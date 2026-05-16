#!/usr/bin/env node
/**
 * proxy-all.js -- Ultra-Fast Proxy Scraper + Checker API (Railway Edition)
 *
 * - Scrapes 54 sources in parallel
 * - Checks proxies with 400ms timeout, only 1-300ms accepted
 * - Races HTTP + SOCKS5 + SOCKS4 in PARALLEL (not sequential)
 * - TCP pre-filter eliminates dead proxies instantly
 * - 500 concurrent checks for blazing speed
 * - Railway-stable: memory-safe, crash-proof, auto-restart safe
 *
 * Endpoints:
 *   GET /               → raw ip:port (all types, 1-300ms only)
 *   GET /?type=http     → HTTP only
 *   GET /?type=socks4   → SOCKS4 only
 *   GET /?type=socks5   → SOCKS5 only
 *   GET /?format=json   → JSON with speed + type info
 *   GET /?limit=100     → limit results
 *   GET /download       → auto-download .txt file
 *   GET /health         → server stats + memory info
 */

const http = require("http");
const https = require("https");
const net = require("net");
const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════════════════
// CRASH PROTECTION — never let process die
// ═══════════════════════════════════════════════════════════════════

let shuttingDown = false;

process.on("uncaughtException", (err) => {
  try { console.error(`[CRASH] ${err.message}\n${err.stack}`); } catch (_) {}
});

process.on("unhandledRejection", (reason) => {
  try { console.error(`[CRASH] Rejection: ${reason}`); } catch (_) {}
});

process.on("SIGTERM", () => { shuttingDown = true; console.log("[SHUTDOWN] SIGTERM"); });
process.on("SIGINT", () => { shuttingDown = true; console.log("[SHUTDOWN] SIGINT"); });

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const CONFIG_PATH = path.join(__dirname, "config.json");
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")); }
  catch (_) { return {}; }
}

// ═══════════════════════════════════════════════════════════════════
// ALL PROXY SOURCES (54 sources)
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// SAFE HTTP GET — crash-proof with double-timeout protection
// ═══════════════════════════════════════════════════════════════════

function httpGet(url, timeout) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };

    const mod = url.startsWith("https") ? https : http;
    const timer = setTimeout(() => {
      try { req.destroy(); } catch (_) {}
      done("");
    }, timeout + 2000);

    let req;
    try {
      req = mod.get(url, { timeout, headers: { "User-Agent": "Mozilla/5.0", "Connection": "close" } }, (res) => {
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

// ═══════════════════════════════════════════════════════════════════
// SCRAPER — all sources in parallel
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// PROXY CHECKER — Ultra-fast with parallel protocol racing
// ═══════════════════════════════════════════════════════════════════

const JUDGES = [
  "http://api.ipify.org?format=json",
  "http://checkip.amazonaws.com",
  "http://ip-api.com/json",
  "http://httpbin.org/ip",
];

// TCP pre-filter — instant dead proxy elimination
function tcpConnect(host, port, timeout) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };
    try {
      const sock = new net.Socket();
      sock.setNoDelay(true);
      const timer = setTimeout(() => {
        try { sock.destroy(); } catch (_) {}
        done(false);
      }, timeout);
      sock.on("error", () => { clearTimeout(timer); try { sock.destroy(); } catch (_) {} done(false); });
      sock.on("timeout", () => { clearTimeout(timer); try { sock.destroy(); } catch (_) {} done(false); });
      sock.connect(port, host, () => { clearTimeout(timer); try { sock.destroy(); } catch (_) {} done(true); });
    } catch (_) { done(false); }
  });
}

// Single protocol check — fully crash-proof with settled guard
function checkProtocol(proxy, judge, protocol, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };
    const start = process.hrtime.bigint();

    let agent = null;
    let req = null;

    const cleanup = () => {
      try { if (req) req.destroy(); } catch (_) {}
      try { if (agent) agent.destroy(); } catch (_) {}
    };

    const timer = setTimeout(() => { cleanup(); done(null); }, timeoutMs + 200);

    try {
      if (protocol === "http") {
        const { HttpProxyAgent } = require("http-proxy-agent");
        agent = new HttpProxyAgent(`http://${proxy}`);
      } else {
        const { SocksProxyAgent } = require("socks-proxy-agent");
        agent = new SocksProxyAgent(`${protocol}://${proxy}`);
      }
    } catch (_) { clearTimeout(timer); done(null); return; }

    try {
      req = http.get(judge, { agent, timeout: timeoutMs }, (res) => {
        const chunks = [];
        res.on("data", (c) => { chunks.push(c); });
        res.on("end", () => {
          clearTimeout(timer);
          const ms = (Number(process.hrtime.bigint() - start) / 1e6) | 0;
          cleanup();
          if (res.statusCode >= 200 && res.statusCode < 400) {
            done({ ms, type: protocol });
          } else {
            done(null);
          }
        });
        res.on("error", () => { clearTimeout(timer); cleanup(); done(null); });
      });
      req.on("error", () => { clearTimeout(timer); cleanup(); done(null); });
      req.on("timeout", () => { clearTimeout(timer); cleanup(); done(null); });
    } catch (_) { clearTimeout(timer); cleanup(); done(null); }
  });
}

// Race ALL protocols in PARALLEL — first valid response wins
// This is 3x faster than sequential checking
function checkOneProxy(proxy, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };

    const judge = JUDGES[Math.floor(Math.random() * JUDGES.length)];

    // Race all three protocols simultaneously
    let pending = 3;
    const finish = (result) => {
      pending--;
      if (result && !settled) {
        settled = true;
        resolve(result);
      } else if (pending === 0 && !settled) {
        resolve(null);
      }
    };

    checkProtocol(proxy, judge, "http", timeoutMs).then(finish);
    checkProtocol(proxy, judge, "socks5", timeoutMs).then(finish);
    checkProtocol(proxy, judge, "socks4", timeoutMs).then(finish);
  });
}

// ═══════════════════════════════════════════════════════════════════
// LIVE CACHE — proxies appear here immediately when found
// ═══════════════════════════════════════════════════════════════════

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
  peakMemory: 0,
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

// ═══════════════════════════════════════════════════════════════════
// MEMORY MONITOR — prevent Railway OOM crashes
// ═══════════════════════════════════════════════════════════════════

function getMemoryMB() {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

function checkMemory() {
  const memMB = getMemoryMB();
  if (memMB > stats.peakMemory) stats.peakMemory = memMB;

  // If memory exceeds 450MB on Railway (512MB limit), force GC and trim cache
  if (memMB > 450) {
    console.warn(`[MEMORY] ${memMB}MB — trimming cache & forcing GC`);
    // Keep only the fastest 500 proxies to free memory
    if (liveProxies.length > 500) {
      liveProxies = liveProxies.slice(0, 500);
      liveSet = new Set(liveProxies.map(p => p.proxy));
      stats.alive = liveProxies.length;
    }
    if (global.gc) try { global.gc(); } catch (_) {}
  }
}

// ═══════════════════════════════════════════════════════════════════
// BACKGROUND CHECK — ultra-fast with TCP pre-filter + parallel racing
// ═══════════════════════════════════════════════════════════════════

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
    const timeoutMs = cfg.timeout_ms || 400;
    const maxConc = Math.min(cfg.max_concurrent || 500, 500);
    const minMs = cfg.min_speed_ms || 1;
    const maxMs = cfg.max_speed_ms || 300;
    const total = proxies.length;

    console.log(`[CYCLE ${cycle}] Checking ${total} proxies (${maxConc} concurrent, ${timeoutMs}ms timeout, ${minMs}-${maxMs}ms speed filter)...`);

    // Phase 1: TCP pre-filter — eliminate unreachable proxies instantly
    console.log(`[CYCLE ${cycle}] Phase 1: TCP pre-filter (500ms timeout)...`);
    const tcpStart = Date.now();
    const tcpConc = Math.min(maxConc * 2, 1000); // Higher concurrency for TCP checks
    const reachable = [];

    for (let i = 0; i < total && !shuttingDown; i += tcpConc) {
      const batch = proxies.slice(i, i + tcpConc);
      const results = await Promise.allSettled(
        batch.map(async (proxy) => {
          try {
            const [host, portStr] = proxy.split(":");
            const port = parseInt(portStr);
            if (!host || isNaN(port)) return null;
            const ok = await tcpConnect(host, port, 500);
            return ok ? proxy : null;
          } catch (_) { return null; }
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) reachable.push(r.value);
      }
    }

    const tcpElapsed = ((Date.now() - tcpStart) / 1000).toFixed(1);
    console.log(`[CYCLE ${cycle}] TCP pre-filter: ${reachable.length}/${total} reachable in ${tcpElapsed}s`);

    if (reachable.length === 0) {
      stats.checking = false;
      return;
    }

    // Phase 2: Protocol check with parallel racing — only on reachable proxies
    console.log(`[CYCLE ${cycle}] Phase 2: Protocol racing (${maxConc} concurrent, ${timeoutMs}ms timeout)...`);
    const checkStart = Date.now();
    const checkTotal = reachable.length;

    for (let i = 0; i < checkTotal && !shuttingDown; i += maxConc) {
      const batch = reachable.slice(i, i + maxConc);
      const batchNum = Math.floor(i / maxConc) + 1;
      const totalBatches = Math.ceil(checkTotal / maxConc);

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

      // Memory check every 5 batches
      if (batchNum % 5 === 0) {
        checkMemory();
      }

      if (batchNum % 10 === 0 || batchNum === totalBatches) {
        console.log(`[CYCLE ${cycle}] Progress: ${Math.min(i + maxConc, checkTotal)}/${checkTotal} checked, ${stats.alive} alive, ${getMemoryMB()}MB`);
      }
    }

    const checkElapsed = ((Date.now() - checkStart) / 1000).toFixed(1);

    // Sort by speed (fastest first)
    liveProxies.sort((a, b) => a.ms - b.ms);
    stats.lastUpdate = new Date().toISOString();
    console.log(`[CYCLE ${cycle}] Done in ${checkElapsed}s: ${stats.alive} alive (1-${maxMs}ms), ${stats.dead} dead, ${getMemoryMB()}MB`);

    // Force GC after each cycle
    if (global.gc) try { global.gc(); } catch (_) {}

  } catch (err) {
    console.error(`[CYCLE ${cycle}] Error: ${err.message}`);
  }

  stats.checking = false;
}

// ═══════════════════════════════════════════════════════════════════
// HTTP API SERVER
// ═══════════════════════════════════════════════════════════════════

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
          memory_mb: getMemoryMB(),
          peak_memory_mb: stats.peakMemory,
          ...stats,
        }));
        return;
      }

      // Auto-download endpoint — saves .txt file directly (all live proxies)
      if (pathname === "/download") {
        const filtered = liveProxies;
        const filename = `fast_proxies_1-300ms_${filtered.length}.txt`;
        const body = filtered.map((p) => p.proxy).join("\n") + (filtered.length ? "\n" : "");

        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": Buffer.byteLength(body),
          "X-Total-Alive": String(stats.alive),
          "X-Returned": String(filtered.length),
          "X-Speed-Range": "1-300ms",
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
            speed_range: "1-300ms",
            proxies: filtered.map((p) => ({ proxy: p.proxy, ms: p.ms, type: p.type })),
          }));
        } else {
          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Total-Alive": String(stats.alive),
            "X-Checking": String(stats.checking),
            "X-Returned": String(filtered.length),
            "X-Speed-Range": "1-300ms",
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

  // Prevent server crashes
  server.on("error", (err) => {
    console.error(`[SERVER] ${err.message}`);
    // Don't let server errors crash the process
  });

  // Handle connection errors gracefully
  server.on("clientError", (err, socket) => {
    try { if (!socket.destroyed) socket.destroy(); } catch (_) {}
  });

  server.listen(port, "0.0.0.0", () => {
    console.log("════════════════════════════════════════════════════");
    console.log("  Proxy Manager API (Ultra-Fast Railway Edition)");
    console.log("════════════════════════════════════════════════════");
    console.log(`  Speed filter: 1-300ms ONLY`);
    console.log(`  Sources: ${SOURCES.length}`);
    console.log(`  Refresh: ${(refreshMs / 60000).toFixed(0)}m`);
    console.log(`  Concurrency: 500 (TCP pre-filter: 1000)`);
    console.log(`  Timeout: 400ms`);
    console.log("════════════════════════════════════════════════════");
    console.log(`  GET /             → raw ip:port (1-300ms only)`);
    console.log(`  GET /?type=http   → HTTP only`);
    console.log(`  GET /?format=json → JSON`);
    console.log(`  GET /download     → auto-download .txt`);
    console.log(`  GET /health       → stats + memory\n`);
  });

  // Start first check immediately
  setTimeout(() => runCheck(), 1000);

  // Auto-refresh
  setInterval(() => {
    if (!shuttingDown && !stats.checking) runCheck();
  }, refreshMs);

  // Memory monitor — check every 30s
  setInterval(() => {
    checkMemory();
  }, 30000);

  return server;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

function main() {
  const config = loadConfig();
  const cfg = config.checker || {};

  console.log("════════════════════════════════════════════════════");
  console.log("  Proxy Manager API (Ultra-Fast Railway Edition)");
  console.log("════════════════════════════════════════════════════");
  console.log(`Sources: ${SOURCES.length}`);
  console.log(`Refresh: ${cfg.refresh_interval_minutes || 5}m`);
  console.log(`Concurrency: ${Math.min(cfg.max_concurrent || 500, 500)}`);
  console.log(`Timeout: ${cfg.timeout_ms || 400}ms`);
  console.log(`Speed: ${cfg.min_speed_ms || 1}-${cfg.max_speed_ms || 300}ms ONLY`);
  console.log("════════════════════════════════════════════════════\n");

  startServer();
}

main();
