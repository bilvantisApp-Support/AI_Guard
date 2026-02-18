import {  mailjetClient } from "./mailjet.client";

export class MailService {
    async sendMail(
        to: string,
        subject: string,
        html: string
    ): Promise<void> {
        await mailjetClient.post("send", { version: "v3.1" }).request({
            Messages: [
                {
                    From: {
                        Email: process.env.FROM_MAIL,
                        Name: "AI Guard"
                    },
                    To: [
                        {
                            Email: to
                        }
                    ],
                    Subject: subject,
                    HTMLPart: html
                }
            ]
        });
    }
}

export const mailService = new MailService();
