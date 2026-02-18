import { Context } from "koa";
import { OTPController } from "../../../../src/api/controllers/otp.controller";
import { otpService } from "../../../../src/services/OTP/otp.service";
import { ProxyError } from "../../../../src/types/proxy";

jest.mock("../../../../src/services/OTP/otp.service", () => ({
  otpService: {
    sendOTP: jest.fn(),
    verifyOTP: jest.fn(),
  },
}));

describe("OTPController", () => {
    let ctx: Context;
    beforeEach(() => {
        ctx = {
            request: {
                body: {},
            },
            body: undefined,
        } as unknown as Context;
        jest.clearAllMocks();
    });

    describe("sendOTP", () => {

        it("should send OTP successfully", async () => {
            (otpService.sendOTP as jest.Mock).mockResolvedValue(undefined);
            ctx.request.body = {
                email: "test@example.com",
                name: "John Doe",
            };
            await OTPController.sendOTP(ctx);
            expect(otpService.sendOTP).toHaveBeenCalledWith(
                "test@example.com",
                "John Doe"
            );
            expect(ctx.body).toEqual({ success: true, message: "OTP sent successfully" });
        });

        it("should throw error if email is missing", async () => {
            ctx.request.body = { name: "John Doe" };
            await expect(OTPController.sendOTP(ctx)).rejects.toThrow(ProxyError);
        });

        it("should throw error if email format is invalid", async () => {
            ctx.request.body = { email: "invalid-email", name: "John Doe" };
            await expect(OTPController.sendOTP(ctx)).rejects.toThrow("Invalid email format");
        });

        it("should throw error if name is missing", async () => {
            ctx.request.body = { email: "test@example.com" };
            await expect(
                OTPController.sendOTP(ctx)
            ).rejects.toThrow("name is required");
        });

        it("should throw error if name is empty", async () => {
            ctx.request.body = { email: "test@example.com", name: "   " };
            await expect(OTPController.sendOTP(ctx)).rejects.toThrow("name is required");
        });
    });

    describe("verifyOTP", () => {
        it("should verify OTP successfully", async () => {
            (otpService.verifyOTP as jest.Mock).mockResolvedValue(true);
            ctx.request.body = {
                email: "test@example.com",
                otp: "123456",
            };
            await OTPController.verifyOTP(ctx);
            expect(otpService.verifyOTP).toHaveBeenCalledWith(
                "test@example.com",
                "123456"
            );
            expect(ctx.body).toEqual({
                success: true,
                valid: true,
                message: "OTP verified successfully",
            });
        });

        it("should throw error if email is missing", async () => {
            ctx.request.body = { otp: "123456" };
            await expect(OTPController.verifyOTP(ctx)
            ).rejects.toThrow("Email and OTP required");
        });

        it("should throw error if OTP is missing", async () => {
            ctx.request.body = { email: "test@example.com" };
            await expect(
                OTPController.verifyOTP(ctx)
            ).rejects.toThrow("Email and OTP required");
        });

        it("should throw error if OTP is invalid", async () => {
            (otpService.verifyOTP as jest.Mock).mockResolvedValue(false);
            ctx.request.body = { email: "test@example.com", otp: "000000" };
            await expect(OTPController.verifyOTP(ctx)).rejects.toThrow("Invalid or expired OTP");
        });
    });
});
