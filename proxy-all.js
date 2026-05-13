#!/usr/bin/env node
/**
 * proxy-all.js -- All-in-One Proxy Scraper + Checker API
 *
 * Single file with ALL proxy sources combined.
 * Railway-stable: crash protection, memory safe, fast checking.
 * Serves raw ip:port or JSON via HTTP API.
 *
 * Usage: node proxy-all.js
 *
 * Endpoints:
 *   GET /             → raw ip:port (all types)
 *   GET /?type=http   → HTTP only
 *   GET /?type=socks4 → SOCKS4 only
 *   GET /?type=socks5 → SOCKS5 only
 *   GET /?format=json → JSON with speed + type info
 *   GET /?limit=100   → limit results
 *   GET /health       → health/stats
 */

const http = require("http");
const https = require("https");
const net = require("net");
const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════
// CRASH PROTECTION
// ═══════════════════════════════════════════════════════

let shuttingDown = false;

process.on("uncaughtException", (err) => {
  console.error(`[CRASH] ${err.message}`);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error(`[CRASH] Unhandled rejection: ${reason}`);
});

process.on("SIGTERM", () => { console.log("[SHUTDOWN] SIGTERM"); shuttingDown = true; });
process.on("SIGINT", () => { console.log("[SHUTDOWN] SIGINT"); shuttingDown = true; });

// ═══════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════

const CONFIG_PATH = path.join(__dirname, "config.json");
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")); }
  catch (_) { return {}; }
}

// ═══════════════════════════════════════════════════════
// ALL PROXY SOURCES (54 sources combined)
// ═══════════════════════════════════════════════════════

const SOURCES = [
  // ProxyScrape
  { name: "ProxyScrape HTTP", url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all" },
  { name: "ProxyScrape SOCKS4", url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=all" },
  { name: "ProxyScrape SOCKS5", url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all" },
  // Proxifly
  { name: "Proxifly ALL", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.txt" },
  { name: "Proxifly HTTP", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/http/data.txt" },
  { name: "Proxifly SOCKS4", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks4/data.txt" },
  { name: "Proxifly SOCKS5", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.txt" },
  // GeoNode
  { name: "GeoNode p1", url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc", fmt: "geonode" },
  { name: "GeoNode p2", url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=2&sort_by=lastChecked&sort_type=desc", fmt: "geonode" },
  { name: "GeoNode p3", url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=3&sort_by=lastChecked&sort_type=desc", fmt: "geonode" },
  // TheSpeedX
  { name: "TheSpeedX HTTP", url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt" },
  { name: "TheSpeedX SOCKS4", url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks4.txt" },
  { name: "TheSpeedX SOCKS5", url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt" },
  // monosans
  { name: "monosans HTTP", url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt" },
  { name: "monosans SOCKS4", url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt" },
  { name: "monosans SOCKS5", url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt" },
  // iplocate
  { name: "iplocate HTTP", url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/http.txt" },
  { name: "iplocate SOCKS4", url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/socks4.txt" },
  { name: "iplocate SOCKS5", url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/socks5.txt" },
  // gfpcom
  { name: "gfpcom HTTP", url: "https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/proxies/http.txt" },
  { name: "gfpcom SOCKS4", url: "https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/proxies/socks4.txt" },
  { name: "gfpcom SOCKS5", url: "https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/proxies/socks5.txt" },
  // prxchk
  { name: "prxchk HTTP", url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/http.txt" },
  { name: "prxchk SOCKS4", url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks4.txt" },
  { name: "prxchk SOCKS5", url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks5.txt" },
  // Thordata
  { name: "Thordata HTTP", url: "https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxies/http.txt" },
  { name: "Thordata SOCKS4", url: "https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxies/socks4.txt" },
  { name: "Thordata SOCKS5", url: "https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxies/socks5.txt" },
  // komutan234
  { name: "komutan234 HTTP", url: "https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/http.txt" },
  { name: "komutan234 SOCKS4", url: "https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks4.txt" },
  { name: "komutan234 SOCKS5", url: "https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks5.txt" },
  // litport
  { name: "litport HTTP", url: "https://litport.net/free-proxy/http.txt" },
  { name: "litport SOCKS5", url: "https://litport.net/free-proxy/socks5.txt" },
  // pubproxy
  { name: "pubproxy HTTP", url: "http://pubproxy.com/api/proxy?limit=20&format=txt&type=http" },
  { name: "pubproxy SOCKS5", url: "http://pubproxy.com/api/proxy?limit=20&format=txt&type=socks5" },
  // redscrape
  { name: "redscrape API", url: "https://free.redscrape.com/api/proxies", fmt: "redscrape" },
  // naravid19
  { name: "naravid19 HTTP", url: "https://raw.githubusercontent.com/naravid19/checked-proxies/main/http.txt" },
  { name: "naravid19 SOCKS4", url: "https://raw.githubusercontent.com/naravid19/checked-proxies/main/socks4.txt" },
  { name: "naravid19 SOCKS5", url: "https://raw.githubusercontent.com/naravid19/checked-proxies/main/socks5.txt" },
  // ShiftyTR
  { name: "ShiftyTR ALL", url: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/proxy.txt" },
  // hookzof
  { name: "hookzof SOCKS", url: "https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt" },
  // sunny9577
  { name: "sunny9577 HTTP", url: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/http_proxies.txt" },
  { name: "sunny9577 SOCKS4", url: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks4_proxies.txt" },
  { name: "sunny9577 SOCKS5", url: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks5_proxies.txt" },
  // ErcinDede
  { name: "ErcinDede HTTP", url: "https://raw.githubusercontent.com/ErcinDedeworken/proxies/main/proxies/http.txt" },
  { name: "ErcinDede SOCKS4", url: "https://raw.githubusercontent.com/ErcinDedeworken/proxies/main/proxies/socks4.txt" },
  { name: "ErcinDede SOCKS5", url: "https://raw.githubusercontent.com/ErcinDedeworken/proxies/main/proxies/socks5.txt" },
  // jetkai
  { name: "jetkai HTTP", url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt" },
  { name: "jetkai SOCKS4", url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt" },
  { name: "jetkai SOCKS5", url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt" },
  // roosterkid
  { name: "roosterkid HTTP", url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt" },
  { name: "roosterkid SOCKS4", url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt" },
  { name: "roosterkid SOCKS5", url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt" },
];

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

const IP_RE = /(\d{1,3}(?:\.\d{1,3}){3}:\d{1,5})/g;

function validate(p) {
  const m = p.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/);
  if (!m) return false;
  return [1, 2, 3, 4].every((i) => parseInt(m[i]) <= 255) && parseInt(m[5]) >= 1 && parseInt(m[5]) <= 65535;
}

function extractIps(t) { return (t.match(IP_RE) || []).filter(validate); }

// ═══════════════════════════════════════════════════════
// FAST HTTP GET (safe, single-resolve)
// ═══════════════════════════════════════════════════════

function httpGet(url, timeout = 10000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => { if (!done) { done = true; resolve(val); } };

    const mod = url.startsWith("https") ? https : http;
    const timer = setTimeout(() => { try { req.destroy(); } catch (_) {} finish(""); }, timeout + 2000);

    let req;
    try {
      req = mod.get(url, { timeout, headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        let d = "";
        res.on("data", (c) => { d += c; });
        res.on("end", () => { clearTimeout(timer); finish(d); });
        res.on("error", () => { clearTimeout(timer); finish(""); });
      });
    } catch (_) { clearTimeout(timer); finish(""); return; }

    req.on("error", () => { clearTimeout(timer); finish(""); });
    req.on("timeout", () => { clearTimeout(timer); try { req.destroy(); } catch (_) {} finish(""); });
  });
}

// ═══════════════════════════════════════════════════════
// SCRAPER (all sources in parallel)
// ═══════════════════════════════════════════════════════

async function scrapeAll() {
  console.log(`[SCRAPE] Fetching from ${SOURCES.length} sources...`);
  const results = await Promise.allSettled(
    SOURCES.map(async (src) => {
      try {
        const raw = await httpGet(src.url, 12000);
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
  let sourcesOk = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.length > 0) {
      sourcesOk++;
      for (const p of r.value) {
        if (!seen.has(p)) { seen.add(p); proxies.push(p); }
      }
    }
  }
  console.log(`[SCRAPE] ${sourcesOk}/${SOURCES.length} sources OK → ${proxies.length} unique proxies`);
  return proxies;
}

// ═══════════════════════════════════════════════════════
// FAST PROXY CHECKER (TCP pre-check + protocol check)
// ═══════════════════════════════════════════════════════

const JUDGES = [
  "http://api.ipify.org?format=json",
  "http://checkip.amazonaws.com",
  "http://ip-api.com/json",
  "http://httpbin.org/ip",
];

function tcpConnect(host, port, timeout) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const timer = setTimeout(() => { sock.destroy(); resolve(false); }, timeout);
    sock.connect(port, host, () => { clearTimeout(timer); sock.destroy(); resolve(true); });
    sock.on("error", () => { clearTimeout(timer); sock.destroy(); resolve(false); });
  });
}

function checkWithHttp(proxy, judge, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => { if (!done) { done = true; resolve(val); } };
    const start = process.hrtime.bigint();

    let agent;
    try {
      const { HttpProxyAgent } = require("http-proxy-agent");
      agent = new HttpProxyAgent(`http://${proxy}`);
    } catch (_) { finish(null); return; }

    const timer = setTimeout(() => {
      try { req.destroy(); } catch (_) {}
      try { agent.destroy(); } catch (_) {}
      finish(null);
    }, timeoutMs + 500);

    let req;
    try {
      req = http.get(judge, { agent, timeout: timeoutMs }, (res) => {
        let d = "";
        res.on("data", (c) => { d += c; });
        res.on("end", () => {
          clearTimeout(timer);
          const ms = (Number(process.hrtime.bigint() - start) / 1e6) | 0;
          try { agent.destroy(); } catch (_) {}
          finish(res.statusCode >= 200 && res.statusCode < 400 ? { ms, type: "http" } : null);
        });
        res.on("error", () => { clearTimeout(timer); try { agent.destroy(); } catch (_) {} finish(null); });
      });
    } catch (_) { clearTimeout(timer); try { agent.destroy(); } catch (_) {} finish(null); return; }

    req.on("error", () => { clearTimeout(timer); try { agent.destroy(); } catch (_) {} finish(null); });
    req.on("timeout", () => { clearTimeout(timer); try { req.destroy(); agent.destroy(); } catch (_) {} finish(null); });
  });
}

function checkWithSocks(proxy, judge, socksType, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => { if (!done) { done = true; resolve(val); } };
    const start = process.hrtime.bigint();

    let agent;
    try {
      const { SocksProxyAgent } = require("socks-proxy-agent");
      agent = new SocksProxyAgent(`${socksType}://${proxy}`);
    } catch (_) { finish(null); return; }

    const timer = setTimeout(() => {
      try { req.destroy(); } catch (_) {}
      try { agent.destroy(); } catch (_) {}
      finish(null);
    }, timeoutMs + 500);

    let req;
    try {
      req = http.get(judge, { agent, timeout: timeoutMs }, (res) => {
        let d = "";
        res.on("data", (c) => { d += c; });
        res.on("end", () => {
          clearTimeout(timer);
          const ms = (Number(process.hrtime.bigint() - start) / 1e6) | 0;
          try { agent.destroy(); } catch (_) {}
          finish(res.statusCode >= 200 && res.statusCode < 400 ? { ms, type: socksType } : null);
        });
        res.on("error", () => { clearTimeout(timer); try { agent.destroy(); } catch (_) {} finish(null); });
      });
    } catch (_) { clearTimeout(timer); try { agent.destroy(); } catch (_) {} finish(null); return; }

    req.on("error", () => { clearTimeout(timer); try { req.destroy(); agent.destroy(); } catch (_) {} finish(null); });
    req.on("timeout", () => { clearTimeout(timer); try { req.destroy(); agent.destroy(); } catch (_) {} finish(null); });
  });
}

async function checkProxy(proxy, timeoutMs) {
  const [host, portStr] = proxy.split(":");
  const port = parseInt(portStr);
  const reachable = await tcpConnect(host, port, Math.min(timeoutMs, 2000));
  if (!reachable) return null;

  const judge = JUDGES[Math.floor(Math.random() * JUDGES.length)];
  const result = await checkWithHttp(proxy, judge, timeoutMs);
  if (result) return result;
  const r2 = await checkWithSocks(proxy, judge, "socks5", timeoutMs);
  if (r2) return r2;
  return await checkWithSocks(proxy, judge, "socks4", timeoutMs);
}

async function checkAll(proxies, cfg = {}) {
  const timeoutMs = cfg.timeout_ms || 3000;
  const maxConc = Math.min(cfg.max_concurrent || 500, 500);
  const minMs = cfg.min_speed_ms || 5;
  const maxMs = cfg.max_speed_ms || 1000;
  const alive = [];
  let deadCount = 0;
  const total = proxies.length;

  for (let i = 0; i < total; i += maxConc) {
    if (shuttingDown) break;

    const batch = proxies.slice(i, i + maxConc);
    const batchNum = Math.floor(i / maxConc) + 1;
    const totalBatches = Math.ceil(total / maxConc);
    console.log(`[CHECK] Batch ${batchNum}/${totalBatches} (${i}-${Math.min(i + maxConc, total)}/${total}) alive=${alive.length}`);

    const results = await Promise.allSettled(
      batch.map(async (proxy) => {
        try {
          const r = await checkProxy(proxy, timeoutMs);
          return { proxy, ...(r || { ms: null, type: null }) };
        } catch (_) {
          return { proxy, ms: null, type: null };
        }
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        const { proxy, ms, type } = r.value;
        if (ms !== null && ms >= minMs && ms <= maxMs) alive.push({ proxy, ms, type });
        else deadCount++;
      } else {
        deadCount++;
      }
    }

    if (global.gc) global.gc();
  }

  alive.sort((a, b) => a.ms - b.ms);
  return { alive, deadCount };
}

// ═══════════════════════════════════════════════════════
// CACHED PROXY LIST (background refresh)
// ═══════════════════════════════════════════════════════

let cachedProxies = [];
let cacheStats = { scraped: 0, alive: 0, dead: 0, elapsed: "0", lastUpdate: null, updating: false };

async function refreshCache() {
  if (cacheStats.updating) return;
  cacheStats.updating = true;
  const config = loadConfig();
  const cfg = config.checker || {};

  try {
    console.log("[CACHE] Refreshing...");
    const t0 = Date.now();
    const proxies = await scrapeAll();

    if (proxies.length === 0) {
      console.log("[CACHE] No proxies scraped");
      cacheStats.updating = false;
      return;
    }

    const { alive, deadCount } = await checkAll(proxies, cfg);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    cachedProxies = alive;
    cacheStats = {
      scraped: proxies.length,
      alive: alive.length,
      dead: deadCount,
      elapsed,
      lastUpdate: new Date().toISOString(),
      updating: false,
    };
    console.log(`[CACHE] Updated: ${alive.length} alive / ${deadCount} dead in ${elapsed}s`);
  } catch (err) {
    console.error(`[CACHE] Error: ${err.message}`);
    cacheStats.updating = false;
  }

  if (global.gc) global.gc();
}

// ═══════════════════════════════════════════════════════
// HTTP API SERVER
// ═══════════════════════════════════════════════════════

function startServer() {
  const port = process.env.PORT || 3000;
  const config = loadConfig();
  const refreshMs = (config.checker?.refresh_interval_minutes || 5) * 60 * 1000;

  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Health endpoint
    if (pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: shuttingDown ? "shutting_down" : "running",
        uptime: Math.floor(process.uptime()),
        memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
        cache: cacheStats,
      }));
      return;
    }

    // Main proxy endpoint
    if (pathname === "/" || pathname === "/proxies") {
      const type = (url.searchParams.get("type") || "all").toLowerCase();
      const format = (url.searchParams.get("format") || "raw").toLowerCase();
      const limit = parseInt(url.searchParams.get("limit") || "0") || 0;

      let filtered = cachedProxies;
      if (type !== "all") {
        filtered = cachedProxies.filter((p) => p.type === type);
      }
      if (limit > 0) {
        filtered = filtered.slice(0, limit);
      }

      if (format === "json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          total_scraped: cacheStats.scraped,
          total_alive: cacheStats.alive,
          total_dead: cacheStats.dead,
          returned: filtered.length,
          last_update: cacheStats.lastUpdate,
          elapsed_sec: cacheStats.elapsed,
          type_filter: type,
          proxies: filtered.map((p) => ({ proxy: p.proxy, ms: p.ms, type: p.type })),
        }));
      } else {
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Total-Scraped": cacheStats.scraped,
          "X-Total-Alive": cacheStats.alive,
          "X-Total-Dead": cacheStats.dead,
          "X-Returned": filtered.length,
          "X-Last-Update": cacheStats.lastUpdate || "pending",
        });
        res.end(filtered.map((p) => p.proxy).join("\n") + (filtered.length ? "\n" : ""));
      }
      return;
    }

    // 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found. Use / or /proxies or /health" }));
  });

  server.on("error", (err) => console.error(`[SERVER] ${err.message}`));

  server.listen(port, () => {
    console.log(`[SERVER] Listening on :${port}`);
    console.log(`[SERVER] Endpoints:`);
    console.log(`  GET /             → raw ip:port`);
    console.log(`  GET /?type=http   → HTTP only`);
    console.log(`  GET /?type=socks4 → SOCKS4 only`);
    console.log(`  GET /?type=socks5 → SOCKS5 only`);
    console.log(`  GET /?format=json → JSON`);
    console.log(`  GET /?limit=100   → limit results`);
    console.log(`  GET /health       → stats`);
  });

  // Initial refresh
  refreshCache();

  // Auto-refresh on interval
  setInterval(() => {
    if (!shuttingDown) refreshCache();
  }, refreshMs);

  return server;
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

function main() {
  const config = loadConfig();
  const cfg = config.checker || {};
  const refreshMin = cfg.refresh_interval_minutes || 5;

  console.log("═══════════════════════════════════════");
  console.log("  Proxy Manager API (Railway Stable)");
  console.log("═══════════════════════════════════════");
  console.log(`Sources: ${SOURCES.length}`);
  console.log(`Refresh: ${refreshMin}m`);
  console.log(`Concurrency: ${Math.min(cfg.max_concurrent || 500, 500)}`);
  console.log(`Timeout: ${cfg.timeout_ms || 3000}ms`);
  console.log("═══════════════════════════════════════\n");

  startServer();
}

main();
