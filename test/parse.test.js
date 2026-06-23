const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDeployVersion, parsePrototype } = require('../netlify/functions/lib/parse');

test('parseDeployVersion: deploy preview host', () => {
  assert.equal(
    parseDeployVersion('https://deploy-preview-26--ts-design-prototypes.netlify.app/standalone/isa/x'),
    'deploy-preview-26'
  );
});

test('parseDeployVersion: localhost is local', () => {
  assert.equal(parseDeployVersion('http://localhost:8888/demo/'), 'local');
  assert.equal(parseDeployVersion('http://127.0.0.1:8888/'), 'local');
});

test('parseDeployVersion: production host is unknown', () => {
  assert.equal(parseDeployVersion('https://ts-design-prototypes.netlify.app/x'), 'unknown');
});

test('parseDeployVersion: branch deploy is unknown', () => {
  assert.equal(parseDeployVersion('https://main--ts-design-prototypes.netlify.app/x'), 'unknown');
});

test('parseDeployVersion: garbage is unknown', () => {
  assert.equal(parseDeployVersion('not a url'), 'unknown');
});

test('parsePrototype: convention path returns prototype segment', () => {
  assert.equal(
    parsePrototype('https://deploy-preview-26--site.netlify.app/standalone/isa/custom-eligibility-prototype-v3'),
    'custom-eligibility-prototype-v3'
  );
});

test('parsePrototype: deeper sub-route still returns prototype segment', () => {
  assert.equal(
    parsePrototype('https://site.netlify.app/standalone/isa/custom-eligibility-prototype-v3/step-2'),
    'custom-eligibility-prototype-v3'
  );
});

test('parsePrototype: trailing index.html stripped', () => {
  assert.equal(
    parsePrototype('https://site.netlify.app/standalone/isa/proto-a/index.html'),
    'proto-a'
  );
});

test('parsePrototype: non-convention path falls back to last segment', () => {
  assert.equal(parsePrototype('https://site.netlify.app/foo/bar/baz'), 'baz');
});

test('parsePrototype: root path is unknown', () => {
  assert.equal(parsePrototype('https://site.netlify.app/'), 'unknown');
});

test('parsePrototype: incomplete standalone path is unknown', () => {
  assert.equal(parsePrototype('https://site.netlify.app/standalone/isa'), 'unknown');
  assert.equal(parsePrototype('https://site.netlify.app/standalone/isa/'), 'unknown');
});

test('parsePrototype: bare standalone path is unknown', () => {
  assert.equal(parsePrototype('https://site.netlify.app/standalone'), 'unknown');
});

test('parsePrototype: garbage input is unknown', () => {
  assert.equal(parsePrototype('not a url'), 'unknown');
});

const { parseDevice, parseBrowser } = require('../netlify/functions/lib/parse');

const UA_MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const UA_IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const UA_WIN_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0';
const UA_ANDROID_FF = 'Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0';

test('parseDevice: desktop mac', () => {
  assert.equal(parseDevice(UA_MAC_CHROME), 'Desktop — macOS');
});
test('parseDevice: iphone is mobile iOS', () => {
  assert.equal(parseDevice(UA_IPHONE_SAFARI), 'Mobile — iOS');
});
test('parseDevice: android mobile', () => {
  assert.equal(parseDevice(UA_ANDROID_FF), 'Mobile — Android');
});
test('parseDevice: empty is unknown', () => {
  assert.equal(parseDevice(''), 'unknown');
});

test('parseBrowser: chrome', () => {
  assert.equal(parseBrowser(UA_MAC_CHROME), 'Chrome 124');
});
test('parseBrowser: edge wins over chrome token', () => {
  assert.equal(parseBrowser(UA_WIN_EDGE), 'Edge 124');
});
test('parseBrowser: safari', () => {
  assert.equal(parseBrowser(UA_IPHONE_SAFARI), 'Safari 17');
});
test('parseBrowser: firefox', () => {
  assert.equal(parseBrowser(UA_ANDROID_FF), 'Firefox 126');
});
test('parseBrowser: empty is unknown', () => {
  assert.equal(parseBrowser(''), 'unknown');
});

const { validate, buildFields } = require('../netlify/functions/lib/parse');

test('validate: ok when name + comment present, no email', () => {
  assert.deepEqual(validate({ name: 'Ada', comment: 'Looks good' }), []);
});
test('validate: missing name and comment', () => {
  const errs = validate({ name: '  ', comment: '' });
  assert.equal(errs.length, 2);
});
test('validate: bad email format', () => {
  const errs = validate({ name: 'Ada', comment: 'x', email: 'nope' });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /email/i);
});
test('validate: good email passes', () => {
  assert.deepEqual(validate({ name: 'Ada', comment: 'x', email: 'ada@example.com' }), []);
});

test('buildFields: maps exact columns with injected timestamp', () => {
  const body = {
    name: ' Ada ',
    email: 'ada@example.com',
    comment: ' Nice ',
    context: ' Home — Step 1 — scrolled 10% ',
    pageUrl: 'https://deploy-preview-26--site.netlify.app/standalone/isa/proto-x',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };
  const fields = buildFields(body, '2026-06-22T00:00:00.000Z');
  assert.deepEqual(fields, {
    'Timestamp': '2026-06-22T00:00:00.000Z',
    'Name': 'Ada',
    'Email': 'ada@example.com',
    'Page URL': 'https://deploy-preview-26--site.netlify.app/standalone/isa/proto-x',
    'Deploy Version': 'deploy-preview-26',
    'Prototype': 'proto-x',
    'Context': 'Home — Step 1 — scrolled 10%',
    'Comment': 'Nice',
    'Device': 'Desktop — macOS',
    'Browser': 'Chrome 124',
  });
});

test('parseDeployVersion: 0.0.0.0 is local', () => {
  assert.equal(parseDeployVersion('http://0.0.0.0:8888/'), 'local');
});

test('parseBrowser: opera', () => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0';
  assert.equal(parseBrowser(ua), 'Opera 110');
});
