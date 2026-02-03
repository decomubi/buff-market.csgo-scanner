// buff-csgomarket-scanner/netlify/functions/scan.mjs
// Buff163 (CS2) → market.csgo.com buy orders arbitrage scanner

// Env vars required:
//   BUFF_COOKIE          – full cookie string from buff.163.com
//   CSGOMARKET_API_KEY   – API key from market.csgo.com
//   FX_CNYUSD            – CNY → USD rate (e.g. "0.14")

const BUFF_BASE = "https://buff.163.com";
const CSGOMARKET_BASE = "https://market.csgo.com/api/v2";

// --------------- in-memory caches ---------------
let buffCache = { ts: 0, key: "", items: [] };
let csgomarketCache = { ts: 0, data: {} }; // prices cache (5 min)

// --------------- helpers ---------------
function ok(body) {
  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function fail(statusCode, message) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ok: false, error: message }),
  };
}

function mustEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

function normalizeUrl(u) {
  if (!u) return "";
  return u.startsWith("//") ? `https:${u}` : u;
}

// --------------- BUFF163 ---------------
async function buffFetch(path, params = {}) {
  const cookie = mustEnv("BUFF_COOKIE");
  const qs = new URLSearchParams(params).toString();
  const url = `${BUFF_BASE}${path}${qs ? "?" + qs : ""}`;

  const r = await fetch(url, {
    headers: {
      Cookie: cookie,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`BUFF HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }

  const j = await r.json();
  if (j.code === "Login Required") {
    throw new Error("BUFF: Login Required (cookie expired)");
  }
  if (j.code && j.code !== "OK") {
    throw new Error(`BUFF error: ${j.code} ${j.error || ""}`);
  }

  return j;
}

// minPriceCny / maxPriceCny are in CNY fen (integer, 100 = 1 CNY).
async function buffGoodsList({ search = "", pageNum = 1, pageSize = 20, minPriceCny, maxPriceCny } = {}) {
  const data = await buffFetch("/api/market/goods", {
    game: "csgo",
    page_num: pageNum,
    page_size: pageSize,
    search: search || undefined,
    sort_by: "sell_num.desc",
    ...(minPriceCny != null && { price_min: minPriceCny }),
    ...(maxPriceCny != null && { price_max: maxPriceCny }),
  });

  return data?.data?.items || [];
}

// --------------- market.csgo.com ---------------
// Their price list API returns { items: { "classid_instanceid": { price, buy_order, market_hash_name, ... } } }
// We'll batch fetch all items at once, cache for 5 min

async function csgomarketPriceList() {
  const apiKey = mustEnv("CSGOMARKET_API_KEY");
  const now = Date.now();

  // Cache for 5 minutes
  if (csgomarketCache.data && Object.keys(csgomarketCache.data).length > 0 && now - csgomarketCache.ts < 300000) {
    return csgomarketCache.data;
  }

  const url = `${CSGOMARKET_BASE}/prices/USD.json?key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(`market.csgo.com HTTP ${r.status}`);
  }

  const j = await r.json();
  if (!j.success) {
    throw new Error(`market.csgo.com error: ${j.error || "unknown"}`);
  }

  // j.items is { "classid_instanceid": { price, buy_order, market_hash_name, ... }, ... }
  csgomarketCache = { ts: now, data: j.items || {} };
  console.log("market.csgo.com price list loaded:", Object.keys(csgomarketCache.data).length, "items");
  return csgomarketCache.data;
}

// Look up highest buy order for a given market_hash_name
async function csgomarketHighestBuyOrder(marketHashName) {
  const prices = await csgomarketPriceList();

  // Find the item by market_hash_name (case-sensitive match)
  let bestBuyOrder = 0;
  for (const [key, item] of Object.entries(prices)) {
    if (item.market_hash_name === marketHashName) {
      const buyOrder = parseFloat(item.buy_order || "0");
      if (buyOrder > bestBuyOrder) {
        bestBuyOrder = buyOrder;
      }
    }
  }

  return {
    priceUsd: bestBuyOrder,
    totalOrders: bestBuyOrder > 0 ? 1 : 0, // API doesn't give count, just highest price
  };
}

// For the detail popup — market.csgo.com doesn't have an orders list endpoint,
// so we'll just return the single highest buy order
async function csgomarketGetOrders(marketHashName) {
  const result = await csgomarketHighestBuyOrder(marketHashName);
  return {
    totalCount: result.totalOrders,
    orders: result.priceUsd > 0 ? [{ priceUsd: result.priceUsd, quantity: 1 }] : [],
  };
}

// --------------- concurrency limiter ---------------
async function mapLimit(arr, limit, fn) {
  const results = [];
  let i = 0;
  const workers = Array(limit)
    .fill(null)
    .map(async () => {
      while (i < arr.length) {
        const idx = i++;
        results[idx] = await fn(arr[idx], idx);
      }
    });
  await Promise.all(workers);
  return results;
}

// --------------- main handler ---------------
const _BUILT = "2026-02-02T03:00:00Z";
export async function handler(event) {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
      body: "",
    };
  }

  try {
    const qs = event.queryStringParameters || {};

    // --------------- order detail endpoint ---------------
    if (qs.orders) {
      const data = await csgomarketGetOrders(qs.orders);
      return ok({ ok: true, nameHash: qs.orders, ...data });
    }

    const search = (qs.search || "").trim();
    const limit = Math.max(1, Math.min(100, parseInt(qs.limit) || 20));
    const fx = Number(process.env.FX_CNYUSD || "0.14");

    // Price range: frontend sends USD, we convert to CNY fen for BUFF.
    const minUsd = parseFloat(qs.minPrice);
    const maxUsd = parseFloat(qs.maxPrice);
    const minPriceCny = !isNaN(minUsd) && minUsd > 0 ? Math.round((minUsd / fx) * 100) : undefined;
    const maxPriceCny = !isNaN(maxUsd) && maxUsd > 0 ? Math.round((maxUsd / fx) * 100) : undefined;

    // --- BUFF cache (60s) ---
    const cacheKey = `${search}|${limit}|${minPriceCny ?? ""}|${maxPriceCny ?? ""}`;
    const now = Date.now();
    let buffItems;

    if (buffCache.items?.length && buffCache.key === cacheKey && now - buffCache.ts < 60000) {
      buffItems = buffCache.items;
    } else {
      buffItems = await buffGoodsList({ search, pageNum: 1, pageSize: limit, minPriceCny, maxPriceCny });
      buffCache = { ts: now, key: cacheKey, items: buffItems };
    }

    // --- parse BUFF items ---
    const rows = buffItems
      .map((it, idx) => {
        const nameHash = it?.market_hash_name || it?.name || it?.short_name;
        if (!nameHash) return null;

        const buffPriceCny =
          it?.sell_min_price != null
            ? Number(it.sell_min_price)
            : it?.sell_min_price_cny != null
            ? Number(it.sell_min_price_cny)
            : 0;

        const buffPriceUsd = Number((buffPriceCny * fx).toFixed(2));
        const quantity = it?.sell_num ?? it?.sell_count ?? it?.goods_info?.sell_num ?? 0;
        const image =
          normalizeUrl(it?.goods_info?.icon_url) ||
          normalizeUrl(it?.icon_url) ||
          normalizeUrl(it?.img) ||
          "";

        return {
          id: it?.id || idx + 1,
          name: nameHash,
          image,
          buffPriceCny,
          buffPriceUsd,
          buffQuantity: Number(quantity) || 0,
        };
      })
      .filter(Boolean);

    // --- fetch market.csgo.com buy orders (4 concurrent) ---
    const enriched = await mapLimit(rows, 4, async (row) => {
      try {
        const csgo = await csgomarketHighestBuyOrder(row.name);
        const csgomarketBuyOrderUsd = csgo.priceUsd || 0;
        const spreadPct =
          row.buffPriceUsd > 0
            ? Number(((csgomarketBuyOrderUsd / row.buffPriceUsd - 1) * 100).toFixed(2))
            : 0;
        const profitUsd = Number((csgomarketBuyOrderUsd - row.buffPriceUsd).toFixed(2));

        return {
          ...row,
          wmBuyOrderUsd: csgomarketBuyOrderUsd, // Keep same field name for frontend compatibility
          wmOrderCount: csgo.totalOrders || 0,
          spreadPct,
          profitUsd,
        };
      } catch (e) {
        console.error(`market.csgo.com error for "${row.name}":`, e.message);
        return { ...row, wmBuyOrderUsd: 0, wmOrderCount: 0, spreadPct: 0, profitUsd: 0 };
      }
    });

    return ok({ ok: true, _built: _BUILT, fx, items: enriched });
  } catch (e) {
    console.error("scan.mjs top-level error:", e);
    return fail(500, String(e?.message || e));
  }
}
