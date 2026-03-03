export function otpTemplate(
    name: string,
    otp: string
): string {

    return `
    <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 30px;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); text-align: center;">

            <h2 style="margin-top: 0; color: #1f2937;">Verification Code</h2>

            <p style="font-size: 15px; color: #374151;">
                Hello <strong>${name}</strong>,
            </p>

            <p style="font-size: 15px; color: #374151;">
                Use the One-Time Password (OTP) below to complete your verification process:
            </p>

            <div style="margin: 25px 0; padding: 15px; background-color: #111827; border-radius: 8px; display: inline-block;">
                <span style="font-size: 28px; letter-spacing: 6px; color: #ffffff; font-weight: bold;">
                    ${otp}
                </span>
            </div>

            <p style="font-size: 14px; color: #6b7280;">
                This code will expire in <strong>10 minutes</strong>.
            </p>

            <p style="font-size: 13px; color: #9ca3af; margin-top: 20px;">
                If you did not request this code, please ignore this email.
            </p>

        </div>
    </div>
    `;
}