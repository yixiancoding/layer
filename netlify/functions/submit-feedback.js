'use strict';

const { validate, buildFields, parseDataUrl } = require('./lib/parse');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(obj),
  };
}

async function handler(event) {
  const method = event && event.httpMethod;

  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (method !== 'POST') return json(405, { error: 'Method not allowed' });

  let body;
  try {
    body = JSON.parse((event && event.body) || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const errors = validate(body);
  if (errors.length) return json(400, { error: errors.join(' ') });

  const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_SCREENSHOT_FIELD_ID } = process.env;
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
    console.error('Layer: missing Airtable environment variables');
    return json(500, { error: 'Server is not configured.' });
  }

  const fields = buildFields(body, new Date().toISOString());
  const createUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`;

  let recordId;
  try {
    const res = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields, typecast: true }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('Layer: Airtable error', res.status, detail);
      return json(502, { error: 'Could not save feedback.' });
    }
    const data = await res.json();
    recordId = data && data.id;
  } catch (err) {
    console.error('Layer: Airtable request failed', err);
    return json(502, { error: 'Could not save feedback.' });
  }

  let screenshotAttached = false;
  const parsed = parseDataUrl(body && body.screenshot);
  if (parsed && AIRTABLE_SCREENSHOT_FIELD_ID && recordId) {
    const uploadUrl = `https://content.airtable.com/v0/${AIRTABLE_BASE_ID}/${recordId}/${AIRTABLE_SCREENSHOT_FIELD_ID}/uploadAttachment`;
    try {
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contentType: parsed.contentType, file: parsed.base64, filename: parsed.filename }),
      });
      if (uploadRes.ok) {
        screenshotAttached = true;
      } else {
        const detail = await uploadRes.text();
        console.error('Layer: screenshot upload failed', uploadRes.status, detail);
      }
    } catch (err) {
      console.error('Layer: screenshot upload threw', err);
    }
  }

  return json(200, { ok: true, screenshotAttached });
}

exports.handler = handler;
