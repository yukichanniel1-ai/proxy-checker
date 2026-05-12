/**
 * scrape-http.js -- Standalone HTTP proxy scraper + checker + Telegram sender.
 * Vercel serverless function. Trigger via GET /api/scrape-http or cron.
 *
 * Everything in ONE file. Scrapes HTTP proxies, checks speed (5ms-1000ms),
 * sends fast proxies to Telegram chat IDs from config.json.
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

// ── CONFIG ──────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, "..", "config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch (_) {
    return {};
  }
}

// ── HTTP PROXY SOURCES ──────────────────────────────────
const SOURCES = [
  {
    name: "ProxyScrape HTTP",
    url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all",
  },
  {
    name: "Proxifly HTTP",
    url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/http/data.txt",
  },
  {
    name: "Proxifly ALL",
    url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.txt",
  },
  {
    name: "iplocate HTTP",
    url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/http.txt",
  },
  {
    name: "litport HTTP",
    url: "https://litport.net/free-proxy/http.txt",
  },
  {
    name: "pubproxy HTTP",
    url: "http://pubproxy.com/api/proxy?limit=20&format=txt&type=http",
  },
  {
    name: "GeoNode p1",
    url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc",
    fmt: "geonode",
  },
  {
    name: "GeoNode p2",
    url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=2&sort_by=lastChecked&sort_type=desc",
    fmt: "geonode",
  },
  {
    name: "free-proxy-list.net",
    url: "https://free-proxy-list.net/",
  },
  {
    name: "redscrape API",
    url: "https://free.redscrape.com/api/proxies",
    fmt: "redscrape",
  },
];

// ── HELPERS ─────────────────────────────────────────────
const IP_RE = /(\d{1,3}(?:\.\d{1,3}){3}:\d{1,5})/g;

function validate(proxy) {
  const m = proxy.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/);
  if (!m) return false;
  return [1, 2, 3, 4].every((i) => parseInt(m[i]) <= 255) && parseInt(m[5]) >= 1 && parseInt(m[5]) <= 65535;
}

function extractIps(text) {
  return (text.match(IP_RE) || []).filter(validate);
}

function httpGet(url, timeout = 15000) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout, headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve(d));
    });
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
    setTimeout(() => { req.destroy(); resolve(""); }, timeout + 1000);
  });
}

// ── SCRAPER ─────────────────────────────────────────────
async function scrapeAll() {
  const results = await Promise.allSettled(
    SOURCES.map(async (src) => {
      const raw = await httpGet(src.url, 20000);
      if (!raw) return [];
      if (src.fmt === "geonode") {
        try {
          const data = JSON.parse(raw);
          return (data.data || [])
            .map((i) => (i.ip && i.port ? `${i.ip}:${i.port}` : ""))
            .filter(validate);
        } catch (_) { return []; }
      }
      if (src.fmt === "redscrape") {
        try {
          const data = JSON.parse(raw);
          const items = Array.isArray(data) ? data : data.proxies || data.data || [];
          return items
            .map((i) => (i.ip && i.port ? `${i.ip}:${i.port}` : ""))
            .filter(validate);
        } catch (_) { return []; }
      }
      return extractIps(raw);
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

// ── CHECKER ─────────────────────────────────────────────
const JUDGES = [
  "http://api.ipify.org?format=json",
  "http://checkip.amazonaws.com",
  "http://ip-api.com/json",
  "http://httpbin.org/ip",
];

function checkProxy(proxy, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const judge = JUDGES[Math.floor(Math.random() * JUDGES.length)];
    const start = Date.now();
    const proxyParts = proxy.split(":");
    const options = {
      hostname: proxyParts[0],
      port: parseInt(proxyParts[1]),
      method: "CONNECT",
      path: new URL(judge).hostname + ":80",
      timeout: timeoutMs,
    };

    // Simple HTTP proxy check via direct request through proxy
    const proxyUrl = `http://${proxy}`;
    const { HttpProxyAgent } = require("http-proxy-agent");
    const agent = new HttpProxyAgent(proxyUrl);

    const req = http.get(judge, { agent, timeout: timeoutMs }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        const ms = Date.now() - start;
        resolve(res.statusCode >= 200 && res.statusCode < 400 ? ms : null);
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    setTimeout(() => { req.destroy(); resolve(null); }, timeoutMs + 500);
  });
}

async function checkAll(proxies, config = {}) {
  const timeoutMs = config.timeout_ms || 5000;
  const maxConcurrent = config.max_concurrent || 300;
  const minMs = config.min_speed_ms || 5;
  const maxMs = config.max_speed_ms || 1000;

  const alive = [];
  const dead = [];

  for (let i = 0; i < proxies.length; i += maxConcurrent) {
    const batch = proxies.slice(i, i + maxConcurrent);
    const results = await Promise.allSettled(
      batch.map(async (proxy) => {
        const ms = await checkProxy(proxy, timeoutMs);
        return { proxy, ms };
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        const { proxy, ms } = r.value;
        if (ms !== null && ms >= minMs && ms <= maxMs) {
          alive.push({ proxy, ms, type: "http" });
        } else {
          dead.push(proxy);
        }
      }
    }
  }

  alive.sort((a, b) => a.ms - b.ms);
  return { alive, dead };
}

// ── TELEGRAM ────────────────────────────────────────────
function telegramSendMessage(token, chatId, text) {
  const payload = JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096), parse_mode: "HTML" });
  return new Promise((resolve) => {
    const req = https.request(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }, timeout: 15000 },
      (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve(true)); }
    );
    req.on("error", () => resolve(false));
    req.write(payload);
    req.end();
  });
}

function telegramSendFile(token, chatId, content, filename, caption) {
  const FormData = require("form-data");
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", Buffer.from(content, "utf-8"), { filename });
  if (caption) form.append("caption", caption.slice(0, 1024));

  return new Promise((resolve) => {
    const url = new URL(`https://api.telegram.org/bot${token}/sendDocument`);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname, method: "POST", headers: form.getHeaders(), timeout: 30000 },
      (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve(true)); }
    );
    req.on("error", () => resolve(false));
    form.pipe(req);
  });
}

async function broadcast(alive, dead, config) {
  const token = config.telegram_bot_token || "";
  const chatIds = config.chat_ids || [];
  if (!token || token === "YOUR_BOT_TOKEN_HERE") return;
  if (!chatIds.length || chatIds[0] === "CHAT_ID_1") return;

  const fileContent = alive.map((p) => p.proxy).join("\n") + "\n";
  const summary =
    `<b>HTTP Proxy Update</b>\n` +
    `Fast (5-1000ms): ${alive.length}\n` +
    `Dead/Slow: ${dead.length}\n` +
    `Fastest: ${alive.length > 0 ? alive[0].ms + "ms" : "N/A"}`;

  for (const chatId of chatIds) {
    await telegramSendMessage(token, chatId, summary);
    if (alive.length > 0) {
      await telegramSendFile(token, chatId, fileContent, "http_proxies.txt", `${alive.length} fast HTTP proxies`);
    }
  }
}

// ── VERCEL HANDLER ──────────────────────────────────────
module.exports = async function handler(req, res) {
  const config = loadConfig();
  const checkerConfig = config.checker || {};

  const t0 = Date.now();
  const proxies = await scrapeAll();
  const { alive, dead } = await checkAll(proxies, checkerConfig);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  await broadcast(alive, dead, config);

  const result = {
    type: "http",
    scraped: proxies.length,
    alive: alive.length,
    dead: dead.length,
    elapsed_sec: elapsed,
    fastest: alive.length > 0 ? alive[0].ms + "ms" : null,
    proxies: alive.map((p) => ({ proxy: p.proxy, ms: p.ms })),
  };

  res.status(200).json(result);
};
