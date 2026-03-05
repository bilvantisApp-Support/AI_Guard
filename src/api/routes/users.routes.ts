import Router from '@koa/router';
import { UsersController } from '../controllers/users.controller';
import { AuthMiddleware } from '../../auth/auth-middleware';

const router = new Router();

//forgot password
router.post('/forgot-password',UsersController.forgotPassword);

// All user routes require authentication
router.use(AuthMiddleware.requireAuth());

// Profile management
router.get('/', UsersController.listProfiles);
router.get('/profile', UsersController.getProfile);
router.put('/profile', UsersController.updateProfile);
router.delete('/account', UsersController.deleteAccount);

// Token management
router.post('/tokens', UsersController.createToken);
router.get('/tokens', UsersController.listTokens);
router.delete('/tokens/:tokenId', UsersController.revokeToken);
router.post('/tokens/:tokenId/rotate', UsersController.rotateToken);

// Usage summary
router.get('/usage', UsersController.getUsageSummary);

export { router as usersRouter };