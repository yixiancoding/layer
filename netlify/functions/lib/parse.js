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
  return segments[segments.length - 1];
}

module.exports = { parseDeployVersion, parsePrototype };
