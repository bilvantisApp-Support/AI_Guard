import Redis from "ioredis";
import crypto from "crypto";
import { logger } from "../../utils/logger";
import { otpTemplate } from "../mail/templates/otp.template";
import { ProxyError, ProxyErrorType } from "../../types/proxy";
import { brevoService } from "../mail/mail.service";

class OTPService {

    private redis: Redis | null = null;
    private readonly PREFIX = "otp:";
    private readonly TTL_SECONDS = 600;
    private readonly RESEND_TIME = 180;
    private readonly MAX_RESEND = 3;
    private readonly WINDOW_TIME = 3600;

    constructor() {
        this.initializeRedis();
    }

    //Initialize redis
    private initializeRedis(): void {
        try {
            const redisUrl = process.env.REDIS_URL;
            if (!redisUrl) {
                logger.warn("REDIS_URL not found. OTP disabled.");
                return;
            }
            this.redis = new Redis(redisUrl);
            this.redis.on("connect", () => {
                logger.info("Redis connected for OTP service");
            });
            this.redis.on("error", (err) => {
                logger.error("Redis OTP error:", err);
            });
        } catch (err) {
            logger.error("Redis initialization failed:", err);
            this.redis = null;
        }
    }

    //Genrate random OTP
    private generateOTP(): string {
        return crypto.randomInt(100000, 999999).toString();
    }

    private getKey(email: string): string {
        return `${this.PREFIX}${email.toLowerCase()}`;
    }

    async sendOTP(
        email: string,
        name: string
    ): Promise<void> {

        if (!this.redis) {
            throw new Error("OTP service unavailable");
        }

        const key = this.getKey(email);
        const existing = await this.redis.get(key);

        let resendCount = 1;
        let resendWindowMs = Date.now();
        if (existing) {
            const data = JSON.parse(existing);
            const elapsedTime = (Date.now() - data.createdAt) / 1000;

            if(elapsedTime < this.RESEND_TIME){
                const remainTime = Math.ceil(this.RESEND_TIME - elapsedTime);
                throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 429, `Please wait ${remainTime} seconds before requesting a new OTP`)
            }

            resendCount = data.resetCount ?? 1;
            resendWindowMs = data.resendWindowMs ?? Date.now();

            const windowElapsed = (Date.now() - resendWindowMs) / 1000;
            if(windowElapsed < this.WINDOW_TIME && resendCount > this.MAX_RESEND){
                throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 429, 'Resend limit exceed');
            }

            if(windowElapsed >= this.WINDOW_TIME){
                resendCount = 0;
                resendWindowMs = Date.now();
            }

            resendCount++;
            
        }
        const otp = this.generateOTP();
        const payload = {
            otp,
            createdAt: Date.now(),
            resendCount,
            resendWindowMs
        }
        await this.redis.set(key, JSON.stringify(payload), "EX", this.TTL_SECONDS);

        await brevoService.sendMail(email, "Your AI Guard verification code", otpTemplate(name, otp));
        logger.info(`OTP sent to ${email}`);
    }

    async verifyOTP(email: string, otp: number): Promise<boolean> {
        if (!this.redis) {
            return false;
        }

        const key = this.getKey(email);
        const storedOTP = await this.redis.get(key);

        if (!storedOTP) {
            return false;
        }

        const data = JSON.parse(storedOTP)
        
        if (data.otp !== String(otp)) {
            return false;
        }
        await this.redis.del(key);
        return true;
    }

    async hasActiveOTP(email: string): Promise<boolean> {
        if (!this.redis) {
            return false;
        }
        const exists = await this.redis.exists(
            this.getKey(email)
        );
        return exists === 1;
    }

}
export const otpService = new OTPService();
