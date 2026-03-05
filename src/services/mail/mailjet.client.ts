import Mailjet from "node-mailjet";

const apiKey = process.env.MAILJET_API_KEY;
const secretKey = process.env.MAILJET_SECRET_KEY;

if (!apiKey || !secretKey) {
  throw new Error("Mailjet environment variables are missing");
}

export const mailjetClient = Mailjet.apiConnect(
  apiKey,
  secretKey
);
