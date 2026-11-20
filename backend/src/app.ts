import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

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

export function createApp(trustProxyHops: number) {
  const app = express();

  app.use(helmet());
  app.set('trust proxy', trustProxyHops);
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

  // Routes admin (JWT uniquement)
  apiRouter.use('/alerts', authenticate, alertRoutes);
  apiRouter.use('/automations', authenticate, automationRoutes);
  apiRouter.use('/api-keys', authenticate, apiKeyRoutes);
  apiRouter.use('/api-logs', authenticate, apiLogRoutes);
  apiRouter.use('/users', authenticate, userRoutes);
  apiRouter.use('/tenants', authenticate, tenantRoutes);
  apiRouter.use('/public', apiKeyAuth, (req, res) => { res.json({ message: 'API key validated', tenantId: req.user?.tenantId }); });
  apiRouter.use('/admin', authenticate, adminRoutes);

  app.use('/api/v1', apiRouter);

  app.use(errorHandler);

  return app;
}
