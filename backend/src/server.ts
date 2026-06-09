import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import logger from './utils/logger';
import redisClient from './utils/redis';

import authRoutes from './routes/auth';
import buildingRoutes from './routes/buildings';
import deviceRoutes from './routes/devices';
import readingRoutes from './routes/readings';
import energyRoutes from './routes/energy';
import automationRoutes from './routes/automations';
import alertRoutes from './routes/alerts';
import reportRoutes from './routes/reports';
import apiKeyRoutes from './routes/apiKeys';
import apiLogRoutes from './routes/apiLogs';
import userRoutes from './routes/users';
import tenantRoutes from './routes/tenants';
import adminRoutes from './routes/admin';

import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { authenticate } from './middleware/authenticate';
import { authenticateOrApiKey } from './middleware/authenticateOrApiKey';
import { apiKeyAuth } from './middleware/apiKeyAuth';

import { connectMQTT } from './services/mqttWorker';
import { checkEnv } from './scripts/checkEnv';

// Vérification critique des variables d'environnement au démarrage
checkEnv();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

io.adapter(createAdapter(redisClient, redisClient.duplicate()));

app.use(helmet());
app.set("trust proxy", true);
app.set("trust proxy", true);
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const apiRouter = express.Router();
apiRouter.use(requestLogger);

apiRouter.use('/auth', authRoutes);

// Routes publiques (JWT ou clé API)
apiRouter.use('/buildings', authenticateOrApiKey, buildingRoutes);
apiRouter.use('/devices', authenticateOrApiKey, deviceRoutes);
apiRouter.use('/readings', authenticateOrApiKey, readingRoutes);
apiRouter.use('/energy', authenticateOrApiKey, energyRoutes);
apiRouter.use('/reports', authenticateOrApiKey, reportRoutes);
apiRouter.use('/alerts', authenticateOrApiKey, alertRoutes);

// Routes admin (JWT uniquement)
apiRouter.use('/automations', authenticate, automationRoutes);
apiRouter.use('/api-keys', authenticate, apiKeyRoutes);
apiRouter.use('/api-logs', authenticate, apiLogRoutes);
apiRouter.use('/users', authenticate, userRoutes);
apiRouter.use('/tenants', authenticate, tenantRoutes);
apiRouter.use('/public', apiKeyAuth, (req, res) => { res.json({ message: 'API key validated', tenantId: (req as any).user?.tenantId }); });
apiRouter.use('/admin', authenticate, adminRoutes);

app.use('/api/v1', apiRouter);

app.use(errorHandler);

io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  socket.on('join:building', (buildingId) => {
    socket.join(`building:${buildingId}`);
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
  logger.info(`Server running on port ${PORT}`);
});
