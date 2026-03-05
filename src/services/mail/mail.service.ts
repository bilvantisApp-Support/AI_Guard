import nodemailer from "nodemailer";
import { logger } from "../../utils/logger";

export class BrevoService {
    private static instance: BrevoService;
    private transporter!: nodemailer.Transporter;
    private initialized = false;

    private constructor() { }

    public static getInstance(): BrevoService {
        if (!BrevoService.instance) {
            BrevoService.instance = new BrevoService();
        }
        return BrevoService.instance;
    }

    public initialize(): void {
        if (this.initialized) {
            logger.info("Brevo SMTP already initialized");
            return;
        }
        const { BREVO_SMTP_HOST, BREVO_SMTP_PORT, BREVO_SMTP_USER, BREVO_SMTP_PASS, FROM_MAIL } = process.env;

        if (!BREVO_SMTP_HOST || !BREVO_SMTP_PORT || !BREVO_SMTP_USER || !BREVO_SMTP_PASS || !FROM_MAIL) {
            throw new Error("Missing required Brevo SMTP configuration");
        }
        try {
            this.transporter = nodemailer.createTransport({
                host: process.env.BREVO_SMTP_HOST,
                port: Number(process.env.BREVO_SMTP_PORT),
                secure: false,
                auth: {
                    user: process.env.BREVO_SMTP_USER,
                    pass: process.env.BREVO_SMTP_PASS
                }
            });

            this.initialized = true;
            logger.info("Brevo SMTP initialized successfully");
        } catch (error) {
            logger.error("Brevo SMTP initialization failed:", error);
            throw error;
        }
    }

    public async sendMail(
        to: string,
        subject: string,
        html: string
    ) {
        if (!this.initialized) {
            logger.warn("Brevo SMTP not initialized");
            return;
        }
        const fromMail = process.env.FROM_MAIL;
        try {
            const response = await this.transporter.sendMail({
                from: `"AI Guard" <${fromMail}>`,
                to,
                subject,
                html
            });

            logger.info(`Email sent successfully to ${to}`);
            return response;
        } catch (error) {
            logger.error("Email sending failed:", error);
            throw error;
        }
    }
}

export const brevoService = BrevoService.getInstance();