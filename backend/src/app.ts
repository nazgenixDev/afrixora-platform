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
import { configuredBrowserOrigins } from './utils/browserOrigins';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function createApp(trustProxyHops: number, checkReadiness?: () => Promise<boolean>) {
  const app = express();

  app.use(helmet());
  app.set('trust proxy', trustProxyHops);
  const browserOrigins = configuredBrowserOrigins();
  app.use(cors({ origin: browserOrigins, credentials: true }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/ready', async (req, res) => {
    if (!loopbackAddresses.has(req.socket.remoteAddress ?? '')) {
      return res.sendStatus(404);
    }
    try {
      if (await checkReadiness?.()) return res.json({ status: 'ready' });
    } catch {
      // Une dépendance indisponible est signalée sans exposer la configuration.
    }
    return res.status(503).json({ status: 'not_ready' });
  });

  const apiRouter = express.Router();
  apiRouter.use(requestLogger);
  apiRouter.use((req, res, next) => {
    const hasSessionCookie = req.cookies.access_token || req.cookies.refresh_token;
    if (hasSessionCookie && !safeMethods.has(req.method) && !browserOrigins.includes(req.get('Origin') ?? '')) {
      return res.status(403).json({ error: 'Origine du navigateur refusée', code: 'ORIGIN_FORBIDDEN' });
    }
    return next();
  });
  apiRouter.use(express.json());

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
