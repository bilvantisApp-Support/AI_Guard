import Router from '@koa/router';
import { analyticsController } from '../controllers/analytics.controller';
import { AuthMiddleware } from '../../auth/auth-middleware';

const router = new Router();

// All analytics routes require authentication
router.use(AuthMiddleware.requireAuth());

router.get('/', async ctx => {
  await analyticsController.getAnalytics(ctx);
});

export { router as analyticsRouter };
