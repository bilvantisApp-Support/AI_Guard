import cors from '@koa/cors';
import { Context } from 'koa';

export const corsMiddleware = cors({
  origin: (ctx: Context): string => {
    // In production, you should configure allowed origins properly
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
    const requestOrigin = ctx.get('Origin');
    
    if (allowedOrigins.includes('*')) {
      return '*';
    }
    
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      return requestOrigin;
    }
    
    return '';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-AI-Guard-Provider',
    'X-Request-ID',
  ],
  exposeHeaders: [
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
});