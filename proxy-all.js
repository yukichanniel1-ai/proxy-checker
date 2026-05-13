#!/usr/bin/env node
/**
 * proxy-all.js -- All-in-One Proxy Scraper + Checker + Sender
 *
 * Single file with ALL proxy sources combined.
 * Railway-stable: crash protection, memory safe, fast checking.
 *
 * Usage: node proxy-all.js
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
// ALL PROXY SOURCES (combined from proxy-file1..5)
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

function sleep(ms) {
  return new Promise((r) => {
    if (shuttingDown) { r(); return; }
    const timer = setTimeout(r, ms);
    const check = setInterval(() => {
      if (shuttingDown) { clearTimeout(timer); clearInterval(check); r(); }
    }, 1000);
    setTimeout(() => clearInterval(check), ms + 100);
  });
}

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
// FAST PROXY CHECKER (TCP connect first, then protocol)
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
  // Fast TCP pre-check — skip dead hosts immediately
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
// TELEGRAM SENDER (retry + error logging)
// ═══════════════════════════════════════════════════════

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10, timeout: 10000 });

async function tgSendMessage(token, chatId, text, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" });
      const result = await new Promise((resolve) => {
        let done = false;
        const finish = (val) => { if (!done) { done = true; resolve(val); } };
        const timer = setTimeout(() => finish({ ok: false, error: "timeout" }), 15000);

        const req = https.request(
          `https://api.telegram.org/bot${token}/sendMessage`,
          { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }, agent: httpsAgent, timeout: 10000 },
          (res) => {
            let d = "";
            res.on("data", (c) => { d += c; });
            res.on("end", () => {
              clearTimeout(timer);
              try { const j = JSON.parse(d); finish({ ok: j.ok, error: j.ok ? null : j.description }); }
              catch (_) { finish({ ok: res.statusCode < 300, error: d }); }
            });
            res.on("error", () => { clearTimeout(timer); finish({ ok: false, error: "res error" }); });
          }
        );
        req.on("error", (e) => { clearTimeout(timer); finish({ ok: false, error: e.message }); });
        req.on("timeout", () => { clearTimeout(timer); try { req.destroy(); } catch (_) {} finish({ ok: false, error: "req timeout" }); });
        req.write(payload);
        req.end();
      });

      if (result.ok) return true;
      console.error(`[TG] sendMessage fail #${attempt}: ${result.error}`);
    } catch (e) { console.error(`[TG] sendMessage err #${attempt}: ${e.message}`); }
    if (attempt < retries) await sleep(2000 * attempt);
  }
  return false;
}

async function tgSendDocument(token, chatId, content, filename, caption, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await new Promise((resolve) => {
        let done = false;
        const finish = (val) => { if (!done) { done = true; resolve(val); } };
        const timer = setTimeout(() => finish({ ok: false, error: "timeout" }), 30000);

        const FormData = require("form-data");
        const form = new FormData();
        form.append("chat_id", String(chatId));
        form.append("document", Buffer.from(content, "utf-8"), { filename });
        if (caption) form.append("caption", caption.slice(0, 1024));

        const url = new URL(`https://api.telegram.org/bot${token}/sendDocument`);
        const req = https.request(
          { hostname: url.hostname, path: url.pathname, method: "POST", headers: form.getHeaders(), timeout: 25000 },
          (res) => {
            let d = "";
            res.on("data", (c) => { d += c; });
            res.on("end", () => {
              clearTimeout(timer);
              try { const j = JSON.parse(d); finish({ ok: j.ok, error: j.ok ? null : j.description }); }
              catch (_) { finish({ ok: res.statusCode < 300, error: d }); }
            });
            res.on("error", () => { clearTimeout(timer); finish({ ok: false, error: "res error" }); });
          }
        );
        req.on("error", (e) => { clearTimeout(timer); finish({ ok: false, error: e.message }); });
        req.on("timeout", () => { clearTimeout(timer); try { req.destroy(); } catch (_) {} finish({ ok: false, error: "req timeout" }); });
        form.pipe(req);
      });

      if (result.ok) return true;
      console.error(`[TG] sendDoc fail #${attempt}: ${result.error}`);
    } catch (e) { console.error(`[TG] sendDoc err #${attempt}: ${e.message}`); }
    if (attempt < retries) await sleep(2000 * attempt);
  }
  return false;
}

// ═══════════════════════════════════════════════════════
// HEALTH CHECK SERVER
// ═══════════════════════════════════════════════════════

let stats = { cycle: 0, lastAlive: 0, lastDead: 0, lastElapsed: "0", lastRun: null };

function startHealthServer() {
  const port = process.env.PORT || 3000;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: shuttingDown ? "shutting_down" : "running",
      uptime: Math.floor(process.uptime()),
      memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
      ...stats,
    }));
  });
  server.on("error", (err) => console.error(`[HEALTH] ${err.message}`));
  server.listen(port, () => console.log(`[HEALTH] :${port}`));
  return server;
}

// ═══════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════

async function main() {
  const config = loadConfig();
  const token = config.telegram_bot_token || "";
  const targetIds = config.target_ids || [];
  const targetId = targetIds[0] || "";
  const cfg = config.checker || {};
  const delayMs = (cfg.refresh_interval_minutes || 5) * 60 * 1000;

  if (!token) { console.error("Error: telegram_bot_token not set in config.json"); process.exit(1); }
  if (!targetId) { console.error("Error: target_ids not set in config.json"); process.exit(1); }

  console.log("═══════════════════════════════════════");
  console.log("  Proxy All-in-One (Railway Stable)");
  console.log("═══════════════════════════════════════");
  console.log(`Sources: ${SOURCES.length}`);
  console.log(`Target: ${targetId}`);
  console.log(`Interval: ${delayMs / 60000}m`);
  console.log(`Concurrency: ${Math.min(cfg.max_concurrent || 500, 500)}`);
  console.log(`Timeout: ${cfg.timeout_ms || 3000}ms`);
  console.log("═══════════════════════════════════════\n");

  startHealthServer();

  let cycle = 0;
  while (!shuttingDown) {
    cycle++;
    stats.cycle = cycle;
    console.log(`\n[CYCLE ${cycle}] Starting...`);

    try {
      // 1. Scrape
      const proxies = await scrapeAll();
      if (shuttingDown) break;

      if (proxies.length === 0) {
        console.log(`[CYCLE ${cycle}] No proxies found, retry in ${delayMs / 60000}m`);
        await sleep(delayMs);
        continue;
      }

      // 2. Check
      const t0 = Date.now();
      const { alive, deadCount } = await checkAll(proxies, cfg);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[CYCLE ${cycle}] Done in ${elapsed}s → Live: ${alive.length} | Dead: ${deadCount}`);

      stats.lastAlive = alive.length;
      stats.lastDead = deadCount;
      stats.lastElapsed = elapsed;
      stats.lastRun = new Date().toISOString();

      if (shuttingDown) break;

      if (alive.length === 0) {
        console.log(`[CYCLE ${cycle}] No live proxies, retry in ${delayMs / 60000}m`);
        await sleep(delayMs);
        continue;
      }

      // 3. Send to Telegram
      const byType = {};
      alive.forEach((p) => { byType[p.type] = (byType[p.type] || 0) + 1; });
      const typeStr = Object.entries(byType).map(([t, c]) => `${t}:${c}`).join(" | ");
      const summary =
        `<b>Proxy Check — Cycle ${cycle}</b>\n` +
        `Sources: ${SOURCES.length}\n` +
        `Scraped: ${proxies.length}\n` +
        `Live: <b>${alive.length}</b> | Dead: ${deadCount}\n` +
        `Types: ${typeStr}\n` +
        `Fastest: ${alive[0].ms}ms | Time: ${elapsed}s`;

      console.log(`[CYCLE ${cycle}] Sending to ${targetId}...`);
      const msgOk = await tgSendMessage(token, targetId, summary);
      if (!msgOk) {
        console.error(`[CYCLE ${cycle}] Failed to send — check target_id or /start the bot first`);
        await sleep(delayMs);
        continue;
      }

      const fileContent = alive.map((p) => p.proxy).join("\n") + "\n";
      const filename = `proxies_cycle${cycle}.txt`;
      const caption = `${alive.length} live proxies | Fastest: ${alive[0].ms}ms | ${elapsed}s`;
      const fileOk = await tgSendDocument(token, targetId, fileContent, filename, caption);
      if (!fileOk) console.error(`[CYCLE ${cycle}] Failed to send file`);
      else console.log(`[CYCLE ${cycle}] Sent ${alive.length} proxies`);

    } catch (err) {
      console.error(`[CYCLE ${cycle}] Error: ${err.message}`);
    }

    if (global.gc) global.gc();
    console.log(`[CYCLE ${cycle}] Next in ${delayMs / 60000}m`);
    if (!shuttingDown) await sleep(delayMs);
  }

  console.log("[MAIN] Stopped.");
  httpsAgent.destroy();
  process.exit(0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
