import http from 'http';
import { Server, type DefaultEventsMap } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { z } from 'zod';
import { prisma } from './utils/database';
import logger from './utils/logger';
import redisClient from './utils/redis';

import { createApp } from './app';
import { socketAuth, type SocketData } from './middleware/socketAuth';
import { connectMQTT } from './services/mqttWorker';
import { startApiKeyUsageSync } from './services/apiKeyUsage';
import { checkEnv } from './scripts/checkEnv';

// Vérification critique des variables d'environnement au démarrage
checkEnv();

const trustProxyHops = z.string().regex(/^\d+$/).transform(Number)
  .pipe(z.number().int().nonnegative().safe())
  .safeParse(process.env.TRUST_PROXY_HOPS ?? '1');
if (!trustProxyHops.success) {
  throw new Error('TRUST_PROXY_HOPS doit être un entier positif ou nul');
}

const app = createApp(trustProxyHops.data);
const server = http.createServer(app);

const io = new Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>(server, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

io.adapter(createAdapter(redisClient, redisClient.duplicate()));
io.use(socketAuth);

const buildingIdSchema = z.string().uuid();
const joinError = 'Impossible de rejoindre ce bâtiment';

io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  socket.on('join:building', async (buildingId: unknown): Promise<void> => {
    const validatedId = buildingIdSchema.safeParse(buildingId);
    if (!validatedId.success) {
      socket.emit('error:join', joinError);
      return;
    }

    const { tenantId, role } = socket.data.user;
    const id = validatedId.data;
    try {
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
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

connectMQTT(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  startApiKeyUsageSync();
  logger.info(`Server running on port ${PORT}`);
});
