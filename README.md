# Proxy Checker + Telegram Bot (Vercel)

Ultra-fast proxy scraper and checker with Telegram auto-send. Each file is **1 complete standalone file** with different proxy source links.

## Files

Each file is the **same code** but with **different proxy source URLs**:

| File | Sources |
|------|---------|
| `api/proxy-file1.js` | ProxyScrape, Proxifly, GeoNode |
| `api/proxy-file2.js` | TheSpeedX, monosans, iplocate |
| `api/proxy-file3.js` | gfpcom, prxchk, Thordata, komutan234 |
| `api/proxy-file4.js` | litport, pubproxy, redscrape, free-proxy-list.net, naravid19, ShiftyTR |
| `api/proxy-file5.js` | hookzof, sunny9577, ErcinDede, jetkai, roosterkid |
| `api/telegram-webhook.js` | Telegram bot webhook — handles `/start`, `/upload_proxy`, `/proxy_done` commands |

Every file scrapes **HTTP + SOCKS4 + SOCKS5** -> checks speed (keeps only **5ms-1000ms**) -> sends to Telegram.

## How to make more files

1. Copy any `proxy-fileN.js`
2. Change the `SOURCES` array to use different proxy links
3. Update `vercel.json` to add the cron
4. Deploy

## Setup

### 1. Edit `config.json`

```json
{
    "telegram_bot_token": "123456:ABC-DEF...",

    "chat_ids": {
        "proxy-file1": ["123456789"],
        "proxy-file2": ["987654321"],
        "proxy-file3": ["123456789", "987654321"],
        "proxy-file4": ["123456789"],
        "proxy-file5": ["987654321"]
    },

    "checker": {
        "timeout_ms": 5000,
        "max_concurrent": 300,
        "min_speed_ms": 5,
        "max_speed_ms": 1000
    }
}
```

Each proxy file sends to its **own list of chat IDs**. You can:
- Put different IDs for each file (each file goes to different chats)
- Put the same ID in multiple files (one chat receives from multiple files)
- Put multiple IDs in one file (one file sends to multiple chats)

**Bot token:** Message [@BotFather](https://t.me/BotFather) -> `/newbot`
**Chat ID:** Message [@userinfobot](https://t.me/userinfobot)

### 2. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Vercel cron auto-triggers every 5 min. Each file runs independently.

### 3. Manual trigger

```
https://your-app.vercel.app/api/proxy-file1
https://your-app.vercel.app/api/proxy-file2
https://your-app.vercel.app/api/proxy-file3
https://your-app.vercel.app/api/proxy-file4
https://your-app.vercel.app/api/proxy-file5
```

## Telegram Bot Commands

The bot supports interactive commands so you can upload your own proxy files and check them:

| Command | Description |
|---------|-------------|
| `/start` | Welcome message with instructions |
| `/upload_proxy` | Start uploading proxy files |
| `/proxy_done` | Check all uploaded proxies and get results |

### Flow

1. Send `/start` to the bot
2. Send `/upload_proxy` to begin
3. Send your proxy file(s) (`.txt` with `ip:port` format, one per line)
4. Send `/proxy_done` to check all uploaded proxies
5. Bot checks each proxy (HTTP, SOCKS4, SOCKS5) and sends back working proxies as a file

Repeat `/upload_proxy` -> send files -> `/proxy_done` anytime.

### Set up the webhook

After deploying, register the webhook with Telegram:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-app.vercel.app/api/telegram-webhook
```

Replace `<YOUR_BOT_TOKEN>` with your bot token and `your-app.vercel.app` with your Vercel domain.

## Worker Script (Bot-to-Bot)

`worker.js` runs 5 concurrent workers that scrape, check, and send proxies to a target bot automatically.

### Worker Cycle (per bot)

1. **Check** — Scrape proxies from assigned sources, check if live
2. **Handshake** — Send `/start` to the target bot
3. **Command** — Send `/upload_proxy`
4. **Upload** — Attach the file of checked proxies
5. **Signal** — Send `/proxy_done`
6. **Loop** — Wait `refresh_interval_minutes`, repeat

### Setup

1. Add `target_ids` to `config.json` — the chat ID(s) where the target bot receives messages:

```json
{
  "target_ids": ["123456789"]
}
```

Each worker sends to its own target ID (by index). If fewer target IDs than workers, all workers use the first one.

2. Install dependencies and run:

```bash
npm install
node worker.js
```

The worker runs continuously. Each of the 5 threads checks proxies from different sources (same as proxy-file1..5) and sends results to the target bot.

## What each file does (everything in 1 file)

1. Scrapes proxies from its source URLs (all in parallel)
2. Checks each proxy as HTTP, SOCKS5, SOCKS4 (tries all types)
3. Keeps only fast proxies (5ms-1000ms response time)
4. Sends `ip:port` only txt file to Telegram chat IDs
5. Returns JSON with results

## Config

| Key | Default | Description |
|-----|---------|-------------|
| `telegram_bot_token` | `""` | Telegram bot token |
| `chat_ids` | `[]` | Chat IDs to send files to |
| `target_ids` | `[]` | Target chat IDs for bot-to-bot worker |
| `timeout_ms` | `5000` | Proxy check timeout |
| `max_concurrent` | `300` | Concurrent checks |
| `min_speed_ms` | `5` | Min speed to keep |
| `max_speed_ms` | `1000` | Max speed to keep |

## Vercel Limits

- Hobby: 10s timeout (may timeout)
- Pro: 300s timeout (recommended)
- Cron needs Pro plan for custom schedules
