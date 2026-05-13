#!/usr/bin/env node
/**
 * proxy-all.js -- All-in-One Proxy Scraper + Checker API
 *
 * - Scrapes 54 sources
 * - Checks proxies and adds them to the API IMMEDIATELY when found live
 * - No waiting — live proxies appear in the API as soon as verified
 * - Railway-stable: crash-proof, low memory, auto-restart safe
 *
 * Endpoints:
 *   GET /               → raw ip:port (all types)
 *   GET /?type=http     → HTTP only
 *   GET /?type=socks4   → SOCKS4 only
 *   GET /?type=socks5   → SOCKS5 only
 *   GET /?format=json   → JSON with speed + type info
 *   GET /?limit=100     → limit results
 *   GET /health         → server stats
 */

const http = require("http");
const https = require("https");
const net = require("net");
const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════
// CRASH PROTECTION — never let process die
// ═══════════════════════════════════════════════════════

let shuttingDown = false;

process.on("uncaughtException", (err) => {
  try { console.error(`[CRASH] ${err.message}\n${err.stack}`); } catch (_) {}
});

process.on("unhandledRejection", (reason) => {
  try { console.error(`[CRASH] Rejection: ${reason}`); } catch (_) {}
});

process.on("SIGTERM", () => { shuttingDown = true; console.log("[SHUTDOWN] SIGTERM"); });
process.on("SIGINT", () => { shuttingDown = true; console.log("[SHUTDOWN] SIGINT"); });

// ═══════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════

const CONFIG_PATH = path.join(__dirname, "config.json");
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")); }
  catch (_) { return {}; }
}

// ═══════════════════════════════════════════════════════
// ALL PROXY SOURCES (54 sources)
// ═══════════════════════════════════════════════════════

const SOURCES = [
  { url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all" },
  { url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=all" },
  { url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all" },
  { url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.txt" },
  { url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/http/data.txt" },
  { url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks4/data.txt" },
  { url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.txt" },
  { url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc", fmt: "geonode" },
  { url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=2&sort_by=lastChecked&sort_type=desc", fmt: "geonode" },
  { url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=3&sort_by=lastChecked&sort_type=desc", fmt: "geonode" },
  { url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt" },
  { url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks4.txt" },
  { url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt" },
  { url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt" },
  { url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt" },
  { url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt" },
  { url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/http.txt" },
  { url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/socks4.txt" },
  { url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/socks5.txt" },
  { url: "https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/proxies/http.txt" },
  { url: "https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/proxies/socks4.txt" },
  { url: "https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/proxies/socks5.txt" },
  { url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/http.txt" },
  { url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks4.txt" },
  { url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks5.txt" },
  { url: "https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxies/http.txt" },
  { url: "https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxies/socks4.txt" },
  { url: "https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxies/socks5.txt" },
  { url: "https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/http.txt" },
  { url: "https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks4.txt" },
  { url: "https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks5.txt" },
  { url: "https://litport.net/free-proxy/http.txt" },
  { url: "https://litport.net/free-proxy/socks5.txt" },
  { url: "http://pubproxy.com/api/proxy?limit=20&format=txt&type=http" },
  { url: "http://pubproxy.com/api/proxy?limit=20&format=txt&type=socks5" },
  { url: "https://free.redscrape.com/api/proxies", fmt: "redscrape" },
  { url: "https://raw.githubusercontent.com/naravid19/checked-proxies/main/http.txt" },
  { url: "https://raw.githubusercontent.com/naravid19/checked-proxies/main/socks4.txt" },
  { url: "https://raw.githubusercontent.com/naravid19/checked-proxies/main/socks5.txt" },
  { url: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/proxy.txt" },
  { url: "https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt" },
  { url: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/http_proxies.txt" },
  { url: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks4_proxies.txt" },
  { url: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks5_proxies.txt" },
  { url: "https://raw.githubusercontent.com/ErcinDedeworken/proxies/main/proxies/http.txt" },
  { url: "https://raw.githubusercontent.com/ErcinDedeworken/proxies/main/proxies/socks4.txt" },
  { url: "https://raw.githubusercontent.com/ErcinDedeworken/proxies/main/proxies/socks5.txt" },
  { url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt" },
  { url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt" },
  { url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt" },
  { url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt" },
  { url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt" },
  { url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt" },
];

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

const IP_RE = /(\d{1,3}(?:\.\d{1,3}){3}:\d{1,5})/g;

function validate(p) {
  try {
    const m = p.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/);
    if (!m) return false;
    return [1, 2, 3, 4].every((i) => parseInt(m[i]) <= 255) && parseInt(m[5]) >= 1 && parseInt(m[5]) <= 65535;
  } catch (_) { return false; }
}

function extractIps(t) {
  try { return (t.match(IP_RE) || []).filter(validate); }
  catch (_) { return []; }
}

// ═══════════════════════════════════════════════════════
// SAFE HTTP GET
// ═══════════════════════════════════════════════════════

function httpGet(url, timeout) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };

    const mod = url.startsWith("https") ? https : http;
    const timer = setTimeout(() => {
      try { req.destroy(); } catch (_) {}
      done("");
    }, timeout + 3000);

    let req;
    try {
      req = mod.get(url, { timeout, headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        const chunks = [];
        res.on("data", (c) => { chunks.push(c); });
        res.on("end", () => { clearTimeout(timer); done(Buffer.concat(chunks).toString()); });
        res.on("error", () => { clearTimeout(timer); done(""); });
      });
    } catch (_) { clearTimeout(timer); done(""); return; }

    req.on("error", () => { clearTimeout(timer); done(""); });
    req.on("timeout", () => { clearTimeout(timer); try { req.destroy(); } catch (_) {} done(""); });
  });
}

// ═══════════════════════════════════════════════════════
// SCRAPER
// ═══════════════════════════════════════════════════════

async function scrapeAll() {
  const results = await Promise.allSettled(
    SOURCES.map(async (src) => {
      try {
        const raw = await httpGet(src.url, 10000);
        if (!raw) return [];
        if (src.fmt === "geonode") {
          try {
            const d = JSON.parse(raw);
            return (d.data || []).map((i) => (i.ip && i.port ? `${i.ip}:${i.port}` : "")).filter(validate);
          } catch (_) { return []; }
        }
        if (src.fmt === "redscrape") {
          try {
            const d = JSON.parse(raw);
            const items = Array.isArray(d) ? d : d.proxies || d.data || [];
            return items.map((i) => (i.ip && i.port ? `${i.ip}:${i.port}` : "")).filter(validate);
          } catch (_) { return []; }
        }
        return extractIps(raw);
      } catch (_) { return []; }
    })
  );

  const seen = new Set();
  const proxies = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const p of r.value) {
        if (!seen.has(p)) { seen.add(p); proxies.push(p); }
      }
    }
  }
  return proxies;
}

// ═══════════════════════════════════════════════════════
// PROXY CHECKER — streams results into cache immediately
// ═══════════════════════════════════════════════════════

const JUDGES = [
  "http://api.ipify.org?format=json",
  "http://checkip.amazonaws.com",
  "http://ip-api.com/json",
  "http://httpbin.org/ip",
];

function tcpConnect(host, port, timeout) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };
    try {
      const sock = new net.Socket();
      const timer = setTimeout(() => { try { sock.destroy(); } catch (_) {} done(false); }, timeout);
      sock.on("error", () => { clearTimeout(timer); try { sock.destroy(); } catch (_) {} done(false); });
      sock.on("timeout", () => { clearTimeout(timer); try { sock.destroy(); } catch (_) {} done(false); });
      sock.connect(port, host, () => { clearTimeout(timer); try { sock.destroy(); } catch (_) {} done(true); });
    } catch (_) { done(false); }
  });
}

function checkHttp(proxy, judge, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };
    const start = process.hrtime.bigint();

    let agent, req;
    const timer = setTimeout(() => {
      try { if (req) req.destroy(); } catch (_) {}
      try { if (agent) agent.destroy(); } catch (_) {}
      done(null);
    }, timeoutMs + 1000);

    try {
      const { HttpProxyAgent } = require("http-proxy-agent");
      agent = new HttpProxyAgent(`http://${proxy}`);
    } catch (_) { clearTimeout(timer); done(null); return; }

    try {
      req = http.get(judge, { agent, timeout: timeoutMs }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          clearTimeout(timer);
          const ms = (Number(process.hrtime.bigint() - start) / 1e6) | 0;
          try { agent.destroy(); } catch (_) {}
          done(res.statusCode >= 200 && res.statusCode < 400 ? { ms, type: "http" } : null);
        });
        res.on("error", () => { clearTimeout(timer); try { agent.destroy(); } catch (_) {} done(null); });
      });
      req.on("error", () => { clearTimeout(timer); try { agent.destroy(); } catch (_) {} done(null); });
      req.on("timeout", () => { clearTimeout(timer); try { req.destroy(); agent.destroy(); } catch (_) {} done(null); });
    } catch (_) { clearTimeout(timer); try { agent.destroy(); } catch (_) {} done(null); }
  });
}

function checkSocks(proxy, judge, socksType, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };
    const start = process.hrtime.bigint();

    let agent, req;
    const timer = setTimeout(() => {
      try { if (req) req.destroy(); } catch (_) {}
      try { if (agent) agent.destroy(); } catch (_) {}
      done(null);
    }, timeoutMs + 1000);

    try {
      const { SocksProxyAgent } = require("socks-proxy-agent");
      agent = new SocksProxyAgent(`${socksType}://${proxy}`);
    } catch (_) { clearTimeout(timer); done(null); return; }

    try {
      req = http.get(judge, { agent, timeout: timeoutMs }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          clearTimeout(timer);
          const ms = (Number(process.hrtime.bigint() - start) / 1e6) | 0;
          try { agent.destroy(); } catch (_) {}
          done(res.statusCode >= 200 && res.statusCode < 400 ? { ms, type: socksType } : null);
        });
        res.on("error", () => { clearTimeout(timer); try { agent.destroy(); } catch (_) {} done(null); });
      });
      req.on("error", () => { clearTimeout(timer); try { agent.destroy(); } catch (_) {} done(null); });
      req.on("timeout", () => { clearTimeout(timer); try { req.destroy(); agent.destroy(); } catch (_) {} done(null); });
    } catch (_) { clearTimeout(timer); try { agent.destroy(); } catch (_) {} done(null); }
  });
}

async function checkOneProxy(proxy, timeoutMs) {
  try {
    const [host, portStr] = proxy.split(":");
    const port = parseInt(portStr);
    if (!host || isNaN(port)) return null;

    const reachable = await tcpConnect(host, port, Math.min(timeoutMs, 1500));
    if (!reachable) return null;

    const judge = JUDGES[Math.floor(Math.random() * JUDGES.length)];
    const r1 = await checkHttp(proxy, judge, timeoutMs);
    if (r1) return r1;
    const r2 = await checkSocks(proxy, judge, "socks5", timeoutMs);
    if (r2) return r2;
    return await checkSocks(proxy, judge, "socks4", timeoutMs);
  } catch (_) { return null; }
}

// ═══════════════════════════════════════════════════════
// LIVE CACHE — proxies appear here immediately when found
// ═══════════════════════════════════════════════════════

let liveProxies = [];
let liveSet = new Set();
let stats = {
  scraped: 0,
  checked: 0,
  alive: 0,
  dead: 0,
  checking: false,
  lastUpdate: null,
  cycle: 0,
};

function addLiveProxy(entry) {
  if (!liveSet.has(entry.proxy)) {
    liveSet.add(entry.proxy);
    liveProxies.push(entry);
    stats.alive = liveProxies.length;
  }
}

function clearCache() {
  liveProxies = [];
  liveSet = new Set();
  stats.alive = 0;
  stats.checked = 0;
  stats.dead = 0;
}

// ═══════════════════════════════════════════════════════
// BACKGROUND CHECK — streams into cache
// ═══════════════════════════════════════════════════════

async function runCheck() {
  if (stats.checking || shuttingDown) return;
  stats.checking = true;
  stats.cycle++;
  const cycle = stats.cycle;

  try {
    console.log(`\n[CYCLE ${cycle}] Scraping...`);
    const proxies = await scrapeAll();
    stats.scraped = proxies.length;
    console.log(`[CYCLE ${cycle}] Scraped ${proxies.length} proxies`);

    if (proxies.length === 0) {
      stats.checking = false;
      return;
    }

    // Clear old cache at start of new cycle
    clearCache();

    const config = loadConfig();
    const cfg = config.checker || {};
    const timeoutMs = cfg.timeout_ms || 3000;
    const maxConc = Math.min(cfg.max_concurrent || 200, 200);
    const minMs = cfg.min_speed_ms || 5;
    const maxMs = cfg.max_speed_ms || 1000;
    const total = proxies.length;

    console.log(`[CYCLE ${cycle}] Checking ${total} proxies (${maxConc} concurrent, ${timeoutMs}ms timeout)...`);

    for (let i = 0; i < total && !shuttingDown; i += maxConc) {
      const batch = proxies.slice(i, i + maxConc);
      const batchNum = Math.floor(i / maxConc) + 1;
      const totalBatches = Math.ceil(total / maxConc);

      try {
        const results = await Promise.allSettled(
          batch.map(async (proxy) => {
            try {
              const r = await checkOneProxy(proxy, timeoutMs);
              stats.checked++;
              if (r && r.ms >= minMs && r.ms <= maxMs) {
                addLiveProxy({ proxy, ms: r.ms, type: r.type });
                return true;
              }
              stats.dead++;
              return false;
            } catch (_) {
              stats.dead++;
              return false;
            }
          })
        );
      } catch (err) {
        console.error(`[CYCLE ${cycle}] Batch ${batchNum} error: ${err.message}`);
      }

      if (batchNum % 5 === 0 || batchNum === totalBatches) {
        console.log(`[CYCLE ${cycle}] Progress: ${Math.min(i + maxConc, total)}/${total} checked, ${stats.alive} alive`);
      }
    }

    // Sort by speed
    liveProxies.sort((a, b) => a.ms - b.ms);
    stats.lastUpdate = new Date().toISOString();
    console.log(`[CYCLE ${cycle}] Done: ${stats.alive} alive, ${stats.dead} dead`);
  } catch (err) {
    console.error(`[CYCLE ${cycle}] Error: ${err.message}`);
  }

  stats.checking = false;
  if (global.gc) try { global.gc(); } catch (_) {}
}

// ═══════════════════════════════════════════════════════
// HTTP API SERVER
// ═══════════════════════════════════════════════════════

function startServer() {
  const port = parseInt(process.env.PORT, 10) || 3000;
  const config = loadConfig();
  const refreshMs = (config.checker?.refresh_interval_minutes || 5) * 60 * 1000;

  const server = http.createServer((req, res) => {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");

      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const pathname = url.pathname;

      if (pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: shuttingDown ? "shutting_down" : stats.checking ? "checking" : "ready",
          uptime: Math.floor(process.uptime()),
          memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
          ...stats,
        }));
        return;
      }

      // Auto-download endpoint — saves .txt file directly (all live proxies)
      if (pathname === "/download") {
        const filtered = liveProxies;
        const filename = `live_proxies_${filtered.length}.txt`;
        const body = filtered.map((p) => p.proxy).join("\n") + (filtered.length ? "\n" : "");

        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": Buffer.byteLength(body),
          "X-Total-Alive": String(stats.alive),
          "X-Returned": String(filtered.length),
        });
        res.end(body);
        return;
      }

      if (pathname === "/" || pathname === "/proxies") {
        const type = (url.searchParams.get("type") || "all").toLowerCase();
        const format = (url.searchParams.get("format") || "raw").toLowerCase();

        const filtered = type === "all" ? liveProxies : liveProxies.filter((p) => p.type === type);

        if (format === "json") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            total_scraped: stats.scraped,
            total_alive: stats.alive,
            total_dead: stats.dead,
            checking: stats.checking,
            returned: filtered.length,
            last_update: stats.lastUpdate,
            type_filter: type,
            proxies: filtered.map((p) => ({ proxy: p.proxy, ms: p.ms, type: p.type })),
          }));
        } else {
          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Total-Alive": String(stats.alive),
            "X-Checking": String(stats.checking),
            "X-Returned": String(filtered.length),
          });
          res.end(filtered.map((p) => p.proxy).join("\n") + (filtered.length ? "\n" : ""));
        }
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Use / or /proxies or /download or /health\n");
    } catch (err) {
      try {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal error\n");
      } catch (_) {}
      console.error(`[SERVER] Request error: ${err.message}`);
    }
  });

  server.on("error", (err) => console.error(`[SERVER] ${err.message}`));
  server.listen(port, "0.0.0.0", () => {
    console.log(`[SERVER] Listening on 0.0.0.0:${port}`);
    console.log(`  GET /             → raw ip:port`);
    console.log(`  GET /?type=http   → HTTP only`);
    console.log(`  GET /?format=json → JSON`);
    console.log(`  GET /download     → auto-download .txt`);
    console.log(`  GET /health       → stats\n`);
  });

  // Start first check immediately
  setTimeout(() => runCheck(), 1000);

  // Auto-refresh
  setInterval(() => {
    if (!shuttingDown && !stats.checking) runCheck();
  }, refreshMs);

  return server;
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

function main() {
  const config = loadConfig();
  const cfg = config.checker || {};

  console.log("═══════════════════════════════════════");
  console.log("  Proxy Manager API (Stable)");
  console.log("═══════════════════════════════════════");
  console.log(`Sources: ${SOURCES.length}`);
  console.log(`Refresh: ${cfg.refresh_interval_minutes || 5}m`);
  console.log(`Concurrency: ${Math.min(cfg.max_concurrent || 200, 200)}`);
  console.log(`Timeout: ${cfg.timeout_ms || 3000}ms`);
  console.log("═══════════════════════════════════════\n");

  startServer();
}

main();
