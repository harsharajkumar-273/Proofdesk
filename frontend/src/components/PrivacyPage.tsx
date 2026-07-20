import React from 'react';
import LegalPage from './LegalPage';
import { PRODUCT_NAME } from '../utils/brand';

const SECTIONS = [
  {
    heading: '1. Overview',
    body: (
      <>
        <p>
          This Privacy Policy explains what information {PRODUCT_NAME} collects, how it is used, and your
          rights regarding that information. We take your privacy seriously and collect only what is
          necessary to provide the Service.
        </p>
      </>
    ),
  },
  {
    heading: '2. Information We Collect',
    body: (
      <>
        <p><strong className="text-zinc-800 dark:text-zinc-200">GitHub Profile Data</strong></p>
        <p>
          When you sign in with GitHub, we receive your GitHub username, display name, public email address,
          and avatar URL. This is used solely to identify your account within the Service.
        </p>
        <p><strong className="text-zinc-800 dark:text-zinc-200">GitHub Access Token</strong></p>
        <p>
          We store a GitHub OAuth access token in an encrypted server-side session. This token is used
          to clone and push to repositories on your behalf. It is never shared with third parties and is
          deleted when you sign out.
        </p>
        <p><strong className="text-zinc-800 dark:text-zinc-200">Repository Content</strong></p>
        <p>
          Files from repositories you open are temporarily stored on our servers to enable editing,
          building, and preview. We do not read, analyze, or retain your content beyond what is needed
          to run the Service.
        </p>
        <p><strong className="text-zinc-800 dark:text-zinc-200">Session Cookies</strong></p>
        <p>
          We use an HTTP-only, secure session cookie to maintain your login state. No tracking or
          advertising cookies are used.
        </p>
        <p><strong className="text-zinc-800 dark:text-zinc-200">Usage Logs</strong></p>
        <p>
          Standard server logs (IP address, request path, timestamp) are retained for up to 30 days
          for security and debugging purposes.
        </p>
      </>
    ),
  },
  {
    heading: '3. How We Use Your Information',
    body: (
      <>
        <ul className="list-disc pl-5 space-y-1">
          <li>To authenticate you and maintain your session.</li>
          <li>To clone, build, and serve repository content you request.</li>
          <li>To display your name and avatar within the workspace.</li>
          <li>To diagnose errors and improve the Service.</li>
        </ul>
        <p>We do not sell, rent, or share your personal data with any third party for marketing purposes.</p>
      </>
    ),
  },
  {
    heading: '4. Data Retention',
    body: (
      <>
        <p>
          Session data (including your GitHub token) is deleted when you sign out or after a period of
          inactivity. Cloned repository files are deleted when your workspace session ends.
          Server logs are retained for up to 30 days, then automatically purged.
        </p>
      </>
    ),
  },
  {
    heading: '5. Third-Party Services',
    body: (
      <>
        <p>
          The Service integrates with <strong className="text-zinc-800 dark:text-zinc-200">GitHub</strong> for
          authentication and repository access. Your use of GitHub is governed by{' '}
          <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 underline">
            GitHub's Privacy Statement
          </a>.
        </p>
        <p>
          No other third-party analytics, advertising, or tracking services are used.
        </p>
      </>
    ),
  },
  {
    heading: '6. Security',
    body: (
      <>
        <p>
          All data in transit is encrypted via HTTPS/TLS. Session cookies are HTTP-only and marked
          Secure. GitHub tokens are stored in server-side sessions and never exposed to the browser.
        </p>
        <p>
          No system is completely secure. We encourage you to sign out after each session, especially
          on shared devices.
        </p>
      </>
    ),
  },
  {
    heading: '7. Your Rights',
    body: (
      <>
        <p>You may at any time:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Sign out to immediately invalidate your session and delete your GitHub token from our servers.</li>
          <li>Request deletion of any stored data by contacting us at the email below.</li>
          <li>Revoke {PRODUCT_NAME}'s access to your GitHub account at any time via{' '}
            <a href="https://github.com/settings/applications" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 underline">
              GitHub → Settings → Applications
            </a>.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: '8. Changes to This Policy',
    body: (
      <>
        <p>
          We may update this Privacy Policy from time to time. The "Last updated" date at the top of
          this page reflects when changes were last made. Continued use of the Service after changes
          are posted constitutes acceptance of the revised Policy.
        </p>
      </>
    ),
  },
  {
    heading: '9. Contact',
    body: (
      <>
        <p>
          For privacy questions or data deletion requests, contact us at{' '}
          <a href="mailto:harsharajkumar273@gmail.com" className="text-indigo-600 dark:text-indigo-400 underline">
            harsharajkumar273@gmail.com
          </a>.
        </p>
      </>
    ),
  },
];

const PrivacyPage: React.FC = () => (
  <LegalPage
    title="Privacy Policy"
    lastUpdated="April 21, 2026"
    sections={SECTIONS}
  />
);

export default PrivacyPage;
