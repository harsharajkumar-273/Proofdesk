# Security Policy

## Supported Versions

We take security seriously and are committed to ensuring Proofdesk remains a secure platform for collaborative textbook authoring. The following versions of Proofdesk are currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0.0 | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability within Proofdesk, please **do not** open a public issue. We appreciate your efforts to responsibly disclose your findings.

Please report security issues directly by emailing our security team at **security@proofdesk.app**. You may also use GitHub's built-in private vulnerability reporting feature for this repository.

### What to include in your report

To help us triage and resolve the issue quickly, please include the following details in your report:

- **Description**: A clear description of the vulnerability and its potential impact.
- **Steps to reproduce**: Step-by-step instructions on how to reproduce the issue.
- **Proof of Concept (PoC)**: Any scripts, payloads, or screenshots that demonstrate the vulnerability.
- **Environment**: Details about the environment where the vulnerability was found (e.g., specific version of Proofdesk, browser, OS, Docker configuration).
- **Suggested mitigation**: (Optional) If you have a suggested fix or mitigation, we would love to hear it.

### Our Response Process

1. **Acknowledgment**: We will acknowledge receipt of your report within 48 hours.
2. **Triage**: Our maintainers will investigate and verify the vulnerability. We may ask for additional information if needed.
3. **Remediation**: We will develop a fix and test it thoroughly.
4. **Disclosure**: Once the fix is deployed and the vulnerability is resolved, we will publish a security advisory and publicly acknowledge your contribution (unless you prefer to remain anonymous).

## Recent Security Enhancements

We are continuously working to improve the security posture of Proofdesk. Recent proactive measures include:
- Securing internal monitoring endpoints against unauthorized access.
- Strengthening WebSocket authentication to prevent Insecure Direct Object Reference (IDOR) vulnerabilities in collaborative rooms by strictly enforcing session creator verification.
- Implementing rate limiting on build initialization (`initBuild`) and requiring authentication via `requireAccessToken` on prewarming endpoints (`/build/prewarm`) to mitigate Denial of Service (DoS) risks.
- Hardening containerized build environments (via `scons` and Docker) against path traversal and command injection.

Thank you for helping keep Proofdesk secure!
