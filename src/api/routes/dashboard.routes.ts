import Router from '@koa/router';
import { DashboardController } from '../controllers/dashboard.controller';
import { AuthMiddleware } from '../../auth/auth-middleware';

const router = new Router();

// All dashboard routes require authentication
router.use(AuthMiddleware.requireAuth());
router.use(AuthMiddleware.requireAdmin());

router.get('/stats', DashboardController.getStats);
router.get('/activity', DashboardController.getRecentActivity);
router.get('/usage-trend', DashboardController.getUsageTrend);
router.get('/provider-stats', DashboardController.getProviderStats);

export { router as dashboardRouter};
