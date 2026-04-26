import fs from 'fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { config, validateConfig } from './config';
import { logger } from './logger';
import { requestIdMiddleware, requestLogger, notFoundHandler, errorHandler } from './middleware';
import router from './blogRouter';
import { connectDB, disconnectDB } from './db';

if (process.env.NODE_ENV !== 'production') {
  if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs', { recursive: true });
  }
}

try {
  validateConfig();
} catch (err) {
  console.error('Configuration error:', (err as Error).message);
  console.error('Copy .env.example to .env and add your GOOGLE_AI_API_KEY');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
// app.use(
//   cors({
//     origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
//     methods: ['GET', 'POST'],
//     allowedHeaders: ['Content-Type', 'X-Request-ID'],
//     exposedHeaders: ['X-Request-ID'],
//   })
// );

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow all origins in development and production for now
      // This allows credentials to work by mirroring the origin header
      callback(null, true);
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Request-ID', 'Authorization'],
    exposedHeaders: ['X-Request-ID'],
    credentials: true,
  })
);

app.options('*', cors());

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use(requestIdMiddleware);
app.use(requestLogger);

if (config.nodeEnv !== 'test') {
  app.use(
    morgan('combined', {
      stream: { write: (msg: string) => logger.http(msg.trim()) },
    })
  );
}

app.use('/', router);
app.use(notFoundHandler);
app.use(errorHandler);

// ── Connect to MongoDB then start HTTP server ─────────────────────────────────
let server: ReturnType<typeof app.listen>;

connectDB()
  .then(() => {
    server = app.listen(config.port, () => {
      logger.info(`${config.app.name} is running`, {
        port: config.port,
        env: config.nodeEnv,
        model: config.googleAI.model,
      });
      logger.info(`Health:   GET  http://localhost:${config.port}/health`);
      logger.info(`Options:  GET  http://localhost:${config.port}/api/options`);
      logger.info(`Generate: POST http://localhost:${config.port}/api/blogs/generate`);
    });
  })
  .catch((err) => {
    logger.error('Could not connect to MongoDB — aborting startup', {
      error: (err as Error).message,
    });
    process.exit(1);
  });

function gracefulShutdown(signal: string): void {
  logger.info(`${signal} received — starting graceful shutdown`);
  if (server) {
    server.close(async () => {
      await disconnectDB();
      logger.info('All connections closed. Exiting cleanly.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
  setTimeout(() => {
    logger.error('Shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Promise Rejection (non-fatal)', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception — process will restart', {
    message: err.message,
    stack: err.stack,
  });
  gracefulShutdown('uncaughtException');
});

export default app;
