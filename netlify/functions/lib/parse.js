'use strict';

function safeUrl(pageUrl) {
  try { return new URL(pageUrl); } catch { return null; }
}

function parseDeployVersion(pageUrl) {
  const url = safeUrl(pageUrl);
  if (!url) return 'unknown';
  if (url.protocol === 'file:') return 'local';
  const host = url.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return 'local';
  const firstLabel = host.split('--')[0];
  const m = firstLabel.match(/^deploy-preview-\d+/);
  return m ? m[0] : 'unknown';
}

function parsePrototype(pageUrl) {
  const url = safeUrl(pageUrl);
  if (!url) return 'unknown';
  let segments = url.pathname.split('/').filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  if (segments.length && segments[segments.length - 1].toLowerCase() === 'index.html') {
    segments.pop();
  }
  if (!segments.length) return 'unknown';
  if (segments[0] === 'standalone' && segments.length >= 3) return segments[2];
  if (segments[0] === 'standalone') return 'unknown';
  return segments[segments.length - 1];
}

function parseDevice(userAgent) {
  const ua = userAgent || '';
  if (!ua) return 'unknown';
  const os =
    /iPhone|iPad|iPod/.test(ua) ? 'iOS' :
    /Android/.test(ua) ? 'Android' :
    /Mac OS X|Macintosh/.test(ua) ? 'macOS' :
    /Windows/.test(ua) ? 'Windows' :
    /Linux/.test(ua) ? 'Linux' : 'unknown';
  if (os === 'unknown') return 'unknown';
  const form =
    /iPad|Tablet/.test(ua) ? 'Tablet' :
    /Mobi|iPhone|Android.*Mobile/.test(ua) ? 'Mobile' :
    'Desktop';
  return `${form} — ${os}`;
}

function parseBrowser(userAgent) {
  const ua = userAgent || '';
  if (!ua) return 'unknown';
  let m;
  if ((m = ua.match(/Edg\/(\d+)/))) return `Edge ${m[1]}`;
  if ((m = ua.match(/OPR\/(\d+)/))) return `Opera ${m[1]}`;
  if ((m = ua.match(/Firefox\/(\d+)/))) return `Firefox ${m[1]}`;
  if ((m = ua.match(/Chrome\/(\d+)/))) return `Chrome ${m[1]}`;
  if (/Safari/.test(ua) && (m = ua.match(/Version\/(\d+)/))) return `Safari ${m[1]}`;
  return 'unknown';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(body) {
  const b = body || {};
  const errors = [];
  if (!String(b.name || '').trim()) errors.push('Name is required.');
  if (!String(b.comment || '').trim()) errors.push('Comment is required.');
  const email = String(b.email || '').trim();
  if (email && !EMAIL_RE.test(email)) errors.push('Email is not valid.');
  return errors;
}

function buildFields(body, nowIso) {
  const b = body || {};
  const pageUrl = String(b.pageUrl || '');
  const userAgent = String(b.userAgent || '');
  return {
    'Timestamp': nowIso,
    'Name': String(b.name || '').trim(),
    'Email': String(b.email || '').trim(),
    'Page URL': pageUrl,
    'Deploy Version': parseDeployVersion(pageUrl),
    'Prototype': parsePrototype(pageUrl),
    'Context': String(b.context || '').trim(),
    'Comment': String(b.comment || '').trim(),
    'Device': parseDevice(userAgent),
    'Browser': parseBrowser(userAgent),
  };
}

var ALLOWED_IMAGE_TYPES = { 'image/jpeg': 'screenshot.jpg', 'image/png': 'screenshot.png' };

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  var m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  var contentType = m[1];
  var filename = ALLOWED_IMAGE_TYPES[contentType];
  if (!filename) return null;
  return { contentType: contentType, base64: m[2], filename: filename };
}

module.exports = {
  parseDeployVersion, parsePrototype, parseDevice, parseBrowser, validate, buildFields, parseDataUrl,
};
