import { Context } from "koa";
import mongoose from "mongoose";
import { TeamsController } from "../../../../src/api/controllers/teams.controller";
import { teamRepository } from "../../../../src/database/repositories/team.repository";
import { projectRepository } from "../../../../src/database/repositories/project.repository";
import { userRepository } from "../../../../src/database/repositories/user.repository";
import { usageTracker } from "../../../../src/interceptors/response/usage-tracker";
import { ProxyError } from "../../../../src/types/proxy";

jest.mock("../../../../src/database/repositories/team.repository");
jest.mock("../../../../src/database/repositories/project.repository");
jest.mock("../../../../src/database/repositories/user.repository");
jest.mock("../../../../src/interceptors/response/usage-tracker");
jest.mock("../../../../src/interceptors/request/quota-checker");
jest.mock("../../../../src/interceptors");

const userId = new mongoose.Types.ObjectId();
const teamId = new mongoose.Types.ObjectId();
const projectId = new mongoose.Types.ObjectId();

const createCtx = (overrides: Partial<any> = {}) =>
({
    state: { auth: { user: { _id: userId } } },
    params: {},
    query: {},
    request: { body: {} },
    body: undefined,
    ...overrides,
} as unknown as Context);

afterEach(() => jest.clearAllMocks());

describe("createTeam", () => {
    it("should create team successfully", async () => {
        const ctx = createCtx({
            request: { body: { name: "Team A", description: "Desc" } },
        });
        (teamRepository.createTeam as jest.Mock).mockResolvedValue({
            _id: teamId,
            name: "Team A",
            ownerId: userId,
            members: [],
            createdAt: new Date(),
        });
        await TeamsController.createTeam(ctx);
        expect(teamRepository.createTeam).toHaveBeenCalled();
        expect(ctx.body).toHaveProperty("id");
    });

    it("should throw error if name missing", async () => {

        const ctx = createCtx({
            request: { body: { description: "Desc" } },
        });

        await expect(TeamsController.createTeam(ctx))
            .rejects.toThrow(ProxyError);

    });

});

describe("listTeams", () => {
    it("should list teams", async () => {
        const ctx = createCtx();
        (teamRepository.findByMember as jest.Mock).mockResolvedValue({
            teams: [{
                _id: teamId,
                name: "Team",
                description: "Desc",
                ownerId: userId,
                members: [{ userId, role: "owner" }],
                projectCount: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
            }],
            total: 1,
        });
        await TeamsController.listTeams(ctx);
        expect((ctx.body as any).teams.length).toBe(1);
    });
});

describe("getTeam", () => {
    it("should return team details", async () => {
        const ctx = createCtx({
            params: { id: teamId.toString() }
        });

        (teamRepository.findByIdWithMembers as jest.Mock).mockResolvedValue({
            _id: teamId,
            name: "Team",
            members: [],
            settings: {},
            usage: {},
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        (teamRepository.isMember as jest.Mock).mockResolvedValue(true);

        (teamRepository.listProjects as jest.Mock).mockResolvedValue([]);

        await TeamsController.getTeam(ctx);

        expect(ctx.body).toHaveProperty("id");

    });

});

describe("updateTeam", () => {
    it("should update team", async () => {
        const ctx = createCtx({
            params: { id: teamId.toString() },
            request: { body: { name: "Updated" } }
        });
        (teamRepository.findById as jest.Mock).mockResolvedValue({});
        (teamRepository.getMemberRole as jest.Mock).mockResolvedValue("owner");
        (teamRepository.updateTeam as jest.Mock).mockResolvedValue({
            _id: teamId,
            name: "Updated",
            settings: {},
            updatedAt: new Date(),
        });

        await TeamsController.updateTeam(ctx);

        expect((ctx.body as any).name).toBe("Updated");

    });

});

describe("deleteTeam", () => {
    it("should delete team", async () => {
        const ctx = createCtx({
            params: { id: teamId.toString() },
        });
        (teamRepository.findById as jest.Mock).mockResolvedValue({
            ownerId: userId,
        });
        await TeamsController.deleteTeam(ctx);
        expect((ctx.body as any).message).toBe("Team deleted successfully");
    });
});

describe("addMember", () => {
    it("should add member", async () => {
        const ctx = createCtx({
            params: { id: teamId.toString() },
            request: { body: { email: "test@test.com", role: "member" } },
        });
        (teamRepository.getMemberRole as jest.Mock).mockResolvedValue("owner");
        (userRepository.findByEmail as jest.Mock).mockResolvedValue({
            _id: userId,
            email: "test@test.com",
            name: "User",
        });
        (teamRepository.isMember as jest.Mock).mockResolvedValue(false);
        (teamRepository.addMember as jest.Mock).mockResolvedValue({});
        await TeamsController.addMember(ctx);
        expect((ctx.body as any).member.email).toBe("test@test.com");
    });
});

describe("updateMemberRole", () => {
    it("should update member role", async () => {
        const memberId = new mongoose.Types.ObjectId();
        const ctx = createCtx({
            params: { id: teamId.toString(), memberId: memberId.toString() },
            request: { body: { role: "admin" } },
        });
        (teamRepository.getMemberRole as jest.Mock).mockResolvedValue("owner");
        (teamRepository.findById as jest.Mock).mockResolvedValue({
            members: [{ userId: memberId, role: "member" }],
        });
        (teamRepository.updateMemberRole as jest.Mock).mockResolvedValue({});
        await TeamsController.updateMemberRole(ctx);
        expect((ctx.body as any).member.role).toBe("admin");
    });
});

describe("removeMember", () => {
    it("should remove member", async () => {
        const memberId = new mongoose.Types.ObjectId();
        const ctx = createCtx({
            params: { id: teamId.toString(), memberId: memberId.toString() },
        });
        (teamRepository.getMemberRole as jest.Mock).mockResolvedValue("owner");
        (teamRepository.findById as jest.Mock).mockResolvedValue({
            ownerId: new mongoose.Types.ObjectId(),
        });
        (teamRepository.removeMember as jest.Mock).mockResolvedValue({});
        await TeamsController.removeMember(ctx);
        expect((ctx.body as any).memberId).toBe(memberId.toString());
    });
});

describe("assignProject", () => {
    it("should assign project", async () => {
        const ctx = createCtx({
            params: { id: teamId.toString() },
            request: { body: { projectId } },
        });
        (teamRepository.getMemberRole as jest.Mock).mockResolvedValue("owner");
        (projectRepository.findById as jest.Mock).mockResolvedValue({});
        (projectRepository.getMemberRole as jest.Mock).mockResolvedValue("owner");
        await TeamsController.assignProject(ctx);
        expect((ctx.body as any).projectId).toEqual(projectId);
    });
});

describe("removeProject", () => {
    it("should remove project", async () => {
        const ctx = createCtx({
            params: { id: teamId.toString(), projectId: projectId.toString() }
        });
        (teamRepository.getMemberRole as jest.Mock).mockResolvedValue("owner");
        (projectRepository.findById as jest.Mock).mockResolvedValue({
            teamIds: [teamId],
        });
        await TeamsController.removeProject(ctx);
        expect((ctx.body as any).projectId).toBe(projectId.toString());
    });
});

describe("getUsageStats", () => {
    it("should return usage stats", async () => {
        const ctx = createCtx({ params: { id: teamId.toString() } });
        (teamRepository.isMember as jest.Mock).mockResolvedValue(true);
        (usageTracker.getTeamUsageStats as jest.Mock).mockResolvedValue({
            totalRequests: 100,
        });
        await TeamsController.getUsageStats(ctx);
        expect((ctx.body as any).teamId).toBe(teamId.toString());
    });
});
