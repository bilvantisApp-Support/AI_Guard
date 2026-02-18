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
        <h2>Your Personal Access Token</h2>

        <p>Hello ${name},</p>

        <p>Your PAT token:</p>

        <pre>${token}</pre>

        <h3>cURL</h3>
        <pre>${snippets.curl.replaceAll("YOUR_PAT_TOKEN", token)}</pre>

        <h3>Node.js</h3>
        <pre>${snippets.node.replaceAll("YOUR_PAT_TOKEN", token)}</pre>

        <h3>Python</h3>
        <pre>${snippets.python.replaceAll("YOUR_PAT_TOKEN", token)}</pre>

        <h3>Java</h3>
        <pre>${snippets.java.replaceAll("YOUR_PAT_TOKEN", token)}</pre>

    `;
}
