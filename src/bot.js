/**
 * bot.js -- Telegram bot that auto-sends proxy files to configured chat IDs.
 *
 * Reads config.json for bot_token and chat_ids.
 * Sends proxy list files as documents with summary message.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const FormData = require("form-data");
const { loadConfig } = require("./helpers");

async function sendMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = JSON.stringify({
    chat_id: String(chatId),
    text: text.slice(0, 4096),
    parse_mode: "HTML",
  });

  return new Promise((resolve) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const result = JSON.parse(data);
            resolve(result.ok || false);
          } catch (_) {
            resolve(false);
          }
        });
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.write(payload);
    req.end();
  });
}

async function sendFile(botToken, chatId, filePath, caption) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    return false;
  }

  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", fs.createReadStream(filePath), {
    filename: path.basename(filePath),
  });
  if (caption) {
    form.append("caption", caption.slice(0, 1024));
  }

  return new Promise((resolve) => {
    const url = new URL(
      `https://api.telegram.org/bot${botToken}/sendDocument`
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
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const result = JSON.parse(data);
            if (result.ok) {
              console.log(
                `  [+] Sent ${path.basename(filePath)} to chat ${chatId}`
              );
            } else {
              console.log(
                `  [!] Failed to send to ${chatId}: ${result.description || "Unknown"}`
              );
            }
            resolve(result.ok || false);
          } catch (_) {
            resolve(false);
          }
        });
      }
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });

    form.pipe(req);
  });
}

async function broadcastProxyFiles(proxyFiles, stats = {}) {
  const config = loadConfig();
  const botToken = config.telegram_bot_token || "";
  const chatIds = config.chat_ids || [];

  if (!botToken || botToken === "YOUR_BOT_TOKEN_HERE") {
    console.log("  [!] Bot token not configured. Skipping Telegram send.");
    return;
  }

  if (
    !chatIds.length ||
    (chatIds.length === 2 &&
      chatIds[0] === "CHAT_ID_1" &&
      chatIds[1] === "CHAT_ID_2")
  ) {
    console.log("  [!] Chat IDs not configured. Skipping Telegram send.");
    return;
  }

  const summary =
    `<b>Proxy Update</b>\n` +
    `Alive (fast): ${stats.alive || 0}\n` +
    `Too slow: ${stats.tooSlow || 0}\n` +
    `Dead: ${stats.dead || 0}\n` +
    `No Google: ${stats.noGoogle || 0}\n` +
    `Speed filter: ${stats.minMs || 5}ms - ${stats.maxMs || 1000}ms\n` +
    `Files: ${proxyFiles.length}`;

  for (const chatId of chatIds) {
    await sendMessage(botToken, chatId, summary);

    for (const filePath of proxyFiles) {
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
        const caption = `Proxy list: ${path.basename(filePath)}`;
        await sendFile(botToken, chatId, filePath, caption);
        // small delay between sends to avoid rate limiting
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  console.log(
    `  [+] Broadcast complete: ${proxyFiles.length} files to ${chatIds.length} chats`
  );
}

module.exports = { sendMessage, sendFile, broadcastProxyFiles };
