import axios, { AxiosInstance } from "axios";
import { logger } from "../../utils/logger";

interface TurnstileVerifyResponse {
    success: boolean;
    challenge_ts?: string;
    hostname?: string;
    "error-codes"?: string[];
}

class CaptchaService {
    private readonly client: AxiosInstance;
    private readonly secret: string;

    constructor() {
        const secret = process.env.TURNSTILE_SECRET_KEY;

        if (!secret) {
            throw new Error("TURNSTILE_SECRET_KEY is not defined in environment variables")
        }

        this.secret = secret;
        this.client = axios.create({ baseURL: "https://challenges.cloudflare.com", timeout: 5000, headers: { "Content-Type": "application/json" } })
    }


    public async verifyTurnstileToken(captchaToken: string, remoteIp?: string) {
        if (!captchaToken) {
            logger.warn("Captcha validation failed: token missing");
            return false;
        }

        try {
            const body = { secret: this.secret, response: captchaToken, remoteip: remoteIp };
            const { data } = await this.client.post<TurnstileVerifyResponse>(
                "/turnstile/v0/siteverify",
                body
            );

            if(!data.success){
                logger.error("Captcha verification failed",{error: data["error-codes"]});
                return;
            }
            logger.info("Captcha verification successful");
            return true;
        } catch (error) {
            logger.error("Captcha verification error",error);
            return false;
        }
    }
}

export const captchaService = new CaptchaService();
