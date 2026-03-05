import Router from "@koa/router";
import { OTPController } from "../controllers/otp.controller";

const router = new Router();

//OTP send and verify
router.post("/send", OTPController.sendOTP);
router.post("/verify", OTPController.verifyOTP);

export { router as otpRouter };
