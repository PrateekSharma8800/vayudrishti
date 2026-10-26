// vercel.json carries the security headers, including the hash of the page's inline script.
// It is generated from lib/security.js so the two can never disagree:  npm run sync:vercel
const fs = require("fs"), path = require("path");
const { securityHeaders } = require("../lib/security");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const config = {
  $schema: "https://openapi.vercel.sh/vercel.json",
  framework: null, buildCommand: null, installCommand: null, // nothing to build or install
  outputDirectory: "public",
  // XKDR history queries can take longer than a live reading (lib/xkdr.js times out at 25 seconds)
  functions: { "api/*.js": { maxDuration: 30 } },
  headers: [{ source: "/(.*)", headers: Object.entries(securityHeaders(html, { https: true })).map(([key, value]) => ({ key, value })) }],
};
const text = JSON.stringify(config, null, 2) + "\n";

if (require.main === module) {
  fs.writeFileSync(path.join(root, "vercel.json"), text);
  console.log("vercel.json written");
}
module.exports = { text };
