import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';

const { isGitHubHost } = await import('../src/services/githubCacheStore.js');
const cacheStore = (await import('../src/services/githubCacheStore.js')).default;

/**
 * Regression tests for the credential leak reported in issue #53.
 *
 * `_downloadAsset` follows redirects itself, and sent `Authorization: token …` on every hop. GitHub
 * release assets redirect to pre-signed S3 URLs, so the token was being handed to a host that has
 * no business seeing it — and S3 rejected the request as a signature mismatch, which is the visible
 * symptom the issue describes.
 *
 * The redirect behaviour is exercised against two local HTTP servers rather than mocked, so what is
 * asserted is the headers that actually went over a socket.
 */
describe('GitHub cache asset download (issue #53)', () => {
  describe('host classification', () => {
    it('accepts github.com and its subdomains', () => {
      assert.equal(isGitHubHost('github.com'), true);
      assert.equal(isGitHubHost('api.github.com'), true);
      assert.equal(isGitHubHost('uploads.github.com'), true);
    });

    it('rejects a lookalike domain that merely ends in github.com', () => {
      // The check suggested in the issue, `hostname.endsWith('github.com')`, accepts all of these.
      assert.equal(isGitHubHost('evilgithub.com'), false);
      assert.equal(isGitHubHost('notgithub.com'), false);
      assert.equal(isGitHubHost('mygithub.com'), false);
    });

    it('rejects the hosts a release asset actually redirects to', () => {
      assert.equal(isGitHubHost('objects.githubusercontent.com'), false);
      assert.equal(isGitHubHost('github-releases.s3.amazonaws.com'), false);
      assert.equal(isGitHubHost('s3.amazonaws.com'), false);
    });

    it('rejects an empty or unrelated host', () => {
      assert.equal(isGitHubHost(''), false);
      assert.equal(isGitHubHost('example.com'), false);
      assert.equal(isGitHubHost('github.com.evil.net'), false);
    });
  });

  describe('following a redirect', () => {
    let origin;
    let destination;
    let originUrl;
    let destinationUrl;
    let workDir;
    /** Headers seen by the redirect target, i.e. the stand-in for S3. */
    let destinationHeaders;

    before(async () => {
      workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proofdesk-cache-'));

      destination = http.createServer((req, res) => {
        destinationHeaders = req.headers;
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end('asset-contents');
      });
      await new Promise((resolve) => destination.listen(0, '127.0.0.1', resolve));
      destinationUrl = `http://127.0.0.1:${destination.address().port}/asset.tar.gz`;

      origin = http.createServer((req, res) => {
        if (req.url === '/relative') {
          // A Location header is allowed to be a path rather than an absolute URL.
          res.writeHead(302, { Location: '/final' });
          return res.end();
        }
        if (req.url === '/final') {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          return res.end('relative-target');
        }
        res.writeHead(302, { Location: destinationUrl });
        res.end();
      });
      await new Promise((resolve) => origin.listen(0, '127.0.0.1', resolve));
      originUrl = `http://127.0.0.1:${origin.address().port}/download`;
    });

    after(async () => {
      await new Promise((resolve) => origin.close(resolve));
      await new Promise((resolve) => destination.close(resolve));
      await fs.rm(workDir, { recursive: true, force: true });
    });

    it('does not send the Authorization header to the redirect target', async () => {
      destinationHeaders = null;
      const dest = path.join(workDir, 'asset.bin');

      await cacheStore._downloadAsset(originUrl, dest);

      assert.ok(destinationHeaders, 'the redirect target was never reached');
      assert.equal(
        destinationHeaders.authorization,
        undefined,
        'the GitHub token was forwarded to the redirect target'
      );
    });

    it('still sends the headers the asset endpoint needs', async () => {
      destinationHeaders = null;
      await cacheStore._downloadAsset(originUrl, path.join(workDir, 'asset2.bin'));

      assert.equal(destinationHeaders['user-agent'], 'proofdesk-cache/1.0');
      assert.equal(destinationHeaders.accept, 'application/octet-stream');
    });

    it('writes the body from the redirect target, not the redirect itself', async () => {
      const dest = path.join(workDir, 'asset3.bin');
      await cacheStore._downloadAsset(originUrl, dest);
      assert.equal(await fs.readFile(dest, 'utf8'), 'asset-contents');
    });

    it('resolves a relative Location against the URL that produced it', async () => {
      // Passing a bare `/final` back into the follower would leave it with no scheme or host.
      const dest = path.join(workDir, 'relative.bin');
      const base = originUrl.replace('/download', '/relative');

      await cacheStore._downloadAsset(base, dest);
      assert.equal(await fs.readFile(dest, 'utf8'), 'relative-target');
    });

    it('rejects a malformed redirect target instead of throwing out of the promise', async () => {
      await assert.rejects(
        cacheStore._downloadAsset('not-a-url', path.join(workDir, 'bad.bin')),
        /Invalid redirect target/
      );
    });

    it('gives up after too many redirects', async () => {
      const loop = http.createServer((_req, res) => {
        res.writeHead(302, { Location: `http://127.0.0.1:${loop.address().port}/again` });
        res.end();
      });
      await new Promise((resolve) => loop.listen(0, '127.0.0.1', resolve));

      try {
        await assert.rejects(
          cacheStore._downloadAsset(
            `http://127.0.0.1:${loop.address().port}/start`,
            path.join(workDir, 'loop.bin')
          ),
          /Too many redirects/
        );
      } finally {
        await new Promise((resolve) => loop.close(resolve));
      }
    });
  });
});

/**
 * Restoring the pretex equation cache into the shared Docker volume.
 *
 * The volume used to be cleared whenever the commit being built differed from the one last
 * loaded, before looking for a release. A new commit has no release of its own yet, so every
 * commit after the first was rendered from nothing. Docker and the GitHub API are stubbed here;
 * what is asserted is which release gets restored, and that nothing removes what is already there.
 */
describe('GitHub cache restore', () => {
  const SHA = '0123456789abcdef0123456789abcdef01234567';
  const TAG = 'pretex-cache-o-r-01234567';
  const release = (tag) => ({ id: 1, tag_name: tag, upload_url: '', assets: [{ name: 'pretex-cache.tar.gz', size: 1, url: 'x' }] });

  let extracted;
  let latestLookups;

  beforeEach(() => {
    cacheStore.enabled = true;
    extracted = [];
    latestLookups = 0;
    mock.method(cacheStore, '_downloadAsset', async () => {});
    mock.method(cacheStore, '_extractIntoVolume', async (_file, tag) => { extracted.push(tag); });
  });

  afterEach(() => {
    mock.restoreAll();
    cacheStore.enabled = false;
  });

  const stub = ({ volume = [], exact = null, latest = null }) => {
    mock.method(cacheStore, '_readVolumeTags', async () => volume);
    mock.method(cacheStore, '_getRelease', async () => exact);
    mock.method(cacheStore, '_getLatestReleaseFor', async (prefix) => {
      latestLookups += 1;
      assert.equal(prefix, 'pretex-cache-o-r-');
      return latest;
    });
  };

  it('skips the download when the volume already holds this commit', async () => {
    stub({ volume: [TAG] });
    assert.equal(await cacheStore.checkAndRestore('o', 'r', SHA), true);
    assert.deepEqual(extracted, []);
  });

  it('restores the release for this exact commit when there is one', async () => {
    stub({ volume: ['pretex-cache-o-r-aaaaaaaa'], exact: release(TAG) });
    assert.equal(await cacheStore.checkAndRestore('o', 'r', SHA), true);
    assert.deepEqual(extracted, [TAG]);
  });

  it('keeps an earlier commit\'s renders instead of clearing them when this commit has no release', async () => {
    stub({ volume: ['pretex-cache-o-r-aaaaaaaa'] });
    assert.equal(await cacheStore.checkAndRestore('o', 'r', SHA), true);
    assert.deepEqual(extracted, []);
    assert.equal(latestLookups, 0);
  });

  it('falls back to the newest release for the repo on a volume that has none of its renders', async () => {
    stub({ volume: ['pretex-cache-other-repo-bbbbbbbb'], latest: release('pretex-cache-o-r-cccccccc') });
    assert.equal(await cacheStore.checkAndRestore('o', 'r', SHA), true);
    assert.deepEqual(extracted, ['pretex-cache-o-r-cccccccc']);
  });

  it('reports a full build only when the repo has no release at all', async () => {
    stub({});
    assert.equal(await cacheStore.checkAndRestore('o', 'r', SHA), false);
    assert.deepEqual(extracted, []);
  });

  it('never runs a command that removes files from the volume', async () => {
    const source = await fs.readFile(new URL('../src/services/githubCacheStore.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /rm -rf/);
  });
});

describe('finding the newest release for a repo', () => {
  afterEach(() => mock.restoreAll());

  it('takes the first matching release with a cache asset and ignores lookalike tags', async () => {
    const asset = [{ name: 'pretex-cache.tar.gz', size: 1, url: 'x' }];
    mock.method(cacheStore, '_apiRequest', async () => [
      { tag_name: 'pretex-cache-o-r-extra-11111111', assets: asset },
      { tag_name: 'pretex-cache-o-r-22222222', assets: [] },
      { tag_name: 'pretex-cache-o-r-33333333', assets: asset },
      { tag_name: 'pretex-cache-o-r-44444444', assets: asset },
    ]);
    const found = await cacheStore._getLatestReleaseFor('pretex-cache-o-r-');
    assert.equal(found?.tag_name, 'pretex-cache-o-r-33333333');
  });
});
