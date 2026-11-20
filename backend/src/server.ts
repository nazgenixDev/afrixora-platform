import http from 'http';
import { Server, type DefaultEventsMap } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { z } from 'zod';
import { prisma } from './utils/database';
import logger from './utils/logger';
import redisClient, { isRedisConnected } from './utils/redis';

import { createApp } from './app';
import { isCurrentSocketSession, readAccessCookie, revalidateSocketSessions, sessionRoom, socketAuth, type SocketData } from './middleware/socketAuth';
import { sessionEvents } from './services/authService';
import { connectMQTT, isMqttReady } from './services/mqttWorker';
import { startApiKeyUsageSync } from './services/apiKeyUsage';
import { checkEnv } from './scripts/checkEnv';
import { configuredBrowserOrigins } from './utils/browserOrigins';

// Vérification critique des variables d'environnement au démarrage
checkEnv();

const trustProxyHops = z.string().regex(/^\d+$/).transform(Number)
  .pipe(z.number().int().nonnegative().safe())
  .safeParse(process.env.TRUST_PROXY_HOPS ?? '1');
if (!trustProxyHops.success) {
  throw new Error('TRUST_PROXY_HOPS doit être un entier positif ou nul');
}

const app = createApp(trustProxyHops.data, async () => {
  if (!isRedisConnected() || !isMqttReady()) return false;
  const [pong] = await Promise.all([
    redisClient.ping(),
    prisma.tenant.findFirst({ select: { id: true } }),
    prisma.$queryRaw`SELECT 1 FROM public.sensor_readings LIMIT 0`,
  ]);
  return pong === 'PONG' && isMqttReady();
});
const server = http.createServer(app);
const browserOrigins = configuredBrowserOrigins();

const io = new Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>(server, {
  cors: {
    origin: browserOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  allowRequest: (request, callback) => {
    const { origin, cookie } = request.headers;
    const allowed = origin !== undefined ? browserOrigins.includes(origin) :
      readAccessCookie(cookie) === undefined || request.headers['sec-fetch-site'] === 'same-origin';
    callback(null, allowed);
  },
});

io.adapter(createAdapter(redisClient, redisClient.duplicate()));
io.use(socketAuth);
const disconnectRevokedSessions = (userId: string, jwtVersion: number) => {
  try {
    io.in(sessionRoom(userId, jwtVersion)).disconnectSockets(true);
  } catch {
    logger.error('auth.socket_revocation_unavailable', { userId });
  }
};
sessionEvents.on('revoked', disconnectRevokedSessions);

// Le contrôle par lot couvre également les changements effectués par un autre service.
let validatingSessions = false;
const sessionValidation = setInterval(async () => {
  if (validatingSessions) return;
  validatingSessions = true;
  const sockets = Array.from(io.sockets.sockets.values());
  try {
    await revalidateSocketSessions(sockets);
  } catch {
    logger.error('auth.socket_verification_unavailable');
    for (const socket of sockets) socket.disconnect(true);
  } finally {
    validatingSessions = false;
  }
}, 10_000);
sessionValidation.unref();
server.on('close', () => {
  clearInterval(sessionValidation);
  sessionEvents.off('revoked', disconnectRevokedSessions);
});

const buildingIdSchema = z.string().uuid();
const joinError = 'Impossible de rejoindre ce bâtiment';

io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  const session = socket.data.user;
  void socket.join(sessionRoom(session.userId, session.jwtVersion));
  const expiration = setTimeout(() => socket.disconnect(true), Math.max(0, session.expiresAt - Date.now()));
  expiration.unref();
  socket.on('join:building', async (buildingId: unknown): Promise<void> => {
    const validatedId = buildingIdSchema.safeParse(buildingId);
    if (!validatedId.success) {
      socket.emit('error:join', joinError);
      return;
    }

    const { tenantId, role } = socket.data.user;
    const id = validatedId.data;
    try {
      if (!await isCurrentSocketSession(session)) {
        socket.disconnect(true);
        return;
      }
      // Un SUPER_ADMIN peut rejoindre tout bâtiment existant, quel que soit son tenant.
      const building = await prisma.building.findFirst({
        where: role === 'SUPER_ADMIN' ? { id } : { id, tenantId },
        select: { id: true },
      });
      if (!building) {
        socket.emit('error:join', joinError);
        return;
      }
      if (socket.connected) {
        await socket.join(`building:${building.id}`);
      }
    } catch (error) {
      logger.error('Impossible de vérifier ou de rejoindre la room Socket.IO', { error });
      socket.emit('error:join', joinError);
    }
  });
  socket.on('leave:building', (buildingId) => {
    socket.leave(`building:${buildingId}`);
  });
  socket.on('disconnect', () => {
    clearTimeout(expiration);
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

connectMQTT(io);

const port = Number(process.env.PORT || 4000);
const listen = () => {
  startApiKeyUsageSync();
  logger.info(`Serveur démarré sur le port ${port}`);
};
if (process.env.API_BIND_HOST) server.listen(port, process.env.API_BIND_HOST, listen);
else server.listen(port, listen);
