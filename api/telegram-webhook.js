/**
 * telegram-webhook.js -- Telegram Bot Webhook Handler
 *
 * Handles bot commands:
 *   /start        - Welcome message with instructions
 *   /upload_proxy - Prepare to receive a proxy file
 *   /proxy_done   - Check uploaded proxies and send results
 *
 * Flow: /start -> /upload_proxy -> send .txt file -> /proxy_done
 *       (repeat /upload_proxy -> file -> /proxy_done as needed)
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "config.json");
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch (_) {
    return {};
  }
}

// ═══════════════════════════════════════════════════════
// TELEGRAM API HELPERS
// ═══════════════════════════════════════════════════════

function tgApi(token, method, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve) => {
    const req = https.request(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 15000,
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch (_) {
            resolve({ ok: false });
          }
        });
      }
    );
    req.on("error", () => resolve({ ok: false }));
    req.write(payload);
    req.end();
  });
}

function tgSendMessage(token, chatId, text) {
  return tgApi(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  });
}

function tgGetFile(token, fileId) {
  return tgApi(token, "getFile", { file_id: fileId });
}

function tgSendDocument(token, chatId, content, filename, caption) {
  const FormData = require("form-data");
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", Buffer.from(content, "utf-8"), { filename });
  if (caption) form.append("caption", caption.slice(0, 1024));
  return new Promise((resolve) => {
    const url = new URL(
      `https://api.telegram.org/bot${token}/sendDocument`
    );
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: "POST",
        headers: form.getHeaders(),
        timeout: 30000,
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(true));
      }
    );
    req.on("error", () => resolve(false));
    form.pipe(req);
  });
}

function downloadFile(url, timeout = 15000) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      { timeout, headers: { "User-Agent": "Mozilla/5.0" } },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(d));
      }
    );
    req.on("error", () => resolve(""));
    req.on("timeout", () => {
      req.destroy();
      resolve("");
    });
    setTimeout(() => {
      req.destroy();
      resolve("");
    }, timeout + 1000);
  });
}

// ═══════════════════════════════════════════════════════
// PROXY HELPERS
// ═══════════════════════════════════════════════════════

const IP_RE = /(\d{1,3}(?:\.\d{1,3}){3}:\d{1,5})/g;

function validate(p) {
  const m = p.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/
  );
  if (!m) return false;
  return (
    [1, 2, 3, 4].every((i) => parseInt(m[i]) <= 255) &&
    parseInt(m[5]) >= 1 &&
    parseInt(m[5]) <= 65535
  );
}

function extractIps(t) {
  return (t.match(IP_RE) || []).filter(validate);
}

// ═══════════════════════════════════════════════════════
// PROXY CHECKER
// ═══════════════════════════════════════════════════════

const JUDGES = [
  "http://api.ipify.org?format=json",
  "http://checkip.amazonaws.com",
  "http://ip-api.com/json",
  "http://httpbin.org/ip",
];

function checkWithHttp(proxy, judge, timeoutMs) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const { HttpProxyAgent } = require("http-proxy-agent");
    const agent = new HttpProxyAgent(`http://${proxy}`);
    const req = http.get(judge, { agent, timeout: timeoutMs }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        const ms = (Number(process.hrtime.bigint() - start) / 1e6) | 0;
        resolve(
          res.statusCode >= 200 && res.statusCode < 400
            ? { ms, type: "http" }
            : null
        );
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    setTimeout(() => {
      req.destroy();
      resolve(null);
    }, timeoutMs + 500);
  });
}

function checkWithSocks(proxy, judge, socksType, timeoutMs) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const { SocksProxyAgent } = require("socks-proxy-agent");
    const agent = new SocksProxyAgent(`${socksType}://${proxy}`);
    const req = http.get(judge, { agent, timeout: timeoutMs }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        const ms = (Number(process.hrtime.bigint() - start) / 1e6) | 0;
        resolve(
          res.statusCode >= 200 && res.statusCode < 400
            ? { ms, type: socksType }
            : null
        );
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    setTimeout(() => {
      req.destroy();
      resolve(null);
    }, timeoutMs + 500);
  });
}

async function checkProxy(proxy, timeoutMs) {
  const judge = JUDGES[Math.floor(Math.random() * JUDGES.length)];
  let result = await checkWithHttp(proxy, judge, timeoutMs);
  if (result) return result;
  result = await checkWithSocks(proxy, judge, "socks5", timeoutMs);
  if (result) return result;
  result = await checkWithSocks(proxy, judge, "socks4", timeoutMs);
  return result;
}

async function checkAll(proxies, cfg = {}) {
  const timeoutMs = cfg.timeout_ms || 5000;
  const maxConc = cfg.max_concurrent || 300;
  const minMs = cfg.min_speed_ms || 5;
  const maxMs = cfg.max_speed_ms || 1000;
  const alive = [];
  const dead = [];

  for (let i = 0; i < proxies.length; i += maxConc) {
    const batch = proxies.slice(i, i + maxConc);
    const results = await Promise.allSettled(
      batch.map(async (proxy) => {
        const r = await checkProxy(proxy, timeoutMs);
        return { proxy, ...(r || { ms: null, type: null }) };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        const { proxy, ms, type } = r.value;
        if (ms !== null && ms >= minMs && ms <= maxMs)
          alive.push({ proxy, ms, type });
        else dead.push(proxy);
      }
    }
  }

  alive.sort((a, b) => a.ms - b.ms);
  return { alive, dead };
}

// ═══════════════════════════════════════════════════════
// STATE (per-chat, stored in /tmp for Vercel)
// ═══════════════════════════════════════════════════════

const STATE_DIR = path.join("/tmp", "proxy-bot-state");

function ensureStateDir() {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  } catch (_) {}
}

function getProxyFile(chatId) {
  return path.join(STATE_DIR, `${chatId}_proxies.txt`);
}

function getStatusFile(chatId) {
  return path.join(STATE_DIR, `${chatId}_status.json`);
}

function setStatus(chatId, status) {
  ensureStateDir();
  fs.writeFileSync(
    getStatusFile(chatId),
    JSON.stringify({ status, ts: Date.now() })
  );
}

function getStatus(chatId) {
  try {
    const data = JSON.parse(fs.readFileSync(getStatusFile(chatId), "utf-8"));
    return data.status || "idle";
  } catch (_) {
    return "idle";
  }
}

function appendProxies(chatId, content) {
  ensureStateDir();
  fs.appendFileSync(getProxyFile(chatId), content + "\n");
}

function getStoredProxies(chatId) {
  try {
    const raw = fs.readFileSync(getProxyFile(chatId), "utf-8");
    return extractIps(raw);
  } catch (_) {
    return [];
  }
}

function clearState(chatId) {
  try {
    fs.unlinkSync(getProxyFile(chatId));
  } catch (_) {}
  try {
    fs.unlinkSync(getStatusFile(chatId));
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════

async function handleStart(token, chatId) {
  const text =
    `<b>Welcome to Proxy Checker Bot!</b>\n\n` +
    `<b>Commands:</b>\n` +
    `/start - Show this help message\n` +
    `/upload_proxy - Start uploading proxy files\n` +
    `/proxy_done - Check uploaded proxies\n\n` +
    `<b>How to use:</b>\n` +
    `1. Send /upload_proxy\n` +
    `2. Send your proxy file (.txt with ip:port format)\n` +
    `3. Send /proxy_done to start checking\n\n` +
    `You can send multiple files before /proxy_done.\n` +
    `Repeat the flow anytime!`;
  await tgSendMessage(token, chatId, text);
}

async function handleUploadProxy(token, chatId) {
  clearState(chatId);
  setStatus(chatId, "awaiting_file");
  const text =
    `📂 <b>Ready to receive proxy files!</b>\n\n` +
    `Send me your proxy file(s) in <b>.txt</b> format.\n` +
    `Each line should be in <code>ip:port</code> format.\n\n` +
    `When you're done uploading, send /proxy_done to start checking.`;
  await tgSendMessage(token, chatId, text);
}

async function handleDocument(token, chatId, document) {
  const status = getStatus(chatId);
  if (status !== "awaiting_file") {
    await tgSendMessage(
      token,
      chatId,
      "⚠️ Please send /upload_proxy first before sending files."
    );
    return;
  }

  const fileInfo = await tgGetFile(token, document.file_id);
  if (!fileInfo.ok || !fileInfo.result || !fileInfo.result.file_path) {
    await tgSendMessage(
      token,
      chatId,
      "❌ Could not download the file. Please try again."
    );
    return;
  }

  const fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`;
  const content = await downloadFile(fileUrl);

  if (!content) {
    await tgSendMessage(
      token,
      chatId,
      "❌ File is empty or could not be read. Please try again."
    );
    return;
  }

  const proxies = extractIps(content);
  appendProxies(chatId, content);

  const fileName = document.file_name || "unknown";
  await tgSendMessage(
    token,
    chatId,
    `✅ <b>File received:</b> ${fileName}\n` +
      `Found <b>${proxies.length}</b> proxies in this file.\n\n` +
      `Send more files or /proxy_done to start checking.`
  );
}

async function handleProxyDone(token, chatId, cfg) {
  const status = getStatus(chatId);
  if (status !== "awaiting_file") {
    await tgSendMessage(
      token,
      chatId,
      "⚠️ No proxy files uploaded. Send /upload_proxy first, then send your files."
    );
    return;
  }

  const proxies = getStoredProxies(chatId);
  if (proxies.length === 0) {
    await tgSendMessage(
      token,
      chatId,
      "⚠️ No valid proxies found in uploaded files.\nSend /upload_proxy to try again."
    );
    clearState(chatId);
    return;
  }

  setStatus(chatId, "checking");

  await tgSendMessage(
    token,
    chatId,
    `🔍 <b>Checking ${proxies.length} proxies...</b>\nThis may take a moment.`
  );

  const t0 = Date.now();
  const { alive, dead } = await checkAll(proxies, cfg);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const summary =
    `<b>Proxy Check Complete!</b>\n\n` +
    `📊 Total: ${proxies.length}\n` +
    `✅ Working: ${alive.length}\n` +
    `❌ Dead: ${dead.length}\n` +
    `⏱ Time: ${elapsed}s\n` +
    (alive.length > 0
      ? `⚡ Fastest: ${alive[0].ms}ms (${alive[0].type})`
      : "");

  await tgSendMessage(token, chatId, summary);

  if (alive.length > 0) {
    const fileContent = alive.map((p) => p.proxy).join("\n") + "\n";
    await tgSendDocument(
      token,
      chatId,
      fileContent,
      "checked_proxies.txt",
      `${alive.length} working proxies (ip:port)`
    );
  }

  clearState(chatId);
}

// ═══════════════════════════════════════════════════════
// VERCEL HANDLER (Webhook endpoint)
// ═══════════════════════════════════════════════════════

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, info: "Telegram webhook endpoint. Use POST." });
  }

  const config = loadConfig();
  const token = config.telegram_bot_token || "";
  const cfg = config.checker || {};

  if (!token) {
    return res.status(500).json({ error: "Bot token not configured" });
  }

  const update = req.body;
  if (!update || !update.message) {
    return res.status(200).json({ ok: true });
  }

  const message = update.message;
  const chatId = message.chat.id;
  const text = (message.text || "").trim();

  if (text === "/start") {
    await handleStart(token, chatId);
  } else if (text === "/upload_proxy") {
    await handleUploadProxy(token, chatId);
  } else if (text === "/proxy_done") {
    await handleProxyDone(token, chatId, cfg);
  } else if (message.document) {
    await handleDocument(token, chatId, message.document);
  }

  res.status(200).json({ ok: true });
};
