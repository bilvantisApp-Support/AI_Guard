import Router from '@koa/router';
import AdminController from '../controllers/admin.controller';
import { AuthMiddleware } from '../../auth/auth-middleware';

const router = new Router();

router.use(AuthMiddleware.requireAuth());
// All admin routes require admin authentication
router.use(AuthMiddleware.requireAdmin());

// System health
router.get('/system/health', AdminController.getSystemHealth);

// User management
router.get('/users', AdminController.listUsers);
router.put('/users/:id', AdminController.updateUser);
router.delete('/users/:id', AdminController.deleteUser);
router.post('/users/:id/reset-limits', AdminController.resetUserLimits);

// Audit logs
router.get('/audit', AdminController.getAuditLogs);

// Cache management
router.post('/cache/clear', AdminController.clearCache);

// Analytics
router.get('/analytics/usage', AdminController.getUsageAnalytics);

export { router as adminRouter };