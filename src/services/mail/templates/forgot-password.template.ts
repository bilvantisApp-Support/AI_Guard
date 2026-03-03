export function forgotPasswordTemplate(
  name: string,
  link: string
): string {

  return `
  <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 30px;">
    <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); text-align: center;">

      <h2 style="margin-top: 0; color: #1f2937;">Password Reset</h2>

      <p style="font-size: 15px; color: #374151;">
        Hello <strong>${name}</strong>,
      </p>

      <p style="font-size: 15px; color: #374151;">
        We received a request to reset your password. Click the button below to proceed.
      </p>

      <div style="margin: 25px 0;">
        <a href="${link}"
           style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: bold; display: inline-block;">
          Reset Password
        </a>
      </div>

      <p style="font-size: 14px; color: #6b7280;">
        This link will expire automatically for security reasons.
      </p>

      <p style="font-size: 13px; color: #9ca3af; margin-top: 20px;">
        If you did not request a password reset, you can safely ignore this email.
      </p>

    </div>
  </div>
  `;
}