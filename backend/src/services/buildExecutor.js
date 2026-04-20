// backend/src/services/buildExecutor.js
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import localTestRepoService from './localTestRepoService.js';
import { syncPreviewBundle } from './previewBundleService.js';
import { getProofdeskDataRoot } from '../utils/dataPaths.js';
import githubCacheStore from './githubCacheStore.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Simple LRU cache for served build artifacts ───────────────────────────────
// Avoids repeated fs.readFile calls when the same preview asset is requested
// many times (fonts, CSS, images).  Entries are evicted when the cache exceeds
// MAX_ARTIFACT_CACHE_ENTRIES or when the owning session is cleaned up.
const MAX_ARTIFACT_CACHE_ENTRIES = 200;
const MAX_ARTIFACT_CACHE_BYTES   = 32 * 1024 * 1024; // 32 MB total

class ArtifactLRUCache {
  constructor() {
    this._map   = new Map();  // key → { buf, size, sessionId }
    this._bytes = 0;
  }

  get(key) {
    const entry = this._map.get(key);
    if (!entry) return undefined;
    // Move to end (most-recently-used)
    this._map.delete(key);
    this._map.set(key, entry);
    return entry.buf;
  }

  set(key, buf, sessionId) {
    if (this._map.has(key)) {
      this._bytes -= this._map.get(key).size;
      this._map.delete(key);
    }
    const size = buf.length;
    this._map.set(key, { buf, size, sessionId });
    this._bytes += size;
    this._evict();
  }

  invalidateSession(sessionId) {
    for (const [key, entry] of this._map) {
      if (entry.sessionId === sessionId) {
        this._bytes -= entry.size;
        this._map.delete(key);
      }
    }
  }

  _evict() {
    while (
      this._map.size > MAX_ARTIFACT_CACHE_ENTRIES
      || this._bytes > MAX_ARTIFACT_CACHE_BYTES
    ) {
      const oldestKey = this._map.keys().next().value;
      const entry = this._map.get(oldestKey);
      this._bytes -= entry.size;
      this._map.delete(oldestKey);
    }
  }
}

const artifactCache = new ArtifactLRUCache();

// Bump this whenever the local build/render toolchain changes in a way that
// should invalidate app-side cached preview builds.
const BUILD_CACHE_VERSION = 'preview-toolchain-20260324-1';

// The editor preview clones the GitHub repo into /tmp, so it does not see the
// local renderer/build fixes that made the static build work. Copy the known
// good toolchain files from our local workspace into each cloned repo before
// running Docker, while leaving authored chapter content untouched.
const PATCHED_TOOLCHAIN_FILES = [
  'SConstruct',
  'demos/SConscript',
  'demos/rabbits.html',
  'pretex/processtex.py',
  'mathbox/gulpfile.js',
  'mathbox/src/shaders/factory.coffee',
  'mathbox/vendor/shadergraph/src/factory/library.coffee',
  'static/css/ila-add-on.css',
  'static/css/ila-add-on-gt.css',
];

// Named Docker volumes shared across ALL build runs.
// The pretex-cache holds pre-rendered LaTeX→SVG equation images.
// Sharing it means: first build = 30 min, every subsequent build = 2-5 min.
const SHARED_DOCKER_VOLUMES = [
  '-v mra-pretex-cache:/home/vagrant/cache',
  '-v mra-vagrant-build:/home/vagrant/build',
].join(' ');

class BuildExecutor {
  constructor() {
    this.image   = process.env.PROOFDESK_DOCKER_IMAGE || 'mra-pretext-builder';
    this.workspaceRoot = path.resolve(__dirname, '../../..');
    this.localRepoToolchainRoot = path.join(this.workspaceRoot, 'builds', 'ila-repo');
    this.dockerDir = path.join(this.workspaceRoot, 'docker');
    this.imageEnsurePromise = null;

    // Active sessions: sessionId → { owner, repo, repoPath, outputPath, fromCache }
    this.sessions = new Map();

    // Build cache: "owner/repo" → { commitHash, cacheVersion, repoPath, outputPath, sessionId, builtAt }
    // When a user requests a repo whose HEAD commit matches a cached build,
    // we skip clone + Docker entirely and return in ~100ms.
    this.buildCache = new Map();
    this.cacheFile  = path.join(this.workDir, '.build-cache.json');

    // In-progress dedup: "owner/repo" → Promise<{ repoPath, outputPath }>
    // If two requests for the same repo arrive simultaneously, the second one
    // waits for the first build rather than starting a duplicate.
    this.inProgress = new Map();

    // Tracks repos currently running a Docker build so callers can detect
    // "already building" and show a waiting UI instead of "Build Failed".
    this.dockerBuildsInProgress = new Set();

    // Restore persisted cache from previous server runs
    this._loadCache();
  }

  get workDir() {
    return getProofdeskDataRoot();
  }

  scheduleCleanup(sessionId) {
    const ttlMs = Number(process.env.PROOFDESK_SESSION_TTL_MS) || 2 * 60 * 60 * 1000;
    const timer = setTimeout(() => this.cleanup(sessionId), ttlMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  }

  async _ensureImageAvailableNow() {
    try {
      const { stdout } = await execAsync(`docker images -q ${this.image}`, { timeout: 10000 });
      if (stdout.trim()) return false;
    } catch {
      // docker CLI unavailable — fall through to build attempt
    }

    console.log(`[Docker] Image ${this.image} not found locally. Building from ${this.dockerDir}...`);
    const buildCmd = `docker build -t ${this.image} "${this.dockerDir}"`;
    const { stderr } = await execAsync(buildCmd, {
      timeout: 2 * 60 * 60 * 1000,
      maxBuffer: 50 * 1024 * 1024,
    });
    if (stderr) console.log('Docker image build stderr:', stderr);
    return true;
  }

  async ensureImageAvailable() {
    if (this.imageEnsurePromise) {
      return this.imageEnsurePromise;
    }

    this.imageEnsurePromise = this._ensureImageAvailableNow().finally(() => {
      this.imageEnsurePromise = null;
    });

    return this.imageEnsurePromise;
  }

  /* ─── Cache persistence ──────────────────────────────────────────────────── */

  async _loadCache() {
    try {
      await fs.mkdir(this.workDir, { recursive: true });
      const raw     = await fs.readFile(this.cacheFile, 'utf-8');
      const entries = JSON.parse(raw);
      let restored  = 0;
      for (const [key, value] of entries) {
        try {
          if (value.cacheVersion !== BUILD_CACHE_VERSION) continue;
          await fs.access(value.outputPath); // only restore if output still on disk
          this.buildCache.set(key, value);
          restored++;
        } catch { /* output was cleaned up — skip */ }
      }
      if (restored > 0) console.log(`[BuildCache] Restored ${restored} cached builds`);
    } catch { /* no cache file yet — normal on first run */ }
  }

  async _saveCache() {
    try {
      await fs.writeFile(this.cacheFile, JSON.stringify([...this.buildCache.entries()]), 'utf-8');
    } catch (e) {
      console.error('[BuildCache] Failed to save cache:', e.message);
    }
  }

  async _syncPatchedToolchainFiles(repoPath) {
    const copied = [];
    for (const relPath of PATCHED_TOOLCHAIN_FILES) {
      const srcPath = path.join(this.localRepoToolchainRoot, relPath);
      const destPath = path.join(repoPath, relPath);
      try {
        await fs.access(srcPath);
      } catch {
        continue;
      }
      try {
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.copyFile(srcPath, destPath);
        copied.push(relPath);
      } catch (error) {
        console.warn(`[BuildSync] Failed to copy ${relPath}: ${error.message}`);
      }
    }

    if (copied.length > 0) {
      console.log(`[BuildSync] Applied local toolchain fixes to ${copied.length} files`);
    }
  }

  async _findLocalMirror(owner, repo) {
    const candidates = [
      path.join(this.workspaceRoot, 'builds', `${repo}-repo`),
      path.join(this.workspaceRoot, 'builds', `${owner}-${repo}`),
      path.join(this.workspaceRoot, 'builds', owner, repo),
    ];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        continue;
      }
    }

    return null;
  }

  async _populateFromLocalMirror(owner, repo, repoPath) {
    const mirrorPath = await this._findLocalMirror(owner, repo);
    if (!mirrorPath) return false;

    console.log(`[BuildClone] Falling back to local mirror for ${owner}/${repo}: ${mirrorPath}`);
    await fs.rm(repoPath, { recursive: true, force: true });
    await fs.cp(mirrorPath, repoPath, {
      recursive: true,
      filter: (src) => {
        const rel = path.relative(mirrorPath, src);
        if (!rel) return true;
        const parts = rel.split(path.sep);
        if (parts.includes('node_modules')) return false;
        if (parts[0] === 'html') return false;
        return true;
      },
    });
    return true;
  }

  async _seedOutputFromLocalBuild(outputPath) {
    const candidates = [
      path.join(this.workspaceRoot, 'builds', 'output'),
      path.join(this.localRepoToolchainRoot, 'html'),
    ];

    for (const candidate of candidates) {
      try {
        const entryFile = await this.findEntry(candidate);
        if (!entryFile) continue;
        await fs.cp(candidate, outputPath, { recursive: true, force: true });
        console.log(`[BuildSeed] Seeded preview output from ${candidate}`);
        return true;
      } catch {
        continue;
      }
    }

    return false;
  }

  async _copyWorkspaceSnapshot(sourceRepoPath, sourceOutputPath, baseDir) {
    const repoPath = path.join(baseDir, 'repo');
    const outputPath = path.join(baseDir, 'output');

    await fs.rm(baseDir, { recursive: true, force: true });
    await fs.mkdir(baseDir, { recursive: true });
    await fs.cp(sourceRepoPath, repoPath, {
      recursive: true,
      force: true,
      filter: (src) => {
        const rel = path.relative(sourceRepoPath, src);
        if (!rel) return true;
        return !rel.split(path.sep).includes('node_modules');
      },
    });

    try {
      await fs.cp(sourceOutputPath, outputPath, { recursive: true, force: true });
    } catch {
      await fs.mkdir(outputPath, { recursive: true });
    }

    return { repoPath, outputPath };
  }

  async _getLocalMirrorCommit(owner, repo) {
    const mirrorPath = await this._findLocalMirror(owner, repo);
    if (!mirrorPath) return null;

    try {
      const { stdout } = await execAsync('git rev-parse HEAD', {
        cwd: mirrorPath,
        timeout: 5000,
      });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /* ─── Fast commit-hash check (no clone needed) ──────────────────────────── */

  async _getLatestCommit(owner, repo, token) {
    const url = `https://github.com/${owner}/${repo}.git`;
    const env = token
      ? { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo', GIT_USERNAME: 'x-token', GIT_PASSWORD: token,
          GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '' }
      : { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    try {
      const { stdout } = await execAsync(`git ls-remote "${url}" HEAD`, { timeout: 3000, env });
      return stdout.split('\t')[0]?.trim() || null;
    } catch {
      return null; // network error — fall through to full build
    }
  }

  /* ─── Clone (shallow for speed) ─────────────────────────────────────────── */

  async _clone(owner, repo, token, repoPath) {
    const publicUrl = `https://github.com/${owner}/${repo}.git`;
    const cloneEnv  = token
      ? { ...process.env, GIT_ASKPASS: 'echo', GIT_USERNAME: 'x-token', GIT_PASSWORD: token,
          GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '' }
      : process.env;
    const opts = { timeout: 300000, maxBuffer: 10 * 1024 * 1024, env: cloneEnv };

    // --depth=1 skips full history and is typically 5-10× faster than a full clone.
    // --single-branch skips all other branches.
    // --recurse-submodules --shallow-submodules also shallow-clones submodules.
    const shallowCmd = `git clone --depth=1 --single-branch --recurse-submodules --shallow-submodules "${publicUrl}" "${repoPath}"`;

    try {
      const { stderr } = await execAsync(shallowCmd, opts);
      if (stderr) console.log('Clone stderr:', stderr);
    } catch (publicErr) {
      console.log('Public clone failed, retrying with auth...');
      try {
        await fs.rm(repoPath, { recursive: true, force: true });
        await fs.mkdir(repoPath, { recursive: true });
      } catch {}

      if (!token) throw new Error(`Clone failed: ${publicErr.stderr || publicErr.message}`);

      const authHeader = `Authorization: Basic ${Buffer.from(`x-token:${token}`).toString('base64')}`;
      try {
        await execAsync(
          `git -c http.extraHeader="${authHeader}" clone --depth=1 --single-branch --recurse-submodules --shallow-submodules "${publicUrl}" "${repoPath}"`,
          { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
        );
      } catch (authErr) {
        throw new Error(`Clone failed: ${authErr.stderr || authErr.message}`);
      }
    }

    // Confirm clone succeeded
    await fs.access(path.join(repoPath, '.git'));
    console.log(`Cloned ${owner}/${repo} successfully`);
  }

  /* ─── prepareRepository: cache check → dedup → clone ────────────────────── */

  async prepareRepository(owner, repo, token, options = {}) {
    const startTime = Date.now();
    const defaultBranch = options.defaultBranch || 'main';
    console.log(`[BuildExecutor] Preparing repository: ${owner}/${repo} (Start: ${new Date().toISOString()})`);

    if (localTestRepoService.isEnabled() && localTestRepoService.matchesRepo(owner, repo)) {
      const sessionId = crypto.randomBytes(8).toString('hex');
      const baseDir = path.join(this.workDir, sessionId);
      const repoPath = path.join(baseDir, 'repo');
      const outputPath = path.join(baseDir, 'output');

      await fs.mkdir(baseDir, { recursive: true });
      await localTestRepoService.copyRepositoryTo(repoPath);
      await fs.mkdir(outputPath, { recursive: true });

      this.sessions.set(sessionId, {
        owner,
        repo,
        token,
        repoPath,
        outputPath,
        fromCache: false,
        localTestMode: true,
        defaultBranch,
      });
      this.scheduleCleanup(sessionId);

      console.log(`[BuildExecutor] Local test repo prepared in ${Date.now() - startTime}ms`);
      return { sessionId, repoPath, fromCache: false };
    }

    const repoKey = `${owner}/${repo}`;
    const localMirrorCommit = await this._getLocalMirrorCommit(owner, repo);
    const preferSeed = options.preferSeed === true;

    // 1. Get latest commit SHA cheaply (no clone) — ~1-2 seconds
    console.log(`[BuildCache] Checking HEAD for ${repoKey}...`);
    const commitHash = await this._getLatestCommit(owner, repo, token) || localMirrorCommit;
    console.log(`[BuildCache] HEAD check completed in ${Date.now() - startTime}ms`);

    // 2. Cache hit: same commit already built → return instantly
    if (commitHash) {
      const cached = this.buildCache.get(repoKey);
      if (
        cached
        && cached.cacheVersion === BUILD_CACHE_VERSION
        && cached.commitHash === commitHash
      ) {
        console.log(`[BuildCache] HIT ${repoKey}@${commitHash.slice(0, 7)} — no build needed`);
        const sessionId = crypto.randomBytes(8).toString('hex');
        const baseDir = path.join(this.workDir, sessionId);
        const workspace = await this._copyWorkspaceSnapshot(cached.repoPath, cached.outputPath, baseDir);
        this.sessions.set(sessionId, {
          owner, repo, token,
          repoPath:   workspace.repoPath,
          outputPath: workspace.outputPath,
          fromCache:  true,
          defaultBranch,
        });
        this.scheduleCleanup(sessionId);
        console.log(`[BuildExecutor] Cache HIT prepared in ${Date.now() - startTime}ms`);
        return { sessionId, repoPath: workspace.repoPath, fromCache: true };
      }
    }

    // 3. Dedup: if a build is already in progress for this repo, wait for it
    if (this.inProgress.has(repoKey)) {
      console.log(`[BuildCache] Build in progress for ${repoKey}, waiting...`);
      const existing  = await this.inProgress.get(repoKey);
      const sessionId = crypto.randomBytes(8).toString('hex');
      const baseDir = path.join(this.workDir, sessionId);
      const workspace = await this._copyWorkspaceSnapshot(existing.repoPath, existing.outputPath, baseDir);
      this.sessions.set(sessionId, {
        owner,
        repo,
        token,
        repoPath: workspace.repoPath,
        outputPath: workspace.outputPath,
        fromCache: true,
        defaultBranch,
      });
      this.scheduleCleanup(sessionId);
      console.log(`[BuildExecutor] Deduped build prepared in ${Date.now() - startTime}ms`);
      return { sessionId, repoPath: workspace.repoPath, fromCache: true };
    }

    // 4. Fresh clone + build
    const sessionId  = crypto.randomBytes(8).toString('hex');
    const baseDir    = path.join(this.workDir, sessionId);
    const repoPath   = path.join(baseDir, 'repo');
    const outputPath = path.join(baseDir, 'output');
    let seededFromLocal = false;

    await fs.mkdir(repoPath,   { recursive: true });
    await fs.mkdir(outputPath, { recursive: true });

    if (preferSeed) {
      console.log(`[BuildExecutor] Attempting to seed from local mirror for ${repoKey}`);
      const usedLocalMirror = await this._populateFromLocalMirror(owner, repo, repoPath);
      if (usedLocalMirror) {
        seededFromLocal = await this._seedOutputFromLocalBuild(outputPath);
        await this._syncPatchedToolchainFiles(repoPath);

        this.sessions.set(sessionId, {
          owner,
          repo,
          token,
          repoPath,
          outputPath,
          commitHash,
          fromCache: seededFromLocal,
          seededFromLocal,
          defaultBranch,
        });
        this.scheduleCleanup(sessionId);

        console.log(`[BuildExecutor] Seeded from local mirror in ${Date.now() - startTime}ms`);
        return { sessionId, repoPath, fromCache: seededFromLocal };
      }
    }

    // Register the in-progress promise so concurrent requests dedup against it
    const buildPromise = this._clone(owner, repo, token, repoPath)
      .catch(async (error) => {
        console.warn(`[BuildExecutor] Clone failed, trying mirror: ${error.message}`);
        const usedLocalMirror = await this._populateFromLocalMirror(owner, repo, repoPath);
        if (!usedLocalMirror) throw error;
        seededFromLocal = await this._seedOutputFromLocalBuild(outputPath);
      })
      .then(async () => {
        await this._syncPatchedToolchainFiles(repoPath);
        return { repoPath, outputPath };
      });
    
    this.inProgress.set(repoKey, buildPromise);
    buildPromise.then(
      () => this.inProgress.delete(repoKey),
      () => this.inProgress.delete(repoKey),
    );

    await buildPromise;

    if (preferSeed && !seededFromLocal) {
      seededFromLocal = await this._seedOutputFromLocalBuild(outputPath);
    }

    this.sessions.set(sessionId, {
      owner,
      repo,
      token,
      repoPath,
      outputPath,
      commitHash,
      fromCache: seededFromLocal,
      seededFromLocal,
      defaultBranch,
    });
    // 2-hour TTL on uncached sessions
    this.scheduleCleanup(sessionId);

    console.log(`[BuildExecutor] Fresh repo prepared in ${Date.now() - startTime}ms`);
    return { sessionId, repoPath, fromCache: seededFromLocal };
  }

  /* ─── build: run Docker, cache result ───────────────────────────────────── */

  async build(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Invalid build session');

    if (session.localTestMode) {
      const localBuild = await localTestRepoService.buildOutput(session.repoPath, session.outputPath);
      session.previewPath = await syncPreviewBundle({
        sessionId,
        outputPath: session.outputPath,
        repoPath: session.repoPath,
      });
      const artifacts = await this.findArtifacts(session.outputPath);
      return {
        success: artifacts.length > 0,
        buildType: localBuild.buildType,
        artifacts,
        entryFile: localBuild.entryFile,
        stdout: '',
        stderr: '',
        sessionId,
        fromCache: false,
      };
    }

    // Cache hit: skip Docker entirely, return existing output
    if (session.fromCache) {
      session.previewPath = await syncPreviewBundle({
        sessionId,
        outputPath: session.outputPath,
        repoPath: session.repoPath,
      });
      const artifacts = await this.findArtifacts(session.outputPath);
      const entryFile = await this.findEntry(session.outputPath);
      console.log(`[BuildCache] Serving cached output for ${session.owner}/${session.repo}`);
      return {
        success: artifacts.length > 0 || !!entryFile,
        buildType: session.seededFromLocal ? 'seeded-local' : 'cached',
        artifacts,
        entryFile,
        sessionId,
        fromCache: true,
      };
    }

    const repoKey = `${session.owner}/${session.repo}`;

    // If a Docker build is already running for this repo, tell the caller
    // so the UI can show "build in progress" instead of "Build Failed".
    if (this.dockerBuildsInProgress.has(repoKey)) {
      console.log(`[BuildExecutor] Docker build already running for ${repoKey} — returning buildInProgress`);
      return {
        success: false,
        buildInProgress: true,
        buildType: 'scons-html',
        artifacts: [],
        entryFile: null,
        sessionId,
      };
    }

    // Try to restore pretex equation cache from GitHub Releases before running Docker.
    // If restored, the build skips the slowest step and finishes in ~3 min instead of ~60 min.
    let commitHash = session.commitHash || null;
    try {
      const { stdout: sha } = await execAsync('git rev-parse HEAD', {
        cwd: session.repoPath, timeout: 5000,
      });
      commitHash = sha.trim();
    } catch {}
    await githubCacheStore.checkAndRestore(session.owner, session.repo, commitHash);

    // Mount shared volumes so the pretex equation cache is reused across builds
    const cmd = [
      'docker run --rm',
      `-v "${session.repoPath}:/repo"`,
      `-v "${session.outputPath}:/output"`,
      SHARED_DOCKER_VOLUMES,
      this.image,
    ].join(' ');

    console.log(`Running build: ${cmd}`);

    try {
      await this.ensureImageAvailable();
    } catch (err) {
      console.error('Docker image setup error:', err.message);
      return {
        success: false,
        buildType: 'scons-html',
        artifacts: [],
        entryFile: null,
        stdout: err.stdout || '',
        stderr:
          `Docker builder image "${this.image}" is unavailable and automatic setup failed.\n` +
          `${err.stderr || err.message}`,
        command: `docker build -t ${this.image} "${this.dockerDir}"`,
        sessionId,
      };
    }

    this.dockerBuildsInProgress.add(repoKey);
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: 3600000, // 60 min hard limit
        maxBuffer: 50 * 1024 * 1024,
      });
      if (stderr) console.log('Build stderr:', stderr);

      const artifacts = await this.findArtifacts(session.outputPath);
      const entryFile = await this.findEntry(session.outputPath);
      const success   = artifacts.length > 0 || !!entryFile;

      // Cache the successful build
      if (success) {
        const repoKey = `${session.owner}/${session.repo}`;
        // commitHash was already resolved above before the Docker run
        try {
          if (!commitHash) {
            const { stdout: sha } = await execAsync('git rev-parse HEAD', {
              cwd: session.repoPath, timeout: 5000,
            });
            commitHash = sha.trim();
          }
        } catch {}

        // Upload pretex cache to GitHub Releases in the background (non-blocking)
        githubCacheStore.save(session.owner, session.repo, commitHash).catch(() => {});

        this.buildCache.set(repoKey, {
          commitHash,
          cacheVersion: BUILD_CACHE_VERSION,
          repoPath:   session.repoPath,
          outputPath: session.outputPath,
          sessionId,
          builtAt: Date.now(),
        });
        await this._saveCache();
        console.log(`[BuildCache] Cached ${repoKey}@${commitHash?.slice(0, 7)}`);
        session.previewPath = await syncPreviewBundle({
          sessionId,
          outputPath: session.outputPath,
          repoPath: session.repoPath,
        });
      }

      return { success, buildType: 'scons-html', artifacts, entryFile, stdout, stderr, command: cmd, sessionId };

    } catch (err) {
      console.error('Build error:', err.message);
      return {
        success: false, buildType: 'scons-html', artifacts: [], entryFile: null,
        stdout: err.stdout || '', stderr: err.stderr || err.message, command: cmd, sessionId,
      };
    } finally {
      this.dockerBuildsInProgress.delete(repoKey);
    }
  }

  /* ─── prewarm: build a repo in the background at server startup ──────────── */

  async prewarm(owner, repo, token = null) {
    const repoKey = `${owner}/${repo}`;
    console.log(`[Prewarm] Starting background build for ${repoKey}`);
    try {
      const { sessionId, fromCache } = await this.prepareRepository(owner, repo, token);
      if (fromCache) {
        console.log(`[Prewarm] ${repoKey} — already cached, nothing to do`);
        return;
      }
      const result = await this.build(sessionId);
      console.log(`[Prewarm] ${repoKey} — ${result.success ? 'ready' : 'build failed'}`);
    } catch (err) {
      console.error(`[Prewarm] ${repoKey} failed:`, err.message);
    }
  }

  /* ─── findArtifacts ──────────────────────────────────────────────────────── */

  async findArtifacts(outputPath) {
    const artifacts = [];
    try {
      const files = await this.walkDir(outputPath);
      for (const file of files) {
        artifacts.push({
          path:     path.relative(outputPath, file),
          type:     path.extname(file),
          fullPath: file,
        });
      }
    } catch (error) {
      console.error('Error finding artifacts:', error.message);
    }
    return artifacts;
  }

  /* ─── walkDir ────────────────────────────────────────────────────────────── */

  async walkDir(dir) {
    const files = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...await this.walkDir(full));
        else files.push(full);
      }
    } catch {}
    return files;
  }

  /* ─── findEntry ──────────────────────────────────────────────────────────── */

  async findEntry(outputPath) {
    for (const candidate of ['overview.html', 'toc.html', 'home.html', 'main.html', 'index.html']) {
      try {
        await fs.access(path.join(outputPath, candidate));
        return candidate;
      } catch {}
    }
    try {
      const files   = await fs.readdir(outputPath);
      const htmlFile = files.find(f => f.endsWith('.html'));
      if (htmlFile) return htmlFile;
    } catch {}
    return null;
  }

  /* ─── updateFile + rebuild ───────────────────────────────────────────────── */

  async updateFile(sessionId, filePath, content) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Invalid session');

    await fs.writeFile(path.join(session.repoPath, filePath), content, 'utf-8');
    console.log(`Updated file: ${filePath}`);

    if (session.localTestMode) {
      return this.build(sessionId);
    }

    // Invalidate the build cache for this repo since content changed
    const repoKey = `${session.owner}/${session.repo}`;
    this.buildCache.delete(repoKey);
    await this._saveCache();

    // Mark this session as a fresh build (not cached)
    session.fromCache = false;

    return this.build(sessionId);
  }

  /* ─── serveArtifact ──────────────────────────────────────────────────────── */

  async serveArtifact(sessionId, filePath) {
    if (!/^[0-9a-f]{16}$/.test(sessionId)) throw new Error('Invalid session ID');

    const session    = this.sessions.get(sessionId);
    const outputPath = session ? session.outputPath : path.join(this.workDir, sessionId, 'output');
    const repoPath   = session ? session.repoPath   : path.join(this.workDir, sessionId, 'repo');

    const resolvedOutput = path.resolve(outputPath, filePath);
    const allowedOutput  = path.resolve(outputPath);

    if (!resolvedOutput.startsWith(allowedOutput + path.sep) && resolvedOutput !== allowedOutput) {
      throw new Error('Path traversal attempt blocked');
    }

    const cacheKey = `${sessionId}:${filePath}`;
    const cached = artifactCache.get(cacheKey);
    if (cached) return cached;

    const readAndCache = async (fullPath) => {
      const buf = await fs.readFile(fullPath);
      artifactCache.set(cacheKey, buf, sessionId);
      return buf;
    };

    try {
      await fs.access(resolvedOutput);
      return readAndCache(resolvedOutput);
    } catch {
      const resolvedRepo  = path.resolve(repoPath, filePath);
      const allowedRepo   = path.resolve(repoPath);
      if (!resolvedRepo.startsWith(allowedRepo + path.sep) && resolvedRepo !== allowedRepo) {
        throw new Error('Path traversal attempt blocked');
      }
      try {
        await fs.access(resolvedRepo);
        return readAndCache(resolvedRepo);
      } catch {
        throw new Error(`Artifact not found: ${filePath}`);
      }
    }
  }

  /* ─── cleanup ────────────────────────────────────────────────────────────── */

  async cleanup(sessionId) {
    if (!/^[0-9a-f]{16}$/.test(sessionId)) return;

    const session = this.sessions.get(sessionId);
    const baseDir = session
      ? path.dirname(session.repoPath)
      : path.join(this.workDir, sessionId);

    // Protect directories that are still referenced by the build cache.
    // Check ALL cache entries (not just the one for this session's repo)
    // so a post-restart cleanup call never wipes a directory another repo's
    // cache entry is pointing at.
    const isDirCached = [...this.buildCache.values()].some(entry => {
      const cachedBase = path.dirname(entry.repoPath);
      return cachedBase === path.resolve(baseDir);
    });

    if (isDirCached) {
      const repoKey = session ? `${session.owner}/${session.repo}` : sessionId;
      console.log(`[BuildCache] Keeping ${repoKey} directory (still in cache)`);
      this.sessions.delete(sessionId);
      return;
    }

    try {
      await fs.rm(baseDir, { recursive: true, force: true });
      console.log(`Cleaned up session: ${sessionId}`);
    } catch (error) {
      console.error(`Cleanup error for ${sessionId}:`, error.message);
    }
    artifactCache.invalidateSession(sessionId);
    this.sessions.delete(sessionId);
  }
}

export default new BuildExecutor();
