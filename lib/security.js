// Security headers for the page, built from the page itself so they cannot drift out of date.
const crypto = require("crypto");

// The page has one inline script (theme and "js" flag in <head>). It is allowed by hash, so
// script-src never needs 'unsafe-inline'. Browsers hash the text after normalising CRLF to LF.
const inlineScriptHashes = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => `'sha256-${crypto.createHash("sha256").update(m[1].replace(/\r\n?/g, "\n")).digest("base64")}'`);

const contentSecurityPolicy = (html) => [
  "default-src 'self'",
  `script-src 'self' https://cdn.jsdelivr.net ${inlineScriptHashes(html).join(" ")}`.trim(),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // inline style attributes set custom properties
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'self'",
].join("; ");

// https: true adds HSTS (production, or any host that only serves HTTPS such as Vercel)
function securityHeaders(html, { https = false } = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy": contentSecurityPolicy(html),
    "Permissions-Policy": "geolocation=(self), camera=(), microphone=()",
    ...(https ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
  };
}

module.exports = { securityHeaders, contentSecurityPolicy, inlineScriptHashes };
