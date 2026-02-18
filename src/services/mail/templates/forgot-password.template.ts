export function forgotPasswordTemplate(
  name: string,
  link: string
): string {

  return `
    <h2>Password Reset</h2>
    
    <p>Hello ${name},</p>
    <p>Click below to reset your password:</p>

    <a href="${link}">
      Reset Password
    </a>

    <p>This link expires automatically.</p>
  `;

}
