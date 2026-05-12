# Proxy Checker + Telegram Bot (Vercel)

Ultra-fast proxy scraper and checker with Telegram auto-send. Deploys on Vercel with cron auto-trigger.

Each file is **completely standalone** -- everything (scraper, checker, Telegram sender) in ONE file.

## Files

| File | What it does | Proxy Sources |
|------|-------------|---------------|
| `api/scrape-http.js` | HTTP proxies | ProxyScrape, Proxifly, iplocate, litport, pubproxy, GeoNode, free-proxy-list.net, redscrape |
| `api/scrape-socks4.js` | SOCKS4 proxies | ProxyScrape, Proxifly, iplocate, TheSpeedX, monosans, hookzof, GeoNode |
| `api/scrape-socks5.js` | SOCKS5 proxies | ProxyScrape, Proxifly, iplocate, TheSpeedX, monosans, litport, pubproxy, GeoNode |
| `api/scrape-all.js` | ALL types | All sources above combined (23+ sources) |
| `config.json` | Settings | Bot token, chat IDs, speed filter, concurrency |
| `vercel.json` | Cron schedule | Auto-triggers every 30 min |

Each file scrapes -> checks speed (5ms-1000ms only) -> sends fast proxies to Telegram.

## Setup

### 1. Configure `config.json`

```json
{
    "telegram_bot_token": "123456:ABC-DEF...",
    "chat_ids": [
        "123456789",
        "-1001234567890"
    ],
    "checker": {
        "timeout_ms": 5000,
        "max_concurrent": 300,
        "min_speed_ms": 5,
        "max_speed_ms": 1000,
        "check_google": true,
        "proxy_types": ["http", "socks4", "socks5"],
        "refresh_interval_minutes": 30,
        "auto_loop": true
    }
}
```

**Get bot token:** Message [@BotFather](https://t.me/BotFather) -> `/newbot` -> copy token

**Get chat ID:** Message [@userinfobot](https://t.me/userinfobot) for your ID. For groups: add bot to group, then check `https://api.telegram.org/bot<TOKEN>/getUpdates`

### 2. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

That's it. Vercel cron will auto-trigger the scrapers every 30 minutes and send proxy files to your Telegram.

### 3. Manual trigger

Visit these URLs to trigger manually:
- `https://your-app.vercel.app/api/scrape-http`
- `https://your-app.vercel.app/api/scrape-socks4`
- `https://your-app.vercel.app/api/scrape-socks5`
- `https://your-app.vercel.app/api/scrape-all`

Each returns JSON with the results and sends files to Telegram.

## Cron Schedule (vercel.json)

| Endpoint | Schedule | Description |
|----------|----------|-------------|
| `/api/scrape-http` | Every 30 min | HTTP proxies |
| `/api/scrape-socks4` | Every 30 min | SOCKS4 proxies |
| `/api/scrape-socks5` | Every 30 min | SOCKS5 proxies |
| `/api/scrape-all` | Every hour | All types combined |

## Speed Filter

Only proxies with response time **5ms to 1000ms** are kept and sent. Change in `config.json`:

```json
{
    "checker": {
        "min_speed_ms": 5,
        "max_speed_ms": 1000
    }
}
```

## Config Options

| Key | Default | Description |
|-----|---------|-------------|
| `telegram_bot_token` | `""` | Telegram bot API token |
| `chat_ids` | `[]` | Chat IDs to send proxy files to |
| `timeout_ms` | `5000` | Proxy check timeout |
| `max_concurrent` | `300` | Concurrent checks (higher = faster) |
| `min_speed_ms` | `5` | Min response time to accept |
| `max_speed_ms` | `1000` | Max response time to accept |
| `proxy_types` | `["http","socks4","socks5"]` | Types to check (for scrape-all) |

## Using for Multiple Bots

Each `api/*.js` file is standalone. Copy any file, change the `SOURCES` array to use different proxy links, and deploy. Each file works independently as its own bot.

## Note on Vercel Limits

- **Hobby plan**: 10s function timeout (may not finish checking all proxies)
- **Pro plan**: 300s timeout (recommended for full checks)
- Cron jobs require Vercel Pro plan for custom schedules
