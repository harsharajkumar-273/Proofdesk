// Stores and restores the pretex equation-render cache (Docker volume
// mra-pretex-cache) as a GitHub Release asset.  The first person to build
// a repo pays the full ~45-min cost; every subsequent fresh server restore
// the cache in ~30 s and finishes the full build in 2-5 min.
//
// Cache key: pretex-cache-{owner}-{repo}-{sha8}
// Storage:   GitHub Releases on PROOFDESK_CACHE_REPO (defaults to main repo)
// Auth:      GITHUB_PERSONAL_TOKEN (needs repo scope)

import { exec } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import http from 'http';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { getProofdeskDataRoot } from '../utils/dataPaths.js';
import logger from '../utils/logger.js';

const execAsync = promisify(exec);

const DOCKER_VOLUME = 'mra-pretex-cache';

interface GitHubAsset {
  name: string;
  size: number;
  url: string;
}

interface GitHubRelease {
  id: number;
  tag_name: string;
  upload_url: string;
  assets?: GitHubAsset[];
}

class GitHubCacheStore {
  private token: string;
  private cacheRepo: string;
  private enabled: boolean;

  constructor() {
    this.token = process.env.GITHUB_PERSONAL_TOKEN || '';
    this.cacheRepo = process.env.PROOFDESK_CACHE_REPO || 'harsharajkumar/proofdesk';
    this.enabled = !!this.token;

    if (!this.enabled) {
      logger.info('[GitHubCache] GITHUB_PERSONAL_TOKEN not set — pretex cache upload/restore disabled');
    }
  }

  private _tag(owner: string, repo: string, sha: string): string {
    return `pretex-cache-${owner}-${repo}-${sha.slice(0, 8)}`;
  }

  /* ── Restore: download release asset → inject into Docker volume ─────────── */

  async checkAndRestore(owner: string, repo: string, sha?: string | null): Promise<boolean> {
    if (!this.enabled || !sha) return false;

    const tag = this._tag(owner, repo, sha);

    // Check whether the volume already contains exactly this commit's cache by
    // reading the sentinel file written after every successful restore. If it
    // matches, skip the download. If it's a different tag (stale cache from a
    // previous build/repo), wipe the volume and load the correct one.
    try {
      const { stdout } = await execAsync(
        `docker run --rm -v ${DOCKER_VOLUME}:/cache alpine sh -c "cat /cache/.cache-tag 2>/dev/null || echo ''"`,
        { timeout: 15000 }
      );
      const loadedTag = stdout.trim();
      if (loadedTag === tag) {
        logger.info(`[GitHubCache] Volume already has correct cache (${tag}) — skipping restore`, { tag });
        return true;
      }
      if (loadedTag) {
        logger.info(`[GitHubCache] Volume has stale cache (${loadedTag}), need ${tag} — clearing`, { loadedTag, tag });
        await execAsync(
          `docker run --rm -v ${DOCKER_VOLUME}:/cache alpine sh -c "rm -rf /cache/* /cache/.[!.]* 2>/dev/null || true"`,
          { timeout: 30000 }
        ).catch(() => {});
      }
    } catch {
      /* docker unavailable */
    }

    logger.info(`[GitHubCache] Looking for release ${tag} ...`, { tag });

    try {
      const release = await this._getRelease(tag);
      if (!release) {
        logger.info('[GitHubCache] No cached release found — full build required', { tag });
        return false;
      }

      const asset = release.assets?.find((a) => a.name === 'pretex-cache.tar.gz');
      if (!asset) return false;

      logger.info(`[GitHubCache] Restoring pretex cache (${Math.round(asset.size / 1024 / 1024)} MB) ...`, { tag, assetSize: asset.size });
      const tmpFile = path.join(getProofdeskDataRoot(), `pretex-cache-${Date.now()}.tar.gz`);

      await this._downloadAsset(asset.url, tmpFile);

      // Inject into the Docker volume, then write the sentinel tag file
      await execAsync(
        `docker run --rm -v ${DOCKER_VOLUME}:/cache -v "${tmpFile}:/tmp/cache.tar.gz:ro" alpine sh -c "tar xzf /tmp/cache.tar.gz -C / 2>/dev/null; echo '${tag}' > /cache/.cache-tag"`,
        { timeout: 300000 }
      );
      await fs.unlink(tmpFile).catch(() => {});
      logger.info('[GitHubCache] Pretex cache restored — build will skip equation rendering', { tag });
      return true;
    } catch (err: any) {
      logger.warn(`[GitHubCache] Restore failed: ${err.message}`, { tag, err });
      return false;
    }
  }

  /* ── Save: tar Docker volume → create GitHub Release → upload asset ──────── */

  async save(owner: string, repo: string, sha?: string | null): Promise<void> {
    if (!this.enabled || !sha) return;

    const tag = this._tag(owner, repo, sha);

    // Don't re-upload if the release already exists
    const existing = await this._getRelease(tag).catch(() => null);
    if (existing) {
      logger.info(`[GitHubCache] Release ${tag} already exists — skipping upload`, { tag });
      return;
    }

    const tmpFile = path.join(getProofdeskDataRoot(), `pretex-cache-${Date.now()}.tar.gz`);
    logger.info(`[GitHubCache] Packaging pretex cache for upload ...`, { tag });

    try {
      // Tar the entire volume content
      const tmpDir = getProofdeskDataRoot();
      await execAsync(
        `docker run --rm -v ${DOCKER_VOLUME}:/cache -v "${tmpDir}:/out" alpine tar czf "/out/${path.basename(tmpFile)}" /cache`,
        { timeout: 300000 }
      );

      const stat = await fs.stat(tmpFile);
      logger.info(`[GitHubCache] Cache tarball: ${Math.round(stat.size / 1024 / 1024)} MB`, { tag, tarballSize: stat.size });

      const release = await this._createRelease(
        tag,
        `Pretex equation cache for ${owner}/${repo} @ ${sha.slice(0, 8)}\n\nAuto-generated by Proofdesk — do not edit.`
      );
      if (!release) {
        throw new Error('Failed to create GitHub release');
      }
      await this._uploadAsset(release.upload_url, tmpFile, 'pretex-cache.tar.gz', stat.size);
      logger.info(`[GitHubCache] Cache uploaded as release ${tag}`, { tag });

      // Keep the sentinel current so the next build on this machine skips restore
      await execAsync(
        `docker run --rm -v ${DOCKER_VOLUME}:/cache alpine sh -c "echo '${tag}' > /cache/.cache-tag"`,
        { timeout: 15000 }
      ).catch(() => {});
    } catch (err: any) {
      logger.warn(`[GitHubCache] Upload failed (non-fatal): ${err.message}`, { tag, err });
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  /* ── GitHub API helpers ──────────────────────────────────────────────────── */

  private _apiRequest<T>(method: string, pathStr: string, body: any = null): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: 'api.github.com',
        path: pathStr,
        method,
        headers: {
          'Authorization': `token ${this.token}`,
          'User-Agent': 'proofdesk-cache/1.0',
          'Accept': 'application/vnd.github.v3+json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        } as Record<string, string>,
      };
      const req = https.request(opts, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 404) return resolve(null);
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`GitHub API ${res.statusCode}: ${data}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data as any);
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async _getRelease(tag: string): Promise<GitHubRelease | null> {
    const [owner, repo] = this.cacheRepo.split('/');
    return this._apiRequest<GitHubRelease>('GET', `/repos/${owner}/${repo}/releases/tags/${tag}`);
  }

  async _createRelease(tag: string, body: string): Promise<GitHubRelease | null> {
    const [owner, repo] = this.cacheRepo.split('/');
    return this._apiRequest<GitHubRelease>('POST', `/repos/${owner}/${repo}/releases`, {
      tag_name: tag,
      name: tag,
      body,
      draft: false,
      prerelease: true,
    });
  }

  async _uploadAsset(uploadUrl: string, filePath: string, name: string, size: number): Promise<any> {
    // uploadUrl looks like: https://uploads.github.com/repos/.../releases/.../assets{?name,label}
    const base = uploadUrl.replace(/\{.*\}/, '');
    const url = new URL(`${base}?name=${encodeURIComponent(name)}`);

    const fileHandle = await fs.open(filePath, 'r');
    const fileStream = fileHandle.createReadStream();

    return new Promise((resolve, reject) => {
      const opts = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Authorization': `token ${this.token}`,
          'User-Agent': 'proofdesk-cache/1.0',
          'Content-Type': 'application/gzip',
          'Content-Length': String(size),
        },
      };
      const req = https.request(opts, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', async () => {
          await fileHandle.close().catch(() => {});
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`Upload failed ${res.statusCode}: ${data}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      });
      req.on('error', async (err) => {
        await fileHandle.close().catch(() => {});
        reject(err);
      });
      fileStream.pipe(req);
    });
  }

  async _downloadAsset(assetUrl: string, dest: string): Promise<void> {
    // GitHub asset URLs redirect to S3; must follow redirects
    const follow = (url: string, redirects = 5): Promise<void> =>
      new Promise((resolve, reject) => {
        if (redirects === 0) return reject(new Error('Too many redirects'));
        const mod = url.startsWith('https') ? https : http;
        mod.get(
          url,
          {
            headers: {
              'Authorization': `token ${this.token}`,
              'User-Agent': 'proofdesk-cache/1.0',
              'Accept': 'application/octet-stream',
            },
          },
          (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume();
              return follow(res.headers.location, redirects - 1).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
              res.resume();
              return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
            }
            const file = createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => {
              file.close((err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            file.on('error', reject);
          }
        ).on('error', reject);
      });

    return follow(assetUrl);
  }
}

export default new GitHubCacheStore();
