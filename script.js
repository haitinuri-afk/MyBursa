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
    "כלל ביטוח":    "KLLI.TA",
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
    "סלקום":        "SELC.TA",
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
    const open = marketState === 'REGULAR';
    const color = open ? '#16a34a' : '#dc2626';
    const dot = document.getElementById('market-status');
    if (dot) dot.style.color = color;
    const label = document.getElementById('market-label');
    if (label) { label.textContent = open ? 'מסחר רציף' : 'סגור'; label.style.color = color; }
    const badge = document.getElementById('ta35-status');
    if (badge) { badge.textContent = open ? '' : 'סגור'; badge.style.color = '#f6465d'; }
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
    if (tf === 'daily')   return { range: '1mo', interval: '1d' };
    if (tf === 'weekly')  return { range: '3mo', interval: '1d' };
    if (tf === 'monthly') return { range: '6mo', interval: '1d' };
    return                       { range: '1y',  interval: '1d' };
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
        stocksData[name].history.push(stocksData[name].price);
        if (stocksData[name].history.length > 300) stocksData[name].history.shift();
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

function initStockSuggestions() {
    const dl = document.getElementById('stock-suggestions');
    if (!dl) return;
    Object.entries(STOCK_SYMBOLS).forEach(([name, sym]) => {
        const o1 = document.createElement('option'); o1.value = name; dl.appendChild(o1);
        const o2 = document.createElement('option'); o2.value = sym;  dl.appendChild(o2);
    });
}

function initTicker() {
    const ticker = document.getElementById('ticker-content');
    if (!ticker) return;

    // Build stable DOM once — 3 identical copies for seamless CSS loop
    if (!ticker.querySelector('[data-stock]')) {
        const names = Object.keys(stocksData);
        const frag  = document.createDocumentFragment();
        for (let copy = 0; copy < 3; copy++) {
            names.forEach(name => {
                const item = document.createElement('span');
                item.dataset.stock = name;
                item.style.cssText = 'padding:0 22px;white-space:nowrap;font-family:"Inter",sans-serif;font-size:0.72rem;font-weight:500;display:inline-flex;align-items:center;gap:4px';
                const lbl = document.createElement('span');
                lbl.className = 'tick-lbl';
                lbl.textContent = name;
                lbl.style.color = '#5f6368';
                const val = document.createElement('span');
                val.className = 'tick-val';
                val.dir = 'ltr';
                item.appendChild(lbl);
                item.appendChild(val);
                frag.appendChild(item);
            });
        }
        ticker.appendChild(frag);
    }

    // Update only the value leaf — never touch structure
    ticker.querySelectorAll('[data-stock]').forEach(item => {
        const stock = stocksData[item.dataset.stock];
        if (!stock) return;
        const pct   = calculatePctChange(parseFloat(stock.price), stock.initial);
        const up    = parseFloat(pct) >= 0;
        const val   = item.querySelector('.tick-val');
        if (val) {
            val.textContent = `${up ? '▲' : '▼'} ${pct}%`;
            val.style.color = pctColor(pct).text;
        }
    });
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

    card.innerHTML = `
        <div class="window-header">
            <h3>${name} - פרטי מניה</h3>
            <div class="window-controls">
                <button class="win-btn win-close" onclick="closeStockWindow('${name}')"></button>
            </div>
        </div>
        <div class="card-body">
            <div class="text-center mb-4">
                <span id="price-${name}" class="text-2xl font-bold font-mono">₪${parseFloat(stock.price).toFixed(2)}</span>
                <span id="pct-${name}" class="block font-bold" style="color: ${color}">${parseFloat(dayPct) >= 0 ? '+' : ''}${dayPct}%</span>
            </div>
            <div class="flex justify-around bg-[#161a1e] py-2 border-t border-b border-[#363c4e] mb-4">
                ${['day', 'week', 'month', '3months'].map(tf => `
                    <div id="tf-${name}-${tf}" class="text-center cursor-pointer opacity-50 ${tf === 'day' ? 'active-tf' : ''}" onclick="updateStockWindowTf('${name}', '${tf}')">
                        <label class="text-[10px] block text-[#848e9c] uppercase">${tf}</label>
                        <span id="stat-${name}-${tf}" class="font-bold text-xs" style="color: ${calculateColor(stock, tf)}">${calculateVal(stock, tf)}%</span>
                    </div>
                `).join('')}
            </div>
            <div class="flex-1 min-h-0 relative">
                <canvas id="canvas-${name}"></canvas>
            </div>
        </div>
    `;

    dashboard.appendChild(card);
    makeDraggable(card);
    makeResizable(card);

    activeStockWindows[name] = { chart: null, tf: 'day' };
    drawStockWindowChart(name);
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
    document.querySelectorAll(`[id^="tf-${name}-"]`).forEach(el => el.classList.remove('active-tf'));
    document.getElementById(`tf-${name}-${tf}`).classList.add('active-tf');
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

    if (tf === 'day') {
        data = [...stock.history];
    } else {
        const basePrice = tf === 'week' ? stock.baseWeek : (tf === 'month' ? stock.baseMonth : stock.base3Month);
        const currentPrice = parseFloat(stock.price);
        const points = 20;
        for (let i = 0; i < points; i++) {
            const ratio = i / (points - 1);
            const mid = basePrice + (currentPrice - basePrice) * ratio;
            data.push(parseFloat((mid + mid * rnd(-0.005, 0.005)).toFixed(2)));
        }
    }

    if (state.chart) {
        state.chart.data.labels = new Array(data.length).fill('');
        state.chart.data.datasets[0].data = data;
        state.chart.update('none');
    } else {
        state.chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: new Array(data.length).fill(''),
                datasets: [{ data, borderColor: '#f0b90b', borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: 'rgba(240, 185, 11, 0.1)', tension: 0.4 }]
            },
            options: {
                animation: { duration: 500 },
                maintainAspectRatio: false, responsive: true,
                plugins: { legend: { display: false } },
                scales: { x: { display: false }, y: { beginAtZero: false, grace: '5%', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#848e9c', font: { size: 10 } } } }
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
        ['day', 'week', 'month', '3months'].forEach(tf => {
            const statEl = document.getElementById(`stat-${name}-${tf}`);
            if (statEl) {
                const val = calculateVal(stock, tf);
                statEl.innerText = `${val}%`;
                statEl.style.color = parseFloat(val) >= 0 ? '#16a34a' : '#dc2626';
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
    _lwChart = LightweightCharts.createChart(container, {
        width: w, height: h,
        layout:   { background: { color: '#ffffff' }, textColor: '#5f6368' },
        grid:     { vertLines: { color: 'rgba(0,0,0,0.04)' }, horzLines: { color: 'rgba(0,0,0,0.06)' } },
        timeScale:      { borderColor: 'rgba(0,0,0,0.1)', timeVisible: true, secondsVisible: false, fixRightEdge: true },
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
    const map = { daily: 0, weekly: 1, monthly: 2, '3months': 3 };
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
            timeScale:       { borderColor: '#1e2430', timeVisible: true, secondsVisible: false, fixRightEdge: true },
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

function updateStockList() {
    const list = document.getElementById('stock-list');
    if (!list) return;
    list.innerHTML = "";
    Object.keys(stocksData).forEach(name => {
        const stock = stocksData[name];
        const price = parseFloat(stock.price);
        const pct   = calculatePctChange(price, stock.initial);
        const up    = parseFloat(pct) >= 0;
        const color = up ? '#16a34a' : '#dc2626';
        const arrow = up ? '▲' : '▼';
        const priceStr = price > 0 ? `₪${price.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
        const tr = document.createElement('tr');
        tr.className = 'stock-row';
        tr.innerHTML = `
            <td class="text-right" style="font-size:0.82rem;color:#202124;white-space:nowrap;cursor:pointer">${name}</td>
            <td class="text-right" style="font-size:0.82rem;color:#202124;font-variant-numeric:tabular-nums;white-space:nowrap" dir="ltr">${priceStr}</td>
            <td class="pct-col"><span dir="ltr" class="inline-block" style="color:${pctColor(pct).text};background:${pctColor(pct).bg};padding:2px 8px;border-radius:20px;font-size:0.76rem;font-weight:700">${up ? '+' : ''}${pct}%</span></td>
            <td class="text-center"><button onclick="event.stopPropagation();quickBuy('${name}')" style="background:#16a34a;color:#fff;border:none;border-radius:4px;font-size:9px;font-weight:700;padding:2px 5px;cursor:pointer">קנה</button></td>`;
        tr.onclick = () => { currentStock = name; _lwStock = null; drawChart(); openStockWindow(name); };
        list.appendChild(tr);
    });
}


function updateTransactionHistory() {
    const tbody = document.getElementById('tx-history-list');
    if (!tbody) return;
    tbody.innerHTML = transactionHistory.map(tx => `
        <tr>
            <td style="padding:1px 3px;color:#848e9c">${tx.time}</td>
            <td style="padding:1px 3px;color:${tx.action==='Buy'?'#0ecb81':'#f6465d'};font-weight:bold">${tx.action==='Buy'?'קנייה':'מכירה'}</td>
            <td style="padding:1px 3px;color:#eaecef">${tx.symbol}</td>
            <td style="padding:1px 3px;text-align:right;color:#eaecef">${tx.qty}</td>
            <td style="padding:1px 3px;text-align:right;color:#eaecef">₪${tx.price}</td>
        </tr>`).join('');
}

function updatePortfolioList() {
    const list = document.getElementById('portfolio-list');
    const totalDisplay = document.getElementById('total-portfolio-value');
    if (!list || !totalDisplay) return;
    list.innerHTML = "";
    let totalValue = 0, totalCost = 0;

    Object.keys(portfolio).forEach(symbol => {
        const p = portfolio[symbol], stock = stocksData[symbol];
        if (!stock) return;
        const currentPrice = parseFloat(stock.price);
        const positionValue = p.qty * currentPrice;
        totalValue += positionValue;
        totalCost  += p.totalCost;
        const totalPct = calculatePctChange(currentPrice, p.buyPrice);
        const dayPct   = calculatePctChange(currentPrice, stock.initial);
        const plShekels = positionValue - p.totalCost;
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

document.addEventListener('DOMContentLoaded', () => {
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

function resetWindows() {
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => { card.removeAttribute('style'); card.classList.remove('maximized'); });
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

function tagStockMentions(text) {
    let out = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    // Inline-highlight stock name mentions that are significant movers
    Object.keys(stocksData).forEach(name => {
        const s = stocksData[name];
        if (!s?.price || !s?.initial) return;
        const pct = ((parseFloat(s.price) - s.initial) / s.initial) * 100;
        if (Math.abs(pct) < 1.5) return;
        const up    = pct >= 0;
        const color = Math.abs(pct) >= 3 ? (up ? '#16a34a' : '#dc2626') : '#b96000';
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp(escaped, 'g'),
            `<strong style="color:${color}">${name}</strong>`);
    });

    out += buildMoversBar();
    return out;
}

function addAIMessage(role, text) {
    const box = document.getElementById('ai-messages');
    const div = document.createElement('div');
    const isUser = role === 'user';
    const html = isUser
        ? text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        : tagStockMentions(text);
    div.style.cssText = `display:flex;justify-content:${isUser ? 'flex-end' : 'flex-start'};margin:3px 0`;
    div.innerHTML = `<div style="max-width:88%;padding:8px 12px;border-radius:10px;font-size:13px;line-height:1.6;white-space:pre-wrap;
        background:${isUser ? 'rgba(26,115,232,0.1)' : '#f8f9fa'};color:${isUser ? '#1a56c4' : '#202124'};
        border:1px solid ${isUser ? 'rgba(26,115,232,0.2)' : 'rgba(0,0,0,0.08)'};direction:rtl;text-align:right">${html}</div>`;
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

let _portfolioHistory = (() => { try { return JSON.parse(localStorage.getItem('portfolioHistory') || '[]'); } catch { return []; } })();
let _lwPortfolio = null;

function snapshotPortfolioValue(value) {
    if (!value || value <= 0) return;
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

function drawPortfolioChart() {
    const el = document.getElementById('portfolioChart');
    if (!el || document.getElementById('win-portfolio-chart')?.style.display === 'none') return;
    const data = _portfolioHistory.filter(p => p.value > 0);
    if (data.length < 2) {
        el.innerHTML = '<div style="color:#9aa0a6;font-size:11px;text-align:center;padding-top:30px">אין מספיק נתונים עדיין — נתונים נאספים כל 5 דקות</div>';
        return;
    }
    if (_lwPortfolio) { _lwPortfolio.remove(); _lwPortfolio = null; }
    const firstVal = data[0].value;
    const lastVal  = data[data.length - 1].value;
    const upColor  = lastVal >= firstVal ? '#34a853' : '#ea4335';
    _lwPortfolio = LightweightCharts.createChart(el, {
        layout:  { background: { color: '#ffffff' }, textColor: '#5f6368' },
        grid:    { vertLines: { color: 'rgba(0,0,0,0.04)' }, horzLines: { color: 'rgba(0,0,0,0.04)' } },
        rightPriceScale: { borderColor: 'rgba(0,0,0,0.1)' },
        timeScale: { borderColor: 'rgba(0,0,0,0.1)', timeVisible: true },
        handleScroll: true, handleScale: true,
    });
    const series = _lwPortfolio.addAreaSeries({
        lineColor: upColor,
        topColor: lastVal >= firstVal ? 'rgba(52,168,83,0.2)' : 'rgba(234,67,53,0.2)',
        bottomColor: 'rgba(0,0,0,0)',
        lineWidth: 2,
        priceFormat: { type: 'price', precision: 0, minMove: 1 },
    });
    series.setData(data.map(p => ({ time: p.time, value: p.value })));
    _lwPortfolio.timeScale().fitContent();
}

function togglePortfolioChart() {
    const win = document.getElementById('win-portfolio-chart');
    if (!win) return;
    if (win.style.display === 'none' || win.style.display === '') {
        win.style.display = '';
        drawPortfolioChart();
    } else {
        win.style.display = 'none';
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

    const thinking = document.createElement('div');
    thinking.id = 'ai-thinking';
    thinking.style.cssText = 'font-size:10px;color:#424c5c;padding:2px 4px';
    thinking.textContent = '...';
    document.getElementById('ai-messages').appendChild(thinking);

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
