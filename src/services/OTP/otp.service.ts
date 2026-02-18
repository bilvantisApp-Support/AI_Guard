import Redis from "ioredis";
import crypto from "crypto";
import { logger } from "../../utils/logger";
import { mailService } from "../../services/mail/mail.service";
import { otpTemplate } from "../mail/templates/otp.template";

class OTPService {

    private redis: Redis | null = null;
    private readonly PREFIX = "otp:";
    private readonly TTL_SECONDS = 600; 

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
        const otp = this.generateOTP();
        const key = this.getKey(email);
        await this.redis.set(key,otp,"EX",this.TTL_SECONDS);

        await mailService.sendMail(email, "Your AI Guard verification code", otpTemplate(name, otp));
        logger.info(`OTP sent to ${email}`);
    }

    async verifyOTP(email: string,otp: string): Promise<boolean> {
        if (!this.redis) {
            return false;
        }

        const key = this.getKey(email);
        const storedOTP = await this.redis.get(key);

        if (!storedOTP) {
            return false;
        }
        if (storedOTP !== otp) {
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
