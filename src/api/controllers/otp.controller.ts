import { Context } from "koa";
import { otpService } from "../../services/OTP/otp.service";
import { ProxyError, ProxyErrorType } from "../../types/proxy";
import { logger } from "../../utils/logger";

export class OTPController {

    /**
     Send OTP to User
    POST /_api/otp/send
    */
    static async sendOTP(ctx: Context): Promise<void> {
        try {
            const { email, name } = ctx.request.body as { email: string; name: string; };
            const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

            if (typeof email !== 'string' || typeof name !== 'string') {
                throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Invalid input types");
            }

            if (!email) {
                throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Email is required');
            }

            if (!regex.test(email)) {
                throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Invalid email format");
            }

            if (!name || !name.trim()) {
                throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "name is required");
            }

            await otpService.sendOTP(email,name);
            ctx.body = {
                success: true,
                message: "OTP sent successfully"
            };
        } catch (error) {
            logger.error("Failed to send OTP:", error);
            throw error;
        }
    }

    /**
    POST /_api/otp/verify
    */
    static async verifyOTP(ctx: Context): Promise<void> {
        try {
            const { email, otp } = ctx.request.body as { email: string; otp: number; };

            if (typeof email !== 'string' || typeof otp !== 'number') {
                throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Invalid input types");
            }

            if (!email || !otp) {
                throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Email and OTP required");
            }
            const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!regex.test(email)) {
                throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Invalid email format");
            }

            if (!/^[0-9]{6}$/.test(String(otp))) {
                throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Invalid OTP format");
            }
            const valid = await otpService.verifyOTP(email, otp);

            if (!valid) {
                throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Invalid or expired OTP");
            }

            ctx.state.otpVerified = true;
            ctx.body = {
                success: true,
                valid: true,
                message: "OTP verified successfully"
            };
        } catch (error) {
            logger.error("OTP verification failed:", error);
            throw error;
        }
    }
}
