const STORAGE_KEY   = 'trading_station_pro_data';
const PORTFOLIO_KEY = 'trading_station_portfolio';


// Yahoo Finance ticker symbols for each Hebrew stock name
const STOCK_SYMBOLS = {
    // מדדים
    "מדד תא-35":    "^TA35",
    "מדד תא-90":    "^TA90",
    // בנקים
    "לאומי":        "LUMI.TA",
    "פועלים":       "POLI.TA",
    "דיסקונט":      "DSCT.TA",
    "מזרחי טפחות": "MZTF.TA",
    // ביטחון/טכנולוגיה
    "אלביט":        "ESLT.TA",
    "נייס":         "NICE.TA",
    "טאוור":        "TSEM.TA",
    // פארמה/כימיה
    "טבע":          "TEVA.TA",
    "כיל":          "ICL.TA",
    // ביטוח
    "הפניקס":       "PHOE.TA",
    "הראל":         "HARL.TA",
    "כלל ביטוח":    "CLIS.TA",
    // נדל"ן
    "עזריאלי":      "AZRG.TA",
    "מליסרון":      "MLSR.TA",
    "אמות":         "AMOT.TA",
    "ביג":          "BIG.TA",
    "גב ים":        "GVYM.TA",
    "שיכון ובינוי": "SKBN.TA",
    // אנרגיה
    "אנרג'יקס":     "ENRG.TA",
    "אנלייט":       "ENLT.TA",
    "אורמת":        "ORA.TA",
    "קבוצת דלק":    "DLEKG.TA",
    // תקשורת
    "בזק":          "BEZQ.TA",
    "סלקום":        "CEL.TA",
    "פרטנר":        "PTNR.TA",
    // מזון/קמעונאות
    "שטראוס":       "STRS.TA",
    "שופרסל":       "SAE.TA",
    "פוקס":         "FOX.TA",
    "רמי לוי":      "RMLI.TA",
};

const TASE_MAP = { "^TA35": "מדד תא-35", "^TA125": "מדד תא-125", "^TA90": "מדד תא-90" };

// Reverse lookup: Yahoo symbol → Hebrew name
const SYM_TO_NAME = Object.fromEntries(
    Object.entries(STOCK_SYMBOLS).map(([name, sym]) => [sym, name])
);

// ── Portfolio persistence — server-side sync ────────────────────────────────
let _portfolioLoaded = false;
let _savePending = false;
function savePortfolio() {
    if (!_portfolioLoaded) return; // don't overwrite before load completes
    // Save to localStorage immediately as fallback
    try { localStorage.setItem(PORTFOLIO_KEY, JSON.stringify({ portfolio, transactionHistory })); } catch(e) {}
    // Debounce server save
    if (_savePending) return;
    _savePending = true;
    setTimeout(async () => {
        _savePending = false;
        try {
            await fetch('/api/portfolio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ portfolio, transactionHistory })
            });
        } catch(e) { console.warn('savePortfolio server:', e.message); }
    }, 500);
}

async function loadPortfolio() {
    try {
        const res = await fetch('/api/portfolio');
        if (res.ok) {
            const data = await res.json();
            // Only use server data if it has actual holdings
            if (data.portfolio && Object.keys(data.portfolio).length > 0) return data;
        }
    } catch(e) { console.warn('loadPortfolio server:', e.message); }
    // Fallback to localStorage
    try {
        const raw = localStorage.getItem(PORTFOLIO_KEY);
        if (raw) {
            const local = JSON.parse(raw);
            // Migrate localStorage data to server
            if (local?.portfolio && Object.keys(local.portfolio).length > 0) {
                fetch('/api/portfolio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(local) }).catch(() => {});
            }
            return local;
        }
    } catch(e) { localStorage.removeItem(PORTFOLIO_KEY); }
    return null;
}

// ── General state (prices / indices cache) ─────────────────────────────────
function saveState() {
    try {
        const prices = {};
        Object.entries(stocksData).forEach(([name, d]) => {
            if (d.price > 0) prices[name] = { price: d.price, initial: d.initial };
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ indicesData, prices }));
        savePortfolio();   // always flush portfolio too
    } catch (e) { console.error("Failed to save state:", e); }
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
    } catch (e) {
        console.error("Error loading saved state:", e);
        localStorage.removeItem(STORAGE_KEY);
    }
    return null;
}

const STOCK_NAMES = Object.keys(STOCK_SYMBOLS);

const savedState = loadState();
// שחזר מחירים שמורים כדי להציג % מיד בטעינה
let stocksData = {};
STOCK_NAMES.forEach(name => {
    const saved = savedState?.prices?.[name];
    stocksData[name] = {
        price: saved?.price ?? 0,
        initial: saved?.initial ?? 0,
        baseWeek: 0, baseMonth: 0, base3Month: 0,
        history: [], historyWeek: [], historyMonth: [], history3Month: [], trend: 0
    };
});

function buildIndexHistory(basePrice, points = 50) {
    let history = [];
    let cur = basePrice * 0.97;
    for (let i = 0; i < points; i++) {
        cur = cur * (1 + rnd(-0.0015, 0.0018));
        history.push(parseFloat(cur.toFixed(2)));
    }
    return history;
}

const _defaultIndicesData = () => ({
    "מדד תא-35":  { price: null, initial: null, baseWeek: null, baseMonth: null, base3Month: null, history: [] },
    "מדד תא-125": { price: null, initial: null, baseWeek: null, baseMonth: null, base3Month: null, history: [] },
    "מדד תא-90":  { price: null, initial: null, baseWeek: null, baseMonth: null, base3Month: null, history: [] }
});
const indicesData = savedState?.indicesData ?? _defaultIndicesData();

// Pre-populate stocksData for TA-35 from last saved indicesData so the chart
// shows last-known values immediately, before the live fetch completes.
if (indicesData["מדד תא-35"]?.price) {
    Object.assign(stocksData["מדד תא-35"], indicesData["מדד תא-35"]);
}


let portfolio          = savedState?.portfolio        ?? {};
let transactionHistory = savedState?.transactionHistory ?? [];

let fetchInterval = null;
let lastMarketOpen = null;

let currentStock = "מדד תא-35";
let myChart = null;  // kept for compat (unused after LW Charts)
let mainChartData = [];
let indexChart = null;
let modalChart = null;
let currentModalStock = null;
let currentModalTf = 'day';
let currentTf = 'daily';
let currentMainTf = 'daily';

// ── Lightweight Charts (candlestick) state ─────────────────────────────────
let _lwChart    = null;
let _lwSeries   = null;
let _lwVolume   = null;
let _lwStock    = null;
let _lwTf       = null;
let _lwResizeOb = null;  // singleton ResizeObserver for the main chart

// ── Real Data ──────────────────────────────────────────────────────────────

function applyMarketStatus(marketState) {
    const open  = marketState === 'REGULAR';
    const color = open ? '#16a34a' : '#9aa0a6';
    const dot   = document.getElementById('market-status');
    if (dot) dot.style.color = color;
    const label = document.getElementById('market-label');
    if (label) { label.textContent = open ? 'מסחר רציף' : 'סגור'; label.style.color = color; }
    const badge = document.getElementById('ta35-status');
    if (badge) badge.textContent = '';
    const statusEl = document.getElementById('data-status');
    if (statusEl) statusEl.classList.toggle('idle-mode', !open);
}

async function loadSessionHistory() {
    // Index chart: load OHLC for LightweightCharts
    const idxSym = STOCK_SYMBOLS["מדד תא-35"];
    if (idxSym) {
        const { ohlc: ohlc5d } = await fetchHistoricalOHLC(idxSym, '5d', '30m');
        if (ohlc5d.length > 1) {
            stocksData["מדד תא-35"].ohlcWeek = ohlc5d;
            drawIndexChart('daily');
        }
        fetchHistoricalOHLC(idxSym, '1mo', '1d').then(({ ohlc: o }) => { if (o.length > 1) stocksData["מדד תא-35"].ohlcMonth    = o; });
        fetchHistoricalOHLC(idxSym, '3mo', '1d').then(({ ohlc: o }) => { if (o.length > 1) stocksData["מדד תא-35"].ohlc3Month   = o; });
    }
    // Main candlestick chart — force a fresh load
    _lwStock = null; _lwTf = null;
    await drawChart();
}

function isMarketOpen() {
    const ilStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' });
    const [datePart, timePart] = ilStr.split(' ');
    const [y, mo, d] = datePart.split('-').map(Number);
    const [h, m] = timePart.split(':').map(Number);
    const day = new Date(y, mo - 1, d).getDay(); // 0=Sun..6=Sat
    const mins = h * 60 + m;
    return day >= 0 && day <= 4 && mins >= 585 && mins < 1050;
}

function scheduleFetch() {
    const open = isMarketOpen();

    if (lastMarketOpen === open && fetchInterval !== null) return;
    lastMarketOpen = open;

    clearInterval(fetchInterval);
    fetchInterval = setInterval(refreshRealData, open ? 2000 : 60000);
    console.log(`[Eco] Market ${open ? 'OPEN → 2s' : 'CLOSED → 60s'}`);
}

function setDataStatus(state, detail = '') {
    const el = document.getElementById('data-status');
    if (!el) return;
    if (state === 'error' && !isMarketOpen()) state = 'sim';
    const styles = {
        live:  { text: 'LIVE', color: '#16a34a', bg: 'rgba(29,185,84,0.15)' },
        sim:   { text: 'SIM',  color: '#5f6368', bg: '#f1f3f4' },
        error: { text: 'ERR',  color: '#dc2626', bg: 'rgba(234,67,53,0.12)' },
        fetch: { text: '...',  color: '#f0b90b', bg: 'rgba(240,185,11,0.10)' }
    };
    const s = styles[state] || styles.sim;
    el.textContent = s.text;
    el.style.color = s.color;
    el.style.background = el.classList.contains('idle-mode') ? '#0d1117' : s.bg;
    if (detail) el.title = detail;
}

async function fetchHistoricalCloses(symbol, range, interval = '1d') {
    try {
        const params = new URLSearchParams({ symbol, range, interval });
        const resp = await fetch(`/api/stock/history?${params}`);
        if (!resp.ok) { console.warn(`[history] ${symbol} ${range} → HTTP ${resp.status}`); return []; }
        const data = await resp.json();
        return data.closes ?? [];
    } catch(e) {
        console.warn(`[history] ${symbol} ${range} | ${e.message}`);
        return [];
    }
}

async function fetchHistoricalWithTs(symbol, range, interval = '1d') {
    try {
        const params = new URLSearchParams({ symbol, range, interval });
        const resp = await fetch(`/api/stock/history?${params}`);
        if (!resp.ok) return { closes: [], timestamps: [] };
        const data = await resp.json();
        return { closes: data.closes ?? [], timestamps: data.timestamps ?? [] };
    } catch(e) { return { closes: [], timestamps: [] }; }
}

function fmtTs(unixSec, intraday) {
    if (!unixSec) return '';
    const d = new Date(unixSec * 1000);
    if (intraday) return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

async function fetchHistoricalOHLC(symbol, range, interval = '1d') {
    try {
        const params = new URLSearchParams({ symbol, range, interval });
        const resp = await fetch(`/api/stock/history?${params}`);
        if (!resp.ok) return { ohlc: [], prevClose: null };
        const data = await resp.json();
        return {
            ohlc: (data.ohlc ?? []).filter(d => d.open > 0 && d.high > 0 && d.low > 0 && d.close > 0),
            prevClose: data.prevClose ?? null,
        };
    } catch(e) { return { ohlc: [], prevClose: null }; }
}

function tfToOhlcRange(tf) {
    if (tf === 'intraday') return { range: '1d',  interval: '5m'  };
    if (tf === 'daily')    return { range: '1mo', interval: '1d'  };
    if (tf === 'weekly')   return { range: '3mo', interval: '1d'  };
    if (tf === 'monthly')  return { range: '6mo', interval: '1d'  };
    return                        { range: '1y',  interval: '1d'  };
}

// Fetch and store historical closes for a stock/timeframe, then redraw.
async function fetchAndStoreHistory(stockName, tf) {
    const sym = STOCK_SYMBOLS[stockName];
    if (!sym) return;
    const rangeMap = { weekly: '5d', monthly: '1mo', '3months': '3mo' };
    const fieldMap = { weekly: 'historyWeek', monthly: 'historyMonth', '3months': 'history3Month' };
    const range = rangeMap[tf];
    const field = fieldMap[tf];
    if (!range || !field) return;

    const closes = await fetchHistoricalCloses(sym, range);
    if (closes.length) {
        stocksData[stockName][field] = closes;
        drawChart();
        if (stockName === "מדד תא-35") drawIndexChart(currentTf);
    }
}

// Batch-fetch current prices via the local server proxy.
async function fetchBatchPrices(symbols) {
    try {
        const params = new URLSearchParams({ symbols: symbols.join(',') });
        const resp = await fetch(`/api/stock/batch?${params}`);
        if (!resp.ok) { console.warn(`[batch] HTTP ${resp.status}`); return null; }
        const data = await resp.json();
        return { marketOpen: data.marketOpen ?? false, marketState: data.marketState ?? 'CLOSED', quotes: Array.isArray(data) ? data : (data.quotes ?? []) };
    } catch(e) {
        console.warn('[batch]', e.message);
        return null;
    }
}

async function refreshRealData() {
    setDataStatus('fetch', 'Fetching from Yahoo Finance…');

    const symbols = Object.values(STOCK_SYMBOLS);
    const quotes  = await fetchBatchPrices(symbols);

    if (quotes === null) {
        setDataStatus('error', 'Network failure');
        scheduleFetch();
        return;
    }

    const { marketState = 'CLOSED', quotes: quoteList } = quotes;
    window._lastQuotes = quoteList;
    const effectiveState = marketState;
    applyMarketStatus(effectiveState);

    let liveCount = 0;
    quoteList.forEach(q => {
        const name = SYM_TO_NAME[q.symbol];
        if (!name || !stocksData[name]) return;
        if (!q.regularMarketPrice) return;

        stocksData[name].price   = q.regularMarketPrice;
        stocksData[name].initial = q.regularMarketPreviousClose ?? q.regularMarketPrice;
        const nowSec = Math.floor(Date.now() / 1000);
        stocksData[name].history.push(stocksData[name].price);
        if (!stocksData[name].historyTs) stocksData[name].historyTs = [];
        stocksData[name].historyTs.push(nowSec);
        if (stocksData[name].history.length > 300) { stocksData[name].history.shift(); stocksData[name].historyTs.shift(); }
        liveCount++;
    });

    // Sync indicesData from live stocksData so it can be persisted
    const ta35 = stocksData["מדד תא-35"];
    if (ta35?.price) Object.assign(indicesData["מדד תא-35"], {
        price: ta35.price, initial: ta35.initial,
        baseWeek: ta35.baseWeek, baseMonth: ta35.baseMonth, base3Month: ta35.base3Month,
        history: [...ta35.history]
    });

    console.log(`[YF] Live: ${liveCount}/${symbols.length}`);
    setDataStatus(liveCount > 0 ? 'live' : (isMarketOpen() ? 'error' : 'sim'), `${liveCount} symbols live`);

    // Update last-fetch timestamp
    if (liveCount > 0) {
        const now = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const el = document.getElementById('last-update');
        if (el) el.textContent = `עודכן ${now}`;
    }

    initTicker(); initStockSuggestions(); updateStockList(); updatePortfolioList(); updateTransactionHistory();
    drawChart(); drawIndexChart(); updateAllStockWindows();
    checkPortfolioAlerts();
    saveState();
    scheduleFetch();
}

// ── Helpers ────────────────────────────────────────────────────────────────

function calculatePctChange(current, baseline) {
    if (!baseline || baseline === 0) return "0.00";
    return (((current - baseline) / baseline) * 100).toFixed(2);
}

// Color scaled by magnitude: small change = muted, large = vivid
function pctColor(pct) {
    const v = Math.abs(parseFloat(pct));
    if (parseFloat(pct) >= 0) {
        if (v < 0.5) return { text: '#4ade80', bg: 'rgba(74,222,128,0.15)' };
        if (v < 1.5) return { text: '#22c55e', bg: 'rgba(34,197,94,0.18)' };
        if (v < 3)   return { text: '#16a34a', bg: 'rgba(22,163,74,0.20)' };
        return              { text: '#15803d', bg: 'rgba(21,128,61,0.22)' };
    } else {
        if (v < 0.5) return { text: '#f87171', bg: 'rgba(248,113,113,0.15)' };
        if (v < 1.5) return { text: '#ef4444', bg: 'rgba(239,68,68,0.18)' };
        if (v < 3)   return { text: '#dc2626', bg: 'rgba(220,38,38,0.20)' };
        return              { text: '#b91c1c', bg: 'rgba(185,28,28,0.22)' };
    }
}

// ── Hebrew stock autocomplete ──────────────────────────────────────────────
let _acIndex = -1;

function stockAutocomplete(q) {
    const dd = document.getElementById('ac-dropdown');
    if (!dd) return;
    const query = q.trim();
    const allNames = Object.keys(STOCK_SYMBOLS);
    const matches = query.length === 0
        ? allNames.slice(0, 10)
        : allNames.filter(n =>
            n.includes(query) ||
            (STOCK_SYMBOLS[n] || '').toLowerCase().includes(query.toLowerCase())
          ).slice(0, 10);

    if (!matches.length) { dd.style.display = 'none'; return; }
    _acIndex = -1;
    dd.innerHTML = matches.map((name, i) => {
        const sym = STOCK_SYMBOLS[name] || '';
        const price = stocksData[name]?.price ? `₪${parseFloat(stocksData[name].price).toFixed(2)}` : '';
        return `<div class="ac-item" data-name="${name}" data-i="${i}"
            style="padding:6px 10px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:12px;border-bottom:1px solid rgba(0,0,0,0.05)"
            onmousedown="selectAutocomplete('${name}')">
            <span style="font-weight:600;direction:rtl">${name}</span>
            <span style="color:#9aa0a6;font-size:10px;font-family:monospace">${sym} ${price}</span>
        </div>`;
    }).join('');
    dd.style.display = 'block';
}

function selectAutocomplete(name) {
    const inp = document.getElementById('sim-symbol');
    const dd  = document.getElementById('ac-dropdown');
    if (inp) { inp.value = name; inp.dispatchEvent(new Event('change')); }
    if (dd)  dd.style.display = 'none';
    document.getElementById('sim-qty')?.focus();
}

function handleAutocompleteKey(e) {
    const dd    = document.getElementById('ac-dropdown');
    const items = dd?.querySelectorAll('.ac-item');
    if (!items?.length) { if (e.key === 'Enter') buyStock(); return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); _acIndex = Math.min(_acIndex + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _acIndex = Math.max(_acIndex - 1, -1); }
    else if (e.key === 'Enter') {
        e.preventDefault();
        if (_acIndex >= 0) selectAutocomplete(items[_acIndex].dataset.name);
        else buyStock();
        return;
    } else if (e.key === 'Escape') { dd.style.display = 'none'; return; }
    items.forEach((el, i) => el.style.background = i === _acIndex ? '#e8f0fe' : '');
}

function initStockSuggestions() {
    const dl = document.getElementById('stock-suggestions');
    if (!dl) return;
    Object.entries(STOCK_SYMBOLS).forEach(([name, sym]) => {
        const o1 = document.createElement('option'); o1.value = name; dl.appendChild(o1);
        const o2 = document.createElement('option'); o2.value = sym;  dl.appendChild(o2);
    });
}

let _tickerReady  = false;
let _tickerRaf    = null;
let _tickerOffset = 0;
let _tickerHalfW  = 0;
let _fxRates      = { usdIls: 0, usdIlsPrev: 0, eurIls: 0, eurIlsPrev: 0 };

async function refreshFxRates() {
    try {
        const r = await fetch('/api/rate');
        if (!r.ok) return;
        const data = await r.json();
        _fxRates.usdIls     = data.usdIls     ?? 0;
        _fxRates.usdIlsPrev = data.usdIlsPrev ?? 0;
        _fxRates.eurIls     = data.eurIls     ?? 0;
        _fxRates.eurIlsPrev = data.eurIlsPrev ?? 0;
        _updateTickerFx();
    } catch(e) {}
}

function _updateTickerFx() {
    ['USD', 'EUR'].forEach(cur => {
        const els  = document.querySelectorAll(`#ticker-content [data-fx="${cur}"] .tick-val`);
        if (!els.length) return;
        const rate = cur === 'USD' ? _fxRates.usdIls     : _fxRates.eurIls;
        const prev = cur === 'USD' ? _fxRates.usdIlsPrev : _fxRates.eurIlsPrev;
        if (!rate) return;
        const pct = prev > 0 ? ((rate - prev) / prev * 100).toFixed(2) : null;
        const up  = pct !== null ? parseFloat(pct) >= 0 : true;
        const txt = pct !== null
            ? `₪${rate.toFixed(3)}  ${up ? '▲' : '▼'} ${up ? '+' : ''}${pct}%`
            : `₪${rate.toFixed(3)}`;
        els.forEach(el => {
            el.textContent = txt;
            el.style.color = pct !== null ? pctColor(pct).text : '#202124';
        });
    });
    // Re-measure ticker width after FX values are injected
    requestAnimationFrame(() => {
        const ticker = document.getElementById('ticker-content');
        if (ticker && _tickerHalfW > 0) {
            const newHalf = ticker.scrollWidth / 2;
            if (newHalf > _tickerHalfW) {
                // Keep same relative position, scale offset proportionally
                _tickerOffset = (_tickerOffset / _tickerHalfW) * newHalf;
                _tickerHalfW = newHalf;
            }
        }
    });
}

function _updateTickerPrices() {
    document.querySelectorAll('#ticker-content [data-stock]').forEach(item => {
        const stock = stocksData[item.dataset.stock];
        if (!stock) return;
        const pct = calculatePctChange(parseFloat(stock.price), stock.initial);
        const up  = parseFloat(pct) >= 0;
        const val = item.querySelector('.tick-val');
        if (val) { val.textContent = `${up?'▲':'▼'} ${pct}%`; val.style.color = pctColor(pct).text; }
    });
}

function _tickerStep() {
    const ticker = document.getElementById('ticker-content');
    if (!ticker || !_tickerHalfW) { _tickerRaf = requestAnimationFrame(_tickerStep); return; }
    _tickerOffset += 1;
    if (_tickerOffset >= _tickerHalfW) _tickerOffset -= _tickerHalfW;
    ticker.style.transform = `translateX(-${_tickerOffset}px)`;
    _tickerRaf = requestAnimationFrame(_tickerStep);
}

function initTicker() {
    const ticker = document.getElementById('ticker-content');
    if (!ticker) return;
    const names = Object.keys(stocksData).filter(n => stocksData[n]?.price > 0);
    if (!names.length) return;

    if (!_tickerReady) {
        _tickerReady = true;
        ticker.innerHTML = '';

        const fxItems = [
            { fx: 'USD', label: '🇺🇸 דולר' },
            { fx: 'EUR', label: '🇪🇺 יורו'  },
        ];
        const sep = () => {
            const s = document.createElement('span');
            s.style.cssText = 'padding:0 8px;color:#bbb;font-size:0.7rem';
            s.textContent = '|';
            return s;
        };

        for (let copy = 0; copy < 2; copy++) {
            // FX rates first
            fxItems.forEach(({ fx, label }) => {
                const item = document.createElement('span');
                item.dataset.fx = fx;
                item.style.cssText = 'padding:0 18px;white-space:nowrap;font-family:"Inter",sans-serif;font-size:0.72rem;font-weight:600;display:inline-flex;align-items:center;gap:5px';
                const lbl = document.createElement('span'); lbl.textContent = label; lbl.style.color = '#5f6368';
                const val = document.createElement('span'); val.className = 'tick-val'; val.dir = 'ltr'; val.style.color = '#202124';
                item.append(lbl, val);
                ticker.appendChild(item);
            });
            ticker.appendChild(sep());
            // Stocks
            names.forEach(name => {
                const item = document.createElement('span');
                item.dataset.stock = name;
                item.style.cssText = 'padding:0 22px;white-space:nowrap;font-family:"Inter",sans-serif;font-size:0.72rem;font-weight:500;display:inline-flex;align-items:center;gap:4px';
                const lbl = document.createElement('span'); lbl.className = 'tick-lbl'; lbl.textContent = name; lbl.style.color = '#5f6368';
                const val = document.createElement('span'); val.className = 'tick-val'; val.dir = 'ltr';
                item.append(lbl, val);
                ticker.appendChild(item);
            });
        }
        _updateTickerPrices();
        _updateTickerFx();
        refreshFxRates();
        // Wait 2 frames so the browser has laid out the items, then measure & start loop
        if (_tickerRaf) cancelAnimationFrame(_tickerRaf);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            _tickerHalfW  = ticker.scrollWidth / 2;
            _tickerOffset = 0;
            if (_tickerHalfW > 0) _tickerRaf = requestAnimationFrame(_tickerStep);
        }));
    } else {
        _updateTickerPrices();
    }
}

let activeStockWindows = {};

function openStockWindow(name) {
    if (activeStockWindows[name]) {
        const win = document.getElementById(`win-detail-${name}`);
        if (win) { win.style.zIndex = ++highestZIndex; return; }
    }

    const dashboard = document.getElementById('dashboard');
    if (!dashboard) return;

    const winId = `win-detail-${name}`;
    const stock = stocksData[name];
    if (!stock) return;

    const isMobile = window.innerWidth <= 768;
    const card = document.createElement('div');
    card.id = winId;

    
    card.className = 'card stock-detail-window';
    if (isMobile) {
        card.style.position = 'relative';
        card.style.width = '100%';
        card.style.height = 'auto';
        card.style.minHeight = '400px';
    } else {
        card.style.width = '400px';
        card.style.height = '420px';
        card.style.top = '100px';
        card.style.left = '300px';
        card.style.zIndex = ++highestZIndex;
    }

    const dayPct = calculatePctChange(parseFloat(stock.price), stock.initial);
    const color = parseFloat(dayPct) >= 0 ? '#16a34a' : '#dc2626';

    const tfLabels = { day: 'יום', week: 'שבוע', month: 'חודש', '3months': '3M' };
    card.innerHTML = `
        <div class="window-header">
            <div style="display:flex;align-items:center;gap:8px">
                <h3>${name}</h3>
                <button onclick="event.stopPropagation();quickBuy('${name}')" style="background:#16a34a;color:#fff;border:none;border-radius:12px;font-size:11px;font-weight:700;padding:2px 10px;cursor:pointer">קנה</button>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
                <div class="timeframe-buttons" style="margin:0">
                    ${['day','week','month','3months'].map(tf => `
                        <button id="tf-${name}-${tf}" class="${tf==='day'?'active':''}" onclick="updateStockWindowTf('${name}','${tf}')">${tfLabels[tf]}</button>
                    `).join('')}
                </div>
                <button class="win-btn win-close" onclick="closeStockWindow('${name}')"></button>
            </div>
        </div>
        <div class="card-body" style="padding:8px 12px">
            <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px">
                <span id="price-${name}" style="font-size:1.6rem;font-weight:700;font-family:'Inter',monospace;color:var(--text)">₪${parseFloat(stock.price).toFixed(2)}</span>
                <span id="pct-${name}" style="font-size:1rem;font-weight:700;color:${color}">${parseFloat(dayPct)>=0?'+':''}${dayPct}%</span>
            </div>
            <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
                ${['day','week','month','3months'].map(tf => {
                    const v = calculateVal(stock, tf);
                    const pos = parseFloat(v) >= 0;
                    const c = pos ? '#16a34a' : '#dc2626';
                    const bg = pos ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)';
                    const sign = pos ? '+' : '';
                    return `<span id="stat-${name}-${tf}" style="font-size:0.72rem;font-weight:700;color:${c};background:${bg};border-radius:20px;padding:2px 8px;white-space:nowrap">${tfLabels[tf]} ${sign}${v}%</span>`;
                }).join('')}
            </div>
            <div style="flex:1;min-height:0;position:relative;height:180px">
                <canvas id="canvas-${name}" style="width:100%;height:100%"></canvas>
            </div>
        </div>
    `;

    dashboard.appendChild(card);
    makeDraggable(card);
    makeResizable(card);

    activeStockWindows[name] = { chart: null, tf: 'day' };
    drawStockWindowChart(name);

    // Fetch historical baselines for week/month/3month stats + intraday for day chart
    const sym = STOCK_SYMBOLS[name];
    if (sym) {
        const tfLabels = { day: 'יום', week: 'שבוע', month: 'חודש', '3months': '3M' };
        // Seed intraday history for the day chart (5d/2m filtered to today)
        fetchHistoricalWithTs(sym, '5d', '2m').then(({ closes, timestamps }) => {
            if (!closes.length) return;
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
            const todayEnd   = todayStart + 86400;
            const pairs = timestamps.map((t, i) => ({ t, c: closes[i] })).filter(d => d.t >= todayStart && d.t < todayEnd);
            if (!pairs.length) return;
            stocksData[name].history   = pairs.map(d => d.c);
            stocksData[name].historyTs = pairs.map(d => d.t);
            if (activeStockWindows[name]?.tf === 'day') drawStockWindowChart(name);
        }).catch(() => {});
        fetchHistoricalWithTs(sym, '1mo').then(({ closes, timestamps }) => {
            if (!closes.length) return;
            stocksData[name].baseWeek       = closes[Math.max(0, closes.length - 6)];
            stocksData[name].baseMonth      = closes[0];
            stocksData[name].historyWeek    = closes.slice(Math.max(0, closes.length - 6));
            stocksData[name].historyMonth   = closes;
            stocksData[name].historyWeekTs  = timestamps.slice(Math.max(0, timestamps.length - 6));
            stocksData[name].historyMonthTs = timestamps;
            ['week', 'month'].forEach(tf => {
                const el = document.getElementById(`stat-${name}-${tf}`);
                if (el) {
                    const v = calculateVal(stocksData[name], tf);
                    const pos = parseFloat(v) >= 0;
                    el.textContent = `${tfLabels[tf]} ${pos?'+':''}${v}%`;
                    el.style.color = pos ? '#16a34a' : '#dc2626';
                    el.style.background = pos ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)';
                }
            });
            const st = activeStockWindows[name];
            if (st && (st.tf === 'week' || st.tf === 'month')) drawStockWindowChart(name);
        }).catch(() => {});
        fetchHistoricalWithTs(sym, '3mo').then(({ closes, timestamps }) => {
            if (!closes.length) return;
            stocksData[name].base3Month      = closes[0];
            stocksData[name].history3Month   = closes;
            stocksData[name].history3MonthTs = timestamps;
            const el = document.getElementById(`stat-${name}-3months`);
            if (el) {
                const v = calculateVal(stocksData[name], '3months');
                const pos = parseFloat(v) >= 0;
                el.textContent = `3M ${pos?'+':''}${v}%`;
                el.style.color = pos ? '#16a34a' : '#dc2626';
                el.style.background = pos ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)';
            }
            if (activeStockWindows[name]?.tf === '3months') drawStockWindowChart(name);
        }).catch(() => {});
    }
}

function calculateColor(stock, tf) {
    const val = calculateVal(stock, tf);
    return parseFloat(val) >= 0 ? '#16a34a' : '#dc2626';
}

function calculateVal(stock, tf) {
    const currentPrice = parseFloat(stock.price);
    const baseline = tf === 'day' ? stock.initial
        : tf === 'week'    ? stock.baseWeek
        : tf === 'month'   ? stock.baseMonth
        : stock.base3Month;
    return calculatePctChange(currentPrice, baseline);
}

function closeStockWindow(name) {
    const win = document.getElementById(`win-detail-${name}`);
    if (win) {
        if (activeStockWindows[name]?.chart) activeStockWindows[name].chart.destroy();
        win.remove();
        delete activeStockWindows[name];
    }
}

function updateStockWindowTf(name, tf) {
    if (!activeStockWindows[name]) return;
    activeStockWindows[name].tf = tf;
    document.querySelectorAll(`[id^="tf-${name}-"]`).forEach(el => el.classList.remove('active'));
    document.getElementById(`tf-${name}-${tf}`)?.classList.add('active');
    drawStockWindowChart(name);
}

function drawStockWindowChart(name) {
    const state = activeStockWindows[name];
    if (!state) return;
    const canvas = document.getElementById(`canvas-${name}`);
    if (!canvas) return;

    const stock = stocksData[name];
    const tf = state.tf;
    let data = [];

    let tsData = [];
    const intraday = tf === 'day';
    if (tf === 'day') {
        data   = [...stock.history];
        tsData = [...(stock.historyTs ?? [])];
    } else {
        const histField = tf === 'week' ? 'historyWeek' : (tf === 'month' ? 'historyMonth' : 'history3Month');
        const tsField   = tf === 'week' ? 'historyWeekTs' : (tf === 'month' ? 'historyMonthTs' : 'history3MonthTs');
        data   = stock[histField]?.length ? [...stock[histField]] : [];
        tsData = stock[tsField]?.length   ? [...stock[tsField]]   : [];
    }
    const labels = tsData.length === data.length
        ? tsData.map(t => fmtTs(t, intraday))
        : new Array(data.length).fill('');

    if (state.chart) {
        state.chart.data.labels = labels;
        state.chart.data.datasets[0].data = data;
        state.chart.update('none');
    } else {
        state.chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [{ data, borderColor: '#f0b90b', borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: 'rgba(240, 185, 11, 0.1)', tension: 0.4 }]
            },
            options: {
                animation: { duration: 500 },
                maintainAspectRatio: false, responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(30,30,40,0.92)',
                        titleColor: '#848e9c',
                        bodyColor: '#fff',
                        bodyFont: { size: 13, weight: '700' },
                        titleFont: { size: 10 },
                        padding: 8,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            title: ctx => ctx[0]?.label ?? '',
                            label: ctx => `₪${parseFloat(ctx.parsed.y).toFixed(2)}`
                        }
                    },
                    crosshair: false
                },
                scales: {
                    x: {
                        display: true,
                        ticks: { color: '#848e9c', font: { size: 9 }, maxTicksLimit: 5, maxRotation: 0, autoSkip: true },
                        grid: { display: false }
                    },
                    y: { beginAtZero: false, grace: '5%', grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { color: '#848e9c', font: { size: 10 } } }
                }
            }
        });
    }
}

function updateAllStockWindows() {
    Object.keys(activeStockWindows).forEach(name => {
        const stock = stocksData[name];
        if (!stock) return;
        const priceEl = document.getElementById(`price-${name}`);
        const pctEl   = document.getElementById(`pct-${name}`);
        if (priceEl) priceEl.innerText = `₪${parseFloat(stock.price).toFixed(2)}`;
        if (pctEl) {
            const dayPct = calculatePctChange(parseFloat(stock.price), stock.initial);
            pctEl.innerText = `${parseFloat(dayPct) >= 0 ? '+' : ''}${dayPct}%`;
            pctEl.style.color = parseFloat(dayPct) >= 0 ? '#16a34a' : '#dc2626';
        }
        const _tfLbl = { day: 'יום', week: 'שבוע', month: 'חודש', '3months': '3M' };
        ['day', 'week', 'month', '3months'].forEach(tf => {
            const statEl = document.getElementById(`stat-${name}-${tf}`);
            if (statEl) {
                const val = calculateVal(stock, tf);
                const pos = parseFloat(val) >= 0;
                const c  = pos ? '#16a34a' : '#dc2626';
                const bg = pos ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)';
                statEl.innerText = `${_tfLbl[tf]} ${pos ? '+' : ''}${val}%`;
                statEl.style.color = c;
                statEl.style.background = bg;
            }
        });
        if (activeStockWindows[name].tf === 'day') drawStockWindowChart(name);
    });
}

// ── Charts ─────────────────────────────────────────────────────────────────

async function drawChart() {
    const container = document.getElementById('stockChart');
    if (!container) return;
    const stockName = currentStock || Object.keys(stocksData)[0];
    document.getElementById('main-chart-title').innerText = stockName;
    const _dateEl = document.getElementById('main-chart-date');
    if (_dateEl) {
        const now = new Date();
        _dateEl.textContent = now.toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'numeric' });
    }
    const sym = STOCK_SYMBOLS[stockName];
    if (!sym) return;

    // Skip re-fetch if stock and timeframe haven't changed (e.g. called from refreshRealData every 2s)
    if (_lwStock === stockName && _lwTf === currentMainTf && _lwChart) return;
    _lwStock = stockName;
    _lwTf    = currentMainTf;

    const { range, interval } = tfToOhlcRange(currentMainTf);
    const { ohlc, prevClose } = await fetchHistoricalOHLC(sym, range, interval);
    if (!ohlc.length) { console.warn('[lwChart] no OHLC for', sym, range); return; }

    // Destroy old chart
    if (_lwChart) { _lwChart.remove(); _lwChart = null; _lwSeries = null; _lwVolume = null; }

    const w = container.clientWidth  || 600;
    const h = container.clientHeight || 400;
    const dark    = document.documentElement.getAttribute('data-theme') === 'dark';
    const chartBg = dark ? '#1a1d23' : '#ffffff';
    const chartTx = dark ? '#9aa0a6' : '#5f6368';
    const gridV   = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
    const gridH   = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const _fmtTick = function(t) {
        var d = new Date(t * 1000);
        return ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2);
    };
    _lwChart = LightweightCharts.createChart(container, {
        width: w, height: h,
        layout:   { background: { color: chartBg }, textColor: chartTx },
        grid:     { vertLines: { color: gridV }, horzLines: { color: gridH } },
        localization: { timeFormatter: _fmtTick },
        timeScale:      { borderColor: 'rgba(0,0,0,0.1)', timeVisible: true, secondsVisible: false, fixRightEdge: true, tickMarkFormatter: _fmtTick },
        rightPriceScale:{ borderColor: 'rgba(0,0,0,0.1)', scaleMargins: { top: 0.06, bottom: 0.26 } },
        crosshair: { mode: 1, vertLine: { labelVisible: false }, horzLine: { labelVisible: true } },
    });
    // Singleton ResizeObserver — disconnect old one before creating a new one
    if (_lwResizeOb) { _lwResizeOb.disconnect(); _lwResizeOb = null; }
    _lwResizeOb = new ResizeObserver(() => {
        if (_lwChart && container.clientWidth && container.clientHeight)
            _lwChart.resize(container.clientWidth, container.clientHeight);
    });
    _lwResizeOb.observe(container);

    _lwSeries = _lwChart.addCandlestickSeries({
        upColor:       '#0ecb81', downColor:       '#f6465d',
        borderUpColor: '#0ecb81', borderDownColor: '#f6465d',
        wickUpColor:   '#0ecb81', wickDownColor:   '#f6465d',
    });
    _lwSeries.setData(ohlc);

    // Volume histogram — sits at the bottom 22% of the chart
    _lwVolume = _lwChart.addHistogramSeries({
        priceFormat:  { type: 'volume' },
        priceScaleId: 'vol',
    });
    _lwChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 }, drawTicks: false });
    _lwVolume.setData(ohlc.map(d => ({
        time:  d.time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(14,203,129,0.3)' : 'rgba(246,70,93,0.3)',
    })));

    _lwChart.timeScale().fitContent();

    // Update header: price + day-change % — use same prevClose source as stock list
    const last = ohlc[ohlc.length - 1];
    const base = stocksData[stockName]?.initial ?? prevClose ?? null;
    const pct  = base && last ? (((last.close - base) / base) * 100).toFixed(2) : null;
    const prEl = document.getElementById('main-chart-price');
    const pcEl = document.getElementById('main-chart-pct');
    if (prEl) prEl.textContent = last ? `₪${last.close.toFixed(2)}` : '';
    if (pcEl && pct !== null) {
        const up = parseFloat(pct) >= 0;
        pcEl.textContent = `${up ? '+' : ''}${pct}%`;
        pcEl.style.color = up ? '#16a34a' : '#dc2626';
    }
}

function updateMainTimeframe(tf) {
    currentMainTf = tf;
    document.querySelectorAll('#main-tf-btns button').forEach(b => b.classList.remove('active'));
    const map = { intraday: 0, daily: 1, weekly: 2, monthly: 3, '3months': 4 };
    const btns = document.querySelectorAll('#main-tf-btns button');
    if (btns[map[tf]]) btns[map[tf]].classList.add('active');
    _lwTf = null;  // force re-fetch
    drawChart();
}

function getIndexOHLC(tf) {
    const idx = stocksData["מדד תא-35"];
    if (!idx?.price) return null;
    if (tf === 'daily')   return idx.ohlcWeek?.length   ? idx.ohlcWeek   : null;
    if (tf === 'weekly')  return idx.ohlcMonth?.length  ? idx.ohlcMonth  : null;
    if (tf === 'monthly') return idx.ohlc3Month?.length ? idx.ohlc3Month : null;
    return idx.ohlc3Month?.length ? idx.ohlc3Month : null;
}

function updateTA35Stats() {
    const idx = stocksData["מדד תא-35"];
    const priceEl = document.getElementById('ta35-price');
    const pctEl   = document.getElementById('ta35-pct');
    const ptsEl   = document.getElementById('ta35-pts');

    if (!idx?.price || !idx?.initial) {
        if (priceEl) priceEl.textContent = '---';
        if (pctEl)   { pctEl.textContent = ''; }
        if (ptsEl)   { ptsEl.textContent = ''; }
        return;
    }

    const price = parseFloat(idx.price);
    const prev  = parseFloat(idx.initial);
    const pct   = calculatePctChange(price, prev);
    const pts   = (price - prev).toFixed(2);
    const color = parseFloat(pct) >= 0 ? '#16a34a' : '#dc2626';
    const sign  = parseFloat(pct) >= 0 ? '+' : '';

    if (priceEl) priceEl.textContent = price.toLocaleString(undefined, { minimumFractionDigits: 2 });
    if (pctEl)   { pctEl.textContent = `${sign}${pct}%`; pctEl.style.color = color; }
    if (ptsEl)   { ptsEl.textContent = `(${sign}${pts})`; ptsEl.style.color = color; }
}

let _idxChart = null, _idxSeries = null, _idxResizeOb = null;

function drawIndexChart(tf = currentTf) {
    updateTA35Stats();
    const container = document.getElementById('indexChart');
    if (!container) return;

    const idx = stocksData["מדד תא-35"];
    if (!idx?.price) return;

    const ohlc = getIndexOHLC(tf);
    if (!ohlc || ohlc.length < 2) return;

    // Recreate chart if theme changed
    if (_idxChart && container.children.length && container.querySelector('canvas')?.style.background?.includes('0b0e')) {
        _idxChart.remove(); _idxChart = null; _idxSeries = null;
    }
    if (!_idxChart) {
        _idxChart = LightweightCharts.createChart(container, {
            width:  container.clientWidth  || 300,
            height: container.clientHeight || 200,
            layout:   { background: { color: '#ffffff' }, textColor: '#5f6368' },
            grid:     { vertLines: { color: 'rgba(0,0,0,0.04)' }, horzLines: { color: 'rgba(0,0,0,0.06)' } },
            localization: { timeFormatter: t => { const d = new Date(t*1000); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; } },
            timeScale:       { borderColor: '#1e2430', timeVisible: true, secondsVisible: false, fixRightEdge: true, tickMarkFormatter: t => { const d = new Date(t*1000); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; } },
            rightPriceScale: { borderColor: '#1e2430', scaleMargins: { top: 0.08, bottom: 0.06 } },
            crosshair: { mode: 1, vertLine: { labelVisible: false }, horzLine: { labelVisible: true } },
        });
        _idxSeries = _idxChart.addAreaSeries({
            lineColor:      '#1db954',
            topColor:       'rgba(29,185,84,0.35)',
            bottomColor:    'rgba(29,185,84,0)',
            lineWidth:      2,
            priceLineVisible: false,
        });
        if (_idxResizeOb) _idxResizeOb.disconnect();
        _idxResizeOb = new ResizeObserver(() => {
            if (_idxChart && container.clientWidth && container.clientHeight)
                _idxChart.resize(container.clientWidth, container.clientHeight);
        });
        _idxResizeOb.observe(container);
    }

    _idxSeries.setData(ohlc.map(d => ({ time: d.time, value: d.close })));
    _idxChart.timeScale().fitContent();
}

async function updateTimeframe(tf) {
    currentTf = tf;
    document.querySelectorAll('#index-tf-btns button').forEach(b => b.classList.remove('active'));
    const map = { daily: 0, weekly: 1, monthly: 2, '3months': 3 };
    const btns = document.querySelectorAll('#index-tf-btns button');
    if (btns[map[tf]]) btns[map[tf]].classList.add('active');

    const idx = stocksData["מדד תא-35"];
    const idxSym = STOCK_SYMBOLS["מדד תא-35"];
    if (tf === 'weekly'   && !idx?.ohlcMonth  && idxSym)
        idx.ohlcMonth   = (await fetchHistoricalOHLC(idxSym, '1mo', '1d')).ohlc;
    if ((tf === 'monthly' || tf === '3months') && !idx?.ohlc3Month && idxSym)
        idx.ohlc3Month  = (await fetchHistoricalOHLC(idxSym, '3mo', '1d')).ohlc;

    drawIndexChart(tf);
}

// ── List Renderers ─────────────────────────────────────────────────────────

let _pinnedStock = null;
let _stockShowAll = false;
const STOCK_LIST_LIMIT = 10;

function updateStockList() {
    const list    = document.getElementById('stock-list');
    const showBtn = document.getElementById('stock-show-more-btn');
    if (!list) return;
    list.innerHTML = '';

    // Build ordered array: pinned first, then rest
    let names = Object.keys(stocksData);
    if (_pinnedStock && names.includes(_pinnedStock)) {
        names = [_pinnedStock, ...names.filter(n => n !== _pinnedStock)];
    }

    const visible = _stockShowAll ? names : names.slice(0, STOCK_LIST_LIMIT);
    const hasMore = names.length > STOCK_LIST_LIMIT;

    visible.forEach(name => {
        const stock = stocksData[name];
        const price = parseFloat(stock.price);
        const pct   = calculatePctChange(price, stock.initial);
        const up    = parseFloat(pct) >= 0;
        const priceStr = price > 0 ? `₪${price.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
        const isPinned = name === _pinnedStock;
        const tr = document.createElement('tr');
        tr.className = 'stock-row';
        if (isPinned) tr.style.cssText = 'background:rgba(26,115,232,0.06);border-right:2px solid #1a73e8';
        tr.innerHTML = `
            <td class="text-right" style="font-size:0.82rem;color:#202124;white-space:nowrap;cursor:pointer">${isPinned ? '📌 ' : ''}${name}</td>
            <td class="text-right" style="font-size:0.82rem;color:#202124;font-variant-numeric:tabular-nums;white-space:nowrap" dir="ltr">${priceStr}</td>
            <td class="pct-col"><span dir="ltr" class="inline-block" style="color:${pctColor(pct).text};background:${pctColor(pct).bg};padding:2px 8px;border-radius:20px;font-size:0.76rem;font-weight:700">${up ? '+' : ''}${pct}%</span></td>
            <td class="text-center"><button onclick="event.stopPropagation();quickBuy('${name}')" style="background:#16a34a;color:#fff;border:none;border-radius:4px;font-size:9px;font-weight:700;padding:2px 5px;cursor:pointer">קנה</button></td>`;
        tr.onclick = () => {
            _pinnedStock = (_pinnedStock === name) ? null : name; // toggle pin
            currentStock = name; _lwStock = null; drawChart(); openStockWindow(name);
            updateStockList();
        };
        list.appendChild(tr);
    });

    // Show more / less button
    if (showBtn) {
        showBtn.style.display = hasMore ? '' : 'none';
        showBtn.textContent   = _stockShowAll
            ? `▲ הצג פחות`
            : `▼ הצג עוד (${names.length - STOCK_LIST_LIMIT})`;
    }
}


function updateTransactionHistory() {
    const tbody = document.getElementById('tx-history-list');
    if (!tbody) return;
    tbody.innerHTML = transactionHistory.map(tx => {
        const isBuy = tx.action === 'Buy';
        const actionColor = isBuy ? '#16a34a' : '#dc2626';
        return `<tr class="tx-row">
            <td class="tx-time">${tx.time}</td>
            <td class="tx-action" style="color:${actionColor}">${isBuy ? 'קנייה' : 'מכירה'}</td>
            <td class="tx-symbol">${tx.symbol ?? tx.name ?? ''}</td>
            <td class="tx-qty" dir="ltr">${tx.qty}</td>
            <td class="tx-price" dir="ltr">₪${tx.price}</td>
        </tr>`;
    }).join('');
}

function updatePortfolioList() {
    const list = document.getElementById('portfolio-list');
    const totalDisplay = document.getElementById('total-portfolio-value');
    if (!list || !totalDisplay) return;
    list.innerHTML = "";
    let totalValue = 0, totalCost = 0, openValue = 0, openCount = 0;

    Object.keys(portfolio).forEach(symbol => {
        const p = portfolio[symbol], stock = stocksData[symbol];
        if (!stock) return;
        const currentPrice = parseFloat(stock.price) || 0;
        const avgCost      = p.buyPrice ?? p.avgCost ?? 0;
        const costBasis    = p.totalCost ?? (p.qty * avgCost);
        const positionValue = p.qty * currentPrice;
        totalValue += positionValue;
        totalCost  += costBasis;
        if (stock.initial > 0) { openValue += p.qty * stock.initial; openCount++; }
        const totalPct = calculatePctChange(currentPrice, p.buyPrice);
        const dayPct   = calculatePctChange(currentPrice, stock.initial);
        const plShekels = positionValue - costBasis;
        const plUp  = plShekels >= 0;
        const dayUp = parseFloat(dayPct) >= 0;
        const plColor  = pctColor(totalPct);
        const dayColor = pctColor(dayPct);
        const plStr = (plShekels >= 0 ? '+' : '') + plShekels.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        const tr = document.createElement('tr');
        tr.className = 'stock-row';
        tr.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON') { currentStock = symbol; _lwStock = null; drawChart(); openStockWindow(symbol); }
        };
        tr.innerHTML = `
            <td style="font-weight:600;font-size:0.8rem">${symbol}</td>
            <td class="pct-col"><span dir="ltr" style="display:inline-block;background:${plColor.bg};color:${plColor.text};padding:1px 6px;border-radius:4px;font-weight:700;font-size:0.75rem">${parseFloat(totalPct)>=0?'+':''}${totalPct}%</span></td>
            <td class="text-right" dir="ltr" style="font-size:0.75rem;font-weight:700;color:${plColor.text};font-variant-numeric:tabular-nums;white-space:nowrap">₪${plStr}</td>
            <td class="pct-col"><span dir="ltr" style="display:inline-block;background:${dayColor.bg};color:${dayColor.text};padding:1px 6px;border-radius:4px;font-weight:700;font-size:0.75rem">${dayUp?'+':''}${dayPct}%</span></td>
            <td class="text-right" dir="ltr" style="font-size:0.75rem;color:#3c4043;font-variant-numeric:tabular-nums;white-space:nowrap">₪${positionValue.toLocaleString('he-IL',{minimumFractionDigits:0,maximumFractionDigits:0})}</td>
            <td><button class="sell-btn" onclick="sellStock('${symbol}')">מכור</button></td>`;
        list.appendChild(tr);
    });

    if (openCount > 0) window._portfolioOpenVal = openValue;
    snapshotPortfolioValue(totalValue);
    const totalPL    = totalCost > 0 ? calculatePctChange(totalValue, totalCost) : "0.00";
    const totalPLils = totalValue - totalCost;
    const c          = pctColor(totalPL);
    const plSign     = totalPLils >= 0 ? '+' : '';
    totalDisplay.innerHTML = `
        <span dir="ltr" style="display:flex;flex-direction:column;align-items:flex-end;gap:1px">
            <span style="font-size:0.85rem;font-weight:700;color:#202124;font-variant-numeric:tabular-nums">
                ₪${totalValue.toLocaleString('he-IL',{minimumFractionDigits:0,maximumFractionDigits:0})}
            </span>
            <span style="font-size:0.75rem;font-weight:700;color:${c.text};background:${c.bg};padding:1px 7px;border-radius:4px;font-variant-numeric:tabular-nums">
                ${plSign}₪${Math.abs(totalPLils).toLocaleString('he-IL',{minimumFractionDigits:0,maximumFractionDigits:0})} (${parseFloat(totalPL)>=0?'+':''}${totalPL}%)
            </span>
        </span>`;
}

function searchSymbol() {
    const input = document.getElementById('search-symbol').value.trim();
    const errEl = document.getElementById('search-error');
    if (!input) return;
    if (stocksData[input]) {
        errEl.classList.add('hidden');
        currentStock = input;
        drawChart();
    } else {
        errEl.classList.remove('hidden');
    }
}

// ── Simulator ──────────────────────────────────────────────────────────────

function resolveStockName(input) {
    if (stocksData[input]) return input;
    const lower = input.toLowerCase();
    return Object.keys(STOCK_SYMBOLS).find(name =>
        STOCK_SYMBOLS[name].toLowerCase() === lower ||
        STOCK_SYMBOLS[name].toLowerCase().replace('.ta','') === lower
    ) ?? null;
}

function quickBuy(name) {
    const simEl = document.getElementById('win-simulator');
    if (simEl) simEl.style.display = '';
    const symEl = document.getElementById('sim-symbol');
    const qtyEl = document.getElementById('sim-qty');
    if (symEl) symEl.value = name;
    if (qtyEl) { qtyEl.value = ''; qtyEl.focus(); }
}

function buyStock() {
    const raw    = document.getElementById('sim-symbol').value.trim();
    const symbol = resolveStockName(raw);
    const qty    = parseInt(document.getElementById('sim-qty').value);
    if (!symbol || isNaN(qty) || qty <= 0) return;
    const price = parseFloat(stocksData[symbol].price);
    const cost  = price * qty;
    if (portfolio[symbol]) {
        portfolio[symbol].qty       += qty;
        portfolio[symbol].totalCost += cost;
        portfolio[symbol].buyPrice   = portfolio[symbol].totalCost / portfolio[symbol].qty;
    } else {
        portfolio[symbol] = { qty, buyPrice: price, totalCost: cost };
    }
    transactionHistory.unshift({ time: new Date().toLocaleTimeString(), action: 'Buy', symbol, qty, price: price.toFixed(2) });
    if (transactionHistory.length > 50) transactionHistory.pop();
    savePortfolio();
    updatePortfolioList();
    updateTransactionHistory();
}

function sellStockSim() {
    const symbol = document.getElementById('sim-symbol').value.trim();
    if (symbol) sellStock(symbol);
}

function sellStock(symbol) {
    if (!portfolio[symbol]) return;
    const qty   = portfolio[symbol].qty;
    const price = parseFloat(stocksData[symbol].price);
    delete portfolio[symbol];
    transactionHistory.unshift({ time: new Date().toLocaleTimeString(), action: 'Sell', symbol, qty, price: price.toFixed(2) });
    if (transactionHistory.length > 50) transactionHistory.pop();
    savePortfolio();
    updatePortfolioList();
    updateTransactionHistory();
}

// ── Init ───────────────────────────────────────────────────────────────────

let highestZIndex = 100;

// ── Mobile Tabs ─────────────────────────────────────────────────────────────
const MOB_TABS = {
    market:    ['win-indices-tase', 'win-stocks', 'win-search'],
    portfolio: ['win-portfolio', 'win-simulator'],
    ai:        ['win-ai-chat'],
    report:    ['win-report'],
};
const MOB_ALL = Object.values(MOB_TABS).flat();

function switchMobileTab(tab) {
    if (window.innerWidth > 768) return;
    document.querySelectorAll('.mob-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    MOB_ALL.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('mob-hidden', !MOB_TABS[tab].includes(id));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.innerWidth <= 768) switchMobileTab('market');
    try { initWindowManager(); } catch(e) { console.error("Window manager failed:", e); }
    requestNotifPermission();

    initTicker(); initStockSuggestions(); updateStockList(); updatePortfolioList(); updateTransactionHistory();
    drawChart(); drawIndexChart();

    document.getElementById('buy-btn').onclick      = buyStock;
    document.getElementById('sell-btn-sim').onclick = sellStockSim;
    document.getElementById('refresh-btn').onclick  = () => refreshRealData();

    applyMarketStatus(isMarketOpen() ? 'REGULAR' : 'CLOSED');
    // Load portfolio from server first, then fetch prices
    loadPortfolio().then(data => {
        if (data?.portfolio) {
            portfolio = data.portfolio;
            transactionHistory = data.transactionHistory ?? [];
        }
        _portfolioLoaded = true;
        updatePortfolioList();
        updateTransactionHistory();
    });
    refreshRealData().then(loadSessionHistory);
    scheduleFetch();

    // Refresh intraday session bars every 5 minutes
    setInterval(loadSessionHistory, 5 * 60 * 1000);

    // Refresh FX rates every hour
    setInterval(refreshFxRates, 3600_000);

    // Sync portfolio from server every 30 seconds
    setInterval(async () => {
        try {
            const res = await fetch('/api/portfolio');
            if (!res.ok) return;
            const data = await res.json();
            if (data?.portfolio && JSON.stringify(data.portfolio) !== JSON.stringify(portfolio)) {
                portfolio = data.portfolio;
                transactionHistory = data.transactionHistory ?? [];
                updatePortfolioList();
                updateTransactionHistory();
            }
        } catch(e) {}
    }, 30_000);
});

// ── Window Manager ─────────────────────────────────────────────────────────

function initWindowManager() {
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        makeDraggable(card);
        makeResizable(card);
        card.addEventListener('mousedown', () => { card.style.zIndex = ++highestZIndex; });
    });
}

function toggleMaximize(winId) {
    const win = document.getElementById(winId);
    if (!win) return;
    win.classList.toggle('maximized');
    if (winId === 'win-indices-tase' && indexChart) indexChart.resize();
    // LW Charts uses autoSize — no manual resize needed for win-main-chart
    const nameMatch = winId.match(/win-detail-(.+)/);
    if (nameMatch && activeStockWindows[nameMatch[1]]) {
        activeStockWindows[nameMatch[1]].chart.resize();
    }
}

// ── Dark mode ─────────────────────────────────────────────────────────────
function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const moon = document.getElementById('dark-icon-moon');
    const sun  = document.getElementById('dark-icon-sun');
    if (moon) moon.style.display = dark ? 'none'  : '';
    if (sun)  sun.style.display  = dark ? ''      : 'none';
    // Update LightweightCharts if active
    const chartBg  = dark ? '#1a1d23' : '#ffffff';
    const chartTxt = dark ? '#9aa0a6' : '#5f6368';
    const gridV    = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
    const gridH    = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    if (window._lwChart) {
        _lwChart.applyOptions({ layout: { background: { color: chartBg }, textColor: chartTxt }, grid: { vertLines: { color: gridV }, horzLines: { color: gridH } } });
    }
    if (window._idxChart) {
        _idxChart.applyOptions({ layout: { background: { color: chartBg }, textColor: chartTxt }, grid: { vertLines: { color: gridV }, horzLines: { color: gridH } } });
    }
    localStorage.setItem('darkMode', dark ? '1' : '0');
}

function toggleDarkMode() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyTheme(!isDark);
}

// Init theme from localStorage
(function() {
    const saved = localStorage.getItem('darkMode');
    if (saved === '1') applyTheme(true);
})();

const POPUP_WINDOWS = ['win-portfolio-chart', 'win-report'];

function resetWindows() {
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        const isPopup = POPUP_WINDOWS.includes(card.id) || card.id?.startsWith('win-detail-');
        const display = card.style.display;
        card.removeAttribute('style');
        card.classList.remove('maximized', 'mob-hidden');
        if (isPopup && display === 'none') card.style.display = 'none';
    });
    if (indexChart) indexChart.resize();
    Object.keys(activeStockWindows).forEach(name => {
        if (activeStockWindows[name].chart) activeStockWindows[name].chart.resize();
    });
}

function makeDraggable(el) {
    const header = el.querySelector('.window-header');
    if (!header) return;
    header.style.cursor = 'move';

    header.addEventListener('mousedown', function(e) {
        if (window.innerWidth <= 768) return; // dragging disabled on mobile
        if (e.target.closest('button') || e.target.closest('input')) return;
        e.preventDefault();

        const dashboard = document.getElementById('dashboard');
        if (!dashboard) return;

        el.style.zIndex = ++highestZIndex;
        el.classList.add('dragging');

        const dashRect = dashboard.getBoundingClientRect();
        const elRect   = el.getBoundingClientRect();
        const shiftX   = e.clientX - elRect.left;
        const shiftY   = e.clientY - elRect.top;

        function onMouseMove(moveEvent) {
            let x = moveEvent.clientX - dashRect.left - shiftX;
            let y = moveEvent.clientY - dashRect.top  - shiftY;
            if (x < 0) x = 0;
            if (y < 0) y = 0;
            if (x + el.offsetWidth  > dashRect.width)  x = dashRect.width  - el.offsetWidth;
            if (y + el.offsetHeight > dashRect.height) y = dashRect.height - el.offsetHeight;
            el.style.left  = x + 'px';
            el.style.top   = y + 'px';
            el.style.right = 'auto';
        }

        function onMouseUp() {
            el.classList.remove('dragging');
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup',   onMouseUp);
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup',   onMouseUp);
    });

    header.addEventListener('dragstart', (e) => e.preventDefault());
}

function makeResizable(el) {
    if (window.innerWidth <= 768) return;
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    el.appendChild(handle);

    handle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const startX    = e.clientX;
        const startY    = e.clientY;
        const startW    = el.offsetWidth;
        const startH    = el.offsetHeight;
        const dashboard = document.getElementById('dashboard');
        const dashRect2 = dashboard ? dashboard.getBoundingClientRect() : { top: 0, height: Infinity };
        const elTop0    = el.getBoundingClientRect().top - dashRect2.top;

        // For win-main-chart, cap just above the search bar; for others cap at dashboard bottom
        let maxH;
        if (el.id === 'win-main-chart') {
            const searchEl = document.getElementById('win-search');
            if (searchEl) {
                maxH = searchEl.getBoundingClientRect().top - dashRect2.top - elTop0 - 4;
            } else {
                maxH = dashRect2.height * 0.91 - elTop0;
            }
        } else {
            maxH = dashRect2.height - elTop0 - 2;
        }

        function onMouseMove(moveEvent) {
            const newW = Math.max(160, startW + (moveEvent.clientX - startX));
            const newH = Math.min(maxH, Math.max(100, startH + (moveEvent.clientY - startY)));
            el.style.width  = newW + 'px';
            el.style.height = newH + 'px';
        }

        function onMouseUp() {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup',   onMouseUp);
            if (indexChart) indexChart.resize();
            if (myChart)    myChart.resize();
            Object.keys(activeStockWindows).forEach(name => {
                if (activeStockWindows[name]?.chart) activeStockWindows[name].chart.resize();
            });
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup',   onMouseUp);
    });
}


let _aiHistory = (() => { try { return JSON.parse(localStorage.getItem('aiHistory') || '[]'); } catch { return []; } })();

function buildMoversBar() {
    const movers = Object.keys(stocksData)
        .filter(name => name !== 'מדד תא-35')
        .map(name => {
            const s = stocksData[name];
            if (!s?.price || !s?.initial) return null;
            const pct = ((parseFloat(s.price) - s.initial) / s.initial) * 100;
            if (Math.abs(pct) < 1.5) return null;
            return { name, pct };
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
        .slice(0, 6);

    if (!movers.length) return '';

    const tags = movers.map(({ name, pct }) => {
        const up    = pct >= 0;
        const abs   = Math.abs(pct);
        const color = abs >= 3 ? (up ? '#16a34a' : '#dc2626') : '#b96000';
        const bg    = abs >= 3 ? (up ? '#d4edda' : '#fde8e8') : '#fff3cd';
        const sign  = up ? '+' : '';
        return `<span style="display:inline-block;background:${bg};color:${color};border:1px solid ${color};`
             + `padding:1px 6px;border-radius:4px;font-weight:700;font-size:9px;white-space:nowrap">`
             + `${name} ${sign}${pct.toFixed(1)}%</span>`;
    }).join(' ');

    return `<div style="margin-top:6px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.1);display:flex;flex-wrap:wrap;gap:4px">${tags}</div>`;
}

function renderMarkdown(text) {
    const lines = text.split('\n');
    const out = [];
    for (const raw of lines) {
        let s = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        // Inline: bold, italic, code
        s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
        s = s.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
        s = s.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,.08);padding:1px 4px;border-radius:3px;font-size:.85em">$1</code>');
        // Block: numbered list
        const numMatch = s.match(/^(\d+)\.\s+(.+)$/);
        if (numMatch) {
            out.push(`<div style="margin:.15em 0"><span style="font-weight:600;color:var(--primary)">${numMatch[1]}.</span> ${numMatch[2]}</div>`);
            continue;
        }
        // Block: bullet list (- or •)
        const bulMatch = s.match(/^[-•]\s+(.+)$/);
        if (bulMatch) {
            out.push(`<div style="margin:.15em 0">• ${bulMatch[1]}</div>`);
            continue;
        }
        // Empty line → paragraph break
        if (s.trim() === '') { out.push('<br>'); continue; }
        // Normal line
        out.push(s + '<br>');
    }
    // Strip trailing <br>
    while (out.length && out[out.length-1] === '<br>') out.pop();
    // Collapse consecutive <br> into one
    return out.join('').replace(/(<br>\s*){2,}/g, '<br>');
}

function tagStockMentions(text) {
    const out = renderMarkdown(text);
    // Movers bar shown only if there are significant movers — as separate row below text
    const bar = buildMoversBar();
    return out + bar;
}

function addAIMessage(role, text) {
    const box = document.getElementById('ai-messages');
    const div = document.createElement('div');
    const isUser = role === 'user';
    const html = isUser
        ? text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        : tagStockMentions(text);
    // direction:ltr on wrapper so flex-end = right regardless of page RTL
    div.style.cssText = `display:flex;direction:ltr;justify-content:${isUser ? 'flex-end' : 'flex-start'};margin:2px 0`;
    const bubble = document.createElement('div');
    bubble.className = `chat-msg ${isUser ? 'chat-msg-user' : 'chat-msg-ai'}`;
    bubble.innerHTML = html;
    div.appendChild(bubble);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

let _rateLimitTimer  = null;
let _rateLimitActive = false;

function _startRateLimitCountdown(seconds, restoredText) {
    const btn   = document.getElementById('ai-send-btn');
    const input = document.getElementById('ai-input');
    if (restoredText) input.value = restoredText;

    let remaining    = seconds;
    _rateLimitActive = true;
    btn.disabled          = true;
    btn.style.background  = '#2b3139';
    btn.style.color       = '#4a5568';
    btn.style.borderColor = '#363c4e';
    btn.textContent       = `${remaining}s`;

    clearInterval(_rateLimitTimer);
    _rateLimitTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(_rateLimitTimer);
            _rateLimitActive      = false;
            btn.disabled          = false;
            btn.style.background  = '';
            btn.style.color       = '';
            btn.style.borderColor = '';
            btn.textContent       = 'שלח';
            input.focus();
        } else {
            btn.textContent = `${remaining}s`;
        }
    }, 1000);
}

let _notifAlertsToday = new Set();

function requestNotifPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function checkPortfolioAlerts() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const today = new Date().toDateString();
    Object.keys(portfolio).forEach(name => {
        const stock = stocksData[name];
        if (!stock?.price || !stock?.initial) return;
        const pct = ((stock.price - stock.initial) / stock.initial) * 100;
        const key = `${name}:${today}`;
        if (pct < -2 && !_notifAlertsToday.has(key)) {
            _notifAlertsToday.add(key);
            new Notification(`⚠ ${name} — שבירת תמיכה`, {
                body: `${name} ירדה ${pct.toFixed(2)}% מהבסיס היומי`,
                icon: '/icon-192.svg',
            });
        }
    });
}

let _portfolioHistory = (() => {
    try {
        const arr = JSON.parse(localStorage.getItem('portfolioHistory') || '[]');
        // clean outliers on load: remove points >30% from median
        if (arr.length < 3) return arr;
        const vals = arr.map(p => p.value).sort((a,b) => a-b);
        const median = vals[Math.floor(vals.length / 2)];
        return arr.filter(p => Math.abs(p.value - median) / median <= 0.3);
    } catch { return []; }
})();
let _lwPortfolio = null;

function snapshotPortfolioValue(value) {
    if (!value || value <= 0) return;
    // only snapshot after open value is known (prices loaded)
    if (!window._portfolioOpenVal) return;
    // reject outliers: ignore if >15% away from open value
    if (Math.abs(value - window._portfolioOpenVal) / window._portfolioOpenVal > 0.15) return;
    const now = Math.floor(Date.now() / 1000);
    const last = _portfolioHistory[_portfolioHistory.length - 1];
    if (last && now - last.time < 300) {
        last.value = value;
    } else {
        _portfolioHistory.push({ time: now, value });
    }
    if (_portfolioHistory.length > 500) _portfolioHistory.shift();
    try { localStorage.setItem('portfolioHistory', JSON.stringify(_portfolioHistory)); } catch {}
}

let _portfolioTf = 'day';

function setPortfolioTf(tf) {
    _portfolioTf = tf;
    ['day','week','all'].forEach(t => document.getElementById(`ptf-${t}`)?.classList.toggle('active', t === tf));
    drawPortfolioChart();
}

async function buildIntradayPortfolio() {
    const symbols = Object.keys(portfolio);
    if (!symbols.length) return [];
    const results = await Promise.all(symbols.map(name => {
        const sym = STOCK_SYMBOLS[name];
        if (!sym) return Promise.resolve({ closes: [], timestamps: [] });
        return fetchHistoricalWithTs(sym, '5d', '2m');
    }));
    // find last trading day with data
    const allTs = results[0]?.timestamps ?? [];
    if (!allTs.length) return [];
    const lastTs   = allTs[allTs.length - 1];
    const lastDay  = new Date(lastTs * 1000); lastDay.setHours(0,0,0,0);
    const dayStart = lastDay.getTime() / 1000;
    const dayEnd   = dayStart + 86400;
    const ref = allTs.filter(t => t >= dayStart && t < dayEnd);
    if (!ref.length) return [];
    return ref.map(t => {
        let total = 0;
        symbols.forEach((name, i) => {
            const { closes, timestamps } = results[i];
            const idx = timestamps.findIndex(ts => ts === t || Math.abs(ts - t) < 120);
            const price = idx >= 0 ? closes[idx] : (stocksData[name]?.price ?? 0);
            total += (portfolio[name]?.qty ?? 0) * price;
        });
        return { time: t, value: total };
    }).filter(p => p.value > 0);
}

function drawPortfolioChart() {
    const el = document.getElementById('portfolioChart');
    if (!el || document.getElementById('win-portfolio-chart')?.style.display === 'none') return;
    const now = Date.now() / 1000;
    const cutoff = _portfolioTf === 'day'  ? (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime()/1000; })()
                 : _portfolioTf === 'week' ? now - 7 * 86400
                 : 0;

    // For day view: always build from intraday prices
    if (_portfolioTf === 'day') {
        el.innerHTML = '<div style="color:#9aa0a6;font-size:12px;text-align:center;padding-top:40px">טוען נתונים...</div>';
        buildIntradayPortfolio().then(data => {
            if (data.length < 2) {
                el.innerHTML = '<div style="color:#9aa0a6;font-size:11px;text-align:center;padding-top:30px">אין נתונים להיום</div>';
                return;
            }
            _renderPortfolioChart(el, data);
        });
        return;
    }

    const data = _portfolioHistory.filter(p => p.value > 0 && p.time >= cutoff);
    if (data.length < 2) {
        el.innerHTML = '<div style="color:#9aa0a6;font-size:11px;text-align:center;padding-top:30px">אין מספיק נתונים</div>';
        return;
    }
    _renderPortfolioChart(el, data);
}

function _renderPortfolioChart(el, data) {
    if (_lwPortfolio) { _lwPortfolio.remove(); _lwPortfolio = null; }
    el.innerHTML = '';
    const lastVal = data[data.length - 1].value;
    const baseVal = window._portfolioOpenVal > 0 ? window._portfolioOpenVal : data[0].value;
    const upColor = lastVal >= baseVal ? '#34a853' : '#ea4335';
    // Shift all timestamps to today so LightweightCharts never adds "DD/MM" day-boundary ticks
    const todayUTCBase = Math.floor(Date.now() / 86400000) * 86400;
    const dataBase     = Math.floor(data[0].time / 86400) * 86400;
    const tsShift      = todayUTCBase - dataBase;
    const pctData = data.map(p => ({ time: p.time + tsShift, value: parseFloat(((p.value - baseVal) / baseVal * 100).toFixed(3)) }));
    const lastPct = pctData[pctData.length - 1].value;

    const _onlyTime = function(t) {
        const d = new Date(Number(t) * 1000);
        const hh = String(d.getHours()).padStart(2,'0');
        const mm = String(d.getMinutes()).padStart(2,'0');
        return hh + ':' + mm;
    };
    const _tickFmt = function(t) {
        return _onlyTime(t);
    };

    _lwPortfolio = LightweightCharts.createChart(el, {
        width:  el.clientWidth  || 400,
        height: Math.max((el.clientHeight || 280) - 32, 200),
        layout:  { background: { color: '#ffffff' }, textColor: '#5f6368' },
        grid:    { vertLines: { color: 'rgba(0,0,0,0.04)' }, horzLines: { color: 'rgba(0,0,0,0.04)' } },
        rightPriceScale: { borderColor: 'rgba(0,0,0,0.1)', scaleMargins: { top: 0.08, bottom: 0.04 } },
        timeScale: { visible: false },
        handleScroll: true, handleScale: true,
    });
    const series = _lwPortfolio.addAreaSeries({
        lineColor: upColor,
        topColor: upColor === '#34a853' ? 'rgba(52,168,83,0.2)' : 'rgba(234,67,53,0.2)',
        bottomColor: 'rgba(0,0,0,0)',
        lineWidth: 2,
        priceFormat: { type: 'custom', formatter: v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` },
    });
    series.setData(pctData);
    series.createPriceLine({ price: 0, color: 'rgba(0,0,0,0.15)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
    _lwPortfolio.timeScale().fitContent();

    // Custom time axis (4 evenly-spaced labels)
    const trEl = document.getElementById('portfolio-chart-timerange');
    if (trEl && data.length) {
        const fmt = t => {
            const d = new Date(t * 1000);
            return ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2);
        };
        const t0 = data[0].time, t1 = data[data.length-1].time;
        const steps = 4;
        const labels = [];
        for (let i = 0; i <= steps; i++) {
            labels.push(fmt(t0 + Math.round((t1 - t0) * i / steps)));
        }
        trEl.style.cssText = 'display:flex;justify-content:space-between;font-size:0.68rem;color:#9aa0a6;padding:2px 6px 0;font-family:"Inter",sans-serif;font-variant-numeric:tabular-nums;border-top:1px solid rgba(0,0,0,0.06)';
        trEl.innerHTML = labels.map(l => `<span>${l}</span>`).join('');
    }

    const summaryEl = document.getElementById('portfolio-chart-summary');
    if (summaryEl) {
        const sign = lastPct >= 0 ? '+' : '';
        const ilsChg = lastVal - baseVal;
        const ilsSign = ilsChg >= 0 ? '+' : '';
        summaryEl.innerHTML = `<span style="color:${upColor};font-weight:700;font-size:0.9rem">${sign}${lastPct.toFixed(2)}%</span> <span style="color:#9aa0a6;font-size:0.8rem">(${ilsSign}₪${Math.round(ilsChg).toLocaleString('he-IL')})</span>`;
    }
}

function togglePortfolioChart() {
    const win = document.getElementById('win-portfolio-chart');
    if (!win) return;
    const isHidden = win.style.display === 'none' || win.classList.contains('mob-hidden') || getComputedStyle(win).display === 'none';
    if (isHidden) {
        win.style.display = 'flex';
        win.classList.remove('mob-hidden');
        win.style.zIndex = window.innerWidth <= 768 ? 200 : ++highestZIndex;
        if (_lwPortfolio) { _lwPortfolio.remove(); _lwPortfolio = null; }
        // Two rAF to let the browser paint at correct dimensions before chart init
        requestAnimationFrame(() => requestAnimationFrame(() => drawPortfolioChart()));
    } else {
        win.style.display = 'none';
        win.classList.add('mob-hidden');
    }
}

async function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const btn   = document.getElementById('ai-send-btn');
    const text  = input.value.trim();
    if (!text) return;

    input.value = '';
    btn.disabled = true;
    addAIMessage('user', text);
    _aiHistory.push({ role: 'user', content: text });
    try { localStorage.setItem('aiHistory', JSON.stringify(_aiHistory.slice(-20))); } catch {}

    const thinkRow = document.createElement('div');
    thinkRow.id = 'ai-thinking';
    thinkRow.style.cssText = 'display:flex;justify-content:flex-start;margin:2px 0';
    const thinkBubble = document.createElement('div');
    thinkBubble.className = 'chat-msg chat-msg-ai thinking';
    thinkBubble.textContent = '…';
    thinkRow.appendChild(thinkBubble);
    document.getElementById('ai-messages').appendChild(thinkRow);

    try {
        const res  = await fetch('/api/chat', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ messages: _aiHistory, quotes: window._lastQuotes || [] })
        });
        const data = await res.json();
        document.getElementById('ai-thinking')?.remove();

        if (res.status === 429) {
            // Roll back the user message — it was never processed
            _aiHistory.pop();
            const wait = Math.ceil(data.retryAfter || 60);
            const rateLimitMsg = `⏱ מגבלת API — ניתן לשלוח שוב בעוד ${wait} שניות`;

            // Update existing rate-limit bubble instead of stacking new ones
            const box = document.getElementById('ai-messages');
            const lastInner = box.lastElementChild?.querySelector('div');
            if (lastInner?.textContent?.startsWith('⏱ מגבלת API')) {
                lastInner.textContent = rateLimitMsg;
            } else {
                addAIMessage('assistant', rateLimitMsg);
            }
            _startRateLimitCountdown(wait, text);
            return;
        }

        const reply = data.reply || data.error || 'אין תשובה';
        _aiHistory.push({ role: 'assistant', content: reply });
        try { localStorage.setItem('aiHistory', JSON.stringify(_aiHistory.slice(-20))); } catch {}
        addAIMessage('assistant', reply);
        // If a trade was executed, refresh portfolio display
        if (data.action) {
            loadPortfolio().then(d => {
                if (d?.portfolio) {
                    portfolio = d.portfolio;
                    updatePortfolioList();
                }
            }).catch(() => {});
        }
    } catch (e) {
        document.getElementById('ai-thinking')?.remove();
        addAIMessage('assistant', 'שגיאה: ' + e.message);
    } finally {
        if (!_rateLimitActive) {
            btn.disabled    = false;
            btn.textContent = 'שלח';
        }
        input.focus();
    }
}

function clearAIChat() {
    _aiHistory = [];
    localStorage.removeItem('aiHistory');
    document.getElementById('ai-messages').innerHTML = '';
}

// ── Report Analyzer ───────────────────────────────────────────────────────────

// Drag & drop on PDF zone
document.addEventListener('DOMContentLoaded', () => {
    const zone = document.getElementById('report-pdf-zone');
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--primary)'; });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.style.borderColor = '';
        const file = e.dataTransfer?.files?.[0];
        if (file?.type === 'application/pdf') {
            const dt = new DataTransfer(); dt.items.add(file);
            const inp = zone.querySelector('input[type=file]');
            inp.files = dt.files;
            analyzeReportPDF(inp);
        }
    });
});

function toggleReportPanel() {
    const win = document.getElementById('win-report');
    const btn = document.getElementById('report-toggle-btn');
    if (!win) return;
    const isOpen = getComputedStyle(win).display !== 'none';
    win.style.display = isOpen ? 'none' : 'flex';
    if (btn) btn.style.background = isOpen ? '' : 'rgba(26,115,232,0.2)';
}

function clearReport() {
    document.getElementById('report-text').value = '';
    document.getElementById('report-result').innerHTML = '';
}

async function analyzeReportPDF(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';

    const btn     = document.getElementById('report-analyze-btn');
    const zone    = document.getElementById('report-pdf-zone');
    const resultEl = document.getElementById('report-result');

    btn.disabled  = true;
    zone.style.opacity = '0.5';
    resultEl.innerHTML = `<div style="color:var(--text2);font-size:0.85rem;padding:12px;text-align:center">מחלץ טקסט מ-${file.name}...</div>`;

    try {
        const form = new FormData();
        form.append('file', file);

        const res = await fetch('/api/analyze-report', {
            method: 'POST',
            body:   form,
            signal: AbortSignal.timeout(60_000),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `שגיאה ${res.status}`);
        resultEl.innerHTML = _renderReportCard(data);
    } catch(e) {
        resultEl.innerHTML = `<div style="color:#d93025;font-size:0.85rem;padding:12px">שגיאה: ${e.message}</div>`;
    } finally {
        btn.disabled = false;
        zone.style.opacity = '';
    }
}

async function analyzeReport() {
    const text = document.getElementById('report-text').value.trim();
    if (!text || text.length < 50) {
        alert('יש להדביק טקסט דוח (לפחות 50 תווים)');
        return;
    }

    const btn = document.getElementById('report-analyze-btn');
    const resultEl = document.getElementById('report-result');
    btn.disabled = true;
    btn.textContent = '⏳ מנתח...';
    resultEl.innerHTML = '<div style="color:var(--text2);font-size:0.85rem;padding:12px;text-align:center">מעבד דוח, אנא המתן...</div>';

    try {
        const res = await fetch('/api/analyze-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
            signal: AbortSignal.timeout(45_000),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `שגיאה ${res.status}`);
        resultEl.innerHTML = _renderReportCard(data);
    } catch (e) {
        resultEl.innerHTML = `<div style="color:#d93025;font-size:0.85rem;padding:12px">שגיאה: ${e.message}</div>`;
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍 נתח דוח';
    }
}

function _renderReportCard(a) {
    const rec = a.recommendation ?? '—';
    const recColor = rec === 'קנייה' ? '#1e8e3e' : rec === 'מכירה' ? '#d93025' : '#f9ab00';
    const conf = a.confidence ?? 0;
    const m = a.metrics ?? {};

    const metricRow = (label, val, suffix = '') =>
        val != null ? `<tr><td style="color:var(--text2);padding:3px 8px 3px 0">${label}</td><td style="font-weight:600;font-variant-numeric:tabular-nums">${val}${suffix}</td></tr>` : '';

    const swotSection = (title, items, color) => {
        if (!items?.length) return '';
        return `<div style="margin-bottom:8px">
            <div style="font-size:0.75rem;font-weight:700;color:${color};margin-bottom:4px">${title}</div>
            ${items.map(i => `<div style="font-size:0.8rem;color:var(--text);padding:2px 0">• ${i}</div>`).join('')}
        </div>`;
    };

    const fxDir = a.fxImpact?.direction ?? '';
    const fxIcon = fxDir === 'חיובי' ? '📈' : fxDir === 'שלילי' ? '📉' : '➡️';

    return `
    <div style="font-size:0.82rem;line-height:1.6">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0 8px;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-weight:700;font-size:1rem">${a.company ?? '—'}</div>
          <div style="color:var(--text2);font-size:0.78rem">${a.period ?? ''}</div>
        </div>
        <div style="text-align:center">
          <div style="font-weight:700;font-size:1.1rem;color:${recColor}">${rec}</div>
          <div style="font-size:0.72rem;color:var(--text2)">ביטחון ${conf}%</div>
          <div style="width:60px;height:4px;background:var(--border);border-radius:2px;margin-top:3px">
            <div style="width:${conf}%;height:100%;background:${recColor};border-radius:2px"></div>
          </div>
        </div>
      </div>

      <!-- Summary -->
      ${a.summary ? `<div style="padding:8px 0;color:var(--text);border-bottom:1px solid var(--border)">${a.summary}</div>` : ''}

      <!-- Metrics -->
      <div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-weight:600;font-size:0.78rem;color:var(--text2);margin-bottom:6px">מדדים פיננסיים</div>
        <table style="width:100%;border-collapse:collapse">
          ${metricRow('הכנסות', m.revenue != null ? Number(m.revenue).toLocaleString('he-IL') : null, ' ₪')}
          ${metricRow('EBITDA', m.ebitda != null ? Number(m.ebitda).toLocaleString('he-IL') : null, ' ₪')}
          ${metricRow('רווח נקי', m.netProfit != null ? Number(m.netProfit).toLocaleString('he-IL') : null, ' ₪')}
          ${metricRow('EPS (רווח למניה)', m.eps)}
          ${metricRow('מכפיל רווח (P/E)', m.peRatio)}
          ${metricRow('חוב להון', m.debtToEquity)}
          ${metricRow('תשואת הון (ROE)', m.roe, '%')}
        </table>
      </div>

      <!-- FX -->
      ${a.fxImpact?.explanation ? `
      <div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-weight:600;font-size:0.78rem;color:var(--text2);margin-bottom:4px">חשיפת מט"ח ${fxIcon}</div>
        <div style="color:var(--text)">${a.fxImpact.explanation}</div>
        <div style="font-size:0.75rem;color:var(--text2);margin-top:2px">רמה: ${a.fxImpact.exposure ?? '—'} | כיוון: ${fxDir}</div>
      </div>` : ''}

      <!-- SWOT -->
      <div style="padding:8px 0">
        <div style="font-weight:600;font-size:0.78rem;color:var(--text2);margin-bottom:8px">SWOT</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>${swotSection('💪 חוזקות', a.swot?.strengths, '#1e8e3e')}</div>
          <div>${swotSection('⚠️ חולשות', a.swot?.weaknesses, '#d93025')}</div>
          <div>${swotSection('🚀 הזדמנויות', a.swot?.opportunities, '#1a73e8')}</div>
          <div>${swotSection('🔴 סיכונים', a.swot?.threats, '#f9ab00')}</div>
        </div>
      </div>

    </div>`;
}
