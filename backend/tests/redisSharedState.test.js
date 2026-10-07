import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

const { getSharedStateBackend, isRedisSharedStateEnabled } = await import(
  '../src/utils/redisClient.js'
);

// ---------------------------------------------------------------------------
// Test setup
//
// Both functions read process.env every time they are called. process.env is
// global, so a test that sets a variable and forgets to put it back changes
// the result of every test after it. Each test therefore starts from a blank
// slate and the original values are restored afterwards.
//
// The variable names live in constants so that a typo is a loud error
// ("undefined" used as a key) instead of a test that quietly sets a variable
// nothing reads, and so passes whatever the code does.
// ---------------------------------------------------------------------------
const BACKEND = 'PROOFDESK_SHARED_STATE_BACKEND';
const REDIS_URL = 'PROOFDESK_REDIS_URL';
const SAMPLE_URL = 'redis://localhost:6379';

let saved;

beforeEach(() => {
  saved = { [BACKEND]: process.env[BACKEND], [REDIS_URL]: process.env[REDIS_URL] };
  delete process.env[BACKEND];
  delete process.env[REDIS_URL];
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// Sets a variable, or leaves it unset when given undefined. An unset variable
// and an empty one are different situations, so tables below can express both.
const configure = ({ backend, url }) => {
  if (backend !== undefined) process.env[BACKEND] = backend;
  if (url !== undefined) process.env[REDIS_URL] = url;
};

// node:test has no it.each, so tables are plain loops.

// ===========================================================================
// getSharedStateBackend: which storage the server was asked to use.
// ===========================================================================
describe('getSharedStateBackend', () => {
  it('defaults to the filesystem when nothing is configured', () => {
    assert.equal(getSharedStateBackend(), 'filesystem');
  });

  // Accepted spellings. People set this by hand in .env files and CI settings.
  const selectsRedis = [
    ['redis', 'plain lower case'],
    ['REDIS', 'upper case'],
    ['Redis', 'mixed case'],
    ['  redis  ', 'surrounding spaces'],
    ['\tredis\n', 'surrounding tab and newline'],
  ];
  for (const [value, description] of selectsRedis) {
    it(`selects redis for ${description} (${JSON.stringify(value)})`, () => {
      configure({ backend: value });
      assert.equal(getSharedStateBackend(), 'redis');
    });
  }

  // Anything that is not exactly "redis" must fall back to the safe default.
  // A typo must never silently turn Redis on.
  const fallsBack = [
    ['filesystem', 'the explicit default'],
    ['redisss', 'a typo with extra letters'],
    ['redsi', 'a typo with swapped letters'],
    ['re dis', 'a space inside the word'],
    ['memcached', 'a different backend'],
    ['true', 'a boolean-looking value'],
    ['1', 'a number'],
    ['', 'an empty string'],
    ['   ', 'only spaces'],
  ];
  for (const [value, description] of fallsBack) {
    it(`falls back to the filesystem for ${description} (${JSON.stringify(value)})`, () => {
      configure({ backend: value });
      assert.equal(getSharedStateBackend(), 'filesystem');
    });
  }

  it('does not look at the Redis URL when choosing the backend', () => {
    configure({ url: SAMPLE_URL });
    assert.equal(getSharedStateBackend(), 'filesystem');
  });
});

// ===========================================================================
// isRedisSharedStateEnabled: should the server actually use Redis?
//
// Redis is on only when BOTH conditions hold: the backend is "redis" AND there
// is a URL to connect to. That is a truth table with four rows, plus edge
// cases. Every row is needed: with "&&" changed to "||", the "both set" row
// alone would still pass.
// ===========================================================================
describe('isRedisSharedStateEnabled', () => {
  const truthTable = [
    // backend,      url,         enabled, description
    [undefined, undefined, false, 'neither the backend nor a URL is set'],
    [undefined, SAMPLE_URL, false, 'a URL is set but the backend is not redis'],
    ['redis', undefined, false, 'the backend is redis but there is no URL'],
    ['redis', SAMPLE_URL, true, 'the backend is redis and a URL is set'],
  ];
  for (const [backend, url, expected, description] of truthTable) {
    it(`is ${expected ? 'enabled' : 'disabled'} when ${description}`, () => {
      configure({ backend, url });
      assert.equal(isRedisSharedStateEnabled(), expected);
    });
  }

  // For edge cases, keep every other input in the "enabled" state. Then the
  // value under test is the only reason the result can change.
  it('is disabled when the backend is redis but the URL is empty', () => {
    configure({ backend: 'redis', url: '' });
    assert.equal(isRedisSharedStateEnabled(), false);
  });

  it('is disabled when the backend is redis but the URL is only spaces', () => {
    configure({ backend: 'redis', url: '   ' });
    assert.equal(isRedisSharedStateEnabled(), false);
  });

  it('is enabled when the URL has surrounding spaces', () => {
    configure({ backend: 'redis', url: `  ${SAMPLE_URL}  ` });
    assert.equal(isRedisSharedStateEnabled(), true);
  });

  it('is enabled when the backend name has different capitals and spaces', () => {
    configure({ backend: '  Redis ', url: SAMPLE_URL });
    assert.equal(isRedisSharedStateEnabled(), true);
  });

  it('is disabled when the backend is a typo, even with a URL', () => {
    configure({ backend: 'redisss', url: SAMPLE_URL });
    assert.equal(isRedisSharedStateEnabled(), false);
  });

  it('is disabled when the backend is the explicit default, even with a URL', () => {
    configure({ backend: 'filesystem', url: SAMPLE_URL });
    assert.equal(isRedisSharedStateEnabled(), false);
  });

  // This documents today's behaviour so any change to it is deliberate.
  // Choosing redis without giving a URL is almost certainly a configuration
  // mistake, yet nothing complains: the server quietly keeps using files. If
  // the team decides that should be a startup error, this test is the one to
  // change.
  it('quietly falls back to the filesystem when redis is chosen without a URL', () => {
    configure({ backend: 'redis' });
    assert.equal(getSharedStateBackend(), 'redis'); // the setting is read as redis...
    assert.equal(isRedisSharedStateEnabled(), false); // ...but redis is not used
  });

  it('agrees with getSharedStateBackend whenever it is enabled', () => {
    configure({ backend: 'redis', url: SAMPLE_URL });
    assert.equal(isRedisSharedStateEnabled(), true);
    assert.equal(getSharedStateBackend(), 'redis');
  });
});
