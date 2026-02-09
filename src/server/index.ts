import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import compress from 'koa-compress';
import { config, validateConfig, getServerInfo } from './config';
import { errorHandler } from '../middleware/error-handler';
import { requestLogger } from '../middleware/request-logger';
import { corsMiddleware } from '../middleware/cors';
import { ProxyHandler } from '../proxy/proxy-handler';
import { logger } from '../utils/logger';
import { getSupportedProviders } from '../proxy/provider-config';
import { dbConnection } from '../database/connection';
import { firebaseAdmin } from '../auth/firebase-admin';
import { apiRouter } from '../api/routes';
import { rateLimiter } from '../interceptors/request/rate-limiter';
import { quotaChecker } from '../interceptors/request/quota-checker';
import { requestValidator } from '../interceptors/request/request-validator';
import { usageTracker } from '../interceptors/response/usage-tracker';
import { AuthMiddleware } from '../auth/auth-middleware';
import { resetDailyAndMonthlyUsage } from '../utils/usage-cron';

// Create Koa app
const app = new Koa();
const router = new Router();

// Create proxy handler
const proxyHandler = new ProxyHandler();

// Health check endpoint
router.get('/health', (ctx) => {
  ctx.body = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    ...getServerInfo(),
  };
});

// Ready check endpoint
router.get('/ready', (ctx) => {
  ctx.body = {
    status: 'ready',
    providers: getSupportedProviders(),
    timestamp: new Date().toISOString(),
  };
});

// API routes (with authentication)
router.use('/_api', apiRouter.routes(), apiRouter.allowedMethods());

// Proxy routes with interceptors
router.all('/(.*)', 
  // Required auth for proxy (supports both Firebase and PAT)
  AuthMiddleware.requireAuth(),
  
  // Request interceptors
  requestValidator.createSecurityMiddleware(),
  requestValidator.createMiddleware(),
  rateLimiter.createMiddleware(),
  quotaChecker.createMiddleware(),
  
  // Response interceptors
  usageTracker.createMiddleware(),
  
  // Main proxy handler
  async (ctx) => {
    await proxyHandler.handleRequest(ctx);
  }
);

// Apply middleware
app.use(errorHandler);
app.use(requestLogger);
app.use(corsMiddleware);

if (config.enableCompression) {
  app.use(compress({
    threshold: 2048,
    gzip: {
      flush: require('zlib').constants.Z_SYNC_FLUSH,
    },
  }));
}

app.use(bodyParser({
  jsonLimit: config.maxRequestSize,
  textLimit: config.maxRequestSize,
  formLimit: config.maxRequestSize,
}));

// Apply routes
app.use(router.routes());
app.use(router.allowedMethods());

// Start server
export async function startServer(): Promise<void> {
  validateConfig();
  
  // Connect to MongoDB
  try {
    await dbConnection.connect();
    logger.info('Database connection established');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    process.exit(1);
  }

  //Initialize usage reset here
  resetDailyAndMonthlyUsage();

  // Initialize Firebase Admin SDK
  try {
    firebaseAdmin.initialize();
    logger.info('Firebase Admin SDK initialized');
  } catch (error) {
    logger.error('Failed to initialize Firebase:', error);
    // Don't exit, Firebase is optional
  }
  
  const server = app.listen(config.port, () => {
    logger.info('AI Guard proxy server started', {
      port: config.port,
      environment: process.env.NODE_ENV || 'development',
      providers: getSupportedProviders(),
    });
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(async () => {
      await dbConnection.disconnect();
      logger.info('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(async () => {
      await dbConnection.disconnect();
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

// Start the server if this is the main module
if (require.main === module) {
  startServer();
}