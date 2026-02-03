import React, { useState, useEffect, useMemo } from "react";
import { TrendingUp, ExternalLink, Box, RefreshCw, Filter } from "lucide-react";

// --------------- stat card component ---------------
const StatCard = ({ icon: Icon, label, value, accent = "indigo", justify = "start" }) => {
  const colors = {
    indigo: "from-indigo-500/20 to-indigo-600/20",
    emerald: "from-emerald-500/20 to-emerald-600/20",
    violet: "from-violet-500/20 to-violet-600/20",
    rose: "from-rose-500/20 to-rose-600/20",
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colors[accent]}`}>
          <Icon size={18} className="text-white" />
        </div>
        <div>
          <div className="text-slate-400 text-[10px] uppercase tracking-wider font-medium">{label}</div>
          <div className="text-white text-lg font-bold leading-none mt-1">{value}</div>
        </div>
      </div>
      <div className={`flex items-center gap-1.5 ${justify}`}>
        {accent === "emerald" && <TrendingUp size={16} className="text-emerald-500" />}
      </div>
    </div>
  );
};

// --------------- main app ---------------
const App = () => {
  const [items, setItems] = useState([]);
  const [fx, setFx] = useState(0.14);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(20);
  const [minPrice, setMinPrice] = useState("0.10");
  const [maxPrice, setMaxPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: "profitUsd", direction: "desc" });
  const [onlyProfitable, setOnlyProfitable] = useState(false);
  const [expandedItem, setExpandedItem] = useState(null); // { name, orders: [...], totalCount, loading }

  // --------------- fetch ---------------
  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (search.trim()) params.set("search", search.trim());
      if (minPrice && parseFloat(minPrice) > 0) params.set("minPrice", minPrice);
      if (maxPrice && parseFloat(maxPrice) > 0) params.set("maxPrice", maxPrice);

      const res = await fetch(`/.netlify/functions/scan?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} from scan function`);

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Scan failed");

      setItems(Array.isArray(data.items) ? data.items : []);
      if (typeof data.fx === "number") setFx(data.fx);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Scan error:", err);
      setError(err.message || "Unknown error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --------------- order detail fetch ---------------
  const handleRowClick = async (item) => {
    // Toggle off if clicking same item
    if (expandedItem?.name === item.name) {
      setExpandedItem(null);
      return;
    }
    // Show loading state immediately
    setExpandedItem({ name: item.name, orders: [], totalCount: 0, loading: true });
    try {
      const res = await fetch(`/.netlify/functions/scan?orders=${encodeURIComponent(item.name)}`);
      const data = await res.json();
      setExpandedItem({ name: item.name, orders: data.orders || [], totalCount: data.totalCount || 0, loading: false });
    } catch (e) {
      setExpandedItem({ name: item.name, orders: [], totalCount: 0, loading: false, error: e.message });
    }
  };

  // --------------- derived metrics ---------------
  const profitableCount = useMemo(() => items.filter((i) => i.profitUsd > 0).length, [items]);

  const avgSpread = useMemo(() => {
    if (!items.length) return 0;
    return items.reduce((sum, i) => sum + (Number(i.spreadPct) || 0), 0) / items.length;
  }, [items]);

  const totalVolume = useMemo(
    () => items.reduce((sum, i) => sum + (Number(i.buffPriceUsd) || 0), 0),
    [items]
  );

  // --------------- sort ---------------
  const requestSort = (key) => {
    let direction = "desc";
    if (sortConfig.key === key && sortConfig.direction === "desc") direction = "asc";
    setSortConfig({ key, direction });
  };

  const visible = useMemo(() => {
    let res = [...items];

    if (search.trim()) {
      const q = search.toLowerCase();
      res = res.filter((i) => (i.name || "").toLowerCase().includes(q));
    }
    if (onlyProfitable) res = res.filter((i) => i.profitUsd > 0);

    const { key, direction } = sortConfig;
    res.sort((a, b) => {
      const av = Number(a[key]) || 0;
      const bv = Number(b[key]) || 0;
      return direction === "asc" ? av - bv : bv - av;
    });

    return res;
  }, [items, search, onlyProfitable, sortConfig]);

  // --------------- formatting ---------------
  const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
  const fmtPct = (n) => `${Number(n || 0).toFixed(2)}%`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* HEADER */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-600 flex items-center justify-center shadow-lg shadow-orange-600/40">
              <TrendingUp size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">ArbitrageScanner</h1>
              <p className="text-slate-400 text-xs">Buff163 — market.csgo.com buy orders</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
              Buff163 API
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></div>
              market.csgo.com API
            </div>
          </div>
        </header>

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon={TrendingUp} label="PROFITABLE FLIPS" value={profitableCount} accent="emerald" />
          <StatCard icon={Filter} label="AVG. SPREAD" value={fmtPct(avgSpread)} accent="violet" />
          <StatCard icon={Box} label="TOTAL VOLUME" value={fmt(totalVolume)} accent="rose" />
          <StatCard
            icon={RefreshCw}
            label="DATA STATUS"
            value={
              <div className="flex flex-col">
                <span className="text-emerald-400 text-xs">Up to Date</span>
                {lastUpdated && (
                  <span className="text-slate-600 text-[9px] mt-0.5">
                    {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </div>
            }
            accent="indigo"
          />
        </div>

        {/* CONTROLS */}
        <div className="flex flex-col md:flex-row gap-3 items-center mb-4">
          {/* SEARCH */}
          <input
            type="text"
            placeholder="Search skin name (e.g. Redline)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />

          {/* PRICE RANGE */}
          <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-1.5">
            <span className="text-slate-500 text-xs">$</span>
            <input
              type="number"
              placeholder="Min"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className="w-16 bg-transparent text-sm focus:outline-none"
              step="0.1"
            />
            <span className="text-slate-600">—</span>
            <input
              type="number"
              placeholder="Max"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-16 bg-transparent text-sm focus:outline-none"
              step="0.1"
            />
          </div>

          {/* FILTER */}
          <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800">
            <input
              type="checkbox"
              checked={onlyProfitable}
              onChange={(e) => setOnlyProfitable(e.target.checked)}
              className="rounded accent-emerald-500"
            />
            <span className="text-xs text-slate-300">Only profitable</span>
          </label>

          {/* LIMIT */}
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(100, parseInt(e.target.value) || 20)))}
            className="w-16 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />

          {/* SCAN */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:bg-slate-800 disabled:text-slate-600 font-medium text-sm transition-colors shadow-lg shadow-orange-600/20"
          >
            {loading ? "Scanning…" : "Scan"}
          </button>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <strong>Scan failed:</strong> {error}
          </div>
        )}

        {/* TABLE */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-400 text-[11px]">Item</th>
                  <th
                    className="px-4 py-3 text-right font-medium text-slate-400 text-[11px] cursor-pointer hover:text-white"
                    onClick={() => requestSort("buffPriceUsd")}
                  >
                    Buff price {sortConfig.key === "buffPriceUsd" && (sortConfig.direction === "desc" ? "↓" : "↑")}
                  </th>
                  <th
                    className="px-4 py-3 text-right font-medium text-slate-400 text-[11px] cursor-pointer hover:text-white"
                    onClick={() => requestSort("wmBuyOrderUsd")}
                  >
                    CSGO.M buy order {sortConfig.key === "wmBuyOrderUsd" && (sortConfig.direction === "desc" ? "↓" : "↑")}
                  </th>
                  <th
                    className="px-4 py-3 text-right font-medium text-slate-400 text-[11px] cursor-pointer hover:text-white"
                    onClick={() => requestSort("spreadPct")}
                  >
                    Spread {sortConfig.key === "spreadPct" && (sortConfig.direction === "desc" ? "↓" : "↑")}
                  </th>
                  <th
                    className="px-4 py-3 text-right font-medium text-slate-400 text-[11px] cursor-pointer hover:text-white"
                    onClick={() => requestSort("profitUsd")}
                  >
                    Profit {sortConfig.key === "profitUsd" && (sortConfig.direction === "desc" ? "↓" : "↑")}
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-slate-400 text-[11px]">Qty</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-400 text-[11px]">Links</th>
                </tr>
              </thead>
              <tbody>
                {!visible.length && !loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500 text-xs">
                      No items found. Click "Scan".
                    </td>
                  </tr>
                )}

                {visible.map((item) => {
                  const profit = Number(item.profitUsd) || 0;
                  const spread = Number(item.spreadPct) || 0;
                  const isPositive = profit > 0;
                  const isExpanded = expandedItem?.name === item.name;

                  return (
                    <React.Fragment key={item.id}>
                    <tr
                      className={`border-t border-slate-800/60 transition-colors cursor-pointer ${isExpanded ? "bg-slate-800/40" : "hover:bg-slate-800/30"}`}
                      onClick={() => handleRowClick(item)}
                    >
                      {/* ITEM */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-slate-800/80 overflow-hidden flex items-center justify-center flex-shrink-0">
                            {item.image ? (
                              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <Box size={16} className="text-slate-600" />
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[11px] font-medium leading-snug">{item.name}</span>
                            <span className="text-[9px] text-slate-600 mt-0.5">{isExpanded ? "▲ collapse" : "▼ click for orders"}</span>
                          </div>
                        </div>
                      </td>

                      {/* BUFF PRICE */}
                      <td className="px-4 py-3 text-right text-[11px]">
                        <div className="flex flex-col items-end">
                          <span className="font-medium">{fmt(item.buffPriceUsd)}</span>
                          <span className="text-slate-500 text-[10px]">¥{Number(item.buffPriceCny || 0).toFixed(2)}</span>
                        </div>
                      </td>

                      {/* CSGO.M BUY ORDER */}
                      <td className="px-4 py-3 text-right text-[11px]">
                        <div className="flex flex-col items-end">
                          <span className="font-medium">{item.wmBuyOrderUsd > 0 ? fmt(item.wmBuyOrderUsd) : <span className="text-slate-600">—</span>}</span>
                          <span className="text-slate-500 text-[10px]">{item.wmOrderCount || 0} orders</span>
                        </div>
                      </td>

                      {/* SPREAD */}
                      <td className="px-4 py-3 text-right text-[11px]">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            isPositive ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"
                          }`}
                        >
                          {isPositive ? "+" : ""}{fmtPct(spread)}
                        </span>
                      </td>

                      {/* PROFIT */}
                      <td className="px-4 py-3 text-right text-[11px] font-semibold">
                        <span className={isPositive ? "text-emerald-400" : "text-red-400"}>
                          {isPositive ? "+" : ""}{fmt(profit)}
                        </span>
                      </td>

                      {/* QUANTITY */}
                      <td className="px-4 py-3 text-center text-[11px] text-slate-300">
                        {item.buffQuantity || "—"}
                      </td>

                      {/* LINKS */}
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <a
                            href={`https://buff.163.com/market/csgo?search=${encodeURIComponent(item.name)}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Open on Buff163"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:border-indigo-500 hover:text-indigo-400 transition-colors"
                          >
                            <ExternalLink size={13} />
                          </a>
                          <a
                            href={`https://market.csgo.com/en/?search=${encodeURIComponent(item.name)}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Open on market.csgo.com"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:border-orange-500 hover:text-orange-400 transition-colors"
                          >
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      </td>
                    </tr>

                    {/* EXPANDED ORDER DETAIL PANEL */}
                    {isExpanded && (
                      <tr className="border-t border-slate-800/40">
                        <td colSpan={7} className="px-4 py-3 bg-slate-900/60">
                          <div className="ml-13 pl-13" style={{ paddingLeft: "52px" }}>
                            {expandedItem.loading ? (
                              <div className="text-slate-500 text-[11px] py-2">Loading orders…</div>
                            ) : expandedItem.error ? (
                              <div className="text-red-400 text-[11px] py-2">{expandedItem.error}</div>
                            ) : expandedItem.orders.length === 0 ? (
                              <div className="text-slate-500 text-[11px] py-2">No buy orders found on market.csgo.com</div>
                            ) : (
                              <div>
                                <div className="text-slate-500 text-[10px] mb-2 uppercase tracking-wide">
                                  market.csgo.com Buy Orders — {expandedItem.totalCount} total
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {expandedItem.orders.map((order, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-1.5"
                                    >
                                      <span className="text-emerald-400 font-semibold text-[12px]">{fmt(order.priceUsd)}</span>
                                      <span className="text-slate-500 text-[10px]">×{order.quantity}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}

                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500 text-xs">
                      <RefreshCw size={16} className="inline animate-spin mr-2" />
                      Scanning...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* FOOTER */}
          {visible.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-800/60 text-xs text-slate-500 text-center">
              Showing {visible.length} results · Last updated {lastUpdated?.toLocaleTimeString() || "—"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
