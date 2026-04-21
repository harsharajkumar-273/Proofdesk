# Proofdesk — Planned Updates

Track features and improvements to implement and release one by one.

---

## ✅ Shipped

- [x] Marketing landing page (hero, features, how-it-works, CTA, footer)
- [x] Guest/demo mode — `/demo` route, no auth required, ILA textbook iframe
- [x] HTTPS + custom domain (`proofdesk.duckdns.org`) via Let's Encrypt + certbot

---

## 🔲 Queued (implement one by one)

### 1. Build Log Streaming
**What:** Stream PreTeXt build output line-by-line to the browser as it builds, instead of waiting for the whole build to finish.
**Why:** Builds take 15-20 min; users currently see no feedback.
**How:** SSE (Server-Sent Events) or WebSocket from backend build executor → frontend build status panel.

### 2. Per-Section Build
**What:** Rebuild only the changed section/chapter instead of the full textbook.
**Why:** Full rebuilds take minutes; per-section can be seconds.
**How:** PreTeXt supports `--xmlid` flag to target a specific section. Parse the changed file, extract `xml:id`, pass to build command.

### 3. Smoke Test After Deploy
**What:** After each GitHub Actions deploy, curl `https://proofdesk.duckdns.org/health` and fail the workflow if it returns non-200.
**Why:** Catch broken deploys immediately before users notice.
**How:** Add a step at the end of `deploy-aws-ec2.yml`.

### 4. Custom Domain (Paid)
**What:** Replace `proofdesk.duckdns.org` with a real domain like `proofdesk.app`.
**Why:** Looks professional; easier to share with professors.
**How:** Buy domain on Porkbun/Namecheap, point A record to EC2 IP, update `nginx.conf` and all secrets, re-run certbot with new domain.

### 5. Dependabot
**What:** Automated PRs for npm security updates.
**Why:** Keep dependencies patched without manual effort.
**How:** Add `.github/dependabot.yml` with npm ecosystem config.

### 6. Google Login (in addition to GitHub)
**What:** Let users sign in with a Google account, not just GitHub.
**Why:** Some professors don't have GitHub accounts.
**How:** Add `passport-google-oauth20` strategy to backend auth, new OAuth app in Google Cloud Console, update landing page CTA.

### 7. Export as ZIP
**What:** One-click download of the compiled textbook as a self-contained ZIP.
**Why:** Professors need to host on university servers, not just preview here.
**How:** Backend zips the `output/` directory for the session, serves as a download. Frontend adds an export button in the toolbar.

### 8. Email Notifications
**What:** Email the author when a build finishes (success or failure).
**Why:** Authors submit a build and close the tab; they need a signal when it's done.
**How:** Add nodemailer (or SendGrid) to backend, trigger after build completes.

### 9. Multiple Repository Support
**What:** Let users open more than one repository at a time (tabbed workspaces).
**Why:** Authors often maintain multiple courses.
**How:** Refactor session/workspace management to support multiple active repos per user.

### 10. Reviewer Mode Polish
**What:** Improve the read-only reviewer view — better navigation, annotation support.
**Why:** Reviewers (students, editors) need a clean view without the editor chrome.
**How:** Add a `/review/:sessionId` route that shows the preview fullscreen with a minimal toolbar.

---

## 💡 Ideas (not yet prioritized)

- Dark/light mode toggle on landing page
- Onboarding walkthrough for first-time users
- PreTeXt syntax highlighting in the editor
- In-editor error highlighting from build output
- Team management UI (invite co-authors, set permissions)
