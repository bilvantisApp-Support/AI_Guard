import { Context } from "koa";
import AdminController from "../../../../src/api/controllers/admin.controller";
import { userRepository } from "../../../../src/database/repositories/user.repository";
import { ProxyError } from "../../../../src/types/proxy";

jest.mock("../../../../src/database/repositories/user.repository");

describe("AdminController", () => {
    let ctx: Context;
    beforeEach(() => {
        ctx = {
            query: {},
            params: {},
            request: {
                body: {},
            },
            body: undefined,
        } as unknown as Context;
        jest.clearAllMocks();
    });

    describe("listUsers", () => {
        it("should return users with pagination", async () => {
            const mockUsers = [
                {
                    _id: "1",
                    email: "test1@email.com",
                    name: "User One",
                    role: "admin",
                    status: "active",
                    createdAt: new Date(),
                    lastLoginAt: new Date(),
                },
                {
                    _id: "2",
                    email: "test2@email.com",
                    name: "User Two",
                    role: "member",
                    status: "active",
                    createdAt: new Date(),
                    lastLoginAt: new Date(),
                },
            ];
            (userRepository.findActiveUsers as jest.Mock).mockResolvedValue({
                users: mockUsers,
                total: 2,
            });
            ctx.query = {
                page: "1",
                limit: "10",
            };
            await AdminController.listUsers(ctx);
            expect(userRepository.findActiveUsers).toHaveBeenCalledWith(
                {},
                { page: 1, limit: 10 }
            );
            expect(ctx.body).toEqual({
                users: [
                    {
                        id: "1",
                        email: "test1@email.com",
                        name: "User One",
                        role: "admin",
                        status: "active",
                        createdAt: mockUsers[0].createdAt,
                        lastLoginAt: mockUsers[0].lastLoginAt,
                    },
                    {
                        id: "2",
                        email: "test2@email.com",
                        name: "User Two",
                        role: "member",
                        status: "active",
                        createdAt: mockUsers[1].createdAt,
                        lastLoginAt: mockUsers[1].lastLoginAt,
                    },
                ],
                pagination: {
                    page: 1,
                    limit: 10,
                    total: 2,
                    pages: 1,
                },
            });
        });

        it("should apply status filter", async () => {
            (userRepository.findActiveUsers as jest.Mock).mockResolvedValue({
                users: [],
                total: 0,
            });
            ctx.query = {
                status: "active",
            };
            await AdminController.listUsers(ctx);
            expect(userRepository.findActiveUsers).toHaveBeenCalledWith(
                { status: "active" },
                { page: 1, limit: 20 }
            );
        });

        it("should use default pagination values", async () => {
            (userRepository.findActiveUsers as jest.Mock).mockResolvedValue({
                users: [],
                total: 0,
            });
            await AdminController.listUsers(ctx);
            expect(userRepository.findActiveUsers).toHaveBeenCalledWith(
                {},
                { page: 1, limit: 20 }
            );
        });
    });

    describe("updateUser", () => {
        it("should update user status successfully", async () => {

            const mockUpdatedUser = {
                _id: "1",
                email: "test@email.com",
                name: "Test User",
                role: "admin",
                status: "active",
                updatedAt: new Date(),
            };
            (userRepository.updateUser as jest.Mock)
                .mockResolvedValue(mockUpdatedUser);
            ctx.params = { id: "1" };
            ctx.request.body = {
                status: "active",
            };
            await AdminController.updateUser(ctx);
            expect(userRepository.updateUser).toHaveBeenCalledWith(
                "1",
                {
                    status: "active",
                    role: undefined,
                }
            );
            expect(ctx.body).toEqual({
                id: mockUpdatedUser._id,
                email: mockUpdatedUser.email,
                role: mockUpdatedUser.role,
                name: mockUpdatedUser.name,
                status: mockUpdatedUser.status,
                updatedAt: mockUpdatedUser.updatedAt,
            });
        });

        it("should update user role successfully", async () => {
            const mockUpdatedUser = {
                _id: "1",
                email: "test@email.com",
                name: "Test User",
                role: "admin",
                status: "active",
                updatedAt: new Date(),
            };

            (userRepository.updateUser as jest.Mock)
                .mockResolvedValue(mockUpdatedUser);
            ctx.params = { id: "1" };
            ctx.request.body = { role: "admin" };
            await AdminController.updateUser(ctx);
            expect(userRepository.updateUser).toHaveBeenCalledWith(
                "1",
                {
                    status: undefined,
                    role: "admin",
                }
            );
        });

        it("should throw error for invalid status", async () => {
            ctx.params = { id: "1" };
            ctx.request.body = {
                status: "invalid_status",
            };
            await expect(
                AdminController.updateUser(ctx)
            ).rejects.toThrow(ProxyError);
        });

        it("should throw error for invalid role", async () => {
            ctx.params = { id: "1" };
            ctx.request.body = {
                role: "invalid_role",
            };
            await expect(
                AdminController.updateUser(ctx)
            ).rejects.toThrow(ProxyError);
        });

        it("should throw error if no status or role provided", async () => {
            ctx.params = { id: "1" };
            ctx.request.body = {};
            await expect(
                AdminController.updateUser(ctx)
            ).rejects.toThrow(ProxyError);

        });

        it("should throw error if user not found", async () => {
            (userRepository.updateUser as jest.Mock)
                .mockResolvedValue(null);
            ctx.params = { id: "999" };
            ctx.request.body = {
                status: "active",
            };
            await expect(
                AdminController.updateUser(ctx)
            ).rejects.toThrow(ProxyError);
        });
    });
});
