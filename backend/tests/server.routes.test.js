import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { ServerResponse } from 'http';
import { PassThrough, Readable } from 'stream';

process.env.NODE_ENV = 'test';
process.env.ENABLE_LOCAL_TEST_MODE = 'true';
process.env.LOCAL_TEST_TOKEN = 'local-test';
process.env.LOCAL_TEST_REPO_OWNER = 'demo';
process.env.LOCAL_TEST_REPO_NAME = 'course-demo';
process.env.LOCAL_TEST_REPO_PATH = './test-repo/course-demo';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.PROOFDESK_SESSION_SECRET = 'proofdesk-test-session-secret';
process.env.PROOFDESK_DATA_DIR = path.resolve(process.cwd(), '../.tmp/proofdesk-backend-tests');

const authSessionStore = (await import('../src/services/authSessionStore.js')).default;
const { getProofdeskDataPath } = await import('../src/utils/dataPaths.js');
const { getReadinessPayload } = await import('../src/utils/runtimeConfig.js');
const { app } = await import('../src/server.js');

const demoFilePath = path.resolve(process.cwd(), '../test-repo/course-demo/interactive.js');
const previewSessionId = 'aaaaaaaaaaaaaaaa';
const previewOutputDir = path.resolve(getProofdeskDataPath(previewSessionId, 'output'));
const dataRootDir = path.resolve(process.env.PROOFDESK_DATA_DIR);
let originalInteractiveJs = '';

class MockRequest extends Readable {
  constructor({ method, url, headers, body }) {
    super();
    this.method = method;
    this.url = url;
    this.headers = headers;
    this.bodyBuffer = body ? Buffer.from(body) : null;
    this.started = false;
    this.pushBody = () => {
      if (this.started) return;
      this.started = true;
      if (this.bodyBuffer) {
        this.push(this.bodyBuffer);
        this.bodyBuffer = null;
      }
      this.push(null);
    };
    this._read = this.pushBody;
    this.socket = new PassThrough();
    this.connection = this.socket;
    this.httpVersion = '1.1';
    this.httpVersionMajor = 1;
    this.httpVersionMinor = 1;

    process.nextTick(() => {
      this.pushBody();
    });
  }

  _read() {
    this.pushBody();
  }

  pushBody() {
    if (this.started) return;
    this.started = true;
    if (this.bodyBuffer) {
      this.push(this.bodyBuffer);
      this.bodyBuffer = null;
    }
    this.push(null);
  }
}

class InProcessRequest {
  constructor(app, method, url) {
    this.app = app;
    this.method = method;
    this.url = url;
    this.headers = {};
    this.payload = undefined;
  }

  set(name, value) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  send(payload) {
    this.payload = payload;
    return this;
  }

  execute() {
    const body = this.payload === undefined
      ? ''
      : typeof this.payload === 'string'
        ? this.payload
        : JSON.stringify(this.payload);
    const headers = {
      ...this.headers,
    };
    if (body) {
      headers['content-type'] = headers['content-type'] || 'application/json';
      headers['content-length'] = String(Buffer.byteLength(body));
    }

    return new Promise((resolve, reject) => {
      const req = new MockRequest({
        method: this.method,
        url: this.url,
        headers,
        body,
      });
      const res = new ServerResponse(req);
      const chunks = [];

      res.write = (chunk, encoding, callback) => {
        if (chunk) {
          const bufferEncoding = typeof encoding === 'string' ? encoding : undefined;
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, bufferEncoding));
        }
        if (typeof encoding === 'function') encoding();
        if (typeof callback === 'function') callback();
        return true;
      };

      res.end = (chunk, encoding, callback) => {
        if (chunk) {
          const bufferEncoding = typeof encoding === 'string' ? encoding : undefined;
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, bufferEncoding));
        }
        const headers = Object.fromEntries(
          Object.entries(res.getHeaders()).map(([name, value]) => [name.toLowerCase(), value])
        );
        if (headers['set-cookie'] && !Array.isArray(headers['set-cookie'])) {
          headers['set-cookie'] = [headers['set-cookie']];
        }
        const text = Buffer.concat(chunks).toString('utf-8');
        const contentType = String(headers['content-type'] || '');
        let body = {};
        if (text && contentType.includes('application/json')) {
          body = JSON.parse(text);
        }
        resolve({
          status: res.statusCode,
          headers,
          text,
          body,
        });
        if (typeof encoding === 'function') encoding();
        if (typeof callback === 'function') callback();
        return res;
      };

      this.app.handle(req, res, reject);
      req.resume();
    });
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  catch(reject) {
    return this.execute().catch(reject);
  }
}

const request = (appInstance) => ({
  get: (url) => new InProcessRequest(appInstance, 'GET', url),
  post: (url) => new InProcessRequest(appInstance, 'POST', url),
  put: (url) => new InProcessRequest(appInstance, 'PUT', url),
});

before(async () => {
  originalInteractiveJs = await fs.readFile(demoFilePath, 'utf-8');
  await fs.rm(dataRootDir, { recursive: true, force: true });
  await fs.mkdir(path.join(previewOutputDir, 'knowl'), { recursive: true });
  await fs.mkdir(path.join(previewOutputDir, 'css'), { recursive: true });

  await fs.writeFile(
    path.join(previewOutputDir, 'knowl', 'sample.html'),
    '<!DOCTYPE html><html><head><title>Knowl</title></head><body><img src="images/important.svg"><svg><image href="figure-images/sample.png"></image></svg><a href="dimension.html#dimension-defn-basis">in-context</a></body></html>',
    'utf-8'
  );
  await fs.writeFile(
    path.join(previewOutputDir, 'demo.html'),
    '<!DOCTYPE html><html><head><title>Demo</title><link rel="stylesheet" href="styles.css"></head><body><div class="mathbox-wrapper"><div id="mathbox1"></div></div><script src="js/demo.js"></script></body></html>',
    'utf-8'
  );
  await fs.writeFile(
    path.join(previewOutputDir, 'css', 'ila.css'),
    '@font-face { src: url("fonts/CharterBT-Roman.woff") format("woff"); }',
    'utf-8'
  );
  await fs.writeFile(
    path.join(previewOutputDir, 'styles.css'),
    '.lesson-section h2 {\n  margin-top: 0;\n  color: #1d4ed8;\n}\n',
    'utf-8'
  );
  await fs.writeFile(
    path.join(previewOutputDir, 'interactive.js'),
    "badge.textContent = 'Local preview ready';\n",
    'utf-8'
  );
});

after(async () => {
  await fs.writeFile(demoFilePath, originalInteractiveJs, 'utf-8');
  await fs.rm(dataRootDir, { recursive: true, force: true });
});

describe('active backend routes', () => {
  it('creates a cookie-backed local demo auth session', async () => {
    const response = await request(app).get('/auth/local-test');
    assert.equal(response.status, 302);
    assert.match(response.headers.location, /http:\/\/localhost:3000/);
    assert.ok(response.headers['set-cookie'].some((cookie) => cookie.startsWith('proofdesk_session=')));

    if (authSessionStore.persistPromise) {
      await authSessionStore.persistPromise;
    }

    const persistedSessions = await fs.readFile(getProofdeskDataPath('.auth-sessions.json'), 'utf-8');
    assert.ok(!persistedSessions.includes('"accessToken"'));
    assert.ok(!persistedSessions.includes('"accessToken":"local-test"'));
    assert.ok(!persistedSessions.includes('"accessToken": "local-test"'));
    assert.match(persistedSessions, /"encryptedAccessToken":\s*"/);
  });

  it('redirects back with a setup error when GitHub OAuth is still using placeholder values', async () => {
    const originalClientId = process.env.GITHUB_CLIENT_ID;
    const originalClientSecret = process.env.GITHUB_CLIENT_SECRET;
    const originalRedirectUri = process.env.GITHUB_REDIRECT_URI;

    process.env.GITHUB_CLIENT_ID = 'replace_me';
    process.env.GITHUB_CLIENT_SECRET = 'replace_me';
    process.env.GITHUB_REDIRECT_URI = 'replace_me';

    const response = await request(app).get('/auth/github');

    process.env.GITHUB_CLIENT_ID = originalClientId;
    process.env.GITHUB_CLIENT_SECRET = originalClientSecret;
    process.env.GITHUB_REDIRECT_URI = originalRedirectUri;

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, 'http://localhost:3000?error=github_not_configured');
  });

  it('returns health status', async () => {
    const readiness = getReadinessPayload(process.env);
    const response = await request(app).get('/health');
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'OK');
    assert.equal(response.body.ready, readiness.ready);
  });

  it('returns readiness details for deployment checks', async () => {
    const readiness = getReadinessPayload(process.env, {
      strict: process.env.NODE_ENV === 'production',
    });
    const response = await request(app).get('/health/ready');
    assert.equal(response.status, readiness.ready ? 200 : 503);
    assert.equal(response.body.status, readiness.status);
    assert.equal(response.body.ready, readiness.ready);
    assert.equal(response.body.config.localTestModeEnabled, true);
    assert.equal(response.body.config.sessionSecretConfigured, true);
    assert.equal(response.body.config.proofdeskDataRoot, dataRootDir);
    assert.equal(response.body.config.terminalMode, 'restricted');
  });

  it('accepts frontend monitoring events and exposes recent event history', async () => {
    const uniqueMessage = `Synthetic frontend crash ${Date.now()}`;

    const postResponse = await request(app)
      .post('/monitoring/client-error')
      .send({
        category: 'frontend_route_crash',
        message: uniqueMessage,
        pathname: '/editor',
        metadata: {
          accessToken: 'secret-token',
          nested: {
            clientSecret: 'keep-hidden',
          },
        },
      });

    assert.equal(postResponse.status, 202);
    assert.ok(postResponse.body.requestId);

    const getResponse = await request(app)
      .get('/monitoring/events?limit=5')
      .set('Authorization', 'Bearer local-test');

    assert.equal(getResponse.status, 200);
    const matchingEvent = getResponse.body.events.find((entry) => entry.message === uniqueMessage);
    assert.ok(matchingEvent);
    assert.equal(matchingEvent.source, 'frontend');
    assert.equal(matchingEvent.metadata.metadata.accessToken, '[redacted]');
    assert.equal(matchingEvent.metadata.metadata.nested.clientSecret, '[redacted]');
  });

  it('allows the backend preview origin for local demo assets', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:4000');
    assert.equal(response.status, 200);
    assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:4000');
  });

  it('serves the local MathJax runtime from backend assets', async () => {
    const response = await request(app).get('/assets/mathjax/tex-svg.js');
    assert.equal(response.status, 200);
    assert.match(response.text, /MathJax/);
  });

  it('rejects protected routes without a bearer token', async () => {
    const response = await request(app).get('/user');
    assert.equal(response.status, 401);
    assert.equal(response.body.error, 'No token provided');
  });

  it('serves the seeded local-test user and repository list', async () => {
    const userResponse = await request(app)
      .get('/user')
      .set('Authorization', 'Bearer local-test');
    assert.equal(userResponse.status, 200);
    assert.equal(userResponse.body.login, 'local-tester');

    const repoResponse = await request(app)
      .get('/repos')
      .set('Authorization', 'Bearer local-test');
    assert.equal(repoResponse.status, 200);
    assert.equal(repoResponse.body[0].full_name, 'demo/course-demo');
  });

  it('prepares a local-test workspace and serves its tree and file contents', async () => {
    const initResponse = await request(app)
      .post('/workspace/init')
      .set('Authorization', 'Bearer local-test')
      .send({
        owner: 'demo',
        repo: 'course-demo',
        defaultBranch: 'main',
      });
    assert.equal(initResponse.status, 200);
    assert.ok(initResponse.body.sessionId);

    const treeResponse = await request(app)
      .get(`/workspace/${initResponse.body.sessionId}/tree`)
      .set('Authorization', 'Bearer local-test');
    assert.equal(treeResponse.status, 200);
    assert.ok(treeResponse.body.some((item) => item.path === 'course.xml'));

    const fileResponse = await request(app)
      .get(`/workspace/${initResponse.body.sessionId}/contents/course.xml`)
      .set('Authorization', 'Bearer local-test');
    assert.equal(fileResponse.status, 200);
    assert.match(fileResponse.body.decoded_content, /Linear Algebra Demo/);
  });

  it('updates workspace files and commits them through the real git routes', async () => {
    const initResponse = await request(app)
      .post('/workspace/init')
      .set('Authorization', 'Bearer local-test')
      .send({
        owner: 'demo',
        repo: 'course-demo',
        defaultBranch: 'main',
      });
    assert.equal(initResponse.status, 200);
    const sessionId = initResponse.body.sessionId;

    const nextContent = `${originalInteractiveJs}\nconsole.log('supertest update');\n`;
    const updateResponse = await request(app)
      .put(`/workspace/${sessionId}/contents/interactive.js`)
      .set('Authorization', 'Bearer local-test')
      .send({
        content: nextContent,
      });

    assert.equal(updateResponse.status, 200);
    assert.ok(updateResponse.body.content.sha);

    const fileResponse = await request(app)
      .get(`/workspace/${sessionId}/contents/interactive.js`)
      .set('Authorization', 'Bearer local-test');
    assert.equal(fileResponse.status, 200);
    assert.match(fileResponse.body.decoded_content, /supertest update/);

    const statusResponse = await request(app)
      .get(`/workspace/${sessionId}/git/status`)
      .set('Authorization', 'Bearer local-test');
    assert.equal(statusResponse.status, 200);
    assert.ok(statusResponse.body.files.some((file) => file.path === 'interactive.js'));

    const stageResponse = await request(app)
      .post(`/workspace/${sessionId}/git/stage`)
      .set('Authorization', 'Bearer local-test')
      .send({ path: 'interactive.js' });
    assert.equal(stageResponse.status, 200);
    assert.ok(stageResponse.body.files.some((file) => file.path === 'interactive.js' && file.staged === true));

    const commitResponse = await request(app)
      .post(`/workspace/${sessionId}/git/commit`)
      .set('Authorization', 'Bearer local-test')
      .send({ message: 'Test commit from supertest' });
    assert.equal(commitResponse.status, 200);
    assert.match(commitResponse.body.commitSha, /^[0-9a-f]{40}$/);
  });

  it('builds the local demo repository without GitHub', async () => {
    const response = await request(app)
      .post('/build/init')
      .set('Authorization', 'Bearer local-test')
      .send({
        owner: 'demo',
        repo: 'course-demo',
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.buildType, 'local-demo');
    assert.equal(response.body.entryFile, 'index.html');
    assert.ok(response.body.sessionId);
  });

  it('quick-updates live-editable CSS and JavaScript assets', async () => {
    const buildResponse = await request(app)
      .post('/build/init')
      .set('Authorization', 'Bearer local-test')
      .send({
        owner: 'demo',
        repo: 'course-demo',
      });
    assert.equal(buildResponse.status, 200);
    const sessionId = buildResponse.body.sessionId;

    const updatedCss = '.lesson-section h2 {\n  margin-top: 0;\n  color: #b91c1c;\n}\n';
    const cssResponse = await request(app)
      .post('/build/quick-update')
      .set('Authorization', 'Bearer local-test')
      .send({
        sessionId,
        filePath: 'styles.css',
        content: updatedCss,
      });

    assert.equal(cssResponse.status, 200);
    assert.equal(cssResponse.body.success, true);
    const previewCssResponse = await request(app).get(`/preview/${sessionId}/styles.css`);
    assert.equal(previewCssResponse.status, 200);
    assert.match(previewCssResponse.text, /color: #b91c1c/);

    const updatedJavascript = "badge.textContent = 'Reviewed live during testing';\n";
    const javascriptResponse = await request(app)
      .post('/build/quick-update')
      .set('Authorization', 'Bearer local-test')
      .send({
        sessionId,
        filePath: 'interactive.js',
        content: updatedJavascript,
      });

    assert.equal(javascriptResponse.status, 200);
    assert.equal(javascriptResponse.body.success, true);
    const previewJavascriptResponse = await request(app).get(`/preview/${sessionId}/interactive.js`);
    assert.equal(previewJavascriptResponse.status, 200);
    assert.match(previewJavascriptResponse.text, /Reviewed live during testing/);
  });

  it('rewrites nested preview asset paths for knowls and shared CSS', async () => {
    const knowlResponse = await request(app).get(`/preview/${previewSessionId}/knowl/sample.html`);
    assert.equal(knowlResponse.status, 200);
    assert.match(knowlResponse.text, /src="\/preview\/aaaaaaaaaaaaaaaa\/images\/important\.svg"/);
    assert.match(knowlResponse.text, /href="\/preview\/aaaaaaaaaaaaaaaa\/figure-images\/sample\.png"/);
    assert.match(knowlResponse.text, /href="\/preview\/aaaaaaaaaaaaaaaa\/dimension\.html#dimension-defn-basis"/);
    assert.ok(knowlResponse.text.includes("out.join(BSS + '\\n')"));
    assert.match(knowlResponse.text, /inlineMath:\[\[/);

    const cssResponse = await request(app).get(`/preview/${previewSessionId}/css/ila.css`);
    assert.equal(cssResponse.status, 200);
    assert.match(cssResponse.text, /url\("\/preview\/aaaaaaaaaaaaaaaa\/fonts\/CharterBT-Roman\.woff"\)/);
  });

  it('injects the MathBox loader cleanup into preview HTML', async () => {
    const response = await request(app).get(`/preview/${previewSessionId}/demo.html`);
    assert.equal(response.status, 200);
    assert.match(response.text, /id="mathbox-loader-preview-fix"/);
    assert.match(response.text, /proofdesk-loader-hidden/);
    assert.match(response.text, /hideMathBoxLoaders/);
  });

  it('cache-busts local live preview JavaScript and CSS references', async () => {
    const response = await request(app).get(`/preview/${previewSessionId}/demo.html?t=live-123`);
    assert.equal(response.status, 200);
    assert.match(response.text, /href="styles\.css\?proofdeskLive=live-123"/);
    assert.match(response.text, /src="js\/demo\.js\?proofdeskLive=live-123"/);
  });

  it('rejects invalid quick-update session ids', async () => {
    const response = await request(app)
      .post('/build/quick-update')
      .set('Authorization', 'Bearer local-test')
      .send({
        sessionId: 'bad-session',
        filePath: 'styles.css',
        content: 'body { color: red; }',
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'Invalid session ID');
  });
});
