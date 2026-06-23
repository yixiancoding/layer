'use strict';

const { validate, buildFields } = require('./lib/parse');

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

  const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID } = process.env;
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
    console.error('Layer: missing Airtable environment variables');
    return json(500, { error: 'Server is not configured.' });
  }

  const fields = buildFields(body, new Date().toISOString());
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`;

  try {
    const res = await fetch(url, {
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
    return json(200, { ok: true });
  } catch (err) {
    console.error('Layer: Airtable request failed', err);
    return json(502, { error: 'Could not save feedback.' });
  }
}

exports.handler = handler;
