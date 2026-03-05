import Router from '@koa/router';
import { usersRouter } from './users.routes';
import { projectsRouter } from './projects.routes';
import { teamsRouter } from './teams.routes';
import { adminRouter } from './admin.routes';
import { swaggerRouter } from './swagger.routes';
import { dashboardRouter } from './dashboard.routes';
import { analyticsRouter } from './analytics.routes';
import { errorEnricher } from '../../interceptors/response/error-enricher';
import { providerSnippetRouter } from './provider-snippet.routes';
import { otpRouter } from './otp.router';

const apiRouter = new Router();

// Add error enrichment middleware
apiRouter.use(errorEnricher.createMiddleware());

// API routes
apiRouter.use('/users', usersRouter.routes(), usersRouter.allowedMethods());
apiRouter.use('/projects', projectsRouter.routes(), projectsRouter.allowedMethods());
apiRouter.use('/teams', teamsRouter.routes(), teamsRouter.allowedMethods());
apiRouter.use('/admin', adminRouter.routes(), adminRouter.allowedMethods());
apiRouter.use('/provider-snippets', providerSnippetRouter.routes(), providerSnippetRouter.allowedMethods());
apiRouter.use('/otp', otpRouter.routes(), otpRouter.allowedMethods());
apiRouter.use('/dashboard', dashboardRouter.routes(), dashboardRouter.allowedMethods());
apiRouter.use('/analytics', analyticsRouter.routes(), analyticsRouter.allowedMethods());

// Swagger documentation routes
apiRouter.use('/', swaggerRouter.routes(), swaggerRouter.allowedMethods());

// Health check for API
apiRouter.get('/health', (ctx) => {
  ctx.body = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  };
});

export { apiRouter };
