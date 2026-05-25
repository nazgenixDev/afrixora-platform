import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import logger from './utils/logger';

// Import routes
import authRoutes from './routes/auth';
import buildingRoutes from './routes/buildings';
import deviceRoutes from './routes/devices';
import readingRoutes from './routes/readings';
import energyRoutes from './routes/energy';
import automationRoutes from './routes/automations';
import alertRoutes from './routes/alerts';
import userRoutes from './routes/users';
import reportRoutes from './routes/reports';
import apiKeyRoutes from './routes/apiKeys';
import { requestLogger } from "./middleware/requestLogger";
import apiLogRoutes from "./routes/apiLogs";

// Import middleware
import { errorHandler } from './middleware/errorHandler';

// Import MQTT worker
import { connectMQTT } from './services/mqttWorker';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Apply middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Health check route
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// API routes with prefix /api/v1
const apiRouter = express.Router();
apiRouter.use(requestLogger);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/buildings', buildingRoutes);
apiRouter.use('/devices', deviceRoutes);
apiRouter.use('/readings', readingRoutes);
apiRouter.use('/energy', energyRoutes);
apiRouter.use('/automations', automationRoutes);
apiRouter.use('/alerts', alertRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/reports', reportRoutes);
apiRouter.use('/api-keys', apiKeyRoutes);
app.use('/api/v1', apiRouter);
apiRouter.use("/api-logs", apiLogRoutes);

// Global error handler
app.use(errorHandler);

// Socket.IO connection handler
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

// Start MQTT worker
connectMQTT(io);

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
