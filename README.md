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
    "chat_ids": ["123456789", "-1001234567890"],
    "checker": {
        "timeout_ms": 5000,
        "max_concurrent": 300,
        "min_speed_ms": 5,
        "max_speed_ms": 1000
    }
}
```

**Bot token:** Message [@BotFather](https://t.me/BotFather) -> `/newbot`
**Chat ID:** Message [@userinfobot](https://t.me/userinfobot)

### 2. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Vercel cron auto-triggers every 30 min. Each file runs independently.

### 3. Manual trigger

```
https://your-app.vercel.app/api/proxy-file1
https://your-app.vercel.app/api/proxy-file2
https://your-app.vercel.app/api/proxy-file3
https://your-app.vercel.app/api/proxy-file4
https://your-app.vercel.app/api/proxy-file5
```

## What each file does (everything in 1 file)

1. Scrapes proxies from its source URLs (all in parallel)
2. Checks each proxy as HTTP, SOCKS5, SOCKS4 (tries all types)
3. Keeps only fast proxies (5ms-1000ms response time)
4. Sends summary + proxy files to Telegram chat IDs
5. Returns JSON with results

## Config

| Key | Default | Description |
|-----|---------|-------------|
| `telegram_bot_token` | `""` | Telegram bot token |
| `chat_ids` | `[]` | Chat IDs to send files to |
| `timeout_ms` | `5000` | Proxy check timeout |
| `max_concurrent` | `300` | Concurrent checks |
| `min_speed_ms` | `5` | Min speed to keep |
| `max_speed_ms` | `1000` | Max speed to keep |

## Vercel Limits

- Hobby: 10s timeout (may timeout)
- Pro: 300s timeout (recommended)
- Cron needs Pro plan for custom schedules
