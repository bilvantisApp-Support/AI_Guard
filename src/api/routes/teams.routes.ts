import Router from '@koa/router';
import { TeamsController } from '../controllers/teams.controller';
import { AuthMiddleware } from '../../auth/auth-middleware';

const router = new Router();

router.use(AuthMiddleware.requireAuth());

// Team CRUD
router.post('/', TeamsController.createTeam);
router.get('/', TeamsController.listTeams);
router.get('/:id', TeamsController.getTeam);
router.put('/:id', TeamsController.updateTeam);
router.delete('/:id', TeamsController.deleteTeam);

// Member management
router.post('/:id/members', TeamsController.addMember);
router.put('/:id/members/:memberId', TeamsController.updateMemberRole);
router.delete('/:id/members/:memberId', TeamsController.removeMember);

// Project assignment
router.post('/:id/projects', TeamsController.assignProject);
router.delete('/:id/projects/:projectId', TeamsController.removeProject);

// Usage
router.get('/:id/usage', TeamsController.getUsageStats);

export { router as teamsRouter };
