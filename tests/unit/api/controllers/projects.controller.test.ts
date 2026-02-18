import mongoose from 'mongoose';
import { Context } from "koa";
import { ProjectsController } from '../../../../src/api/controllers/projects.controller';
import { projectRepository } from '../../../../src/database/repositories/project.repository';
import { ProxyErrorType } from '../../../../src/types/proxy';
import { ProxyError } from "../../../../src/types/proxy";

jest.mock('../../../../src/database/repositories/project.repository');
jest.mock("../../../../src/interceptors");
jest.mock("../../../../src/interceptors/request/quota-checker");

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
  state: { auth: { user: { _id: userId } } },
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
      memberUserId: memberId,
      name: undefined,
      email: undefined,
    })
  );
});

describe("ProjectsController", () => {
  let ctx: Context;
  const userId = "user123";
  beforeEach(() => {
    ctx = {
      state: {
        auth: {
          user: {
            _id: userId,
          },
        },
      },
      query: {},
      params: {},
      request: {
        body: {},
      },
      body: undefined,
    } as unknown as Context;
    jest.clearAllMocks();
  });

  describe("listProjects", () => {
    it("should return projects with pagination", async () => {
      const mockProjects = [
        {
          _id: "proj1",
          name: "Project One",
          ownerId: userId,
          teamIds: ["team1"],
          members: [
            { userId, role: "owner" },
          ],
          apiKeys: [{}, {}],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (projectRepository.findByMember as jest.Mock)
        .mockResolvedValue({
          projects: mockProjects,
          total: 1,
        });
      ctx.query = {
        page: "1",
        limit: "10",
      };
      await ProjectsController.listProjects(ctx);
      expect(projectRepository.findByMember)
        .toHaveBeenCalledWith(userId, { page: 1, limit: 10 });
      expect(ctx.body).toEqual({
        projects: [
          {
            id: "proj1",
            name: "Project One",
            ownerId: userId,
            teamId: ["team1"],
            memberCount: 1,
            apiKeyCount: 2,
            role: "owner",
            createdAt: mockProjects[0].createdAt,
            updatedAt: mockProjects[0].updatedAt,
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          pages: 1,
        },
      });
    });
  });

  describe("updateProject", () => {
    const projectId = "proj1";
    it("should update project name", async () => {
      const existingProject = {
        _id: projectId,
        settings: {},
      };
      const updatedProject = {
        _id: projectId,
        name: "Updated Name",
        settings: {},
        updatedAt: new Date(),
      };
      (projectRepository.findById as jest.Mock).mockResolvedValue(existingProject);
      (projectRepository.getMemberRole as jest.Mock).mockResolvedValue("owner");
      (projectRepository.updateProject as jest.Mock).mockResolvedValue(updatedProject);

      ctx.params = { id: projectId };
      ctx.request.body = {
        name: "Updated Name",
      };
      await ProjectsController.updateProject(ctx);

      expect(projectRepository.updateProject)
        .toHaveBeenCalledWith(projectId, {
          name: "Updated Name",
        });

      expect(ctx.body).toEqual({
        id: projectId,
        name: "Updated Name",
        settings: {},
        updatedAt: updatedProject.updatedAt,
      });

    });

    it("should throw error if project not found", async () => {
      (projectRepository.findById as jest.Mock)
        .mockResolvedValue(null);
      ctx.params = { id: projectId };
      await expect(
        ProjectsController.updateProject(ctx)
      ).rejects.toThrow(ProxyError);
    });

    it("should throw error if user has insufficient permission", async () => {
      (projectRepository.findById as jest.Mock).mockResolvedValue({});
      (projectRepository.getMemberRole as jest.Mock).mockResolvedValue("member");

      ctx.params = { id: projectId };
      ctx.request.body = { name: "New Name" };
      await expect(
        ProjectsController.updateProject(ctx)
      ).rejects.toThrow("Insufficient permissions");
    });

    it("should throw error for invalid plan", async () => {
      (projectRepository.findById as jest.Mock).mockResolvedValue({ settings: {} });
      (projectRepository.getMemberRole as jest.Mock).mockResolvedValue("owner");

      ctx.params = { id: projectId };

      ctx.request.body = {
        settings: {
          plan: "invalid",
        },
      };
      await expect(ProjectsController.updateProject(ctx)).rejects.toThrow("Invalid plan");
    });


    it("should throw error if no valid fields", async () => {
      (projectRepository.findById as jest.Mock).mockResolvedValue({ settings: {} });
      (projectRepository.getMemberRole as jest.Mock).mockResolvedValue("owner");

      ctx.params = { id: projectId };
      ctx.request.body = {};
      await expect(
        ProjectsController.updateProject(ctx)
      ).rejects.toThrow("No valid fields to update");
    });
  });
});
