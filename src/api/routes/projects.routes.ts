import Router from '@koa/router';
import { ProjectsController } from '../controllers/projects.controller';
import { AuthMiddleware } from '../../auth/auth-middleware';

const router = new Router();

// All project routes require authentication
router.use(AuthMiddleware.requireAuth());

// Project CRUD
router.post('/', ProjectsController.createProject);
router.get('/', ProjectsController.listProjects);
router.get('/:id', ProjectsController.getProject);
router.put('/:id', ProjectsController.updateProject);
router.delete('/:id', ProjectsController.deleteProject);

// API key management
router.post('/:id/keys', ProjectsController.addApiKey);
router.get('/:id/keys', ProjectsController.listApiKeys);
router.delete('/:id/keys/:keyId', ProjectsController.removeApiKey);

// Usage and quota
router.get('/:id/usage', ProjectsController.getUsageStats);
router.get('/:id/quota', ProjectsController.getQuotaStatus);

// Member management
router.post('/:id/members', ProjectsController.addMember);
router.put('/:id/members/:memberId', ProjectsController.updateMemberRole);
router.delete('/:id/members/:memberId', ProjectsController.removeMember);

export { router as projectsRouter };