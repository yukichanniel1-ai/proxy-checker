/**
 * helpers.js -- Shared utilities: validation, extraction, file I/O.
 */

const fs = require("fs");
const path = require("path");

const IP_PORT_REGEX = /(\d{1,3}(?:\.\d{1,3}){3}:\d{1,5})/g;

function validateProxy(proxy) {
  const m = proxy.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/);
  if (!m) return false;
  const octets = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), parseInt(m[4])];
  const port = parseInt(m[5]);
  return octets.every((o) => o >= 0 && o <= 255) && port >= 1 && port <= 65535;
}

function extractIps(text) {
  const matches = text.match(IP_PORT_REGEX) || [];
  return matches.filter(validateProxy);
}

function readProxiesFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`  [!] File not found: ${filePath}`);
    return [];
  }
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  const proxies = [];
  const seen = new Set();
  for (const raw of lines) {
    const line = raw.trim().replace(/^[a-zA-Z0-9+\-]+:\/\//, "");
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/(\d{1,3}(?:\.\d{1,3}){3}:\d{1,5})/);
    if (m && validateProxy(m[1]) && !seen.has(m[1])) {
      proxies.push(m[1]);
      seen.add(m[1]);
    }
  }
  return proxies;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getNextFilename(directory, baseFilename) {
  ensureDir(directory);
  const ext = path.extname(baseFilename);
  let base = path.basename(baseFilename, ext).replace(/_\d+$/, "");
  let counter = 1;
  while (true) {
    const candidate = path.join(directory, `${base}_${counter}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    counter++;
  }
}

function loadConfig() {
  const configPath = path.join(__dirname, "..", "config.json");
  if (!fs.existsSync(configPath)) {
    console.log("  [!] config.json not found. Using defaults.");
    return {};
  }
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

module.exports = {
  validateProxy,
  extractIps,
  readProxiesFromFile,
  ensureDir,
  getNextFilename,
  loadConfig,
};
