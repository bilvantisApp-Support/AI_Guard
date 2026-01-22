import mongoose from 'mongoose';
import { ProjectsController } from '../../../../src/api/controllers/projects.controller';
import { projectRepository } from '../../../../src/database/repositories/project.repository';
import { ProxyErrorType } from '../../../../src/types/proxy';

jest.mock('../../../../src/database/repositories/project.repository');

const userId = new mongoose.Types.ObjectId();
const projectId = new mongoose.Types.ObjectId();


type GetProjectResponse = {
  members: Array<{
    userId: any;
    name?: string;
    email?: string;
    role: string;
    addedAt: Date;
  }>;
};


const ctxFactory = (overrides: Partial<any> = {}) => ({
  state: {
    auth: { user: { _id: userId } },
  },
  params: { id: projectId.toString() },
  request: { body: {} },
  body: {} as GetProjectResponse,
  status: undefined,
  ...overrides,
});

afterEach(() => {
  jest.clearAllMocks();
});

//Create project with name and description
it('creates project with description', async () => {
  (projectRepository.createProject as jest.Mock).mockResolvedValue({
    _id: projectId,
    name: 'Proj',
    description: 'Desc',
    ownerId: userId,
    members: [],
    createdAt: new Date(),
  });

  const ctx = ctxFactory({
    request: { body: { name: 'Proj', description: 'Desc' } },
  });

  await ProjectsController.createProject(ctx as any);

  expect(projectRepository.createProject).toHaveBeenCalledWith({
    name: 'Proj',
    description: 'Desc',
    ownerId: userId,
  });
});

//Throw error when name is missing
it('throws error when name is missing', async () => {
  const ctx = ctxFactory({
    request: { body: { description: 'Only desc' } },
  });

  await expect(
    ProjectsController.createProject(ctx as any)
  ).rejects.toMatchObject({
    statusCode: 400,
    type: ProxyErrorType.INVALID_REQUEST,
  });
});

//Throw error when description is missing
it('throws error when description is missing', async () => {
  const ctx = ctxFactory({
    request: { body: { name: 'Sample' } },
  });

  await expect(
    ProjectsController.createProject(ctx as any)
  ).rejects.toMatchObject({
    statusCode: 400,
    type: ProxyErrorType.INVALID_REQUEST,
  });
});

//Returns member name and email
it('returns populated member name and email', async () => {
  (projectRepository.findByIdWithMembers as jest.Mock).mockResolvedValue({
    _id: projectId,
    name: 'Proj',
    description: 'Desc',
    ownerId: userId,
    members: [
      {
        userId: { _id: userId, name: 'John', email: 'john@test.com' },
        role: 'owner',
        addedAt: new Date(),
      },
    ],
    settings: {},
    usage: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  (projectRepository.isMember as jest.Mock).mockResolvedValue(true);
  (projectRepository.getMemberRole as jest.Mock).mockResolvedValue('owner');

  const ctx = ctxFactory();

  await ProjectsController.getProject(ctx as any);

  expect(ctx.body.members[0]).toMatchObject({
    name: 'John',
    email: 'john@test.com',
  });
});

//returns undefined name and email for non popultad user
it('returns undefined name and email for non populated user', async () => {
  const memberId = new mongoose.Types.ObjectId();

  (projectRepository.findByIdWithMembers as jest.Mock).mockResolvedValue({
    _id: projectId,
    name: 'Proj',
    ownerId: userId,
    members: [
      {
        userId: memberId,
        role: 'member',
        addedAt: new Date(),
      },
    ],
    settings: {},
    usage: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  (projectRepository.isMember as jest.Mock).mockResolvedValue(true);
  (projectRepository.getMemberRole as jest.Mock).mockResolvedValue('member');

  const ctx = ctxFactory();

  await ProjectsController.getProject(ctx as any);

  expect(ctx.body.members[0]).toEqual(
    expect.objectContaining({
      userId: memberId,
      name: undefined,
      email: undefined,
    })
  );
});

