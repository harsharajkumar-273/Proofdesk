import React from 'react';
import LegalPage from './LegalPage';
import { PRODUCT_NAME } from '../utils/brand';

const SECTIONS = [
  {
    heading: '1. Acceptance of Terms',
    body: (
      <>
        <p>
          By accessing or using {PRODUCT_NAME} ("the Service"), you agree to be bound by these Terms of Service.
          If you do not agree, do not use the Service.
        </p>
      </>
    ),
  },
  {
    heading: '2. Description of Service',
    body: (
      <>
        <p>
          {PRODUCT_NAME} is a browser-based workspace for authoring and previewing educational materials written
          in PreTeXt XML. It provides a source editor, live preview, Git integration, and real-time collaboration tools.
        </p>
        <p>
          The Service is intended for educators, course authors, and students working with PreTeXt-based
          open educational resources.
        </p>
      </>
    ),
  },
  {
    heading: '3. GitHub Account Requirement',
    body: (
      <>
        <p>
          Most features require you to authenticate via GitHub OAuth. By connecting your GitHub account you
          authorize {PRODUCT_NAME} to read your public profile, email address, and access repositories
          you explicitly grant access to. You remain responsible for your GitHub account and must comply
          with <a href="https://docs.github.com/en/site-policy/github-terms/github-terms-of-service" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 underline">GitHub's Terms of Service</a>.
        </p>
      </>
    ),
  },
  {
    heading: '4. Acceptable Use',
    body: (
      <>
        <p>You agree not to use the Service to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Upload, transmit, or store content that is unlawful, harmful, or infringes third-party rights.</li>
          <li>Attempt to gain unauthorized access to other users' repositories or data.</li>
          <li>Abuse the build infrastructure in a way that degrades service for other users (e.g., deliberate resource exhaustion).</li>
          <li>Reverse-engineer, decompile, or attempt to extract the source code of the Service beyond what is publicly available.</li>
        </ul>
      </>
    ),
  },
  {
    heading: '5. Intellectual Property',
    body: (
      <>
        <p>
          You retain full ownership of all content you create or upload. {PRODUCT_NAME} does not claim any
          rights over your source files, compiled output, or repository data.
        </p>
        <p>
          The {PRODUCT_NAME} software itself is open source. The name "{PRODUCT_NAME}" and its branding are
          the property of the project maintainers.
        </p>
      </>
    ),
  },
  {
    heading: '6. Availability and Changes',
    body: (
      <>
        <p>
          The Service is provided on a best-effort basis. We do not guarantee uninterrupted availability.
          We may modify, suspend, or discontinue any part of the Service at any time without prior notice.
        </p>
        <p>
          We may update these Terms at any time. Continued use of the Service after changes are posted
          constitutes acceptance of the revised Terms.
        </p>
      </>
    ),
  },
  {
    heading: '7. Disclaimer of Warranties',
    body: (
      <>
        <p>
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
          IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
          PURPOSE, AND NON-INFRINGEMENT. USE OF THE SERVICE IS AT YOUR OWN RISK.
        </p>
      </>
    ),
  },
  {
    heading: '8. Limitation of Liability',
    body: (
      <>
        <p>
          TO THE FULLEST EXTENT PERMITTED BY LAW, {PRODUCT_NAME.toUpperCase()} AND ITS MAINTAINERS SHALL NOT
          BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING
          LOSS OF DATA, ARISING FROM YOUR USE OF THE SERVICE.
        </p>
      </>
    ),
  },
  {
    heading: '9. Contact',
    body: (
      <>
        <p>
          Questions about these Terms can be directed to{' '}
          <a href="mailto:harsharajkumar273@gmail.com" className="text-indigo-600 dark:text-indigo-400 underline">
            harsharajkumar273@gmail.com
          </a>.
        </p>
      </>
    ),
  },
];

const TermsPage: React.FC = () => (
  <LegalPage
    title="Terms of Service"
    lastUpdated="April 21, 2026"
    sections={SECTIONS}
  />
);

export default TermsPage;
