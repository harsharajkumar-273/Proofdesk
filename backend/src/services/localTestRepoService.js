import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../../..');

const toBoolean = (value) => String(value || '').toLowerCase() === 'true';

const escapeHtml = (value = '') =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const hashString = (value) =>
  crypto.createHash('sha1').update(value).digest('hex');

const readOpeningTagAttribute = (xml, tagName, attributeName) => {
  const tagMatch = xml.match(new RegExp(`<${tagName}\\b[^>]*>`, 'i'));
  if (!tagMatch) return null;

  const attributeMatch = tagMatch[0].match(new RegExp(`\\b${attributeName}="([^"]*)"`, 'i'));
  return attributeMatch?.[1] || null;
};

const readFileIfExists = async (filePath) => {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
};

const parseXmlSections = (xml) => {
  const title = readOpeningTagAttribute(xml, 'course', 'title') || 'Course Demo';
  const subtitle = readOpeningTagAttribute(xml, 'course', 'subtitle') || 'Local test mode';

  const sections = [...xml.matchAll(/<section[^>]*title="([^"]+)"[^>]*>([\s\S]*?)<\/section>/gi)].map(
    ([, sectionTitle, body]) => {
      const paragraphs = [...body.matchAll(/<paragraph>([\s\S]*?)<\/paragraph>/gi)].map((match) =>
        escapeHtml(match[1].trim())
      );
      const items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) =>
        escapeHtml(match[1].trim())
      );
      return {
        title: sectionTitle,
        paragraphs,
        items,
      };
    }
  );

  return { title, subtitle, sections };
};

const renderCourseHtml = ({ title, subtitle, sections }, xmlSource) => {
  const sectionMarkup = sections.length > 0
    ? sections.map((section) => `
        <section class="lesson-section">
          <h2>${escapeHtml(section.title)}</h2>
          ${section.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('\n')}
          ${section.items.length > 0 ? `
            <ul>
              ${section.items.map((item) => `<li>${item}</li>`).join('\n')}
            </ul>
          ` : ''}
        </section>
      `).join('\n')
    : `
      <section class="lesson-section">
        <h2>Preview fallback</h2>
        <p>The XML is incomplete, so the preview is showing the raw source for now.</p>
        <pre class="xml-source">${escapeHtml(xmlSource)}</pre>
      </section>
    `;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="course-shell">
      <header class="course-header">
        <p class="eyebrow">Local Demo Repository</p>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
      </header>
      <div id="demo-badge" class="demo-badge">Local preview ready</div>
      ${sectionMarkup}
    </main>
    <script src="./interactive.js"></script>
  </body>
</html>`;
};

class LocalTestRepoService {
  isEnabled() {
    return toBoolean(process.env.ENABLE_LOCAL_TEST_MODE);
  }

  getToken() {
    return process.env.LOCAL_TEST_TOKEN || 'local-test';
  }

  isLocalTestToken(token) {
    return this.isEnabled() && token === this.getToken();
  }

  getRepoOwner() {
    return process.env.LOCAL_TEST_REPO_OWNER || 'demo';
  }

  getRepoName() {
    return process.env.LOCAL_TEST_REPO_NAME || 'course-demo';
  }

  getRepoFullName() {
    return `${this.getRepoOwner()}/${this.getRepoName()}`;
  }

  getRepoPath() {
    return path.resolve(
      workspaceRoot,
      process.env.LOCAL_TEST_REPO_PATH || './test-repo/course-demo'
    );
  }

  matchesRepo(owner, repo) {
    return owner === this.getRepoOwner() && repo === this.getRepoName();
  }

  ensureRepo(owner, repo) {
    if (!this.matchesRepo(owner, repo)) {
      throw new Error(`Unknown local test repository: ${owner}/${repo}`);
    }
  }

  getUser() {
    return {
      id: 999001,
      login: 'local-tester',
      name: 'Local Test User',
      avatar_url: null,
      type: 'User',
    };
  }

  getRepositoryDescriptor() {
    const owner = this.getRepoOwner();
    const name = this.getRepoName();
    return {
      id: 999001,
      name,
      full_name: `${owner}/${name}`,
      private: false,
      description: 'Seeded local repository for testing editor, preview, and collaboration flows.',
      default_branch: 'main',
      stargazers_count: 0,
      language: 'XML',
      owner: {
        login: owner,
      },
    };
  }

  async listRepositories() {
    return [this.getRepositoryDescriptor()];
  }

  async listBranches(owner, repo) {
    this.ensureRepo(owner, repo);
    return [{ name: 'main', protected: false }];
  }

  resolveRepoFile(relativePath = '') {
    const repoRoot = this.getRepoPath();
    const targetPath = path.resolve(repoRoot, relativePath);
    if (!targetPath.startsWith(repoRoot + path.sep) && targetPath !== repoRoot) {
      throw new Error('Access denied');
    }
    return targetPath;
  }

  async getTree(owner, repo, relativePath = '') {
    this.ensureRepo(owner, repo);
    const targetPath = this.resolveRepoFile(relativePath);
    const entries = await fs.readdir(targetPath, { withFileTypes: true });

    return entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        path: relativePath ? `${relativePath}/${entry.name}` : entry.name,
        type: entry.isDirectory() ? 'dir' : 'file',
        sha: entry.isDirectory() ? undefined : hashString(entry.name),
      }))
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === 'dir' ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });
  }

  async getFileContent(owner, repo, filePath) {
    this.ensureRepo(owner, repo);
    const resolvedPath = this.resolveRepoFile(filePath);
    const content = await fs.readFile(resolvedPath, 'utf-8');
    const sha = hashString(content);
    return {
      name: path.basename(filePath),
      path: filePath,
      type: 'file',
      sha,
      size: Buffer.byteLength(content, 'utf-8'),
      encoding: 'base64',
      content: Buffer.from(content, 'utf-8').toString('base64'),
      decoded_content: content,
    };
  }

  async updateFileContent(owner, repo, filePath, content, message = '') {
    this.ensureRepo(owner, repo);
    const resolvedPath = this.resolveRepoFile(filePath);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, content, 'utf-8');
    const sha = hashString(content);
    return {
      content: {
        name: path.basename(filePath),
        path: filePath,
        sha,
      },
      commit: {
        message: message || `Update ${filePath}`,
        sha,
      },
    };
  }

  async copyRepositoryTo(destination) {
    await fs.rm(destination, { recursive: true, force: true });
    await fs.cp(this.getRepoPath(), destination, { recursive: true, force: true });
  }

  async buildOutput(repoPath, outputPath) {
    await fs.rm(outputPath, { recursive: true, force: true });
    await fs.mkdir(outputPath, { recursive: true });

    const xmlPath = path.join(repoPath, 'course.xml');
    const cssPath = path.join(repoPath, 'styles.css');
    const jsPath = path.join(repoPath, 'interactive.js');
    const xmlSource = await readFileIfExists(xmlPath);
    const cssSource = await readFileIfExists(cssPath);
    const jsSource = await readFileIfExists(jsPath);
    const parsed = parseXmlSections(xmlSource);
    const indexHtml = renderCourseHtml(parsed, xmlSource);

    await fs.writeFile(path.join(outputPath, 'index.html'), indexHtml, 'utf-8');
    await fs.writeFile(path.join(outputPath, 'styles.css'), cssSource, 'utf-8');
    await fs.writeFile(path.join(outputPath, 'interactive.js'), jsSource, 'utf-8');
    return {
      entryFile: 'index.html',
      buildType: 'local-demo',
    };
  }
}

const localTestRepoService = new LocalTestRepoService();

export default localTestRepoService;
