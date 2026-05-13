#!/usr/bin/env node
/**
 * worker.js -- Stable 5-Thread Proxy Checker + Bot-to-Bot Uploader
 *
 * Designed for Railway (long-running process).
 * Crash-proof: global error handlers, retry logic, memory cleanup,
 * connection limits, graceful shutdown.
 *
 * Usage: node worker.js
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════
// GLOBAL CRASH PROTECTION
// ═══════════════════════════════════════════════════════

let shuttingDown = false;

process.on("uncaughtException", (err) => {
  console.error(`[CRASH] Uncaught exception: ${err.message}`);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error(`[CRASH] Unhandled rejection: ${reason}`);
});

process.on("SIGTERM", () => {
  console.log("[SHUTDOWN] SIGTERM received, shutting down gracefully...");
  shuttingDown = true;
});

process.on("SIGINT", () => {
  console.log("[SHUTDOWN] SIGINT received, shutting down gracefully...");
  shuttingDown = true;
});

// ═══════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════

const CONFIG_PATH = path.join(__dirname, "config.json");
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch (_) {
    return {};
  }
}

// ═══════════════════════════════════════════════════════
// KEEP-ALIVE HTTP AGENTS (reuse connections, prevent leaks)
// ═══════════════════════════════════════════════════════

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50, timeout: 10000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50, timeout: 10000 });

// ═══════════════════════════════════════════════════════
// PROXY SOURCES (same as proxy-file1..5)
// ═══════════════════════════════════════════════════════

const SOURCES_BY_WORKER = [
  [
    { name: "ProxyScrape HTTP", url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all" },
    { name: "ProxyScrape SOCKS4", url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=all" },
    { name: "ProxyScrape SOCKS5", url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all" },
    { name: "Proxifly ALL", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.txt" },
    { name: "Proxifly HTTP", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/http/data.txt" },
    { name: "Proxifly SOCKS4", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks4/data.txt" },
    { name: "Proxifly SOCKS5", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.txt" },
    { name: "GeoNode p1", url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc", fmt: "geonode" },
    { name: "GeoNode p2", url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=2&sort_by=lastChecked&sort_type=desc", fmt: "geonode" },
    { name: "GeoNode p3", url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=3&sort_by=lastChecked&sort_type=desc", fmt: "geonode" },
  ],
  [
    { name: "TheSpeedX HTTP", url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt" },
    { name: "TheSpeedX SOCKS4", url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks4.txt" },
    { name: "TheSpeedX SOCKS5", url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt" },
    { name: "monosans HTTP", url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt" },
    { name: "monosans SOCKS4", url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt" },
    { name: "monosans SOCKS5", url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt" },
    { name: "iplocate HTTP", url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/http.txt" },
    { name: "iplocate SOCKS4", url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/socks4.txt" },
    { name: "iplocate SOCKS5", url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/socks5.txt" },
  ],
  [
    { name: "gfpcom HTTP", url: "https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/proxies/http.txt" },
    { name: "gfpcom SOCKS4", url: "https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/proxies/socks4.txt" },
    { name: "gfpcom SOCKS5", url: "https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/proxies/socks5.txt" },
    { name: "prxchk HTTP", url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/http.txt" },
    { name: "prxchk SOCKS4", url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks4.txt" },
    { name: "prxchk SOCKS5", url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks5.txt" },
    { name: "Thordata HTTP", url: "https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxies/http.txt" },
    { name: "Thordata SOCKS4", url: "https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxies/socks4.txt" },
    { name: "Thordata SOCKS5", url: "https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxies/socks5.txt" },
    { name: "komutan234 HTTP", url: "https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/http.txt" },
    { name: "komutan234 SOCKS4", url: "https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks4.txt" },
    { name: "komutan234 SOCKS5", url: "https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks5.txt" },
  ],
  [
    { name: "litport HTTP", url: "https://litport.net/free-proxy/http.txt" },
    { name: "litport SOCKS5", url: "https://litport.net/free-proxy/socks5.txt" },
    { name: "pubproxy HTTP", url: "http://pubproxy.com/api/proxy?limit=20&format=txt&type=http" },
    { name: "pubproxy SOCKS5", url: "http://pubproxy.com/api/proxy?limit=20&format=txt&type=socks5" },
    { name: "redscrape API", url: "https://free.redscrape.com/api/proxies", fmt: "redscrape" },
    { name: "free-proxy-list.net", url: "https://free-proxy-list.net/" },
    { name: "naravid19 HTTP", url: "https://raw.githubusercontent.com/naravid19/checked-proxies/main/http.txt" },
    { name: "naravid19 SOCKS4", url: "https://raw.githubusercontent.com/naravid19/checked-proxies/main/socks4.txt" },
    { name: "naravid19 SOCKS5", url: "https://raw.githubusercontent.com/naravid19/checked-proxies/main/socks5.txt" },
    { name: "ShiftyTR ALL", url: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/proxy.txt" },
  ],
  [
    { name: "hookzof SOCKS", url: "https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt" },
    { name: "sunny9577 HTTP", url: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/http_proxies.txt" },
    { name: "sunny9577 SOCKS4", url: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks4_proxies.txt" },
    { name: "sunny9577 SOCKS5", url: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks5_proxies.txt" },
    { name: "ErcinDede HTTP", url: "https://raw.githubusercontent.com/ErcinDedeworken/proxies/main/proxies/http.txt" },
    { name: "ErcinDede SOCKS4", url: "https://raw.githubusercontent.com/ErcinDedeworken/proxies/main/proxies/socks4.txt" },
    { name: "ErcinDede SOCKS5", url: "https://raw.githubusercontent.com/ErcinDedeworken/proxies/main/proxies/socks5.txt" },
    { name: "jetkai HTTP", url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt" },
    { name: "jetkai SOCKS4", url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt" },
    { name: "jetkai SOCKS5", url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt" },
    { name: "roosterkid HTTP", url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt" },
    { name: "roosterkid SOCKS4", url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt" },
    { name: "roosterkid SOCKS5", url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt" },
  ],
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
    const timer = setTimeout(r, ms);
    const check = setInterval(() => {
      if (shuttingDown) { clearTimeout(timer); clearInterval(check); r(); }
    }, 1000);
    setTimeout(() => clearInterval(check), ms + 100);
  });
}

function safeRequest(url, options, timeout) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };

    const mod = url.startsWith("https") ? https : http;
    const timer = setTimeout(() => {
      try { req.destroy(); } catch (_) {}
      done("");
    }, timeout + 2000);

    let req;
    try {
      req = mod.get(url, { timeout, ...options }, (res) => {
        let d = "";
        res.on("data", (c) => { d += c; });
        res.on("end", () => { clearTimeout(timer); done(d); });
        res.on("error", () => { clearTimeout(timer); done(""); });
      });
    } catch (_) {
      clearTimeout(timer);
      done("");
      return;
    }

    req.on("error", () => { clearTimeout(timer); done(""); });
    req.on("timeout", () => {
      clearTimeout(timer);
      try { req.destroy(); } catch (_) {}
      done("");
    });
  });
}

function httpGet(url, timeout = 10000) {
  return safeRequest(url, { headers: { "User-Agent": "Mozilla/5.0" } }, timeout);
}

// ═══════════════════════════════════════════════════════
// SCRAPER
// ═══════════════════════════════════════════════════════

async function scrapeAll(sources) {
  const results = await Promise.allSettled(
    sources.map(async (src) => {
      try {
        const raw = await httpGet(src.url, 15000);
        if (!raw) return [];
        if (src.fmt === "geonode") {
          try { const d = JSON.parse(raw); return (d.data || []).map((i) => (i.ip && i.port ? `${i.ip}:${i.port}` : "")).filter(validate); }
          catch (_) { return []; }
        }
        if (src.fmt === "redscrape") {
          try { const d = JSON.parse(raw); const items = Array.isArray(d) ? d : d.proxies || d.data || []; return items.map((i) => (i.ip && i.port ? `${i.ip}:${i.port}` : "")).filter(validate); }
          catch (_) { return []; }
        }
        return extractIps(raw);
      } catch (_) {
        return [];
      }
    })
  );
  const seen = new Set(), proxies = [];
  for (const r of results) {
    if (r.status === "fulfilled") for (const p of r.value) if (!seen.has(p)) { seen.add(p); proxies.push(p); }
  }
  return proxies;
}

// ═══════════════════════════════════════════════════════
// PROXY CHECKER (fast + safe)
// ═══════════════════════════════════════════════════════

const JUDGES = [
  "http://api.ipify.org?format=json",
  "http://checkip.amazonaws.com",
  "http://ip-api.com/json",
  "http://httpbin.org/ip",
];

function checkWithHttp(proxy, judge, timeoutMs) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };

    const start = process.hrtime.bigint();
    let agent;
    try {
      const { HttpProxyAgent } = require("http-proxy-agent");
      agent = new HttpProxyAgent(`http://${proxy}`);
    } catch (_) {
      done(null);
      return;
    }

    const timer = setTimeout(() => {
      try { req.destroy(); } catch (_) {}
      try { agent.destroy(); } catch (_) {}
      done(null);
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
          done(res.statusCode >= 200 && res.statusCode < 400 ? { ms, type: "http" } : null);
        });
        res.on("error", () => { clearTimeout(timer); try { agent.destroy(); } catch (_) {} done(null); });
      });
    } catch (_) {
      clearTimeout(timer);
      try { agent.destroy(); } catch (_) {}
      done(null);
      return;
    }

    req.on("error", () => { clearTimeout(timer); try { agent.destroy(); } catch (_) {} done(null); });
    req.on("timeout", () => { clearTimeout(timer); try { req.destroy(); agent.destroy(); } catch (_) {} done(null); });
  });
}

function checkWithSocks(proxy, judge, socksType, timeoutMs) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };

    const start = process.hrtime.bigint();
    let agent;
    try {
      const { SocksProxyAgent } = require("socks-proxy-agent");
      agent = new SocksProxyAgent(`${socksType}://${proxy}`);
    } catch (_) {
      done(null);
      return;
    }

    const timer = setTimeout(() => {
      try { req.destroy(); } catch (_) {}
      try { agent.destroy(); } catch (_) {}
      done(null);
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
          done(res.statusCode >= 200 && res.statusCode < 400 ? { ms, type: socksType } : null);
        });
        res.on("error", () => { clearTimeout(timer); try { agent.destroy(); } catch (_) {} done(null); });
      });
    } catch (_) {
      clearTimeout(timer);
      try { agent.destroy(); } catch (_) {}
      done(null);
      return;
    }

    req.on("error", () => { clearTimeout(timer); try { req.destroy(); agent.destroy(); } catch (_) {} done(null); });
    req.on("timeout", () => { clearTimeout(timer); try { req.destroy(); agent.destroy(); } catch (_) {} done(null); });
  });
}

async function checkProxy(proxy, timeoutMs) {
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

  for (let i = 0; i < proxies.length; i += maxConc) {
    if (shuttingDown) break;

    const batch = proxies.slice(i, i + maxConc);
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
// TELEGRAM SENDER (with retry)
// ═══════════════════════════════════════════════════════

async function tgSendMessage(token, chatId, text, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" });
      const ok = await new Promise((resolve) => {
        let resolved = false;
        const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };

        const timer = setTimeout(() => done(false), 15000);

        const req = https.request(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
            agent: httpsAgent,
            timeout: 10000,
          },
          (res) => {
            let d = "";
            res.on("data", (c) => { d += c; });
            res.on("end", () => { clearTimeout(timer); done(res.statusCode >= 200 && res.statusCode < 300); });
            res.on("error", () => { clearTimeout(timer); done(false); });
          }
        );
        req.on("error", () => { clearTimeout(timer); done(false); });
        req.on("timeout", () => { clearTimeout(timer); try { req.destroy(); } catch (_) {} done(false); });
        req.write(payload);
        req.end();
      });

      if (ok) return true;
    } catch (_) {}

    if (attempt < retries) await sleep(2000 * attempt);
  }
  return false;
}

async function tgSendDocument(token, chatId, content, filename, caption, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const ok = await new Promise((resolve) => {
        let resolved = false;
        const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };

        const timer = setTimeout(() => done(false), 30000);

        const FormData = require("form-data");
        const form = new FormData();
        form.append("chat_id", String(chatId));
        form.append("document", Buffer.from(content, "utf-8"), { filename });
        if (caption) form.append("caption", caption.slice(0, 1024));

        const url = new URL(`https://api.telegram.org/bot${token}/sendDocument`);
        const req = https.request(
          {
            hostname: url.hostname,
            path: url.pathname,
            method: "POST",
            headers: form.getHeaders(),
            timeout: 25000,
          },
          (res) => {
            let d = "";
            res.on("data", (c) => { d += c; });
            res.on("end", () => { clearTimeout(timer); done(res.statusCode >= 200 && res.statusCode < 300); });
            res.on("error", () => { clearTimeout(timer); done(false); });
          }
        );
        req.on("error", () => { clearTimeout(timer); done(false); });
        req.on("timeout", () => { clearTimeout(timer); try { req.destroy(); } catch (_) {} done(false); });
        form.pipe(req);
      });

      if (ok) return true;
    } catch (_) {}

    if (attempt < retries) await sleep(2000 * attempt);
  }
  return false;
}

// ═══════════════════════════════════════════════════════
// WORKER -- single bot cycle (crash-safe)
// ═══════════════════════════════════════════════════════

async function runWorker(workerId, sources, config) {
  const token = config.telegram_bot_token || "";
  const targetIds = config.target_ids || [];
  const targetId = targetIds[workerId] || targetIds[0] || "";
  const cfg = config.checker || {};
  const delayMs = (cfg.refresh_interval_minutes || 5) * 60 * 1000;

  if (!token || !targetId) {
    console.log(`[W${workerId + 1}] Missing bot token or target_id. Skipping.`);
    return;
  }

  let cycle = 0;
  while (!shuttingDown) {
    cycle++;
    const tag = `[W${workerId + 1}|C${cycle}]`;

    try {
      // Step 1: Scrape
      console.log(`${tag} Scraping...`);
      const proxies = await scrapeAll(sources);
      console.log(`${tag} Scraped ${proxies.length}`);

      if (shuttingDown) break;

      if (proxies.length === 0) {
        console.log(`${tag} No proxies, retry in ${delayMs / 60000}m`);
        await sleep(delayMs);
        continue;
      }

      // Step 2: Check
      console.log(`${tag} Checking ${proxies.length} proxies...`);
      const t0 = Date.now();
      const { alive, deadCount } = await checkAll(proxies, cfg);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`${tag} Done in ${elapsed}s | Live: ${alive.length} | Dead: ${deadCount}`);

      if (shuttingDown) break;

      if (alive.length === 0) {
        console.log(`${tag} No live proxies, retry in ${delayMs / 60000}m`);
        await sleep(delayMs);
        continue;
      }

      // Step 3: Handshake - /start
      console.log(`${tag} /start -> ${targetId}`);
      await tgSendMessage(token, targetId, "/start");
      await sleep(500);

      // Step 4: /upload_proxy
      console.log(`${tag} /upload_proxy`);
      await tgSendMessage(token, targetId, "/upload_proxy");
      await sleep(500);

      // Step 5: Upload file
      const fileContent = alive.map((p) => p.proxy).join("\n") + "\n";
      const filename = `worker${workerId + 1}_proxies.txt`;
      const caption = `W${workerId + 1} | ${alive.length} live | Fastest: ${alive[0].ms}ms`;
      console.log(`${tag} Uploading ${alive.length} proxies`);
      await tgSendDocument(token, targetId, fileContent, filename, caption);
      await sleep(500);

      // Step 6: /proxy_done
      console.log(`${tag} /proxy_done`);
      await tgSendMessage(token, targetId, "/proxy_done");

      console.log(`${tag} Cycle done. Next in ${delayMs / 60000}m`);
    } catch (err) {
      console.error(`${tag} Error: ${err.message}`);
    }

    // Memory cleanup
    if (global.gc) global.gc();

    if (!shuttingDown) await sleep(delayMs);
  }

  console.log(`[W${workerId + 1}] Stopped.`);
}

// ═══════════════════════════════════════════════════════
// HEALTH CHECK SERVER (Railway needs a listening port)
// ═══════════════════════════════════════════════════════

function startHealthServer() {
  const port = process.env.PORT || 3000;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "running",
      uptime: Math.floor(process.uptime()),
      memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
    }));
  });

  server.on("error", (err) => {
    console.error(`[HEALTH] Server error: ${err.message}`);
  });

  server.listen(port, () => {
    console.log(`[HEALTH] Listening on port ${port}`);
  });

  return server;
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

async function main() {
  const config = loadConfig();

  if (!config.telegram_bot_token) {
    console.error("Error: telegram_bot_token not set in config.json");
    process.exit(1);
  }

  if (!config.target_ids || config.target_ids.length === 0) {
    console.error("Error: target_ids not set in config.json");
    process.exit(1);
  }

  console.log("═══════════════════════════════════════");
  console.log("  Proxy Checker Worker (Stable)");
  console.log("═══════════════════════════════════════");
  console.log(`Workers: ${SOURCES_BY_WORKER.length}`);
  console.log(`Targets: ${config.target_ids.join(", ")}`);
  console.log(`Interval: ${config.checker?.refresh_interval_minutes || 5}m`);
  console.log(`Max concurrent: ${Math.min(config.checker?.max_concurrent || 500, 500)}`);
  console.log(`Timeout: ${config.checker?.timeout_ms || 3000}ms`);
  console.log("═══════════════════════════════════════\n");

  startHealthServer();

  const workers = SOURCES_BY_WORKER.map((sources, i) => runWorker(i, sources, config));

  await Promise.all(workers);

  console.log("[MAIN] All workers stopped. Exiting.");
  httpAgent.destroy();
  httpsAgent.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
