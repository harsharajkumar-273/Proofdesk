import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

const {
  assertValidOwner,
  assertValidRepo,
  assertValidRepoIdentifier,
  isValidRepoIdentifier,
  InvalidRepoIdentifierError,
  REPO_IDENTIFIER_PATTERN,
} = await import('../src/utils/repoIdentifier.js');

/**
 * Regression tests for the command injection reported in issue #100.
 *
 * `_getLatestCommit` and `_clone` built a `git` command line by interpolating `owner` and `repo`
 * into a template string and handed the result to `child_process.exec`, which evaluates it with a
 * shell. `POST /workspace/init` reached both without checking either value.
 *
 * The payloads below are the shapes that made that reachable — quote-and-chain, separators,
 * substitution, newline. None of them run anything here: each asserts only that the input is
 * refused before it can reach a subprocess. The command they carry is `id`, which reads a user id
 * and does nothing else, so a test that somehow leaked would still be inert.
 */
describe('repository identifier validation (issue #100)', () => {
  describe('shell metacharacters are refused', () => {
    const payloads = [
      ['double quote and command chain', 'test"; id #'],
      ['semicolon separator', 'repo; id'],
      ['ampersand chain', 'repo && id'],
      ['pipe', 'repo | id'],
      ['command substitution, backticks', 'repo`id`'],
      ['command substitution, dollar-paren', 'repo$(id)'],
      ['subshell parentheses', 'repo(id)'],
      ['newline as a statement separator', 'repo\nid'],
      ['carriage return', 'repo\rid'],
      ['redirect', 'repo > /tmp/x'],
      ['single quote', "repo'; id #"],
      ['backslash escape', 'repo\\; id'],
      ['leading space', ' repo'],
      ['trailing space', 'repo '],
      ['embedded space', 'my repo'],
      ['null byte', 'repo\u0000id'],
      ['tab', 'repo\tid'],
      ['dollar variable', 'repo$HOME'],
      ['glob', 'repo*'],
      ['brace expansion', 'repo{a,b}'],
      ['forward slash path separator', 'owner/repo'],
      ['url scheme', 'https://evil.example'],
      ['at sign, url userinfo', 'repo@evil.example'],
      ['percent encoding', 'repo%3Bid'],
      ['hash comment', 'repo#id'],
      ['exclamation, history expansion', 'repo!id'],
    ];

    for (const [label, payload] of payloads) {
      it(`rejects ${label}`, () => {
        assert.throws(() => assertValidRepo(payload), InvalidRepoIdentifierError);
        assert.throws(() => assertValidOwner(payload), InvalidRepoIdentifierError);
        assert.equal(isValidRepoIdentifier('octocat', payload), false);
        assert.equal(isValidRepoIdentifier(payload, 'hello-world'), false);
      });
    }
  });

  describe('path segments are refused even though they match the character class', () => {
    // `.` and `..` satisfy /^[A-Za-z0-9_.-]+$/, so the regex suggested in the issue admits both.
    // Interpolated into https://github.com/${owner}/${repo}.git they walk the URL path upwards.
    it('the pattern alone would accept them', () => {
      assert.equal(REPO_IDENTIFIER_PATTERN.test('..'), true);
      assert.equal(REPO_IDENTIFIER_PATTERN.test('.'), true);
    });

    it('but validation rejects them', () => {
      assert.throws(() => assertValidRepo('..'), InvalidRepoIdentifierError);
      assert.throws(() => assertValidOwner('..'), InvalidRepoIdentifierError);
      assert.throws(() => assertValidRepo('.'), InvalidRepoIdentifierError);
      assert.throws(() => assertValidOwner('.'), InvalidRepoIdentifierError);
    });

    it('still accepts names that merely contain dots', () => {
      assert.equal(assertValidRepo('my.repo'), 'my.repo');
      assert.equal(assertValidRepo('...'), '...');
    });
  });

  describe('non-strings are refused', () => {
    const nonStrings = [
      ['undefined', undefined],
      ['null', null],
      ['number', 42],
      ['boolean', true],
      ['object', {}],
      ['empty array', []],
      ['array of one valid string', ['ok']],
      ['symbol', Symbol('x')],
    ];

    for (const [label, value] of nonStrings) {
      it(`rejects ${label}`, () => {
        assert.throws(() => assertValidRepo(value), InvalidRepoIdentifierError);
        assert.throws(() => assertValidOwner(value), InvalidRepoIdentifierError);
      });
    }

    it('rejects an object whose toString would look valid', () => {
      // A JSON body can carry an object here; relying on implicit coercion would let it through.
      assert.throws(() => assertValidRepo({ toString: () => 'repo' }), InvalidRepoIdentifierError);
    });
  });

  describe('length is bounded', () => {
    it('rejects an owner over 39 characters', () => {
      assert.throws(() => assertValidOwner('a'.repeat(40)), InvalidRepoIdentifierError);
      assert.equal(assertValidOwner('a'.repeat(39)), 'a'.repeat(39));
    });

    it('rejects a repository name over 100 characters', () => {
      assert.throws(() => assertValidRepo('a'.repeat(101)), InvalidRepoIdentifierError);
      assert.equal(assertValidRepo('a'.repeat(100)), 'a'.repeat(100));
    });

    it('rejects an empty string', () => {
      assert.throws(() => assertValidRepo(''), InvalidRepoIdentifierError);
      assert.throws(() => assertValidOwner(''), InvalidRepoIdentifierError);
    });
  });

  describe('real repository names still work', () => {
    const valid = [
      ['octocat', 'hello-world'],
      ['QBobWatson', 'ila'],
      ['harsharajkumar-273', 'Proofdesk'],
      ['a', 'b'],
      ['user_name', 'repo.name'],
      ['UPPER', 'MiXeD-Case_1.0'],
      ['123', '456'],
      ['a-b-c', 'x.y.z'],
    ];

    for (const [owner, repo] of valid) {
      it(`accepts ${owner}/${repo}`, () => {
        assert.deepEqual(assertValidRepoIdentifier(owner, repo), { owner, repo });
        assert.equal(isValidRepoIdentifier(owner, repo), true);
      });
    }

    it('returns the value unchanged rather than a normalised one', () => {
      // Callers substitute the returned value into a URL. Silently altering it would make the
      // validated string and the requested repository two different things.
      assert.equal(assertValidRepo('MiXeD'), 'MiXeD');
    });
  });

  describe('errors identify which field failed', () => {
    it('names the owner', () => {
      assert.throws(() => assertValidOwner('bad owner'), (error) => {
        assert.equal(error.field, 'owner');
        assert.match(error.message, /Invalid owner/);
        return true;
      });
    });

    it('names the repository', () => {
      assert.throws(() => assertValidRepo('bad repo'), (error) => {
        assert.equal(error.field, 'repo');
        assert.match(error.message, /Invalid repo/);
        return true;
      });
    });

    it('reports the owner first when both are invalid', () => {
      assert.throws(
        () => assertValidRepoIdentifier('bad owner', 'bad repo'),
        /Invalid owner/
      );
    });
  });

  describe('the pattern is anchored', () => {
    it('does not match a valid fragment inside a hostile string', () => {
      // An unanchored pattern finds `ok` inside `ok"; id #` and passes it.
      assert.equal(REPO_IDENTIFIER_PATTERN.test('ok"; id #'), false);
      assert.equal(REPO_IDENTIFIER_PATTERN.test('ok\nid'), false);
    });
  });
});
