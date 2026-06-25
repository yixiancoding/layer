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
    return { ok: true, status: 200, json: async () => ({ id: 'rec1' }), text: async () => '{}' };
  };
  try {
    const res = await withEnv(ENV, () => handler({ httpMethod: 'POST', body: validBody() }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true, screenshotAttached: false });
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

const ENV_WITH_SCREENSHOT = {
  AIRTABLE_API_KEY: 'key123',
  AIRTABLE_BASE_ID: 'appBASE',
  AIRTABLE_TABLE_ID: 'tblTABLE',
  AIRTABLE_SCREENSHOT_FIELD_ID: 'fldSCREEN',
};

function validBodyWithScreenshot() {
  return JSON.stringify({
    name: 'Ada', email: 'ada@example.com', comment: 'Nice',
    pageUrl: 'https://deploy-preview-26--site.netlify.app/standalone/isa/proto-x',
    userAgent: 'UA', context: 'ctx',
    screenshot: 'data:image/jpeg;base64,/9j/fakebase64==',
  });
}

test('no screenshot: one fetch call, screenshotAttached false', async () => {
  let callCount = 0;
  const savedFetch = global.fetch;
  global.fetch = async () => { callCount++; return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'rec1' }), json: async () => ({ id: 'rec1' }) }; };
  try {
    const res = await withEnv(ENV, () => handler({ httpMethod: 'POST', body: validBody() }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true, screenshotAttached: false });
    assert.equal(callCount, 1);
  } finally { global.fetch = savedFetch; }
});

test('screenshot happy path: two fetches, second hits uploadAttachment URL, screenshotAttached true', async () => {
  const calls = [];
  const savedFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'rec42' }), json: async () => ({ id: 'rec42' }) };
  };
  try {
    const res = await withEnv(ENV_WITH_SCREENSHOT, () => handler({ httpMethod: 'POST', body: validBodyWithScreenshot() }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true, screenshotAttached: true });
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /content\.airtable\.com/);
    assert.match(calls[1].url, /rec42/);
    assert.match(calls[1].url, /fldSCREEN/);
    assert.match(calls[1].url, /uploadAttachment/);
    assert.match(calls[1].opts.headers['Authorization'], /Bearer key123/);
    const uploadBody = JSON.parse(calls[1].opts.body);
    assert.equal(uploadBody.contentType, 'image/jpeg');
    assert.equal(uploadBody.filename, 'screenshot.jpg');
    assert.ok(uploadBody.file.length > 0);
  } finally { global.fetch = savedFetch; }
});

test('screenshot present but AIRTABLE_SCREENSHOT_FIELD_ID unset: one fetch, screenshotAttached false', async () => {
  let callCount = 0;
  const savedFetch = global.fetch;
  global.fetch = async () => { callCount++; return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'rec1' }), json: async () => ({ id: 'rec1' }) }; };
  try {
    const res = await withEnv(ENV, () => handler({ httpMethod: 'POST', body: validBodyWithScreenshot() }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true, screenshotAttached: false });
    assert.equal(callCount, 1);
  } finally { global.fetch = savedFetch; }
});

test('attachment upload returns non-2xx: record still created, screenshotAttached false, 200', async () => {
  let callCount = 0;
  const savedFetch = global.fetch;
  global.fetch = async () => {
    callCount++;
    if (callCount === 1) return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'recX' }), json: async () => ({ id: 'recX' }) };
    return { ok: false, status: 422, text: async () => 'error' };
  };
  try {
    const res = await withEnv(ENV_WITH_SCREENSHOT, () => handler({ httpMethod: 'POST', body: validBodyWithScreenshot() }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true, screenshotAttached: false });
    assert.equal(callCount, 2);
  } finally { global.fetch = savedFetch; }
});

test('attachment upload throws: record still created, screenshotAttached false, 200', async () => {
  let callCount = 0;
  const savedFetch = global.fetch;
  global.fetch = async () => {
    callCount++;
    if (callCount === 1) return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'recX' }), json: async () => ({ id: 'recX' }) };
    throw new Error('network error');
  };
  try {
    const res = await withEnv(ENV_WITH_SCREENSHOT, () => handler({ httpMethod: 'POST', body: validBodyWithScreenshot() }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true, screenshotAttached: false });
    assert.equal(callCount, 2);
  } finally { global.fetch = savedFetch; }
});

test('invalid screenshot data URL: one fetch, screenshotAttached false, 200', async () => {
  let callCount = 0;
  const savedFetch = global.fetch;
  global.fetch = async () => { callCount++; return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'rec1' }), json: async () => ({ id: 'rec1' }) }; };
  try {
    const body = JSON.stringify({
      name: 'Ada', comment: 'x',
      pageUrl: 'https://example.com', userAgent: 'UA', context: 'c',
      screenshot: 'not-a-data-url',
    });
    const res = await withEnv(ENV_WITH_SCREENSHOT, () => handler({ httpMethod: 'POST', body }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true, screenshotAttached: false });
    assert.equal(callCount, 1);
  } finally { global.fetch = savedFetch; }
});
