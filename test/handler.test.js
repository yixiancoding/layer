const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/submit-feedback');

const ENV = {
  AIRTABLE_API_KEY: 'key123',
  AIRTABLE_BASE_ID: 'appBASE',
  AIRTABLE_TABLE_ID: 'tblTABLE',
};

function withEnv(env, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(env)) delete process.env[k];
    Object.assign(process.env, saved);
  });
}

function validBody() {
  return JSON.stringify({
    name: 'Ada', email: 'ada@example.com', comment: 'Nice',
    pageUrl: 'https://deploy-preview-26--site.netlify.app/standalone/isa/proto-x',
    userAgent: 'UA', context: 'ctx',
  });
}

test('OPTIONS preflight returns 204 with CORS', async () => {
  const res = await handler({ httpMethod: 'OPTIONS' });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
});

test('GET returns 405', async () => {
  const res = await handler({ httpMethod: 'GET' });
  assert.equal(res.statusCode, 405);
});

test('invalid JSON returns 400', async () => {
  const res = await withEnv(ENV, () => handler({ httpMethod: 'POST', body: '{not json' }));
  assert.equal(res.statusCode, 400);
});

test('validation failure returns 400', async () => {
  const body = JSON.stringify({ name: '', comment: '' });
  const res = await withEnv(ENV, () => handler({ httpMethod: 'POST', body }));
  assert.equal(res.statusCode, 400);
});

test('missing env returns 500', async () => {
  const res = await handler({ httpMethod: 'POST', body: validBody() });
  assert.equal(res.statusCode, 500);
});

test('happy path posts to Airtable and returns 200', async () => {
  let captured = null;
  const savedFetch = global.fetch;
  global.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200, text: async () => '{}' };
  };
  try {
    const res = await withEnv(ENV, () => handler({ httpMethod: 'POST', body: validBody() }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
    assert.equal(captured.url, 'https://api.airtable.com/v0/appBASE/tblTABLE');
    assert.equal(captured.opts.headers.Authorization, 'Bearer key123');
    const sent = JSON.parse(captured.opts.body);
    assert.equal(sent.typecast, true);
    assert.equal(sent.fields['Deploy Version'], 'deploy-preview-26');
    assert.equal(sent.fields['Prototype'], 'proto-x');
    assert.ok(sent.fields['Timestamp']);
  } finally {
    global.fetch = savedFetch;
  }
});

test('Airtable failure returns 502', async () => {
  const savedFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 422, text: async () => 'bad field' });
  try {
    const res = await withEnv(ENV, () => handler({ httpMethod: 'POST', body: validBody() }));
    assert.equal(res.statusCode, 502);
  } finally {
    global.fetch = savedFetch;
  }
});

test('fetch throwing returns 502', async () => {
  const savedFetch = global.fetch;
  global.fetch = async () => { throw new Error('network fail'); };
  try {
    const res = await withEnv(ENV, () => handler({ httpMethod: 'POST', body: validBody() }));
    assert.equal(res.statusCode, 502);
  } finally {
    global.fetch = savedFetch;
  }
});
