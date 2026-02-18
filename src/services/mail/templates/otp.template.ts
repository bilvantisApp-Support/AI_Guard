export function otpTemplate(
    name: string,
    otp: string
): string {

    return `
        <h2>Verification Code</h2>

        <p>Hello ${name}</p>

        <p>Your OTP:</p>

        <h1>${otp}</h1>

        <p>This expires in 10 minutes.</p>
    `;

}
