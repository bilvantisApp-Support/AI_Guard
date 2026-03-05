export function patCreatedTemplate(
    name: string,
    token: string,
    snippets: {
        curl: string;
        node: string;
        python: string;
        java: string;
    }
): string {

    return `
    <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 30px;">
        <div style="max-width: 700px; margin: auto; background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">

            <h2 style="margin-top: 0; color: #1f2937;">Your Personal Access Token</h2>

            <p style="font-size: 15px; color: #374151;">Hello <strong>${name}</strong>,</p>

            <p style="font-size: 15px; color: #374151;">
                Your Personal Access Token (PAT) has been successfully generated.
                Please store it securely. For security reasons, this token may not be shown again.
            </p>

            <div style="background-color: #111827; color: #ffffff; padding: 15px; border-radius: 6px; font-size: 14px; word-break: break-all;">
                ${token}
            </div>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;" />

            <h3 style="color: #111827;">Usage Examples</h3>

            <h4 style="margin-bottom: 5px; color: #2563eb;">cURL</h4>
            <pre style="background: #f3f4f6; padding: 15px; border-radius: 6px; overflow-x: auto;">${snippets.curl.replaceAll("YOUR_PAT_TOKEN", token)}</pre>

            <h4 style="margin-bottom: 5px; color: #2563eb;">Node.js</h4>
            <pre style="background: #f3f4f6; padding: 15px; border-radius: 6px; overflow-x: auto;">${snippets.node.replaceAll("YOUR_PAT_TOKEN", token)}</pre>

            <h4 style="margin-bottom: 5px; color: #2563eb;">Python</h4>
            <pre style="background: #f3f4f6; padding: 15px; border-radius: 6px; overflow-x: auto;">${snippets.python.replaceAll("YOUR_PAT_TOKEN", token)}</pre>

            <h4 style="margin-bottom: 5px; color: #2563eb;">Java</h4>
            <pre style="background: #f3f4f6; padding: 15px; border-radius: 6px; overflow-x: auto;">${snippets.java.replaceAll("YOUR_PAT_TOKEN", token)}</pre>

            <p style="margin-top: 30px; font-size: 13px; color: #6b7280;">
                If you did not create this token, please revoke it immediately from your account settings.
            </p>

        </div>
    </div>
    `;
}