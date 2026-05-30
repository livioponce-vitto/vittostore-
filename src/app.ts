import express, { Express, Request, Response, NextFunction } from 'express';
import { prisma } from './db';
import { Logger } from './services/Logger';
import { RetryWorkerService } from './services/RetryWorkerService';
import ordersRouter from './routes/orders';
import dashboardRouter from './routes/dashboard';

const app: Express = express();

// Track retry worker startup state
let retryWorkerInitialized = false;
let lastRetryWorkerPollTime: Date | null = null;

// Initialize retry worker
async function initializeRetryWorker(): Promise<void> {
  try {
    await RetryWorkerService.start({ pollIntervalMs: 5 * 60 * 1000 });
    retryWorkerInitialized = true;
    Logger.info('RetryWorkerService initialized and polling every 5 minutes');
  } catch (error) {
    Logger.error('Failed to initialize RetryWorkerService', error as Error);
    throw error;
  }
}

// Middleware
app.use(express.json());

// Request logging middleware
app.use((_req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    Logger.info(`${_req.method} ${_req.path} ${res.statusCode} ${duration}ms`, {
      method: _req.method,
      path: _req.path,
      status: res.statusCode,
      duration,
    });
  });
  next();
});

// Routes
app.use('/orders', ordersRouter);
app.use('/dashboard', dashboardRouter);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date(),
    retryWorker: {
      initialized: retryWorkerInitialized,
      lastPollTime: lastRetryWorkerPollTime,
    },
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  Logger.error('Unhandled error', err, {
    method: req.method,
    path: req.path,
    body: req.body,
  });

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  Logger.info('SIGTERM received, shutting down gracefully');
  if (retryWorkerInitialized) {
    RetryWorkerService.stop();
  }
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  Logger.info('SIGINT received, shutting down gracefully');
  if (retryWorkerInitialized) {
    RetryWorkerService.stop();
  }
  await prisma.$disconnect();
  process.exit(0);
});

export default app;
export { initializeRetryWorker };
