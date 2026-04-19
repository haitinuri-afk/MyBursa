const STORAGE_KEY = 'trading_station_pro_data';


// Yahoo Finance ticker symbols for each Hebrew stock name
const STOCK_SYMBOLS = {
    "מדד תא-35":    "^TA35",
    "לאומי":        "LUMI.TA",
    "פועלים":       "POLI.TA",
    "אלביט":        "ESLT.TA",
    "נייס":         "NICE.TA",
    "טבע":          "TEVA.TA",
    "שטראוס":       "STRS.TA",
    "שופרסל":       "SAE.TA",
    "פוקס":         "FOX.TA",
    "עזריאלי":      "AZRG.TA",
    "מליסרון":      "MLSR.TA",
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

function saveState() {
    try {
        const state = { portfolio, transactionHistory, indicesData };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

// Hardcoded prices removed — all values come from live API only
const STOCK_NAMES = Object.keys(STOCK_SYMBOLS);

const savedState = loadState();
// stocksData is never restored from cache; always populated by refreshRealData()
let stocksData = {};
STOCK_NAMES.forEach(name => {
    stocksData[name] = { price: 0, initial: 0, baseWeek: 0, baseMonth: 0, base3Month: 0, history: [], historyWeek: [], historyMonth: [], history3Month: [], trend: 0 };
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


let portfolio = (savedState && savedState.portfolio) ? savedState.portfolio : {};
let transactionHistory = (savedState && savedState.transactionHistory) ? savedState.transactionHistory : [];

let fetchInterval = null;
let lastMarketOpen = null;

let currentStock = "מדד תא-35";
let myChart = null;
let mainChartData = [];
let indexChart = null;
let modalChart = null;
let currentModalStock = null;
let currentModalTf = 'day';
let currentTf = 'daily';
let currentMainTf = 'daily';

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
    for (const name of [...new Set([currentStock, "מדד תא-35"])]) {
        const sym = STOCK_SYMBOLS[name];
        if (!sym) continue;
        const c = await fetchHistoricalCloses(sym, '1d', '5m');
        if (c.length > 5) {
            stocksData[name].history = c;
            if (name === currentStock) drawChart();
            if (name === "מדד תא-35") drawIndexChart();
        }
    }
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
    applyMarketStatus(marketState);

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

function getMainChartData(stockName, tf) {
    const stock = stocksData[stockName];
    if (tf === 'daily')   return stock.history.length ? [...stock.history, parseFloat(stock.price)] : [parseFloat(stock.price)];
    if (tf === 'weekly')  return stock.historyWeek?.length  ? [...stock.historyWeek]  : null;
    if (tf === 'monthly') return stock.historyMonth?.length ? [...stock.historyMonth] : null;
    return stock.history3Month?.length ? [...stock.history3Month] : null;
}

function drawChart() {
    const canvas = document.getElementById('stockChart');
    if (!canvas) return;
    const stockName = currentStock || Object.keys(stocksData)[0];
    const stock = stocksData[stockName];
    if (!stock) return;

    document.getElementById('main-chart-title').innerText = stockName;
    const data = getMainChartData(stockName, currentMainTf);

    if (!data || data.length < 2) {
        if (currentMainTf !== 'daily') fetchAndStoreHistory(stockName, currentMainTf);
        return;
    }

    if (!myChart) {
        myChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: new Array(data.length).fill(''),
                datasets: [{ label: stockName, data, borderColor: '#f0b90b', backgroundColor: 'rgba(240, 185, 11, 0.1)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 3 }]
            },
            options: {
                animation: false, maintainAspectRatio: false, responsive: true,
                plugins: { legend: { display: false } },
                scales: { x: { display: false }, y: { beginAtZero: false, grid: { color: 'rgba(255,255,255,0.05)' }, afterDataLimits: s => { const mid = (s.max + s.min) / 2, span = mid * 0.008; if (s.max - s.min < span) { s.min = mid - span / 2; s.max = mid + span / 2; } } } }
            }
        });
    } else {
        myChart.data.datasets[0].label = stockName;
        myChart.data.datasets[0].data = data;
        myChart.data.labels = new Array(data.length).fill('');
        myChart.update('none');
    }
}

function updateMainTimeframe(tf) {
    currentMainTf = tf;
    document.querySelectorAll('#main-tf-btns button').forEach(b => b.classList.remove('active'));
    const map = { daily: 0, weekly: 1, monthly: 2, '3months': 3 };
    const btns = document.querySelectorAll('#main-tf-btns button');
    if (btns[map[tf]]) btns[map[tf]].classList.add('active');
    if (myChart) { myChart.destroy(); myChart = null; }
    drawChart();
}

function getIndexChartData(tf) {
    const idx = stocksData["מדד תא-35"];
    if (!idx?.price) return null;
    if (tf === 'daily')   return idx.history.length     ? [...idx.history]      : null;
    if (tf === 'weekly')  return idx.historyWeek?.length  ? [...idx.historyWeek]  : null;
    if (tf === 'monthly') return idx.historyMonth?.length ? [...idx.historyMonth] : null;
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
        const pct = calculatePctChange(parseFloat(stock.price), stock.initial);
        const color = parseFloat(pct) >= 0 ? '#0ecb81' : '#f6465d';
        const arrow = parseFloat(pct) >= 0 ? '▲' : '▼';
        const tr = document.createElement('tr');
        tr.className = 'stock-row';
        tr.innerHTML = `<td>${name}</td><td class="pct-col" style="color: ${color}"><span dir="ltr" class="inline-block">${parseFloat(pct) >= 0 ? '+' : ''}${pct}%${arrow}</span></td>`;
        tr.onclick = () => { currentStock = name; drawChart(); openStockWindow(name); };
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
            if (e.target.tagName !== 'BUTTON') { currentStock = symbol; drawChart(); openStockWindow(symbol); }
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
    saveState();
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
    if (winId === 'win-main-chart'   && myChart)    myChart.resize();
    const nameMatch = winId.match(/win-detail-(.+)/);
    if (nameMatch && activeStockWindows[nameMatch[1]]) {
        activeStockWindows[nameMatch[1]].chart.resize();
    }
}

function resetWindows() {
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => { card.removeAttribute('style'); card.classList.remove('maximized'); });
    if (indexChart) indexChart.resize();
    if (myChart)    myChart.resize();
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
