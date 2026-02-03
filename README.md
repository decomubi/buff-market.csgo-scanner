# Buff163 → market.csgo.com Arbitrage Scanner

Real-time CS2 skin arbitrage scanner comparing Buff163 sell prices to market.csgo.com buy order prices.

## Features

- 🔍 **Real-time scanning** — BUFF163 listings vs market.csgo.com buy orders
- 📊 **Live metrics** — profitable flips, avg spread, total volume
- 🎯 **Price filtering** — set min/max USD price range
- ⚡ **Click-to-expand** — view order details for any item
- 🚀 **Fast caching** — BUFF cache (60s), market.csgo.com price list cache (5min)

## Setup

### 1. Get your API keys

**BUFF Cookie:**
1. Open https://buff.163.com in your browser
2. Open DevTools (F12) → Application → Cookies
3. Copy the entire cookie string (all key=value pairs)

**market.csgo.com API Key:**
1. Open https://market.csgo.com/en
2. Go to Settings → API
3. Generate an API key

### 2. Deploy to Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start)

1. Connect your GitHub repo
2. Set environment variables in Netlify:
   - `BUFF_COOKIE` — your full BUFF cookie string
   - `CSGOMARKET_API_KEY` — your market.csgo.com API key (e.g. `pYRwxe571FJ8o5RC0sA4RLnwa5Hn9qa`)
   - `FX_CNYUSD` — exchange rate (e.g. `0.14`)

3. Deploy!

### 3. Local development

```bash
npm install
npm run dev
```

Create `.env` file:
```
BUFF_COOKIE="your_cookie"
CSGOMARKET_API_KEY="pYRwxe571FJ8o5RC0sA4RLnwa5Hn9qa"
FX_CNYUSD="0.14"
```

## API Endpoints

### Scan items
```
GET /.netlify/functions/scan?limit=20&minPrice=0.10&maxPrice=5.00
```

### Get order details
```
GET /.netlify/functions/scan?orders=AK-47+|+Redline+(Field-Tested)
```

## How it works

1. **BUFF163 API** — fetches cheapest CS2 skin listings sorted by liquidity
2. **market.csgo.com API** — fetches entire price list (cached 5min) with buy order prices
3. **Match & calculate** — for each BUFF item, find the highest buy order on market.csgo.com and compute spread/profit

## market.csgo.com API Details

- **Price List Endpoint:** `https://market.csgo.com/api/v2/prices/USD.json?key={api_key}`
- **Response:** `{ success: true, items: { "classid_instanceid": { price, buy_order, market_hash_name, ... } } }`
- **`buy_order`** — highest buy order price in USD
- **Cache:** 5 minutes (API doesn't provide real-time order list, just highest price)

## Notes

- market.csgo.com doesn't have a dedicated "orders list" endpoint — the price list API includes `buy_order` (highest buy order) for each item
- The detail popup shows just the single highest buy order since that's all the API provides
- BUFF cookie expires regularly — update it in Netlify env vars when you get "Login Required" errors

## License

MIT
