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
