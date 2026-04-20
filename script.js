const STORAGE_KEY   = 'trading_station_pro_data';
const PORTFOLIO_KEY = 'trading_station_portfolio';


// Yahoo Finance ticker symbols for each Hebrew stock name
const STOCK_SYMBOLS = {
    "מדד תא-35":    "^TA35",
    "לאומי":        "LUMI.TA",
    "פועלים":       "POLI.TA",
    "דיסקונט":      "DSCT.TA",
    "מזרחי טפחות": "MZTF.TA",
    "אלביט":        "ESLT.TA",
    "נייס":         "NICE.TA",
    "טבע":          "TEVA.TA",
    "כיל":          "ICL.TA",
    "שטראוס":       "STRS.TA",
    "שופרסל":       "SAE.TA",
    "פוקס":         "FOX.TA",
    "עזריאלי":      "AZRG.TA",
    "מליסרון":      "MLSR.TA",
    "בזק":          "BEZQ.TA",
    "סלקום":        "SELC.TA",
    "אמות":         "AMOT.TA",
    "ביג":          "BIG.TA",
    "אורמת":        "ORA.TA",
    "שיכון ובינוי": "SKBN.TA",
    "קבוצת דלק":    "DLEKG.TA",
    "טאוור":        "TSEM.TA",
    "אנרג'יקס":     "ENRG.TA",
    "אנלייט":       "ENLT.TA"
};

const TASE_MAP = { "^TA35": "מדד תא-35", "^TA125": "מדד תא-125", "^TA90": "מדד תא-90" };

// Reverse lookup: Yahoo symbol → Hebrew name
const SYM_TO_NAME = Object.fromEntries(
    Object.entries(STOCK_SYMBOLS).map(([name, sym]) => [sym, name])
);

// ── Portfolio persistence (dedicated key — never wiped by price cache) ──────
function savePortfolio() {
    try {
        localStorage.setItem(PORTFOLIO_KEY, JSON.stringify({ portfolio, transactionHistory }));
    } catch(e) { console.error('savePortfolio', e); }
}

function loadPortfolio() {
    try {
        const raw = localStorage.getItem(PORTFOLIO_KEY);
        if (raw) return JSON.parse(raw);
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


const _savedPortfolio = loadPortfolio();
let portfolio          = _savedPortfolio?.portfolio        ?? savedState?.portfolio        ?? {};
let transactionHistory = _savedPortfolio?.transactionHistory ?? savedState?.transactionHistory ?? [];

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
let _lwChart   = null;
let _lwSeries  = null;
let _lwVolume  = null;
let _lwStock   = null;   // last rendered stock name
let _lwTf      = null;   // last rendered timeframe

// ── Real Data ──────────────────────────────────────────────────────────────

function applyMarketStatus(marketState) {
    const open = marketState === 'REGULAR';
    const color = open ? '#0ecb81' : '#f6465d';
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
    // Index chart: load 5d daily closes
    const idxSym = STOCK_SYMBOLS["מדד תא-35"];
    if (idxSym) {
        const w5d = await fetchHistoricalCloses(idxSym, '5d', '1d');
        if (w5d.length > 1) {
            stocksData["מדד תא-35"].historyWeek = w5d;
            drawIndexChart('daily');
        }
        // Pre-load W/M/3M for index chart timeframe buttons
        fetchHistoricalCloses(idxSym, '1mo', '1d').then(w => { if (w.length > 1) { stocksData["מדד תא-35"].historyMonth  = w; } });
        fetchHistoricalCloses(idxSym, '3mo', '1d').then(w => { if (w.length > 1) { stocksData["מדד תא-35"].history3Month = w; } });
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
        live:  { text: 'LIVE', color: '#0ecb81', bg: 'rgba(14,203,129,0.12)' },
        sim:   { text: 'SIM',  color: '#848e9c', bg: '#1e2430' },
        error: { text: 'ERR',  color: '#f6465d', bg: 'rgba(246,70,93,0.12)' },
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
        if (!resp.ok) return [];
        const data = await resp.json();
        return (data.ohlc ?? []).filter(d => d.open > 0 && d.high > 0 && d.low > 0 && d.close > 0);
    } catch(e) { return []; }
}

function tfToOhlcRange(tf) {
    if (tf === 'daily')   return { range: '5d',  interval: '1d' };
    if (tf === 'weekly')  return { range: '1mo', interval: '1d' };
    if (tf === 'monthly') return { range: '3mo', interval: '1d' };
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
        return { marketOpen: data.marketOpen ?? false, quotes: Array.isArray(data) ? data : (data.quotes ?? []) };
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
    // Use client-side time check as override — Yahoo sometimes returns wrong state for TASE
    const effectiveState = isMarketOpen() ? 'REGULAR' : marketState;
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

    initTicker(); updateStockList(); updatePortfolioList();
    drawChart(); drawIndexChart(); updateAllStockWindows();
    saveState();
    scheduleFetch();
}

// ── Helpers ────────────────────────────────────────────────────────────────

function calculatePctChange(current, baseline) {
    if (!baseline || baseline === 0) return "0.00";
    return (((current - baseline) / baseline) * 100).toFixed(2);
}

function initTicker() {
    const ticker = document.getElementById('ticker-content');
    if (!ticker) return;

    // Build spans exactly once — any innerHTML replacement kills the CSS animation.
    if (!ticker.querySelector('[data-stock]')) {
        const names = Object.keys(stocksData);
        const frag  = document.createDocumentFragment();
        // Three copies for a seamless loop (animation moves -33.333% = one copy)
        for (let copy = 0; copy < 3; copy++) {
            names.forEach(name => {
                const span = document.createElement('span');
                span.dataset.stock = name;
                span.style.cssText = 'padding: 0 28px; white-space: nowrap; font-family: monospace; font-size: 0.75rem; font-weight: 500;';
                frag.appendChild(span);
            });
        }
        ticker.appendChild(frag);
    }

    // Update only colour + text — never touch the container or its class
    ticker.querySelectorAll('[data-stock]').forEach(span => {
        const stock = stocksData[span.dataset.stock];
        if (!stock) return;
        const pct   = calculatePctChange(parseFloat(stock.price), stock.initial);
        const color = parseFloat(pct) >= 0 ? '#0ecb81' : '#f6465d';
        const arrow = parseFloat(pct) >= 0 ? '▲' : '▼';
        span.style.color    = color;
        span.textContent    = '';                           // clear first
        const label = document.createTextNode(`${span.dataset.stock}: `);
        const val   = document.createElement('span');
        val.dir         = 'ltr';
        val.style.display = 'inline-block';
        val.textContent = `${pct}% ${arrow}`;
        val.style.color = color;
        span.appendChild(label);
        span.appendChild(val);
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
    const color = parseFloat(dayPct) >= 0 ? '#0ecb81' : '#f6465d';

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
    return parseFloat(val) >= 0 ? '#0ecb81' : '#f6465d';
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
            pctEl.style.color = parseFloat(dayPct) >= 0 ? '#0ecb81' : '#f6465d';
        }
        ['day', 'week', 'month', '3months'].forEach(tf => {
            const statEl = document.getElementById(`stat-${name}-${tf}`);
            if (statEl) {
                const val = calculateVal(stock, tf);
                statEl.innerText = `${val}%`;
                statEl.style.color = parseFloat(val) >= 0 ? '#0ecb81' : '#f6465d';
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
    const ohlc = await fetchHistoricalOHLC(sym, range, interval);
    if (!ohlc.length) { console.warn('[lwChart] no OHLC for', sym, range); return; }

    // Destroy old chart
    if (_lwChart) { _lwChart.remove(); _lwChart = null; _lwSeries = null; _lwVolume = null; }

    const w = container.clientWidth  || 600;
    const h = container.clientHeight || 400;
    _lwChart = LightweightCharts.createChart(container, {
        width: w, height: h,
        layout:   { background: { color: '#0b0e11' }, textColor: '#848e9c' },
        grid:     { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
        timeScale:      { borderColor: '#1e2430', timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
        rightPriceScale:{ borderColor: '#1e2430', scaleMargins: { top: 0.08, bottom: 0.28 } },
        crosshair: { mode: 1 },
    });
    // Keep chart sized to container on window resize
    new ResizeObserver(() => {
        if (_lwChart && container.clientWidth && container.clientHeight)
            _lwChart.resize(container.clientWidth, container.clientHeight);
    }).observe(container);

    _lwSeries = _lwChart.addCandlestickSeries({
        upColor: '#0ecb81', downColor: '#f6465d',
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

    // Update header with last close + range %
    const last  = ohlc[ohlc.length - 1];
    const first = ohlc[0];
    const pct   = first?.close ? (((last.close - first.close) / first.close) * 100).toFixed(2) : null;
    const prEl  = document.getElementById('main-chart-price');
    const pcEl  = document.getElementById('main-chart-pct');
    if (prEl) prEl.textContent = last ? `₪${last.close.toFixed(2)}` : '';
    if (pcEl && pct !== null) {
        const up = parseFloat(pct) >= 0;
        pcEl.textContent = `${up ? '+' : ''}${pct}%`;
        pcEl.style.color = up ? '#0ecb81' : '#f6465d';
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

function getIndexChartData(tf) {
    const idx = stocksData["מדד תא-35"];
    if (!idx?.price) return null;
    // D: use 5-day historical closes (not the live-push array which is flat when market closed)
    if (tf === 'daily')   return idx.historyWeek?.length   ? [...idx.historyWeek]   : null;
    if (tf === 'weekly')  return idx.historyMonth?.length  ? [...idx.historyMonth]  : null;
    if (tf === 'monthly') return idx.history3Month?.length ? [...idx.history3Month] : null;
    return idx.history3Month?.length ? [...idx.history3Month] : null;
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
    const color = parseFloat(pct) >= 0 ? '#0ecb81' : '#f6465d';
    const sign  = parseFloat(pct) >= 0 ? '+' : '';

    if (priceEl) priceEl.textContent = price.toLocaleString(undefined, { minimumFractionDigits: 2 });
    if (pctEl)   { pctEl.textContent = `${sign}${pct}%`; pctEl.style.color = color; }
    if (ptsEl)   { ptsEl.textContent = `(${sign}${pts})`; ptsEl.style.color = color; }
}

function drawIndexChart(tf = currentTf) {
    updateTA35Stats();
    const canvas = document.getElementById('indexChart');
    if (!canvas) return;

    const idx = stocksData["מדד תא-35"];

    // Don't touch the chart until we have real data — avoids Y-axis being
    // locked to 0 from the initial placeholder render.
    if (!idx?.price) return;

    const data = getIndexChartData(tf);
    if (!data || data.length < 2) {
        if (tf !== 'daily') fetchAndStoreHistory("מדד תא-35", tf);
        return;
    }

    const first = data[0];
    const last  = data[data.length - 1];
    const lineColor = last >= first ? '#0ecb81' : '#f6465d';
    const fillColor = last >= first ? 'rgba(14,203,129,0.1)' : 'rgba(246,70,93,0.1)';

    // Destroy stale chart if it was built before real data arrived
    if (indexChart && indexChart._builtWithNoData) {
        indexChart.destroy();
        indexChart = null;
    }

    if (indexChart) {
        indexChart.data.labels = new Array(data.length).fill('');
        indexChart.data.datasets[0].data = data;
        indexChart.data.datasets[0].borderColor = lineColor;
        indexChart.data.datasets[0].backgroundColor = fillColor;
        indexChart.update('none');
    } else {
        indexChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: new Array(data.length).fill(''),
                datasets: [{ data, borderColor: lineColor, backgroundColor: fillColor, borderWidth: 2, pointRadius: 0, fill: true, tension: 0.4 }]
            },
            options: {
                animation: false, maintainAspectRatio: false, responsive: true,
                plugins: { legend: { display: false } },
                scales: { x: { display: false }, y: { beginAtZero: false, display: false, afterDataLimits: s => { const mid = (s.max + s.min) / 2, span = mid * 0.008; if (s.max - s.min < span) { s.min = mid - span / 2; s.max = mid + span / 2; } } } }
            }
        });
        indexChart._builtWithNoData = false;
    }
}

function updateTimeframe(tf) {
    currentTf = tf;
    document.querySelectorAll('#index-tf-btns button').forEach(b => b.classList.remove('active'));
    const map = { daily: 0, weekly: 1, monthly: 2, '3months': 3 };
    const btns = document.querySelectorAll('#index-tf-btns button');
    if (btns[map[tf]]) btns[map[tf]].classList.add('active');
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
        const color = up ? '#0ecb81' : '#f6465d';
        const arrow = up ? '▲' : '▼';
        const priceStr = price > 0 ? `₪${price.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
        const tr = document.createElement('tr');
        tr.className = 'stock-row';
        tr.innerHTML = `
            <td class="text-right" style="font-size:0.72rem">${name}</td>
            <td class="text-right font-mono" style="font-size:0.72rem;color:#c9d1d9" dir="ltr">${priceStr}</td>
            <td class="pct-col" style="color:${color}"><span dir="ltr" class="inline-block">${up ? '+' : ''}${pct}%${arrow}</span></td>`;
        tr.onclick = () => { currentStock = name; _lwStock = null; drawChart(); openStockWindow(name); };
        list.appendChild(tr);
    });
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
        const tr = document.createElement('tr');
        tr.className = 'stock-row';
        tr.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON') { currentStock = symbol; _lwStock = null; drawChart(); openStockWindow(symbol); }
        };
        tr.innerHTML = `
            <td>${symbol}</td>
            <td class="pct-col" style="color: ${parseFloat(totalPct) >= 0 ? '#0ecb81' : '#f6465d'}"><span dir="ltr" class="inline-block">${totalPct}%</span></td>
            <td class="pct-col" style="color: ${parseFloat(dayPct) >= 0 ? '#0ecb81' : '#f6465d'}"><span dir="ltr" class="inline-block">${dayPct}%</span></td>
            <td><span dir="ltr" class="inline-block">₪${positionValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></td>
            <td><button class="sell-btn" onclick="sellStock('${symbol}')">Sell</button></td>`;
        list.appendChild(tr);
    });

    const totalPL = totalCost > 0 ? calculatePctChange(totalValue, totalCost) : "0.00";
    const color = parseFloat(totalPL) >= 0 ? '#0ecb81' : '#f6465d';
    totalDisplay.innerHTML = `<span dir="ltr" class="inline-block">₪${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span> <span style="color: ${color}" dir="ltr" class="inline-block">(${totalPL}%)</span>`;
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

function buyStock() {
    const symbol = document.getElementById('sim-symbol').value.trim();
    const qty    = parseInt(document.getElementById('sim-qty').value);
    if (!stocksData[symbol] || isNaN(qty) || qty <= 0) return;
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
}

// ── Init ───────────────────────────────────────────────────────────────────

let highestZIndex = 100;

document.addEventListener('DOMContentLoaded', () => {
    try { initWindowManager(); } catch(e) { console.error("Window manager failed:", e); }

    initTicker(); updateStockList(); updatePortfolioList();
    drawChart(); drawIndexChart();

    document.getElementById('buy-btn').onclick      = buyStock;
    document.getElementById('sell-btn-sim').onclick = sellStockSim;
    document.getElementById('refresh-btn').onclick  = () => refreshRealData();

    applyMarketStatus(isMarketOpen() ? 'REGULAR' : 'CLOSED'); // initial guess; server corrects on first fetch
    refreshRealData().then(loadSessionHistory);
    scheduleFetch();

    // Refresh intraday session bars every 5 minutes
    setInterval(loadSessionHistory, 5 * 60 * 1000);
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

        const startX = e.clientX;
        const startY = e.clientY;
        const startW = el.offsetWidth;
        const startH = el.offsetHeight;

        function onMouseMove(moveEvent) {
            const newW = Math.max(160, startW + (moveEvent.clientX - startX));
            const newH = Math.max(100, startH + (moveEvent.clientY - startY));
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


let _aiHistory = [];

function addAIMessage(role, text) {
    const box = document.getElementById('ai-messages');
    const div = document.createElement('div');
    const isUser = role === 'user';
    div.style.cssText = `display:flex;justify-content:${isUser ? 'flex-end' : 'flex-start'};margin:2px 0`;
    div.innerHTML = `<div style="max-width:85%;padding:4px 8px;border-radius:8px;font-size:10px;line-height:1.5;white-space:pre-wrap;
        background:${isUser ? '#1a3a5c' : '#1e2430'};color:${isUser ? '#87ceeb' : '#b7bdc6'};
        border:1px solid ${isUser ? '#274d73' : '#2b3139'}">${text}</div>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
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
        const reply = data.reply || data.error || 'אין תשובה';
        _aiHistory.push({ role: 'assistant', content: reply });
        addAIMessage('assistant', reply);
    } catch (e) {
        document.getElementById('ai-thinking')?.remove();
        addAIMessage('assistant', 'שגיאה: ' + e.message);
    } finally {
        btn.disabled = false;
        input.focus();
    }
}

function clearAIChat() {
    _aiHistory = [];
    document.getElementById('ai-messages').innerHTML = '';
}
