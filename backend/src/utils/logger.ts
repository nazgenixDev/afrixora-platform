import winston from 'winston';

// Configure the Winston logger based on the environment
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'afrixora-backend' },
  transports: [
    new winston.transports.Console(),
  ],
});

// Add file transports in production
if (process.env.NODE_ENV !== 'development') {
  logger.add(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 5 * 1024 * 1024, maxFiles: 4 })
  );
  logger.add(new winston.transports.File({ filename: 'logs/combined.log', maxsize: 5 * 1024 * 1024, maxFiles: 4 }));
}

export default logger;
