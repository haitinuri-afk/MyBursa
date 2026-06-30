const STORAGE_KEY   = 'trading_station_pro_data_v2';
const PORTFOLIO_KEY = 'trading_station_portfolio';

// ── Toast notifications ────────────────────────────────────────────────────
function showToast(msg, { duration = 3000, color = '#1db954' } = {}) {
    let el = document.getElementById('_app-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = '_app-toast';
        el.style.cssText = [
            'position:fixed',
            'top:calc(18px + env(safe-area-inset-top, 0px))',
            'left:50%',
            '-webkit-transform:translateX(-50%) translateY(-80px)',
            'transform:translateX(-50%) translateY(-80px)',
            'background:rgba(20,20,35,0.92)',
            'color:#fff',
            'padding:10px 22px',
            'border-radius:32px',
            'font-size:14px','font-weight:600',
            'white-space:nowrap','direction:rtl',
            'z-index:2147483647','pointer-events:none',
            'backdrop-filter:blur(12px)','-webkit-backdrop-filter:blur(12px)',
            'box-shadow:0 4px 24px rgba(0,0,0,.35)',
            '-webkit-transition:-webkit-transform .35s cubic-bezier(.34,1.56,.64,1)',
            'transition:transform .35s cubic-bezier(.34,1.56,.64,1)'
        ].join(';');
        document.documentElement.appendChild(el);
    }
    el.textContent = msg;
    el.style.borderBottom = `2px solid ${color}`;
    void el.offsetHeight;
    el.style.webkitTransform = 'translateX(-50%) translateY(0)';
    el.style.transform       = 'translateX(-50%) translateY(0)';
    clearTimeout(el._t);
    el._t = setTimeout(() => {
        el.style.webkitTransform = 'translateX(-50%) translateY(-80px)';
        el.style.transform       = 'translateX(-50%) translateY(-80px)';
    }, duration);
}


// ── TA-125 complete component list (local cache — updated from dataConstants.js) ──
// Format: { ticker, nameHe, nameEn, sector }
const TASE125_DATA = [
    // בנקים
    { ticker:'LUMI.TA', nameHe:'לאומי',              nameEn:'Bank Leumi',               sector:'בנקים' },
    { ticker:'POLI.TA', nameHe:'פועלים',              nameEn:'Bank Hapoalim',            sector:'בנקים' },
    { ticker:'DSCT.TA', nameHe:'דיסקונט',             nameEn:'Bank Discount',            sector:'בנקים' },
    { ticker:'MZTF.TA', nameHe:'מזרחי טפחות',         nameEn:'Mizrahi Tefahot',          sector:'בנקים' },
    { ticker:'FIBI.TA', nameHe:'הבינלאומי',           nameEn:'First International Bank', sector:'בנקים' },
    { ticker:'JBNK.TA', nameHe:'בנק ירושלים',         nameEn:'Bank of Jerusalem',        sector:'בנקים' },
    { ticker:'YAHV.TA', nameHe:'בנק יהב',             nameEn:'Bank Yahav',               sector:'בנקים' },
    { ticker:'BNKI.TA', nameHe:'אוצר החייל',           nameEn:'Otzar Ha-Hayal',           sector:'בנקים' },
    { ticker:'IBI.TA',  nameHe:'אי.בי.אי',             nameEn:'IBI Investment House',     sector:'פיננסים' },
    // ביטוח
    { ticker:'PHOE.TA', nameHe:'הפניקס',              nameEn:'Phoenix Holdings',         sector:'ביטוח' },
    { ticker:'HARL.TA', nameHe:'הראל',                nameEn:'Harel Insurance',          sector:'ביטוח' },
    { ticker:'CLIS.TA', nameHe:'כלל ביטוח',           nameEn:'Clal Insurance',           sector:'ביטוח' },
    { ticker:'MNRT.TA', nameHe:'מנורה מבטחים',        nameEn:'Menora Mivtachim',         sector:'ביטוח' },
    { ticker:'MGDL.TA', nameHe:'מגדל ביטוח',          nameEn:'Migdal Insurance',         sector:'ביטוח' },
    { ticker:'HKSH.TA', nameHe:'הכשרה ביטוח',         nameEn:'Hachshara Insurance',      sector:'ביטוח' },
    // טכנולוגיה
    { ticker:'ESLT.TA', nameHe:'אלביט',               nameEn:'Elbit Systems',            sector:'טכנולוגיה' },
    { ticker:'NICE.TA', nameHe:'נייס',                nameEn:'NICE Systems',             sector:'טכנולוגיה' },
    { ticker:'TSEM.TA', nameHe:'טאוור',               nameEn:'Tower Semiconductor',      sector:'טכנולוגיה' },
    { ticker:'NVMI.TA', nameHe:'נובה',                nameEn:'Nova Measuring',           sector:'טכנולוגיה' },
    { ticker:'KMDA.TA', nameHe:'קמהדע',               nameEn:'Camtek',                   sector:'טכנולוגיה' },
    { ticker:'CYBR.TA', nameHe:'סייבר-ארק',           nameEn:'CyberArk Software',        sector:'טכנולוגיה' },
    { ticker:'AURA.TA', nameHe:'אאורה',               nameEn:'Aura Smart Air',           sector:'טכנולוגיה' },
    { ticker:'GNRS.TA', nameHe:"ג'נריישן קפיטל",     nameEn:'Generation Capital',       sector:'טכנולוגיה' },
    { ticker:'SPNS.TA', nameHe:'ספיינס',              nameEn:'Sapiens International',    sector:'טכנולוגיה' },
    { ticker:'PERI.TA', nameHe:'פריון',               nameEn:'Perion Network',           sector:'טכנולוגיה' },
    { ticker:'ALLT.TA', nameHe:'אלוט',                nameEn:'Allot Communications',     sector:'טכנולוגיה' },
    { ticker:'SANO.TA', nameHe:'סנו',                 nameEn:'Sano Industries',          sector:'צריכה' },
    // פארמה / כימיה
    { ticker:'TEVA.TA', nameHe:'טבע',                 nameEn:'Teva Pharmaceutical',      sector:'פארמה' },
    { ticker:'ICL.TA',  nameHe:'כיל',                 nameEn:'ICL Group',                sector:'פארמה' },
    // נדל"ן
    { ticker:'AZRG.TA', nameHe:'עזריאלי',             nameEn:'Azrieli Group',            sector:'נדל"ן' },
    { ticker:'MLSR.TA', nameHe:'מליסרון',             nameEn:'Melisron',                 sector:'נדל"ן' },
    { ticker:'AMOT.TA', nameHe:'אמות',                nameEn:'Amot Investments',         sector:'נדל"ן' },
    { ticker:'BIG.TA',  nameHe:'ביג',                 nameEn:'Big Shopping Centers',     sector:'נדל"ן' },
    { ticker:'GVYM.TA', nameHe:'גב ים',               nameEn:'Gav-Yam',                  sector:'נדל"ן' },
    { ticker:'SKBN.TA', nameHe:'שיכון ובינוי',        nameEn:'Shikun & Binui',           sector:'נדל"ן' },
    { ticker:'RIT1.TA', nameHe:'ריט1',                nameEn:'Reit 1',                   sector:'נדל"ן' },
    { ticker:'AFI.TA', nameHe:'אפי נכסים',           nameEn:'Afikim Properties',        sector:'נדל"ן' },
    { ticker:'NBLD.TA', nameHe:'נכסים ובנין',         nameEn:'Nekhasim & Binyan',        sector:'נדל"ן' },
    { ticker:'ALRB.TA', nameHe:'אלרוב נדל"ן',         nameEn:'Alrov Real Estate',        sector:'נדל"ן' },
    { ticker:'GZT.TA',  nameHe:'גזית גלוב',           nameEn:'Gazit Globe',              sector:'נדל"ן' },
    { ticker:'MNIV.TA', nameHe:'מניב',                nameEn:'Mivne Real Estate',        sector:'נדל"ן' },
    { ticker:'ALHE.TA', nameHe:'אלוני חץ',            nameEn:'Alony-Hetz',               sector:'נדל"ן' },
    { ticker:'RBUA.TA', nameHe:'רבוע כחול נדל"ן',     nameEn:'Blue Square Real Estate',  sector:'נדל"ן' },
    // אנרגיה
    { ticker:'ENRG.TA', nameHe:"אנרג'יקס",           nameEn:'Energix',                  sector:'אנרגיה' },
    { ticker:'ENLT.TA', nameHe:'אנלייט',              nameEn:'Enlight Energy',           sector:'אנרגיה' },
    { ticker:'ORA.TA',  nameHe:'אורמת',               nameEn:'Ormat Technologies',       sector:'אנרגיה' },
    { ticker:'DLEKG.TA',nameHe:'קבוצת דלק',           nameEn:'Delek Group',              sector:'אנרגיה' },
    { ticker:'PZOL.TA', nameHe:'פז נפט',              nameEn:'Paz Oil',                  sector:'אנרגיה' },
    { ticker:'DCRB.TA', nameHe:'דלק רכב',             nameEn:'Delek Automotive',         sector:'אנרגיה' },
    { ticker:'DLKR.TA', nameHe:'דלק קידוחים',         nameEn:'Delek Drilling',           sector:'אנרגיה' },
    { ticker:'OPCE.TA', nameHe:'OPC אנרגיה',          nameEn:'OPC Energy',               sector:'אנרגיה' },
    // תקשורת
    { ticker:'BEZQ.TA', nameHe:'בזק',                 nameEn:'Bezeq',                    sector:'תקשורת' },
    { ticker:'CEL.TA',  nameHe:'סלקום',               nameEn:'Cellcom',                  sector:'תקשורת' },
    { ticker:'PTNR.TA', nameHe:'פרטנר',               nameEn:'Partner Communications',   sector:'תקשורת' },
    // קמעונאות / מזון
    { ticker:'STRS.TA', nameHe:'שטראוס',              nameEn:'Strauss Group',            sector:'צריכה' },
    { ticker:'SAE.TA',  nameHe:'שופרסל',              nameEn:'Shufersal',                sector:'צריכה' },
    { ticker:'FOX.TA',  nameHe:'פוקס',                nameEn:'Fox Fashion',              sector:'צריכה' },
    { ticker:'RMLI.TA', nameHe:'רמי לוי',             nameEn:'Rami Levy',                sector:'צריכה' },
    { ticker:'ELCO.TA', nameHe:'אלקטרה מוצרים',       nameEn:'Electra Consumer Products',sector:'צריכה' },
    // תעשייה / שונות
    { ticker:'ELTR.TA', nameHe:'אלקטרה',              nameEn:'Electra',                  sector:'תעשייה' },
    { ticker:'DISI.TA', nameHe:'דיסקאונט השקעות',     nameEn:'Discount Investments',     sector:'תעשייה' },
    { ticker:'CRSO.TA', nameHe:'קרסו מוטורס',         nameEn:'Carasso Motors',           sector:'תעשייה' },
    { ticker:'ELAL.TA', nameHe:'אל על',               nameEn:'El Al Airlines',           sector:'תחבורה' },
    { ticker:'ILCO.TA', nameHe:'ישראל קורפ',          nameEn:'Israel Corporation',       sector:'תעשייה' },
];

// Fast lookup: nameHe → ticker  (built once from TASE125_DATA)
const _t125ByName   = Object.fromEntries(TASE125_DATA.map(s => [s.nameHe,   s]));
const _t125ByTicker = Object.fromEntries(TASE125_DATA.map(s => [s.ticker,   s]));

// Yahoo Finance ticker symbols for each Hebrew stock name
// (superset: TASE125 stocks + indices + any portfolio-only additions)
const STOCK_SYMBOLS = Object.fromEntries([
    // מדדים
    ['מדד תא-35', '^TA35'], ['מדד תא-90', '^TA90'], ['מדד תא-125', '^TA100'],
    // TA-125 stocks — generated from TASE125_DATA
    ...TASE125_DATA.map(s => [s.nameHe, s.ticker]),
]);

const TASE_MAP = { "^TA35": "מדד תא-35", "^TA100": "מדד תא-125", "^TA90": "מדד תא-90" };

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
    // Try server up to 3 times (MongoDB may not be ready immediately on cold start)
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
            const res = await fetch('/api/portfolio');
            if (res.ok) {
                const data = await res.json();
                if (data.portfolio && Object.keys(data.portfolio).length > 0) return data;
            }
        } catch(e) { break; } // network error — stop retrying
    }
    // Fallback: use localStorage as read-only view (never push back to server)
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
            if (d.price > 0) prices[name] = { price: d.price };   // initial always from server, never cache
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
const _rawIndicesData = savedState?.indicesData ?? {};
const _defIdx = _defaultIndicesData();
// Merge: ensure all three keys exist even if savedState is from an older version
const indicesData = {
    ..._defIdx,
    ..._rawIndicesData,
    // Guarantee מדד תא-125 exists (was added later, may be missing in old saves)
    "מדד תא-125": _rawIndicesData["מדד תא-125"] ?? _defIdx["מדד תא-125"],
};

// Pre-populate stocksData from last saved indicesData for instant display before live fetch
for (const idxName of ["מדד תא-35", "מדד תא-90", "מדד תא-125"]) {
    if (indicesData[idxName]?.price) Object.assign(stocksData[idxName], indicesData[idxName]);
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
    if (label) {
        const ilStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' });
        const [dp] = ilStr.split(' ');
        const [y, mo, d] = dp.split('-').map(Number);
        const day = new Date(y, mo-1, d).getDay();
        let txt = open ? 'מסחר רציף' : (day === 0 || day === 6 ? 'סוף שבוע' : 'סגור');
        label.textContent = txt;
        label.style.color = color;
    }
    const pill = document.getElementById('market-status-pill');
    if (pill) {
        pill.style.background = open ? 'rgba(22,163,74,0.08)' : 'rgba(239,68,68,0.08)';
        pill.style.borderColor = open ? 'rgba(22,163,74,0.3)' : 'rgba(239,68,68,0.3)';
    }
    const badge = document.getElementById('ta35-status');
    if (badge) badge.textContent = '';
    const statusEl = document.getElementById('data-status');
    if (statusEl) statusEl.classList.toggle('idle-mode', !open);
}

async function loadSessionHistory() {
    // Index chart: load OHLC for LightweightCharts
    const idxSym = STOCK_SYMBOLS["מדד תא-35"];
    if (idxSym) {
        const { ohlc: ohlc5d } = await fetchHistoricalOHLC(idxSym, '1d', '5m');
        if (ohlc5d.length > 1) {
            stocksData["מדד תא-35"].ohlcWeek = ohlc5d;
        }
        // Always load 1mo daily — used as D-tab fallback when intraday is unavailable
        fetchHistoricalOHLC(idxSym, '1mo', '1d').then(({ ohlc: o }) => {
            if (o.length > 1) {
                stocksData["מדד תא-35"].ohlcMonth = o;
                // If intraday failed, use monthly data for the D tab
                if (!stocksData["מדד תא-35"].ohlcWeek?.length) {
                    stocksData["מדד תא-35"].ohlcWeek = o;
                }
                drawIndexChart('daily');
            }
        });
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
    return day >= 1 && day <= 5 && mins >= 585 && mins < 1050; // Mon–Fri 9:45–17:30
}

function scheduleFetch() {
    const open = isMarketOpen();

    if (lastMarketOpen === open && fetchInterval !== null) return;
    lastMarketOpen = open;

    clearInterval(fetchInterval);
    fetchInterval = setInterval(refreshRealData, open ? 15000 : 60000);
    console.log(`[Eco] Market ${open ? 'OPEN → 15s' : 'CLOSED → 60s'}`);
}

function setDataStatus(state, detail = '') {
    const el = document.getElementById('data-status');
    if (!el) return;
    if (state === 'error' && !isMarketOpen()) state = 'sim';
    const styles = {
        live:  { text: 'LIVE',  color: '#16a34a', bg: 'rgba(29,185,84,0.15)' },
        sim:   { text: detail || 'סגירה', color: '#5f6368', bg: '#f1f3f4' },
        error: { text: 'ERR',   color: '#dc2626', bg: 'rgba(234,67,53,0.12)' },
        fetch: { text: '...',   color: '#f0b90b', bg: 'rgba(240,185,11,0.10)' },
        wake:  { text: '⏳',    color: '#f0b90b', bg: 'rgba(240,185,11,0.10)' }
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
    // רק בטעינה ראשונה מציגים "..." — לא בכל רענון
    if (!window._lastQuotes?.length) setDataStatus('fetch', 'Fetching from Yahoo Finance…');

    const symbols = Object.values(STOCK_SYMBOLS);
    const quotes  = await fetchBatchPrices(symbols);

    if (quotes === null) {
        setDataStatus('wake', 'השרת מתעורר…');
        window._wasWaking   = true;
        window._wakeAttempts = (window._wakeAttempts || 0) + 1;
        // נסה כל 5 שניות עד 24 ניסיונות (120 שניות) — מספיק לכל cold-start של Render
        if (window._wakeAttempts <= 24) {
            setTimeout(refreshRealData, 5000);
        } else {
            window._wakeAttempts = 0;
            window._wasWaking    = false;
            setDataStatus('error', 'לא ניתן להתחבר — בדוק חיבור אינטרנט');
            scheduleFetch();
        }
        return;
    }
    if (window._wasWaking) showToast('✅ MyBursa מחובר ועדכני');
    window._wakeAttempts = 0;
    window._wasWaking    = false;

    const { marketState = 'CLOSED', quotes: quoteList } = quotes;
    window._lastQuotes = quoteList;
    // Local clock overrides Yahoo — if our schedule says closed, it's closed
    const effectiveState = isMarketOpen() ? marketState : 'CLOSED';
    applyMarketStatus(effectiveState);

    let liveCount = 0;
    quoteList.forEach(q => {
        const name = SYM_TO_NAME[q.symbol];
        if (!name || !stocksData[name]) return;
        if (!q.regularMarketPrice) return;

        stocksData[name].price   = q.regularMarketPrice;
        // Use server-computed prevClose; if changePercent provided, derive it exactly
        const pc = q.regularMarketPreviousClose;
        const pct = q.regularMarketChangePercent;
        stocksData[name].initial = pc
            ? pc
            : (pct != null ? q.regularMarketPrice / (1 + pct / 100) : q.regularMarketPrice);
        const nowSec = Math.floor(Date.now() / 1000);
        stocksData[name].history.push(stocksData[name].price);
        if (!stocksData[name].historyTs) stocksData[name].historyTs = [];
        stocksData[name].historyTs.push(nowSec);
        if (stocksData[name].history.length > 300) { stocksData[name].history.shift(); stocksData[name].historyTs.shift(); }
        liveCount++;
    });

    // Sync indicesData from live stocksData so it can be persisted
    for (const idxName of ["מדד תא-35", "מדד תא-90", "מדד תא-125"]) {
        const idx = stocksData[idxName];
        if (idx?.price) Object.assign(indicesData[idxName], {
            price: idx.price, initial: idx.initial,
            baseWeek: idx.baseWeek, baseMonth: idx.baseMonth, base3Month: idx.base3Month,
            history: [...idx.history]
        });
    }

    console.log(`[YF] Live: ${liveCount}/${symbols.length}`);
    const closeDate = new Date().toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'numeric', timeZone:'Asia/Jerusalem' });
    setDataStatus('sim', liveCount > 0 ? `סגירה ${closeDate}` : '');

    // Update last-fetch timestamp
    if (liveCount > 0) {
        const now = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const el = document.getElementById('last-update');
        if (el) el.textContent = `עודכן ${now}`;
        // Reset ticker on first successful fetch so all live symbols are included
        if (!window._tickerBuiltLive) { window._tickerBuiltLive = true; _tickerReady = false; }
    }

    initTicker(); initStockSuggestions(); updateStockList(); updateRealEstateList(); updatePortfolioList(); updateTransactionHistory();
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

// Sector badge colours
const _SECTOR_COLORS = {
    'בנקים':     '#1d4ed8', 'פיננסים': '#1d4ed8',
    'ביטוח':     '#7c3aed',
    'טכנולוגיה': '#0369a1',
    'פארמה':     '#059669',
    'נדל"ן':     '#d97706',
    'אנרגיה':    '#dc2626',
    'תקשורת':    '#6d28d9',
    'צריכה':     '#92400e',
    'תעשייה':    '#374151',
    'תחבורה':    '#0e7490',
};

function escAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function _sectorBadge(sector) {
    if (!sector) return '';
    const c = _SECTOR_COLORS[sector] ?? '#6b7280';
    return `<span style="font-size:8.5px;background:${c}18;color:${c};border:1px solid ${c}44;border-radius:3px;padding:1px 4px;white-space:nowrap">${sector}</span>`;
}

function stockAutocomplete(q) {
    const dd = document.getElementById('ac-dropdown');
    if (!dd) return;
    const query  = q.trim();
    const ql     = query.toLowerCase();

    // Search TASE125_DATA (Hebrew name, English name, ticker)
    let hits = query.length === 0
        ? TASE125_DATA.slice(0, 10)
        : TASE125_DATA.filter(s =>
            s.nameHe.includes(query) ||
            s.nameEn.toLowerCase().includes(ql) ||
            s.ticker.toLowerCase().includes(ql) ||
            s.sector.includes(query)
          ).slice(0, 12);

    // Fallback: also check STOCK_SYMBOLS names not in TASE125_DATA (indices)
    if (hits.length < 6) {
        const extra = Object.keys(STOCK_SYMBOLS)
            .filter(n => !_t125ByName[n] && (n.includes(query) || (STOCK_SYMBOLS[n]||'').toLowerCase().includes(ql)))
            .slice(0, 4 - hits.length)
            .map(n => ({ nameHe: n, ticker: STOCK_SYMBOLS[n], nameEn: '', sector: 'מדד' }));
        hits = [...hits, ...extra];
    }

    if (!hits.length) { dd.style.display = 'none'; return; }
    _acIndex = -1;
    dd.innerHTML = hits.map((s, i) => {
        const livePrice = stocksData[s.nameHe]?.price;
        const priceTag  = livePrice ? `<span style="color:#374151;font-size:10px;font-family:monospace">₪${parseFloat(livePrice).toFixed(2)}</span>` : '';
        return `<div class="ac-item" data-name="${escAttr(s.nameHe)}" data-ticker="${escAttr(s.ticker)}" data-i="${i}"
            style="padding:6px 10px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:12px;border-bottom:1px solid rgba(0,0,0,0.05)"
            onmousedown="selectAutocomplete(this.dataset.name)">
            <div style="flex:1;min-width:0">
                <div style="font-weight:700;direction:rtl">${s.nameHe}</div>
                <div style="font-size:9.5px;color:#9aa0a6">${s.nameEn}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
                ${_sectorBadge(s.sector)}
                <span style="font-size:9px;color:#9aa0a6;font-family:monospace">${s.ticker}</span>
                ${priceTag}
            </div>
        </div>`;
    }).join('');
    dd.style.display = 'block';
}

function selectAutocomplete(name) {
    const inp  = document.getElementById('sim-symbol');
    const dd   = document.getElementById('ac-dropdown');
    if (inp) { inp.value = name; inp.dispatchEvent(new Event('change')); }
    if (dd)  dd.style.display = 'none';
    // Auto-detect agurot for TASE stocks (price > 200 usually means agurot quoted)
    const meta = _t125ByName[name];
    if (meta) {
        const priceUnitEl = document.getElementById('ms-price-unit');
        if (priceUnitEl) {
            // TASE stocks priced in agurot when buyPrice input > 200
            priceUnitEl.value = 'NIS'; // default; user can override
        }
    }
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

function openMobChart() {
    const card = document.getElementById('win-main-chart');
    const bd   = document.getElementById('mob-chart-backdrop');
    if (!card) return;
    card.classList.add('mob-chart-open');
    if (bd) bd.style.display = 'block';
    // Resize chart after sheet is painted
    setTimeout(() => {
        const body = card.querySelector('.card-body');
        const w = window.innerWidth;
        const h = body ? body.clientHeight : 280;
        if (_lwChart && w && h) _lwChart.resize(w, h);
    }, 80);
}

function closeMobChart() {
    const card = document.getElementById('win-main-chart');
    const bd   = document.getElementById('mob-chart-backdrop');
    if (card) card.classList.remove('mob-chart-open');
    if (bd)   bd.style.display = 'none';
}

function openStockWindow(name) {
    // On mobile: show bottom-sheet chart
    if (window.innerWidth <= 768) { openMobChart(); return; }

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
                <button onclick="closeStockWindow('${name}')" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text3);line-height:1;padding:2px 4px">✕</button>
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
            // Refresh perf tab if open
            if (document.getElementById('itab-content-perf')?.style.display !== 'none') renderPerformanceTabClient();
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
    const isIntraday = currentMainTf === 'intraday';
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
    // _fmtTick: for intraday → HH:MM; for daily+ → handled by LW business-day scale (tickMarkFormatter not needed)
    const _fmtTick = isIntraday
        ? function(t) { var d = new Date(t * 1000); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); }
        : undefined;
    const isMob = window.innerWidth <= 768;
    const scaleMarginBottom = isMob ? 0.04 : 0.26;
    const mobBg  = '#ffffff';
    const mobTx  = '#374151';
    const mobGV  = 'rgba(0,0,0,0.03)';
    const mobGH  = 'rgba(0,0,0,0.05)';
    _lwChart = LightweightCharts.createChart(container, {
        width: w, height: h,
        layout:   { background: { color: isMob ? mobBg : chartBg }, textColor: isMob ? mobTx : chartTx },
        grid:     { vertLines: { color: isMob ? mobGV : gridV }, horzLines: { color: isMob ? mobGH : gridH } },
        localization: { timeFormatter: _fmtTick },
        timeScale:      { borderColor: 'rgba(0,0,0,0.06)', timeVisible: isIntraday, secondsVisible: false, fixRightEdge: true, tickMarkFormatter: _fmtTick },
        rightPriceScale:{ borderColor: 'rgba(0,0,0,0.06)', scaleMargins: { top: 0.08, bottom: scaleMarginBottom } },
        crosshair: { mode: 1, vertLine: { labelVisible: false }, horzLine: { labelVisible: true } },
    });
    // Singleton ResizeObserver — disconnect old one before creating a new one
    if (_lwResizeOb) { _lwResizeOb.disconnect(); _lwResizeOb = null; }
    _lwResizeOb = new ResizeObserver(() => {
        if (_lwChart && container.clientWidth && container.clientHeight)
            _lwChart.resize(container.clientWidth, container.clientHeight);
    });
    _lwResizeOb.observe(container);

    if (isMob) {
        // Mobile: area chart — clean, modern
        const isUp = (ohlc[ohlc.length-1]?.close ?? 0) >= (prevClose ?? 0);
        const lineColor  = isUp ? '#1a73e8' : '#e53935';
        const topColor   = isUp ? 'rgba(26,115,232,0.18)' : 'rgba(229,57,53,0.15)';
        _lwSeries = _lwChart.addAreaSeries({
            lineColor, topColor, bottomColor: 'rgba(0,0,0,0)',
            lineWidth: 2, priceLineVisible: true,
            priceLineColor: lineColor, priceLineWidth: 1,
            crosshairMarkerRadius: 5, crosshairMarkerBorderColor: '#fff',
            crosshairMarkerBackgroundColor: lineColor,
        });
        _lwSeries.setData(ohlc.map(d => ({ time: d.time, value: d.close })));
    } else {
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
    }

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
    if (tf === 'daily')   return idx.ohlcWeek?.length   ? idx.ohlcWeek   : (idx.ohlcMonth?.length ? idx.ohlcMonth : null);
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

    // Detect whether this dataset uses intraday (number) or daily (string) times
    const idxIntraday = typeof ohlc[0].time === 'number';

    // Shift intraday timestamps to IDT (UTC+3) so LightweightCharts day-boundary
    // lands at midnight Israel time, not midnight UTC
    const IDT = 3 * 3600;
    const fmtIdx = idxIntraday
        ? (t, markType) => {
            const d = new Date(t * 1000); // already IDT-shifted
            if (markType <= 2) return ('0'+d.getUTCDate()).slice(-2)+'/'+('0'+(d.getUTCMonth()+1)).slice(-2);
            return ('0'+d.getUTCHours()).slice(-2)+':'+('0'+d.getUTCMinutes()).slice(-2);
          }
        : undefined;

    // Recreate chart only when switching between intraday ↔ daily
    const prevIntraday = _idxChart?._isIntraday;
    const needsRecreate = !_idxChart || prevIntraday !== idxIntraday;
    if (needsRecreate) {
        if (_idxChart) { _idxChart.remove(); _idxChart = null; _idxSeries = null; }
        const cw = container.clientWidth  || container.parentElement?.clientWidth  || 300;
        const ch = container.clientHeight || container.parentElement?.clientHeight || 200;
        _idxChart = LightweightCharts.createChart(container, {
            width:  cw,
            height: ch,
            layout:   { background: { color: '#ffffff' }, textColor: '#5f6368' },
            grid:     { vertLines: { color: 'rgba(0,0,0,0.04)' }, horzLines: { color: 'rgba(0,0,0,0.06)' } },
            timeScale:       { borderColor: '#1e2430', timeVisible: idxIntraday, secondsVisible: false, tickMarkFormatter: fmtIdx },
            rightPriceScale: { borderColor: '#1e2430', scaleMargins: { top: 0.08, bottom: 0.06 }, autoScale: true },
            crosshair: { mode: 1, vertLine: { labelVisible: false }, horzLine: { labelVisible: true } },
        });
        _idxChart._isIntraday = idxIntraday;
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

    const closes = ohlc.map(d => d.close);
    const minClose = Math.min(...closes);
    _idxSeries.applyOptions({ baseValue: { type: 'price', price: minClose } });
    const shift = idxIntraday ? IDT : 0;
    const chartData = ohlc.map(d => ({ time: idxIntraday ? d.time + shift : d.time, value: d.close }));
    if (idxIntraday) {
        const nowUTC = Math.floor(Date.now() / 1000);
        const todayMidnightUTC = Math.floor(nowUTC / 86400) * 86400;
        const marketCloseShifted = todayMidnightUTC + 17 * 3600 + 30 * 60;
        const lastTime = chartData[chartData.length - 1].time;
        if (marketCloseShifted > lastTime)
            chartData.push({ time: marketCloseShifted }); // WhitespaceData to 17:30
    }
    _idxSeries.setData(chartData);
    if (needsRecreate) {
        _idxChart.priceScale('right').applyOptions({ autoScale: true });
        setTimeout(() => {
            if (_idxChart && container.clientWidth && container.clientHeight) {
                _idxChart.resize(container.clientWidth, container.clientHeight);
                if (!idxIntraday) _idxChart.timeScale().fitContent();
                else _idxChart.timeScale().setVisibleRange({
                    from: chartData[0].time,
                    to:   Math.floor(Date.now() / 1000) + IDT + 20 * 60
                });
            }
        }, 80);
    }
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
    if ((tf === 'monthly' || tf === '3months') && idxSym) {
        if (!idx?.ohlc3Month?.length) {
            const { ohlc } = await fetchHistoricalOHLC(idxSym, '3mo', '1d');
            if (ohlc?.length > 1) idx.ohlc3Month = ohlc;
        }
    }

    drawIndexChart(tf);
}

// ── List Renderers ─────────────────────────────────────────────────────────

let _pinnedStock = null;
let _stockShowAll = false;
const STOCK_LIST_LIMIT = 10;

function updateMiniIndicesBar() {
    const map = {
        'מדד תא-35':  { price: 'mini-ta35-price',  pct: 'mini-ta35-pct'  },
        'מדד תא-90':  { price: 'mini-ta90-price',  pct: 'mini-ta90-pct'  },
        'מדד תא-125': { price: 'mini-ta125-price', pct: 'mini-ta125-pct' },
    };
    Object.entries(map).forEach(([name, ids]) => {
        const s = stocksData[name];
        const prEl = document.getElementById(ids.price);
        const pcEl = document.getElementById(ids.pct);
        if (!prEl || !pcEl) return;
        if (!s?.price) { prEl.textContent = '—'; pcEl.textContent = '—'; pcEl.style.color = ''; return; }
        const pct = calculatePctChange(s.price, s.initial);
        const up  = parseFloat(pct) >= 0;
        prEl.textContent = `₪${s.price.toLocaleString('he-IL', {maximumFractionDigits:2})}`;
        pcEl.textContent = `${up ? '+' : ''}${pct}%`;
        pcEl.style.color = pctColor(pct).text;
    });
}

function updateStockList() {
    const list    = document.getElementById('stock-list');
    const showBtn = document.getElementById('stock-show-more-btn');
    if (!list) return;
    list.innerHTML = '';

    // Build ordered array: pinned first, then rest
    // Only show stocks with a live price or a portfolio position (hides TA-125 with no data)
    let names = Object.keys(stocksData).filter(n => (stocksData[n]?.price > 0) || !!portfolio[n]);
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
    updateMiniIndicesBar();
}


const REALESTATE_NAMES = ['עזריאלי','מליסרון','אמות','ביג','גב ים','שיכון ובינוי','ריט1'];

function updateRealEstateList() {
    const tbody = document.getElementById('realestate-list');
    if (!tbody) return;
    tbody.innerHTML = '';
    REALESTATE_NAMES.forEach(name => {
        const stock = stocksData[name];
        if (!stock) return;
        const price = parseFloat(stock.price);
        const pct   = calculatePctChange(price, stock.initial);
        const up    = parseFloat(pct) >= 0;
        const priceStr = price > 0 ? `₪${price.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
        const tr = document.createElement('tr');
        tr.className = 'stock-row';
        tr.innerHTML = `
            <td class="text-right" style="font-size:0.82rem;color:#202124;white-space:nowrap;cursor:pointer">${name}</td>
            <td class="text-right" style="font-size:0.82rem;color:#202124;font-variant-numeric:tabular-nums;white-space:nowrap" dir="ltr">${priceStr}</td>
            <td class="pct-col"><span dir="ltr" class="inline-block" style="color:${pctColor(pct).text};background:${pctColor(pct).bg};padding:2px 8px;border-radius:20px;font-size:0.76rem;font-weight:700">${up ? '+' : ''}${pct}%</span></td>
            <td class="text-center"><button onclick="event.stopPropagation();quickBuy('${name}')" style="background:#16a34a;color:#fff;border:none;border-radius:4px;font-size:9px;font-weight:700;padding:2px 5px;cursor:pointer">קנה</button></td>`;
        tr.onclick = () => { currentStock = name; _lwStock = null; drawChart(); openStockWindow(name); };
        tbody.appendChild(tr);
    });
}

function _txRow(tx) {
    const isBuy = tx.action === 'Buy';
    const c = isBuy ? '#16a34a' : '#dc2626';
    return `<tr class="tx-row">
        <td class="tx-time">${tx.time}</td>
        <td class="tx-action" style="color:${c}">${isBuy ? 'קנייה' : 'מכירה'}</td>
        <td class="tx-symbol">${tx.symbol ?? tx.name ?? ''}</td>
        <td class="tx-qty" dir="ltr">${tx.qty}</td>
        <td class="tx-price" dir="ltr">₪${tx.price}</td>
    </tr>`;
}

function updateTransactionHistory() {
    // Show only the latest transaction in the card
    const latest = document.getElementById('tx-latest');
    if (latest) { latest.style.display = 'none';
        const tx = transactionHistory[0];
        if (tx) {
            const isBuy = tx.action === 'Buy';
            const c = isBuy ? '#16a34a' : '#dc2626';
            latest.innerHTML = `
            <div onclick="openTxModal()" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:var(--surface);cursor:pointer;border:1px solid rgba(5,150,105,0.15)">
                <span style="font-size:15px">${isBuy ? '🟢' : '🔴'}</span>
                <div style="flex:1;min-width:0">
                    <span style="font-weight:600;color:#111;font-size:12px">${tx.symbol ?? tx.name ?? ''}</span>
                    <span style="color:${c};font-size:11px;margin-right:6px">${isBuy ? 'קנייה' : 'מכירה'} ${tx.qty}</span>
                    <span style="color:#9ca3af;font-size:11px">₪${tx.price}</span>
                </div>
                <span style="color:#9ca3af;font-size:11px">${tx.time}</span>
                <span style="color:#9ca3af;font-size:12px">›</span>
            </div>`;
        } else {
            latest.innerHTML = `<div style="text-align:center;color:#9ca3af;font-size:12px;padding:8px">אין עסקאות</div>`;
        }
    }
    // Fill modal table
    const tbody = document.getElementById('tx-history-list');
    if (tbody) tbody.innerHTML = transactionHistory.map(_txRow).join('');
}

function openTxModal() {
    const modal = document.getElementById('tx-modal');
    if (!modal) return;
    modal.style.display = 'block';
    modal.style.opacity = '0';
    modal.style.transform = 'translate(-50%,-50%) scale(0.95)';
    modal.style.transition = 'opacity 0.18s, transform 0.18s';
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modal.style.transform = 'translate(-50%,-50%) scale(1)';
    });
    _initFloatDrag(modal);
}
function closeTxModal() {
    const modal = document.getElementById('tx-modal');
    if (!modal) return;
    modal.style.transition = 'opacity 0.15s, transform 0.15s';
    modal.style.opacity = '0';
    modal.style.transform = (modal.style.transform.includes('translate(') && !modal.style.transform.includes('-50%'))
        ? modal.style.transform.replace('scale(1)', 'scale(0.95)')
        : 'translate(-50%,-50%) scale(0.95)';
    setTimeout(() => {
        modal.style.display = 'none';
        modal.style.top = '50%'; modal.style.left = '50%';
        modal.style.transform = 'translate(-50%,-50%)';
    }, 150);
}
function _initFloatDrag(modal) {
    const handle = document.getElementById('tx-drag-handle');
    if (!handle || handle._dragInit) return;
    handle._dragInit = true;
    let startX, startY, origLeft, origTop;
    const getPos = e => e.touches ? [e.touches[0].clientX, e.touches[0].clientY] : [e.clientX, e.clientY];
    const onStart = e => {
        if (e.target.tagName === 'BUTTON') return;
        const r = modal.getBoundingClientRect();
        [startX, startY] = getPos(e);
        origLeft = r.left;
        origTop  = r.top;
        modal.style.transition = 'none';
        modal.style.transform = 'none';
        modal.style.left = origLeft + 'px';
        modal.style.top  = origTop  + 'px';
        document.body.style.cursor = 'grabbing';
    };
    const onMove = e => {
        if (startX === undefined) return;
        const [cx, cy] = getPos(e);
        modal.style.left = (origLeft + cx - startX) + 'px';
        modal.style.top  = (origTop  + cy - startY) + 'px';
    };
    const onEnd = () => { startX = undefined; document.body.style.cursor = ''; };
    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);
}

function updatePortfolioList() {
    _analysisLoaded = false;
    setTimeout(initPortfolioAnalytics, 500);
    const list = document.getElementById('portfolio-list');
    const totalDisplay = document.getElementById('total-portfolio-value');
    if (!list || !totalDisplay) return;
    list.innerHTML = "";
    let totalValue = 0, totalCost = 0, openValue = 0, openCount = 0, totalDailyPL = 0;
    const mobCards = document.getElementById('mob-ptf-cards');
    if (mobCards) mobCards.innerHTML = '';

    Object.keys(portfolio).forEach(symbol => {
        const p = portfolio[symbol], stock = stocksData[symbol];
        if (!stock) return;
        const currentPrice = parseFloat(stock.price) || 0;
        const avgCost      = p.buyPrice ?? p.avgCost ?? 0;
        const costBasis    = p.totalCost ?? (p.qty * avgCost);
        const positionValue = p.qty * currentPrice;
        totalValue += positionValue;
        totalCost  += costBasis;
        if (stock.initial > 0) {
            openValue   += p.qty * stock.initial;
            totalDailyPL += p.qty * (currentPrice - stock.initial);
            openCount++;
        }
        const totalPct = calculatePctChange(currentPrice, p.buyPrice);
        const dayPct   = calculatePctChange(currentPrice, stock.initial);
        const plShekels = positionValue - costBasis;
        const dayPLils  = stock.initial > 0 ? p.qty * (currentPrice - stock.initial) : 0;
        const plUp  = plShekels >= 0;
        const dayUp = parseFloat(dayPct) >= 0;
        const plColor  = pctColor(totalPct);
        const dayColor = pctColor(dayPct);
        const plStr = (plShekels >= 0 ? '+' : '') + plShekels.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        // ── Desktop table row ──
        const tr = document.createElement('tr');
        tr.className = 'stock-row';
        tr.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON') { currentStock = symbol; _lwStock = null; drawChart(); openStockWindow(symbol); }
        };
        const pDate = p.purchaseDate ?? p.date ?? p.buyDate ?? null;
        const dateStr = pDate ? new Date(pDate).toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        tr.innerHTML = `
            <td style="font-weight:600;font-size:0.8rem">
                <div>${symbol}</div>
                ${dateStr ? `<div style="font-size:8.5px;color:var(--text3);font-weight:400;margin-top:1px">${dateStr}</div>` : ''}
            </td>
            <td class="pct-col"><span dir="ltr" style="display:inline-block;background:${plColor.bg};color:${plColor.text};padding:1px 6px;border-radius:4px;font-weight:700;font-size:0.75rem">${parseFloat(totalPct)>=0?'+':''}${totalPct}%</span></td>
            <td class="text-right" dir="ltr" style="font-size:0.75rem;font-weight:700;color:${plColor.text};font-variant-numeric:tabular-nums;white-space:nowrap">₪${plStr}</td>
            <td class="pct-col"><span dir="ltr" style="display:inline-block;background:${dayColor.bg};color:${dayColor.text};padding:1px 6px;border-radius:4px;font-weight:700;font-size:0.75rem">${dayUp?'+':''}${dayPct}%</span></td>
            <td class="text-right" dir="ltr" style="font-size:0.75rem;color:#3c4043;font-variant-numeric:tabular-nums;white-space:nowrap">₪${positionValue.toLocaleString('he-IL',{minimumFractionDigits:0,maximumFractionDigits:0})}</td>
            <td><button class="sell-btn" onclick="sellStock('${symbol}')">מכור</button></td>`;
        list.appendChild(tr);
        // ── Mobile card ──
        if (mobCards) {
            const portfolioPct = totalValue > 0 ? ((positionValue / totalValue) * 100).toFixed(1) : '0.0';
            const dayILSStr = (dayPLils >= 0 ? '+' : '') + '₪' + Math.abs(dayPLils).toLocaleString('he-IL',{maximumFractionDigits:1});
            const card = document.createElement('div');
            card.className = 'mob-stock-card';
            card.onclick = () => openMobStockDetail(symbol);
            card.innerHTML = `
                <div class="mob-stock-name">${symbol}</div>
                <div class="mob-stock-row1">
                    <span class="mob-stock-qty">${p.qty} יח׳</span>
                    <span class="mob-stock-daily-ils" style="color:${dayColor.text}">${dayILSStr}</span>
                </div>
                <div class="mob-stock-row2">
                    <span class="mob-stock-badge" style="background:${dayColor.bg};color:${dayColor.text}">${dayUp?'+':''}${dayPct}%</span>
                    <span class="mob-stock-total-pct">שינוי מעלות <b style="color:${plColor.text}">${parseFloat(totalPct)>=0?'+':''}${totalPct}%</b></span>
                </div>
                <div class="mob-stock-row3">
                    <span>שווי אחזקה&nbsp;<b>₪${positionValue.toLocaleString('he-IL',{maximumFractionDigits:0})}</b></span>
                    <span>נתח מהתיק&nbsp;<b>${portfolioPct}%</b></span>
                </div>`;
            mobCards.appendChild(card);
        }
    });

    if (openCount > 0) window._portfolioOpenVal = openValue;
    window._portfolioDailyPL = totalDailyPL;   // expose for equity trend indicator
    snapshotPortfolioValue(totalValue);
    // Keep server summary in sync with latest market value (best-effort, non-blocking)
    fetchPortfolioSummary();
    const totalPL    = totalCost > 0 ? calculatePctChange(totalValue, totalCost) : "0.00";
    const totalPLils = totalValue - totalCost;
    const c          = pctColor(totalPL);
    const plSign     = totalPLils >= 0 ? '+' : '-';
    // ── Desktop footer ──
    totalDisplay.innerHTML = `
        <span dir="ltr" style="display:flex;flex-direction:column;align-items:center;gap:4px">
            <span style="font-size:1rem;font-weight:700;color:#202124;font-variant-numeric:tabular-nums;letter-spacing:-0.3px">
                ₪${totalValue.toLocaleString('he-IL',{minimumFractionDigits:0,maximumFractionDigits:0})}
            </span>
            <span style="font-size:0.78rem;font-weight:700;color:${c.text};background:${c.bg};padding:3px 10px;border-radius:6px;font-variant-numeric:tabular-nums;white-space:nowrap">
                ${plSign}₪${Math.abs(Math.round(totalPLils)).toLocaleString('he-IL')} (${parseFloat(totalPL)>=0?'+':''}${totalPL}%)
            </span>
        </span>`;
    // ── Mobile summary ──
    const mobTotal    = document.getElementById('mob-ptf-total');
    const mobDaily    = document.getElementById('mob-ptf-daily');
    const mobTotalPNL = document.getElementById('mob-ptf-total-pnl');
    const mobCount    = document.getElementById('mob-ptf-count');
    if (mobTotal) mobTotal.textContent = '₪' + totalValue.toLocaleString('he-IL',{maximumFractionDigits:0});
    if (mobCount) { const n = Object.keys(portfolio).length; mobCount.textContent = `פירוט ניירות - ${n} ניירות`; }
    if (mobDaily) {
        const cDay = pctColor(totalDailyPL >= 0 ? 1 : -1);
        const openVal = openValue || totalValue;
        const dailyPct = openVal > 0 ? ((totalDailyPL / openVal) * 100).toFixed(2) : '0.00';
        const daySign = totalDailyPL >= 0 ? '+' : '-';
        mobDaily.innerHTML = `<span style="color:${cDay.text};font-weight:700">${daySign}₪${Math.abs(Math.round(totalDailyPL)).toLocaleString('he-IL')}&nbsp;<span style="font-size:12px">(${daySign}${Math.abs(parseFloat(dailyPct)).toFixed(2)}%)</span></span>`;
    }
    if (mobTotalPNL) {
        const cTotal = pctColor(totalPL);
        const totalSign = totalPLils >= 0 ? '+' : '-';
        mobTotalPNL.innerHTML = `<span style="color:${cTotal.text};font-weight:700">${totalSign}₪${Math.abs(Math.round(totalPLils)).toLocaleString('he-IL')}&nbsp;<span style="font-size:12px">(${parseFloat(totalPL)>=0?'+':''}${totalPL}%)</span></span>`;
    }
}

let _mobDetailStock = null;
function openMobStockDetail(symbol) {
    const detail = document.getElementById('mob-stock-detail');
    if (!detail) return;
    // Toggle off if same stock tapped again
    if (_mobDetailStock === symbol && detail.style.display !== 'none') {
        detail.style.display = 'none';
        _mobDetailStock = null;
        document.querySelectorAll('.mob-stock-card').forEach(c => c.classList.remove('selected'));
        return;
    }
    _mobDetailStock = symbol;
    document.querySelectorAll('.mob-stock-card').forEach(c => c.classList.remove('selected'));
    const p = portfolio[symbol], stock = stocksData[symbol];
    if (!p || !stock) return;
    const currentPrice = parseFloat(stock.price) || 0;
    const costBasis    = p.totalCost ?? (p.qty * (p.buyPrice ?? p.avgCost ?? 0));
    const posVal       = p.qty * currentPrice;
    const totalPct     = calculatePctChange(currentPrice, p.buyPrice);
    const dayPct       = calculatePctChange(currentPrice, stock.initial);
    const plILS        = posVal - costBasis;
    const plColor      = pctColor(totalPct);
    const dayColor     = pctColor(dayPct);
    const plSign       = plILS >= 0 ? '+' : '';
    const daySign      = parseFloat(dayPct) >= 0 ? '+' : '';
    // Mark selected card
    document.querySelectorAll('.mob-stock-card').forEach(c => {
        if (c.querySelector('.mob-stock-name')?.textContent === symbol) c.classList.add('selected');
    });
    detail.style.display = 'block';
    detail.innerHTML = `
        <div class="mob-detail-header">
            <span class="mob-detail-name">${symbol}</span>
            <button class="mob-detail-close" onclick="openMobStockDetail('${symbol}')">✕</button>
        </div>
        <div class="mob-detail-stats">
            <div class="mob-detail-stat">
                <span class="mob-detail-stat-label">מחיר נוכחי</span>
                <span class="mob-detail-stat-val" dir="ltr">₪${currentPrice.toLocaleString('he-IL',{maximumFractionDigits:2})}</span>
            </div>
            <div class="mob-detail-stat">
                <span class="mob-detail-stat-label">כמות</span>
                <span class="mob-detail-stat-val">${p.qty} יח׳</span>
            </div>
            <div class="mob-detail-stat">
                <span class="mob-detail-stat-label">שינוי יומי</span>
                <span class="mob-detail-stat-val" style="color:${dayColor.text}" dir="ltr">${daySign}${dayPct}%</span>
            </div>
            <div class="mob-detail-stat">
                <span class="mob-detail-stat-label">רווח/הפסד</span>
                <span class="mob-detail-stat-val" style="color:${plColor.text}" dir="ltr">${plSign}₪${Math.abs(plILS).toLocaleString('he-IL',{maximumFractionDigits:0})}</span>
            </div>
            <div class="mob-detail-stat">
                <span class="mob-detail-stat-label">שווי אחזקה</span>
                <span class="mob-detail-stat-val" dir="ltr">₪${posVal.toLocaleString('he-IL',{maximumFractionDigits:0})}</span>
            </div>
            <div class="mob-detail-stat">
                <span class="mob-detail-stat-label">שינוי מעלות</span>
                <span class="mob-detail-stat-val" style="color:${plColor.text}" dir="ltr">${parseFloat(totalPct)>=0?'+':''}${totalPct}%</span>
            </div>
        </div>
        <button class="mob-detail-sell" onclick="sellStock('${symbol}');document.getElementById('mob-stock-detail').style.display='none'">מכור ${symbol}</button>`;
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    if (!input) return null;
    const trimmed = input.trim();
    if (stocksData[trimmed]) return trimmed;
    const lower = trimmed.toLowerCase();
    // Try Hebrew name match first
    const byName = Object.keys(STOCK_SYMBOLS).find(name =>
        STOCK_SYMBOLS[name].toLowerCase() === lower ||
        STOCK_SYMBOLS[name].toLowerCase().replace('.ta','') === lower
    );
    if (byName) return byName;
    // Try TASE125 English name match
    const byEn = TASE125_DATA.find(s => s.nameEn.toLowerCase().includes(lower) || s.ticker.toLowerCase() === lower);
    if (byEn) return byEn.nameHe;
    return null;
}

function quickBuy(name) {
    const simEl = document.getElementById('win-simulator');
    if (simEl) simEl.style.display = '';
    const symEl = document.getElementById('sim-symbol');
    const qtyEl = document.getElementById('sim-qty');
    if (symEl) symEl.value = name;
    if (qtyEl) { qtyEl.value = ''; qtyEl.focus(); }
}

// ── FIFO cost basis calculator ────────────────────────────────────────────────
// Returns { costBasis, remainingLots } after consuming `qtyToSell` from lots FIFO.
// Falls back to weighted-average price when no lots are stored.
function calcFifoCost(lots, qtyToSell, fallbackAvgPrice) {
    if (!lots?.length) {
        return { costBasis: parseFloat((qtyToSell * fallbackAvgPrice).toFixed(2)), remainingLots: [] };
    }
    const working = lots.map(l => ({ ...l }));   // clone so original is unchanged
    let rem = qtyToSell, cost = 0;
    for (const lot of working) {
        if (rem <= 0) break;
        const take = Math.min(lot.qty, rem);
        cost += take * lot.price;
        lot.qty -= take;
        rem -= take;
    }
    return {
        costBasis: parseFloat(cost.toFixed(2)),
        remainingLots: working.filter(l => l.qty > 0),
    };
}

function buyStock() {
    const raw    = document.getElementById('sim-symbol').value.trim();
    const symbol = resolveStockName(raw);
    const qty    = parseInt(document.getElementById('sim-qty').value);
    if (!symbol || isNaN(qty) || qty <= 0) return;
    const price = parseFloat(stocksData[symbol].price);
    const cost  = price * qty;
    const today = new Date().toISOString().split('T')[0];
    if (portfolio[symbol]) {
        portfolio[symbol].qty       += qty;
        portfolio[symbol].totalCost += cost;
        portfolio[symbol].buyPrice   = portfolio[symbol].totalCost / portfolio[symbol].qty;
        // Append lot for FIFO tracking
        (portfolio[symbol].lots ??= []).push({ qty, price, date: today });
    } else {
        portfolio[symbol] = { qty, buyPrice: price, totalCost: cost,
            lots: [{ qty, price, date: today }] };
    }
    transactionHistory.unshift({ time: new Date().toLocaleTimeString(), action: 'Buy', symbol, qty, price: price.toFixed(2) });
    if (transactionHistory.length > 50) transactionHistory.pop();
    savePortfolio();
    updatePortfolioList();
    updateTransactionHistory();

    // ── Log purchase to cash-balance tracker ──────────────────────────────
    const ticker = STOCK_SYMBOLS[symbol] ?? symbol;
    fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            symbol:   ticker,
            name:     symbol,
            buyDate:  new Date().toISOString().split('T')[0],
            buyPrice: price,
            quantity: qty,
            priceUnit: 'NIS',
        }),
    }).catch(() => {});   // fire-and-forget
}

function sellStockSim() {
    const symbol = document.getElementById('sim-symbol').value.trim();
    if (symbol) sellStock(symbol);
}

// ── Sell confirm modal ────────────────────────────────────────────────────────
function showSellModal(symbol) {
    const p = portfolio[symbol];
    if (!p) return;
    const sellPrice = parseFloat(stocksData[symbol]?.price ?? 0);
    const modal = document.getElementById('sell-confirm-modal');
    if (!modal) { sellStock(symbol, p.qty); return; }
    modal.dataset.symbol = symbol;
    document.getElementById('scm-symbol').textContent  = symbol;
    document.getElementById('scm-price').textContent   = sellPrice > 0 ? `₪${sellPrice.toFixed(2)}` : '—';
    const qtyInput = document.getElementById('scm-qty');
    qtyInput.max   = p.qty;
    qtyInput.value = p.qty;
    document.getElementById('scm-max').textContent = p.qty;
    _updateSellPreview(symbol);
    modal.style.display = 'flex';
}
function closeSellModal() {
    const m = document.getElementById('sell-confirm-modal');
    if (m) m.style.display = 'none';
}
function _updateSellPreview(symbol) {
    const p = portfolio[symbol];
    if (!p) return;
    const qty = parseInt(document.getElementById('scm-qty')?.value) || 0;
    const sellPrice = parseFloat(stocksData[symbol]?.price ?? 0);
    const { costBasis } = calcFifoCost(p.lots ?? [], qty, p.buyPrice ?? p.avgCost ?? 0);
    const proceeds = sellPrice * qty;
    const pnl = parseFloat((proceeds - costBasis).toFixed(2));
    const el  = document.getElementById('scm-preview');
    if (!el) return;
    const col = pnl >= 0 ? '#16a34a' : '#dc2626';

    // Post-sale equity simulation
    const s = _portfolioSummary;
    let equityLine = '';
    if (s && proceeds > 0) {
        const postCash   = s.availableCash + proceeds;
        // Remaining position value
        const remaining  = (p.qty - qty) * sellPrice;
        const postMkt    = (s.totalMarketValue - (p.qty * sellPrice)) + remaining;
        const postEquity = postCash + postMkt;
        const fmt = v => '₪' + Math.round(v).toLocaleString('he-IL');
        equityLine = `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #e5e7eb;width:100%;font-size:11px;color:#374151">
            שווי תיק לאחר מכירה: <strong>${fmt(postEquity)}</strong>
            <span style="color:#9ca3af">&nbsp;(מזומן: ${fmt(postCash)})</span>
        </div>`;
    }

    el.innerHTML = `<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;width:100%">
        <span style="color:#6b7280;font-size:11px">עלות FIFO: ₪${costBasis.toLocaleString('he-IL',{minimumFractionDigits:2})}</span>
        <span style="font-weight:700;font-size:12px;color:${col}">&nbsp;|&nbsp;${pnl>=0?'+':''}₪${Math.abs(pnl).toLocaleString('he-IL',{minimumFractionDigits:2})}</span>
    </div>${equityLine}`;
}
function confirmSellModal() {
    const modal = document.getElementById('sell-confirm-modal');
    if (!modal) return;
    const symbol = modal.dataset.symbol;
    const qty    = parseInt(document.getElementById('scm-qty').value);
    closeSellModal();
    if (symbol && qty > 0) sellStock(symbol, qty);
}

function sellStock(symbol, qtyToSell) {
    if (!portfolio[symbol]) return;

    // No qty given → show modal for qty + FIFO preview
    if (qtyToSell === undefined) { showSellModal(symbol); return; }

    const holding   = portfolio[symbol];
    const maxQty    = holding.qty;
    const qty       = Math.min(Math.max(1, Math.round(qtyToSell)), maxQty);
    const sellPrice = parseFloat(stocksData[symbol]?.price ?? 0);
    const avgPrice  = parseFloat(holding.buyPrice ?? holding.avgCost ?? 0);
    const { costBasis, remainingLots } = calcFifoCost(holding.lots ?? [], qty, avgPrice);
    const method    = (holding.lots?.length ?? 0) > 0 ? 'fifo' : 'weighted_avg';

    if (qty >= maxQty) {
        delete portfolio[symbol];
    } else {
        // Partial sell — update lots, qty, totalCost, avgCost
        portfolio[symbol].qty       -= qty;
        portfolio[symbol].lots       = remainingLots;
        portfolio[symbol].totalCost  = remainingLots.reduce((s, l) => s + l.qty * l.price, 0);
        portfolio[symbol].buyPrice   = portfolio[symbol].qty > 0
            ? portfolio[symbol].totalCost / portfolio[symbol].qty : 0;
    }

    transactionHistory.unshift({ time: new Date().toLocaleTimeString(), action: 'Sell', symbol, qty, price: sellPrice.toFixed(2) });
    if (transactionHistory.length > 50) transactionHistory.pop();
    savePortfolio();
    updatePortfolioList();
    updateTransactionHistory();

    // Persist to SalesHistory with accurate FIFO costBasis
    if (sellPrice > 0) {
        fetch('/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbol, name: symbol,
                buyDate:  holding.buyDate ?? null,
                sellDate: new Date().toISOString().split('T')[0],
                buyPrice: qty > 0 ? costBasis / qty : avgPrice,
                sellPrice, quantity: qty,
                costBasis,   // FIFO-computed — overrides server default
                method,
                entryType: 'current',
            })
        }).catch(() => {});
    }
}

// ── Portfolio Analytics Widget ─────────────────────────────────────────────
const _DONUT_COLORS = ['#4f8ef7','#34a853','#fbbc04','#ea4335','#a142f4','#00acc1','#e8710a','#0f9d58','#7b61ff','#ff6d00','#1a73e8'];
let _donutChart = null;

const _SECTORS_CLIENT = {
    'בנקים':       ['לאומי','פועלים','דיסקונט','מזרחי טפחות','הבינלאומי','בנק ירושלים'],
    'ביטוח':       ['הפניקס','הראל','כלל ביטוח'],
    'טכנולוגיה':   ['נייס','טאוור','אאורה'],
    'ביטחון':      ['אלביט'],
    'פארמה/כימיה': ['טבע','כיל'],
    'נדל"ן':       ['עזריאלי','מליסרון','אמות','ביג','גב ים','שיכון ובינוי','ריט1'],
    'אנרגיה':      ["אנרג'יקס",'אנלייט','אורמת','קבוצת דלק'],
    'תקשורת':      ['בזק','סלקום','פרטנר'],
    'מסחר':        ['שטראוס','שופרסל','פוקס','רמי לוי'],
    'שוק הון':     ['אי.בי.אי'],
    'מדדים':       ['מדד תא-35','מדד תא-90','מדד תא-125'],
};

const _BETAS = {
    'לאומי':1.05,'פועלים':1.08,'דיסקונט':1.00,'מזרחי טפחות':0.95,'הבינלאומי':0.85,'בנק ירושלים':0.80,
    'הפניקס':0.90,'הראל':0.85,'כלל ביטוח':0.88,
    'נייס':1.35,'טאוור':1.40,'אאורה':1.20,
    'אלביט':0.82,
    'טבע':1.05,'כיל':0.95,
    'עזריאלי':0.80,'מליסרון':0.75,'אמות':0.72,'ביג':0.78,'גב ים':0.70,'שיכון ובינוי':0.85,'ריט1':0.65,
    "אנרג'יקס":0.90,'אנלייט':0.88,'אורמת':0.85,'קבוצת דלק':0.92,
    'בזק':0.60,'סלקום':0.65,'פרטנר':0.65,
    'שטראוס':0.70,'שופרסל':0.65,'פוקס':0.90,'רמי לוי':0.72,
    'אי.בי.אי':0.88,
    'מדד תא-35':1.00,'מדד תא-90':1.10,'מדד תא-125':1.05,
};

function initPortfolioAnalytics() {
    const widget = document.getElementById('win-portfolio-analytics');
    if (!widget) return;
    try {
        const ptf   = portfolio ?? {};
        const names = Object.keys(ptf);
        if (!names.length) {
            const leg = document.getElementById('donut-legend');
            if (leg) leg.textContent = 'אין מניות בתיק';
            return;
        }

        // Single pass: sector values + totals + beta
        const sectorVal = {};
        let totalVal = 0, totalCost = 0, betaWeighted = 0, totalDailyPL = 0, openVal = 0;
        names.forEach(name => {
            const h        = ptf[name];
            // stocksData already has live prices mapped to Hebrew names
            const cur      = stocksData[name]?.price ?? h.buyPrice ?? h.avgPrice ?? 0;
            const initial  = stocksData[name]?.initial ?? 0;
            const qty      = h.qty ?? h.quantity ?? h.shares ?? h.amount ?? h.units ?? h.count ?? 0;
            const buyPrice = h.buyPrice ?? h.avgPrice ?? h.avgCost ?? cur;
            const val      = cur * qty;
            const cost     = h.totalCost ?? (buyPrice * qty);
            totalVal      += val;
            totalCost     += cost;
            betaWeighted  += val * (_BETAS[name] ?? 1.0);
            if (initial > 0) { openVal += qty * initial; totalDailyPL += qty * (cur - initial); }
            const sector   = Object.entries(_SECTORS_CLIENT).find(([, s]) => s.includes(name))?.[0] ?? 'אחר';
            sectorVal[sector] = (sectorVal[sector] ?? 0) + val;
        });

        const sectors = Object.entries(sectorVal)
            .map(([name, value]) => ({ name, value: totalVal > 0 ? Math.round(value / totalVal * 1000) / 10 : 0 }))
            .sort((a, b) => b.value - a.value);

        // Risk score 1-5
        const maxSectorPct = sectors[0]?.value ?? 0;
        const numHoldings  = names.length;
        let riskScore = 3;
        if (maxSectorPct > 60) riskScore++;
        if (maxSectorPct > 80) riskScore++;
        if (numHoldings <= 3) riskScore++;
        if (numHoldings >= 8) riskScore--;
        if (Object.keys(sectorVal).length >= 4) riskScore--;
        riskScore = Math.max(1, Math.min(5, riskScore));
        const riskLabels = ['','נמוך מאוד','נמוך','בינוני','גבוה','גבוה מאוד'];
        const riskColors = ['','#22c55e','#86efac','#facc15','#f97316','#ef4444'];
        const riskLabel  = riskLabels[riskScore];
        const riskColor  = riskColors[riskScore];
        const topSector  = sectors[0]?.name ?? '—';
        const diversification = Object.keys(sectorVal).length >= 4 ? 'טובה' : 'מוגבלת';

        // Derived metrics
        const totalPnL     = totalVal - totalCost;
        const totalPnLPct  = totalCost > 0 ? (totalPnL / totalCost * 100) : 0;
        const portfolioBeta = totalVal > 0 ? (betaWeighted / totalVal) : 1.0;
        const hhi          = sectors.reduce((s, sec) => s + (sec.value / 100) ** 2, 0);
        const divScore     = Math.round((1 - hhi) * 100);

        // Helper
        const ge = id => document.getElementById(id);
        const fmtILS = v => `₪${Math.abs(Math.round(v)).toLocaleString('he-IL')}`;
        const pnlColor = totalPnL >= 0 ? '#16a34a' : '#dc2626';
        const pnlSign  = totalPnL >= 0 ? '+' : '−';

        // Summary bar
        const tvEl = ge('ana-total-val');
        if (tvEl) tvEl.textContent = fmtILS(totalVal);
        const pnlEl = ge('ana-total-pnl');
        if (pnlEl) { pnlEl.textContent = `${pnlSign}${fmtILS(totalPnL)}`; pnlEl.style.color = pnlColor; }
        const pctEl = ge('ana-total-pct');
        if (pctEl) { pctEl.textContent = `(${pnlSign}${Math.abs(totalPnLPct).toFixed(1)}%)`; pctEl.style.color = pnlColor; }
        // Daily P&L
        const dailyColor = totalDailyPL >= 0 ? '#16a34a' : '#dc2626';
        const dailySign  = totalDailyPL >= 0 ? '+' : '−';
        const dailyPct   = openVal > 0 ? (totalDailyPL / openVal * 100) : 0;
        const dailyEl = ge('ana-daily-pnl');
        if (dailyEl) { dailyEl.textContent = `${dailySign}${fmtILS(totalDailyPL)}`; dailyEl.style.color = dailyColor; }
        const dailyPctEl = ge('ana-daily-pct');
        if (dailyPctEl) { dailyPctEl.textContent = `(${dailySign}${Math.abs(dailyPct).toFixed(2)}%)`; dailyPctEl.style.color = dailyColor; }
        const divEl = ge('ana-div-score');
        if (divEl) divEl.textContent = `${divScore}/100`;

        // Donut chart
        const canvas = ge('portfolio-donut');
        if (canvas && sectors.length) {
            if (_donutChart) { _donutChart.destroy(); _donutChart = null; }
            _donutChart = new Chart(canvas.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: sectors.map(s => s.name),
                    datasets: [{ data: sectors.map(s => s.value),
                        backgroundColor: _DONUT_COLORS,
                        borderWidth: 1.5, borderColor: '#fff',
                        hoverOffset: 4 }],
                },
                options: {
                    responsive: false, cutout: '68%',
                    devicePixelRatio: window.devicePixelRatio || 2,
                    plugins: { legend: { display: false }, tooltip: {
                        callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` }
                    }},
                    animation: { duration: 600 },
                },
            });
        }

        // Center label
        const center = ge('donut-center');
        if (center) center.innerHTML = `${numHoldings}<br>החזקות`;
        const topSectorEl = ge('analytics-top-sector');
        if (topSectorEl) topSectorEl.textContent = topSector ? topSector : '';

        // Legend (all when maximized, top 4 otherwise)
        const isMaxMode = !!widget.dataset.maxMode;
        const legend = ge('donut-legend');
        if (legend) legend.innerHTML = sectors.slice(0, isMaxMode ? sectors.length : 4).map((s, i) =>
            `<div style="display:flex;align-items:center;gap:4px;min-width:0">
               <span style="flex-shrink:0;width:8px;height:8px;border-radius:2px;background:${_DONUT_COLORS[i % _DONUT_COLORS.length]}"></span>
               <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)">${s.name}</span>
               <span style="font-weight:600;color:var(--text3)">${s.value}%</span>
             </div>`
        ).join('');

        // Risk bar
        const riskBar = ge('risk-bar');
        if (riskBar) { riskBar.style.width = `${riskScore * 20}%`; riskBar.style.background = riskColor; }
        const riskLbl = ge('risk-label');
        if (riskLbl) { riskLbl.textContent = riskLabel; riskLbl.style.color = riskColor; }
        const meta = ge('analytics-meta');
        if (meta) meta.textContent = `${diversification} | בטא ${portfolioBeta.toFixed(2)} | ${numHoldings} מניות`;

    } catch(e) {
        console.error('[analytics]', e);
        const leg = document.getElementById('donut-legend');
        if (leg) leg.textContent = `שגיאה: ${e.message}`;
    }
}

// ── Insights Panel ────────────────────────────────────────────────────────────
let _insightsHistoryData = null;  // cached server response
let _pnlData = [], _pnlIdx = -1; // daily P&L navigation state
let _pnlCharts = {};              // active Chart.js instances

function closeInsightsPanel() {
    const panel    = document.getElementById('win-ai-insights');
    const backdrop = document.getElementById('insights-backdrop');
    if (!panel) return;
    const isMob = window.innerWidth <= 768;
    panel.style.opacity   = isMob ? '1' : '0';
    panel.style.transform = isMob ? 'translateY(100%)' : 'translate(-50%,-48%) scale(0.96)';
    if (backdrop) { backdrop.style.opacity = '0'; backdrop.style.pointerEvents = 'none'; }
    setTimeout(() => {
        panel.style.display = 'none';
        if (backdrop) { backdrop.style.display = 'none'; backdrop.style.pointerEvents = ''; }
    }, 260);
}

function openInsightsPanel() {
    const panel    = document.getElementById('win-ai-insights');
    const backdrop = document.getElementById('insights-backdrop');
    if (!panel) return;
    // Already visible — don't restart animation
    if (panel.style.display === 'flex' && panel.style.opacity === '1') {
        if (!_insightsHistoryData) loadInsightsHistory();
        return;
    }
    // Show backdrop blur
    if (backdrop) {
        backdrop.style.opacity = '0';
        backdrop.style.display = 'block';
    }
    // Mobile: slide up from bottom. Desktop: scale from center.
    const isMob = window.innerWidth <= 768;
    panel.style.display   = 'flex';
    panel.style.opacity   = isMob ? '1' : '0';
    panel.style.transform = isMob ? 'translateY(30px)' : 'translate(-50%,-48%) scale(0.96)';
    requestAnimationFrame(() => requestAnimationFrame(() => {
        panel.style.opacity   = '1';
        panel.style.transform = isMob ? 'translateY(0)' : 'translate(-50%,-50%) scale(1)';
        if (backdrop) backdrop.style.opacity = '1';
    }));
    switchInsightsTab('ai');
    if (!_insightsHistoryData) loadInsightsHistory();
}

function switchInsightsTab(tab) {
    ['ai','perf','pnl'].forEach(t => {
        document.getElementById(`itab-content-${t}`)?.style.setProperty('display', t === tab ? 'flex' : 'none');
        const btn = document.getElementById(`itab-${t}`);
        if (btn) { btn.classList.toggle('itab-active', t === tab); }
    });
    if (tab === 'pnl') renderPnLClient(_insightsHistoryData?.holdings);
    if (tab === 'perf') {
        renderPerformanceTabClient();
        // Re-render after historical fetches complete (baseWeek/Month/3m loaded async)
        setTimeout(() => { if (document.getElementById('itab-content-perf')?.style.display !== 'none') renderPerformanceTabClient(); }, 4000);
        setTimeout(() => { if (document.getElementById('itab-content-perf')?.style.display !== 'none') renderPerformanceTabClient(); }, 10000);
    }
}

let _insightsLoading = false;
async function loadInsightsHistory(force = false) {
    if (_insightsLoading) return;
    if (_insightsHistoryData && !force) return;
    _insightsLoading = true;
    try {
        const res = await fetch('/api/portfolio/history', { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        _insightsHistoryData = await res.json();
        // Upgrade whichever tab is visible with richer server data
        if (document.getElementById('itab-content-perf')?.style.display !== 'none') renderPerformanceTab(_insightsHistoryData.stocks);
        if (document.getElementById('itab-content-pnl')?.style.display  !== 'none') renderPnLClient(_insightsHistoryData?.holdings);
    } catch(e) {
        console.warn('[insights history]', e.message);
        ['perf-loading','pnl-loading'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = `<span style="color:#dc2626">שגיאה: ${e.message} — <button onclick="loadInsightsHistory(true)" style="color:var(--primary);background:none;border:none;cursor:pointer;font-weight:600">נסה שוב</button></span>`;
        });
    } finally {
        _insightsLoading = false;
    }
}

function _sparkline(prices, color) {
    if (!prices || prices.length < 2) return '';
    const w = 64, h = 22;
    const min = Math.min(...prices), max = Math.max(...prices);
    const rng = max - min || 1;
    const pts = prices.map((p, i) =>
        `${((i / (prices.length - 1)) * w).toFixed(1)},${(h - ((p - min) / rng) * (h - 2) - 1).toFixed(1)}`
    ).join(' ');
    return `<svg width="${w}" height="${h}" style="vertical-align:middle;flex-shrink:0"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// ── Client-side performance tab ───────────────────────────────────────────────
let _perfFetchPending = false;

function _renderPerfTable(names, body) {
    const pct = (cur, base) => (base && base > 0) ? ((cur - base) / base * 100).toFixed(2) : null;
    const cell = v => {
        if (v === null) return `<td style="text-align:center;padding:5px 4px;color:var(--text3);font-size:11px">—</td>`;
        const n = parseFloat(v), c = n >= 0 ? '#16a34a' : '#dc2626';
        return `<td style="text-align:center;padding:5px 4px;font-variant-numeric:tabular-nums"><span style="color:${c};font-weight:600">${n >= 0 ? '+' : ''}${n}%</span></td>`;
    };
    const rows = names.map(name => {
        const sd  = stocksData[name] ?? {};
        const cur = sd.price || 0;
        const spark = _sparkline(sd.history?.slice(-20) ?? [], (sd.price >= sd.initial) ? '#16a34a' : '#dc2626');
        return `<tr><td style="padding:5px 4px;font-size:11.5px;font-weight:600;white-space:nowrap">${name}</td>${cell(pct(cur,sd.initial))}${cell(pct(cur,sd.baseWeek))}${cell(pct(cur,sd.baseMonth))}${cell(pct(cur,sd.base3Month))}<td style="padding:5px 4px">${spark}</td></tr>`;
    }).join('');
    body.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="color:var(--text3);font-size:10px">
            <th style="text-align:right;padding:4px">מניה</th>
            <th style="text-align:center;padding:4px">יום</th>
            <th style="text-align:center;padding:4px">שבוע</th>
            <th style="text-align:center;padding:4px">חודש</th>
            <th style="text-align:center;padding:4px">3ח</th>
            <th style="padding:4px"></th>
        </tr></thead><tbody>${rows}</tbody></table>`;
}

function renderPerformanceTabClient() {
    const body    = document.getElementById('perf-table-body');
    const loading = document.getElementById('perf-loading');
    if (!body) return;
    const ptf = portfolio ?? {};
    const names = Object.keys(ptf);
    if (!names.length) { if (loading) loading.textContent = 'אין מניות בתיק'; return; }

    _renderPerfTable(names, body);
    if (loading) loading.style.display = 'none';

    // Fetch missing historical baselines (once only)
    const missing = names.filter(n => !stocksData[n]?.baseMonth);
    if (missing.length && !_perfFetchPending) {
        _perfFetchPending = true;
        Promise.all(missing.map(name => {
            const sym = STOCK_SYMBOLS[name];
            if (!sym) return Promise.resolve();
            return Promise.all([
                fetchHistoricalWithTs(sym, '1mo').then(({ closes }) => {
                    if (!closes.length) return;
                    stocksData[name].baseWeek  = closes[Math.max(0, closes.length - 6)];
                    stocksData[name].baseMonth = closes[0];
                }).catch(() => {}),
                fetchHistoricalWithTs(sym, '3mo').then(({ closes }) => {
                    if (!closes.length) return;
                    stocksData[name].base3Month = closes[0];
                }).catch(() => {})
            ]);
        })).then(() => {
            _perfFetchPending = false;
            if (document.getElementById('itab-content-perf')?.style.display !== 'none') {
                // Re-render once with fresh data, no further fetching
                const b = document.getElementById('perf-table-body');
                if (b) _renderPerfTable(Object.keys(portfolio ?? {}), b);
            }
        });
    }
}

// ── Portfolio P&L tab ────────────────────────────────────────────────────────
function renderPnLClient(holdingsData) {
    const body = document.getElementById('pnl-nav-body');
    if (!body) return;

    // Destroy old Chart.js instances
    Object.values(_pnlCharts).forEach(c => { try { c?.destroy(); } catch(e){} });
    _pnlCharts = {};


    // ── Build data ─────────────────────────────────────────────────────────
    // Always use client-side stocksData for prices (Yahoo Finance, in shekels).
    // Server holdingsData enriches with purchaseDate + sector only.
    let rows = [], totalVal = 0, totalCost = 0, dailyPnl = 0;

    const serverMap = {};
    (holdingsData ?? []).forEach(h => { serverMap[h.name] = h; });

    const ptf = portfolio ?? {};
    Object.entries(ptf).forEach(([name, h]) => {
        const sd  = stocksData[name] ?? {};
        const cur = sd.price ?? 0;
        const prev = sd.initial ?? cur;
        const qty = h.qty ?? h.quantity ?? h.shares ?? 0;
        const buyPrice = parseFloat(h.buyPrice ?? h.avgCost ?? 0);
        const cost = h.totalCost ?? (buyPrice * qty);
        const mktValue = cur * qty;
        totalVal += mktValue; totalCost += cost;
        const dayIls = (cur - prev) * qty;
        dailyPnl += dayIls;
        if (qty && buyPrice && cur > 0) {
            const srv = serverMap[name] ?? {};
            rows.push({
                name, qty, buyPrice, curPrice: cur,
                mktValue: Math.round(mktValue), costBasis: Math.round(cost),
                inceptionPnlIls: Math.round(mktValue - cost),
                inceptionPnlPct: buyPrice > 0 ? ((cur - buyPrice) / buyPrice * 100).toFixed(2) : '0',
                dayChangePct: prev > 0 ? ((cur - prev) / prev * 100).toFixed(2) : '0',
                dayChangeIls: Math.round(dayIls),
                purchaseDate: srv.purchaseDate ?? null,
                sector: srv.sector ?? 'אחר'
            });
        }
    });
    rows.sort((a, b) => b.inceptionPnlIls - a.inceptionPnlIls);

    const cumPnl  = totalVal - totalCost;
    const cumPct  = totalCost > 0 ? (cumPnl / totalCost * 100) : 0;
    const dayBase = totalVal - dailyPnl;
    const dayPct  = dayBase > 0 ? (dailyPnl / dayBase * 100) : 0;

    // ── Helpers ────────────────────────────────────────────────────────────
    const pill = (val, pct) => {
        const pos = val >= 0, c = pos ? '#15803d' : '#b91c1c', bg = pos ? '#f0fdf4' : '#fef2f2';
        return `<span style="display:inline-flex;padding:2px 7px;border-radius:20px;background:${bg};color:${c};font-size:11px;font-weight:700;white-space:nowrap">${pos?'+':'−'}${Math.abs(parseFloat(pct)).toFixed(1)}%</span>`;
    };
    const money = (val, size = 13) => {
        const pos = val >= 0, c = pos ? '#15803d' : '#b91c1c';
        return `<span style="color:${c};font-weight:700;font-size:${size}px">${pos?'+':'−'}₪${Math.abs(Math.round(val)).toLocaleString('he-IL')}</span>`;
    };
    const fmtDate = d => d ? new Date(d).toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '—';
    const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'];

    // ── Sector data ────────────────────────────────────────────────────────
    const sectorMap = {};
    rows.forEach(h => { const s = h.sector ?? 'אחר'; sectorMap[s] = (sectorMap[s] ?? 0) + h.mktValue; });
    const sectorEntries = Object.entries(sectorMap).sort(([,a],[,b]) => b - a);

    // ── Diversification score ──────────────────────────────────────────────
    const numSec = sectorEntries.length;
    const maxPct = totalVal > 0 ? (Math.max(...sectorEntries.map(([,v]) => v)) / totalVal * 100) : 100;
    const divScore = Math.round(Math.min(100, Math.max(10, numSec * 17 - Math.max(0, maxPct - 28) * 0.9)));
    const gaugeColor = divScore >= 65 ? '#10b981' : divScore >= 40 ? '#f59e0b' : '#ef4444';
    const dashLen = (divScore / 100 * Math.PI * 38).toFixed(1);
    const gaugeLabel = divScore >= 65 ? 'גיוון טוב' : divScore >= 40 ? 'בינוני' : 'ריכוז גבוה';
    const gaugeSvg = `
    <div style="text-align:center">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">מדד גיוון</div>
        <svg width="100" height="60" viewBox="0 0 100 60">
            <path d="M 11 50 A 38 38 0 0 1 89 50" fill="none" stroke="#e5e7eb" stroke-width="9" stroke-linecap="round"/>
            <path d="M 11 50 A 38 38 0 0 1 89 50" fill="none" stroke="${gaugeColor}" stroke-width="9"
                  stroke-linecap="round" stroke-dasharray="${dashLen} 999"/>
            <text x="50" y="44" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" font-weight="800" fill="${gaugeColor}">${divScore}</text>
            <text x="50" y="57" text-anchor="middle" font-family="system-ui,sans-serif" font-size="7" fill="#6b7280">${gaugeLabel}</text>
        </svg>
    </div>`;

    // ── All contributors sorted best → worst ──────────────────────────────
    const contrib = [...rows].sort((a,b) => b.inceptionPnlIls - a.inceptionPnlIls);

    // ── P&L table rows ─────────────────────────────────────────────────────
    const isMob = window.innerWidth <= 600;
    const tdP   = isMob ? '5px 4px' : '7px 6px';
    let tRows = '';
    rows.forEach(h => {
        const pnlPos = h.inceptionPnlIls >= 0;
        const rowBg  = pnlPos ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)';
        tRows += `<tr class="pnl-tr" data-bg="${rowBg}" style="border-bottom:1px solid var(--border);background:${rowBg};transition:background 0.12s"
            onmouseenter="this.style.background='rgba(0,0,0,0.05)'"
            onmouseleave="this.style.background=this.dataset.bg">
            <td style="padding:${isMob?'5px 6px':tdP}">
                <div style="font-weight:700;font-size:${isMob?'11':'12'}px;color:var(--text)">${h.name}</div>
                <div style="font-size:9px;color:var(--text3);margin-top:1px">₪${parseFloat(h.buyPrice).toLocaleString('he-IL')} · ${fmtDate(h.purchaseDate)}</div>
            </td>
            ${isMob ? '' : `<td style="padding:${tdP};text-align:center;font-size:11px;color:var(--text3);font-weight:500">${h.qty}</td>`}
            <td style="padding:${tdP};text-align:right;direction:ltr;font-size:${isMob?'10':'11'}px;font-weight:600;color:var(--text)">₪${h.mktValue.toLocaleString('he-IL')}</td>
            <td style="padding:${tdP};text-align:right">${pill(h.dayChangeIls,h.dayChangePct)}<div style="font-size:9px;margin-top:1px;direction:ltr">${money(h.dayChangeIls,10)}</div></td>
            <td style="padding:${tdP};text-align:right">${pill(h.inceptionPnlIls,h.inceptionPnlPct)}<div style="font-size:9px;margin-top:1px;direction:ltr">${money(h.inceptionPnlIls,10)}</div></td>
        </tr>`;
    });

    // ── Render HTML ────────────────────────────────────────────────────────
    body.innerHTML = `
    <div style="display:flex;gap:12px;align-items:stretch;margin-bottom:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:220px;background:linear-gradient(135deg,#f0f9ff,#ecfdf5);border-radius:14px;padding:16px">
            <div style="font-size:11px;color:var(--text3);margin-bottom:2px;text-align:center">שווי תיק</div>
            <div style="font-size:28px;font-weight:800;color:var(--text);text-align:center;direction:ltr;margin-bottom:12px">₪${Math.round(totalVal).toLocaleString('he-IL')}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
                <div style="text-align:center;padding:6px 8px;border-right:1px solid rgba(0,0,0,0.08)">
                    <div style="font-size:10px;color:var(--text3);margin-bottom:3px">שינוי יומי</div>
                    ${money(dailyPnl,14)}<br><span style="display:inline-block;margin-top:3px">${pill(dailyPnl,dayPct)}</span>
                </div>
                <div style="text-align:center;padding:6px 8px">
                    <div style="font-size:10px;color:var(--text3);margin-bottom:3px">רווח מצטבר</div>
                    ${money(cumPnl,14)}<br><span style="display:inline-block;margin-top:3px">${pill(cumPnl,cumPct)}</span>
                </div>
            </div>
        </div>
        <div style="display:${window.innerWidth <= 600 ? 'none' : 'flex'};flex-direction:column;gap:8px;align-items:center;justify-content:center">
            <div style="width:130px;height:130px;position:relative">
                <canvas id="pnl-donut" width="130" height="130"></canvas>
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none">
                    <div style="font-size:20px;font-weight:800;color:var(--text);line-height:1">${rows.length}</div>
                    <div style="font-size:9px;color:var(--text3);margin-top:2px">ניירות</div>
                </div>
            </div>
        </div>
        <div style="display:${window.innerWidth <= 600 ? 'none' : 'block'}">${gaugeSvg}</div>
    </div>

    <div id="pnl-table-wrap" style="border-radius:8px;border:1px solid var(--border);margin-bottom:14px;overflow-y:auto;max-height:${Math.min(rows.length * 58 + 36, 340)}px">
    <table style="width:100%;border-collapse:collapse;font-size:11px;direction:rtl">
        <thead><tr style="color:var(--text3);border-bottom:2px solid var(--border);font-size:10px;background:#f9fafb;position:sticky;top:0;z-index:2">
            <th style="text-align:right;padding:${isMob?'5px 6px':'7px 8px'};font-weight:600">מניה</th>
            ${isMob ? '' : `<th style="text-align:center;padding:7px 6px;font-weight:600">כמות</th>`}
            <th style="text-align:right;padding:${isMob?'5px 4px':'7px 8px'};font-weight:600">שווי</th>
            <th style="text-align:right;padding:${isMob?'5px 4px':'7px 8px'};font-weight:600">יומי</th>
            <th style="text-align:right;padding:${isMob?'5px 4px':'7px 8px'};font-weight:600">P&amp;L</th>
        </tr></thead>
        <tbody>${tRows}</tbody>
    </table>
    </div>

    <div style="border-top:1px solid var(--border);padding-top:12px">
        <div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:8px;text-align:right">תרומה לרווח/הפסד המצטבר (₪)</div>
        <canvas id="pnl-contrib" height="${Math.max(80, contrib.length * 38)}" style="width:100%;display:block"></canvas>
    </div>`;

    // Reset inner table scroll
    const _tw = document.getElementById('pnl-table-wrap');
    if (_tw) _tw.scrollTop = 0;
    // Reset outer container scroll so summary is visible
    const _pc = document.getElementById('itab-content-pnl');
    if (_pc) _pc.scrollTop = 0;

    // ── Chart.js init (after DOM update) ──────────────────────────────────
    if (window._pnlChartTimer) clearTimeout(window._pnlChartTimer);
    window._pnlChartTimer = setTimeout(() => {
        // Bail if this render is stale (user switched tab)
        if (!document.getElementById('pnl-donut')) return;
        // Donut
        const dCtx = document.getElementById('pnl-donut')?.getContext('2d');
        if (dCtx && typeof Chart !== 'undefined') {
            _pnlCharts.donut = new Chart(dCtx, {
                type: 'doughnut',
                data: {
                    labels: sectorEntries.map(([l]) => l),
                    datasets: [{ data: sectorEntries.map(([,v]) => v), backgroundColor: COLORS, borderWidth: 2, borderColor: '#fff' }]
                },
                options: {
                    responsive: false, cutout: '68%',
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${(ctx.raw/totalVal*100).toFixed(1)}%` } }
                    }
                }
            });
        }

        // Contribution horizontal bar
        const cCanvas = document.getElementById('pnl-contrib');
        if (cCanvas) cCanvas.width = cCanvas.parentElement?.clientWidth || (window.innerWidth - 48);
        const cCtx = cCanvas?.getContext('2d');
        if (cCtx && contrib.length && typeof Chart !== 'undefined') {
            _pnlCharts.contrib = new Chart(cCtx, {
                type: 'bar',
                data: {
                    labels: contrib.map(h => h.name),
                    datasets: [{
                        data: contrib.map(h => h.inceptionPnlIls),
                        backgroundColor: contrib.map(h => h.inceptionPnlIls >= 0 ? 'rgba(16,185,129,0.75)' : 'rgba(239,68,68,0.75)'),
                        borderRadius: 4, borderSkipped: false
                    }]
                },
                options: {
                    indexAxis: 'y', responsive: false,
                    plugins: { legend: { display: false }, tooltip: {
                        callbacks: { label: ctx => `${ctx.raw >= 0 ? '+' : ''}₪${Math.round(ctx.raw).toLocaleString('he-IL')}` }
                    }},
                    scales: {
                        x: { grid: { display: false }, title: { display: true, text: 'רווח / הפסד (₪)', font:{size:9}, color:'#9ca3af' }, ticks: { font:{size:9}, callback: v => { const a=Math.abs(v); const s=a>=1000000?'₪'+(a/1000000).toFixed(1)+'M':a>=1000?'₪'+Math.round(a/1000)+'K':'₪'+Math.round(a); return (v>=0?'+':'-')+s; } } },
                        y: { grid: { display: false }, ticks: { font:{size:10,weight:'600'} } }
                    }
                }
            });
        }
        window._pnlChartTimer = null;
    }, 60);
}

function renderPerformanceTab(stocks) {
    const body = document.getElementById('perf-table-body');
    const loading = document.getElementById('perf-loading');
    if (!body || !stocks) return;
    const pill = (v) => {
        const n = parseFloat(v), pos = n >= 0;
        const c = pos ? '#15803d' : '#b91c1c', bg = pos ? '#f0fdf4' : '#fef2f2';
        return `<span style="display:inline-block;padding:1px 6px;border-radius:12px;background:${bg};color:${c};font-weight:700;white-space:nowrap">${pos?'+':''}${n.toFixed(1)}%</span>`;
    };
    let html = `<table style="width:100%;border-collapse:collapse;font-size:11px;direction:rtl">
        <thead><tr style="color:var(--text3);border-bottom:2px solid var(--border);font-size:10px">
            <th style="text-align:right;padding:6px 8px;font-weight:600">מניה</th>
            <th style="text-align:center;padding:6px 3px">יום</th>
            <th style="text-align:center;padding:6px 3px">שבוע</th>
            <th style="text-align:center;padding:6px 3px">חודש</th>
            <th style="text-align:center;padding:6px 3px">P&amp;L</th>
            <th style="text-align:center;padding:6px 3px">מגמה</th>
        </tr></thead><tbody>`;
    Object.entries(stocks).sort(([a],[b]) => parseFloat(stocks[b].change_1d) - parseFloat(stocks[a].change_1d)).forEach(([name, d]) => {
        const closes = d.history.map(h => h.close);
        const trendColor = parseFloat(d.change_1m) >= 0 ? '#15803d' : '#b91c1c';
        const inceptionPct = d.buyPrice > 0 ? ((d.currentPrice - d.buyPrice) / d.buyPrice * 100).toFixed(2) : null;
        html += `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:7px 8px;font-weight:700;white-space:nowrap;color:var(--text)">${name}</td>
            <td style="text-align:center;padding:5px 3px">${pill(d.change_1d)}</td>
            <td style="text-align:center;padding:5px 3px">${pill(d.change_1w)}</td>
            <td style="text-align:center;padding:5px 3px">${pill(d.change_1m)}</td>
            <td style="text-align:center;padding:5px 3px">${inceptionPct != null ? pill(inceptionPct) : '<span style="color:var(--text3)">—</span>'}</td>
            <td style="text-align:center;padding:4px">${_sparkline(closes, trendColor)}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    body.innerHTML = html;
    if (loading) loading.style.display = 'none';
}

function renderPnLTab(dailyPnL) {
    _pnlData = dailyPnL || [];
    _pnlIdx  = _pnlData.length - 1;
    _renderPnLDay();
}

function _pnlNav(dir) {
    _pnlIdx = Math.max(0, Math.min(_pnlData.length - 1, _pnlIdx + dir));
    _renderPnLDay();
}

function _renderPnLDay() {
    const body    = document.getElementById('pnl-nav-body');
    const loading = document.getElementById('pnl-loading');
    if (!body || !_pnlData.length) return;
    const d        = _pnlData[_pnlIdx];
    const pnlColor = d.pnl >= 0 ? '#16a34a' : '#dc2626';
    const sign     = d.pnl >= 0 ? '+' : '−';
    const dateHe   = new Date(d.date + 'T12:00:00').toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // Bar chart: last 30 days up to _pnlIdx
    const slice   = _pnlData.slice(Math.max(0, _pnlIdx - 29), _pnlIdx + 1);
    const maxAbs  = Math.max(...slice.map(x => Math.abs(x.pnl)), 1);
    const barW    = 100 / slice.length;
    const bars    = slice.map((day, i) => {
        const h  = (Math.abs(day.pnl) / maxAbs * 36).toFixed(1);
        const c  = day.pnl >= 0 ? '#86efac' : '#fca5a5';
        const hi = i === slice.length - 1 ? `stroke="${day.pnl >= 0 ? '#16a34a' : '#dc2626'}" stroke-width="1"` : '';
        return `<rect x="${(i * barW + 0.2).toFixed(2)}%" y="${(40 - h).toFixed(1)}" width="${(barW - 0.5).toFixed(2)}%" height="${h}" fill="${c}" rx="1.5" ${hi}/>`;
    }).join('');

    body.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <button onclick="_pnlNav(-1)" style="padding:5px 12px;border-radius:7px;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-size:15px;line-height:1" ${_pnlIdx <= 0 ? 'disabled style="opacity:.4"' : ''}>→</button>
            <span style="font-size:13px;font-weight:700;color:var(--text)">${dateHe}</span>
            <button onclick="_pnlNav(1)"  style="padding:5px 12px;border-radius:7px;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-size:15px;line-height:1" ${_pnlIdx >= _pnlData.length - 1 ? 'disabled style="opacity:.4"' : ''}>←</button>
        </div>
        <div style="text-align:center;margin-bottom:14px;direction:ltr">
            <div style="font-size:24px;font-weight:700;color:var(--text)">₪${Math.abs(d.value).toLocaleString('he-IL')}</div>
            <div style="font-size:15px;font-weight:700;color:${pnlColor}">${sign}₪${Math.abs(d.pnl).toLocaleString('he-IL')} (${sign}${Math.abs(d.pnlPct)}%)</div>
        </div>
        <svg viewBox="0 0 100 40" width="100%" height="56" preserveAspectRatio="none" style="display:block;border-radius:6px;overflow:hidden">${bars}</svg>
        <div style="font-size:10px;color:var(--text3);text-align:center;margin-top:5px">30 ימים אחרונים — לחץ על חצים לדפדוף</div>`;
    if (loading) loading.style.display = 'none';
}

function _escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatInsightsHTML(text) {
    if (!text) return '';
    const sections = [
        { keys: ['חוזקות', 'חוזק'],   icon: '✅', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
        { keys: ['חולשות', 'חולשה'],  icon: '⚠️', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
        { keys: ['המלצות', 'המלצה'],  icon: '💡', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
        { keys: ['סיכום', 'מסקנה'],   icon: '📊', color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe' },
        { keys: ['סיכונים', 'סיכון'], icon: '🔴', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    ];

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let html = '';
    let currentSection = null;
    let currentItems = [];

    function flushSection() {
        if (!currentSection && !currentItems.length) return;
        if (currentSection) {
            const s = currentSection;
            const bulletHTML = currentItems.map(item => {
                const clean = _escHtml(item.replace(/^[-•*#]+\s*/, '').replace(/\*\*/g, ''));
                return `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px"><span style="color:${s.color};flex-shrink:0">▸</span><span style="color:var(--text);font-size:13px;line-height:1.6">${clean}</span></div>`;
            }).join('');
            html += `<div style="background:${s.bg};border:1px solid ${s.border};border-radius:12px;padding:14px 16px;margin-bottom:12px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-weight:700;font-size:13px;color:${s.color}"><span>${s.icon}</span>${s.keys[0]}</div>${bulletHTML}</div>`;
        } else if (currentItems.length) {
            html += `<div style="font-size:13px;line-height:1.8;color:var(--text);margin-bottom:10px">${currentItems.map(_escHtml).join('<br>')}</div>`;
        }
        currentSection = null;
        currentItems = [];
    }

    lines.forEach(line => {
        const cleanLine = line.replace(/\*\*/g, '').replace(/#+\s*/, '').replace(/:$/, '').trim();
        const matched = sections.find(s => s.keys.some(k => cleanLine.includes(k)));
        // A section header: matches keyword AND is a short label line (not a bullet)
        if (matched && !line.trimStart().match(/^[-•*]/) && cleanLine.length < 40) {
            flushSection();
            currentSection = matched;
        } else {
            currentItems.push(line.replace(/\*\*/g, ''));
        }
    });
    flushSection();
    return html || `<div style="font-size:13px;line-height:1.8;color:var(--text);white-space:pre-wrap">${_escHtml(text)}</div>`;
}

async function askPortfolioInsights(silent = false) {
    const btn  = document.getElementById('insights-btn');
    const body = document.getElementById('insights-panel-body');
    if (!body) return;
    if (btn?.disabled) return; // already running
    if (!silent) { openInsightsPanel(); switchInsightsTab('ai'); }
    if (btn) { btn.disabled = true; btn.innerHTML = '<span style="animation:spin 1s linear infinite;display:inline-block">⏳</span> מחשב...'; }
    body.innerHTML = '<div style="text-align:center;padding:30px 20px;color:var(--text3)"><div style="font-size:28px;margin-bottom:10px;animation:spin 1.2s linear infinite;display:inline-block">⏳</div><div style="font-size:13px">מנתח את התיק שלך...</div></div>';
    try {
        // Build enriched context: holdings + historical trends
        const ptf = portfolio ?? {};
        const histStocks = _insightsHistoryData?.stocks ?? {};
        const holdingsArr = Object.entries(ptf).map(([name, h]) => {
            const cur  = stocksData[name]?.price ?? 0;
            const qty  = h.qty ?? h.quantity ?? h.shares ?? 0;
            const buy  = parseFloat(h.buyPrice ?? h.avgPrice ?? h.avgCost ?? 0);
            const pnlPct  = buy > 0 ? ((cur - buy) / buy * 100).toFixed(1) : '0.0';
            const pnlIls  = Math.round((cur - buy) * qty);
            const hs   = histStocks[name];
            const trend = hs ? `, יום:${hs.change_1d}% שבוע:${hs.change_1w}% חודש:${hs.change_1m}% 3ח:${hs.change_3m}%` : '';
            return { name, qty, cur, buy, pnlPct, pnlIls, trend };
        }).filter(h => h.qty > 0 && h.cur > 0);

        const holdings = holdingsArr.map(h =>
            `${h.name}: ${h.qty} מניות, מחיר ₪${h.cur.toFixed(2)}, P&L ${h.pnlPct}%${h.trend}`
        ).join('\n');

        // Worst cumulative contributor
        const worst = [...holdingsArr].sort((a,b) => a.pnlIls - b.pnlIls)[0];
        const worstLine = worst
            ? `\n\nתשומת לב: המניה שתרמה הכי פחות לרווח המצטבר היא "${worst.name}" עם P&L של ₪${worst.pnlIls.toLocaleString('he-IL')} (${worst.pnlPct}%). ספק תובנה ממוקדת וספציפית עליה בסעיף "המלצות".`
            : '';

        const prompt = `להלן תיק ההשקעות שלי עם נתוני מגמה היסטוריים:\n${holdings}${worstLine}\n\nנתח את התיק וספק תובנות מעשיות בפורמט הבא בדיוק:\n\nחוזקות:\n- [נקודת חוזק 1]\n- [נקודת חוזק 2]\n\nחולשות:\n- [נקודת חולשה 1]\n- [נקודת חולשה 2]\n\nהמלצות:\n- [המלצה ממוקדת על ${worst?.name ?? 'המניה החלשה'}]\n- [המלצה מעשית נוספת]\n\nהיה קצר, מעשי ומבוסס על הנתונים. כתוב בעברית בלבד.`;

        const res  = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], quotes: window._lastQuotes || [] }),
            signal: AbortSignal.timeout(30000),
        });
        const data = await res.json();
        if (!res.ok) {
            body.innerHTML = `<div style="color:#dc2626;font-size:13px;padding:10px">${data.error ?? `שגיאת שרת ${res.status}`}</div>`;
        } else {
            const reply = data.reply ?? data.content ?? '';
            body.innerHTML = reply ? formatInsightsHTML(reply) : '<div style="color:var(--text3);font-size:13px">השרת לא החזיר תשובה.</div>';
        }
    } catch(e) {
        body.innerHTML = `<div style="color:#dc2626;font-size:13px;padding:10px">${e.name === 'TimeoutError' ? 'הבקשה לקחה יותר מדי זמן.' : `שגיאה: ${e.message}`}</div>`;
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span style="font-size:15px">🔄</span> עדכן תובנות AI'; }
    }
}

// ── Portfolio Analysis ─────────────────────────────────────────────────────
let _analysisLoaded = false;
function loadPortfolioAnalysis() {
    const cards  = document.getElementById('analysis-cards');
    const sumBar = document.getElementById('analysis-summary');
    if (!cards) return;

    // Use already-loaded globals: portfolio, transactionHistory, window._lastQuotes
    const ptf    = portfolio ?? {};
    const names  = Object.keys(ptf);
    const qList  = window._lastQuotes ?? [];

    if (!names.length) {
        cards.innerHTML = '<div style="text-align:center;color:var(--text3);padding:20px">אין מניות בתיק</div>';
        return;
    }
    if (!qList.length) {
        cards.innerHTML = '<div style="text-align:center;color:var(--text3);padding:20px">ממתין לנתוני שוק...</div>';
        return;
    }

    const qMap = Object.fromEntries(qList.map(q => [q.symbol, q]));

    // First buy date per stock name from transactionHistory
    const firstBuy = {};
    [...(transactionHistory ?? [])].reverse().forEach(tx => {
        const key = tx.name ?? tx.symbol ?? '';
        if ((tx.action === 'Buy' || tx.type === 'buy') && key && !firstBuy[key])
            firstBuy[key] = tx.date ?? tx.time ?? '';
    });

    const fmt  = n => Math.abs(Math.round(n)).toLocaleString('he-IL');
    const fmtP = n => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

    let totalVal = 0, totalCost = 0, totalDay = 0;
    const rows = [];
    names.forEach(name => {
        const h   = ptf[name];
        const sym = STOCK_SYMBOLS[name];
        const q   = sym && qMap[sym];
        if (!q?.regularMarketPrice) return;
        const cur     = q.regularMarketPrice;
        const prev    = q.regularMarketPreviousClose ?? cur;
        const qty     = h.qty ?? h.quantity ?? h.shares ?? h.amount ?? h.units ?? h.count ?? 0;
        const avg     = h.buyPrice ?? h.avgPrice ?? 0;
        const cost    = h.totalCost ?? qty * avg;
        const dayPct  = prev > 0 ? (cur - prev) / prev * 100 : 0;
        const dayGain = (cur - prev) * qty;
        const totPct  = avg > 0 ? (cur - avg) / avg * 100 : 0;
        const totGain = (cur - avg) * qty;
        const buyDate = firstBuy[name] ?? '';
        totalVal  += cur * qty;
        totalCost += cost;
        totalDay  += dayGain;
        rows.push({ name, cur, prev, qty, avg, cost, dayPct, dayGain, totPct, totGain, sym, buyDate });
    });

    rows.sort((a, b) => b.totPct - a.totPct);

    // Summary bar
    const plPct = totalCost > 0 ? (totalVal - totalCost) / totalCost * 100 : 0;
    const plIls = totalVal - totalCost;
    if (sumBar) sumBar.innerHTML = [
        `<span style="font-size:12px;color:var(--text3)">שווי תיק</span>`,
        `<span style="font-size:15px;font-weight:700">₪${fmt(totalVal)}</span>`,
        `<span style="font-size:12px;color:${totalDay>=0?'var(--profit)':'var(--loss)'}">${totalDay>=0?'+':'-'}₪${fmt(totalDay)} היום</span>`,
        `<span style="font-size:12px;color:${plIls>=0?'var(--profit)':'var(--loss)'}">${plIls>=0?'+':'-'}₪${fmt(plIls)} (${fmtP(plPct)}) סה״כ</span>`,
    ].join('');

    if (!rows.length) {
        cards.innerHTML = '<div style="text-align:center;color:var(--text3);padding:20px">אין נתוני מחיר זמינים</div>';
        return;
    }

    cards.innerHTML = rows.map(r => {
        const plCls = r.totPct >= 0 ? 'var(--profit)' : 'var(--loss)';
        const dCls  = r.dayPct >= 0 ? 'var(--profit)' : 'var(--loss)';
        const dateStr = r.buyDate
            ? (r.buyDate.length > 10 ? new Date(r.buyDate).toLocaleDateString('he-IL') : r.buyDate)
            : '—';
        return `<div style="background:var(--bg2,#f9fafb);border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:7px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:14px;font-weight:700">${r.name}</span>
            <span style="font-size:13px;font-weight:700;color:${plCls}">${fmtP(r.totPct)}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 12px;font-size:12px">
            <div><span style="color:var(--text3)">כמות: </span><b>${r.qty} יח׳</b></div>
            <div><span style="color:var(--text3)">שער קנייה: </span><b>₪${r.avg.toLocaleString('he-IL',{maximumFractionDigits:2})}</b></div>
            <div><span style="color:var(--text3)">שער נוכחי: </span><b>₪${r.cur.toLocaleString('he-IL',{maximumFractionDigits:2})}</b></div>
            <div><span style="color:var(--text3)">שינוי יומי: </span><b style="color:${dCls}">${fmtP(r.dayPct)}</b></div>
            <div><span style="color:var(--text3)">עלות: </span><b>₪${fmt(r.cost)}</b></div>
            <div><span style="color:var(--text3)">שווי: </span><b>₪${fmt(r.cur * r.qty)}</b></div>
            <div><span style="color:var(--text3)">רווח/הפסד: </span><b style="color:${plCls}">${r.totGain>=0?'+':'-'}₪${fmt(r.totGain)}</b></div>
            <div><span style="color:var(--text3)">קנייה ראשונה: </span><b>${dateStr}</b></div>
          </div>
        </div>`;
    }).join('');
    _analysisLoaded = true;
}

// ── Init ───────────────────────────────────────────────────────────────────

let highestZIndex = 100;

// ── Mobile Tabs ─────────────────────────────────────────────────────────────
const MOB_TABS = {
    market:    ['win-indices-tase', 'win-stocks', 'win-realestate'],
    portfolio: ['win-portfolio', 'win-simulator', 'win-portfolio-analytics'],
    analysis:  ['win-ai-insights'],
};
const MOB_ALL = Object.values(MOB_TABS).flat();

// Panel labels for the picker
const PANEL_DEFS = {
    market:    [
        { id: 'win-indices-tase', label: 'TA-35' },
        { id: 'win-stocks',       label: 'מניות' },
        { id: 'win-main-chart',   label: 'גרף מניה' },
    ],
    portfolio: [
        { id: 'win-portfolio',           label: 'תיק השקעות' },
        { id: 'win-portfolio-analytics', label: 'ניתוח תיק' },
        { id: 'win-simulator',           label: 'קנה / מכור' },
    ],
    analysis:  [],
};
const PANEL_TAB_LABELS = { market: 'שוק', portfolio: 'תיק', analysis: 'ניתוח' };

// Always start with all panels visible — don't persist hidden-panel prefs across sessions
localStorage.removeItem('mob_panels');
let _panelPrefs = {};
const _PICKER_IDS = new Set(Object.values(PANEL_DEFS).flat().map(p => p.id));
function _isPanelOn(id) { return _panelPrefs[id] !== false; }

function switchMobileTab(tab) {
    if (window.innerWidth > 768) return;
    document.querySelectorAll('.mob-tab[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    // Hide insights panel when not on analysis tab (it's outside #dashboard now)
    if (tab !== 'analysis') {
        const insEl = document.getElementById('win-ai-insights');
        if (insEl) insEl.style.display = 'none';
        const bd = document.getElementById('insights-backdrop');
        if (bd) bd.style.display = 'none';
    }
    // Hide ALL dashboard cards not in this tab (includes stock detail windows)
    const skipHide = new Set(['win-ai-chat', 'win-portfolio-chart']); // managed separately
    document.querySelectorAll('#dashboard .card').forEach(card => {
        if (!card.id || skipHide.has(card.id)) return;
        const inTab = MOB_TABS[tab].includes(card.id);
        const isKnown = MOB_ALL.includes(card.id);
        if (!inTab) {
            card.classList.add('mob-hidden');
        } else {
            card.classList.remove('mob-hidden');
            card.style.display  = (card.id === 'win-ai-insights') ? 'flex' : '';
            card.style.opacity  = '1';
            card.style.transform = 'none';
            card.style.position = 'static';
            card.style.top = ''; card.style.left = '';
            card.style.width  = '100%';
            card.style.height = '';
        }
        // Apply panel picker preference for known panels
        if (isKnown && inTab && !_isPanelOn(card.id)) card.classList.add('mob-hidden');
    });
    if (tab === 'analysis') {
        openInsightsPanel();
        switchInsightsTab('ai');
        if (!document.getElementById('insights-btn')?.disabled) {
            askPortfolioInsights(true);
        }
    }
    if (tab === 'market') {
        setTimeout(() => {
            if (indexChart) indexChart.resize();
            else drawIndexChart();
            Object.keys(activeStockWindows).forEach(n => activeStockWindows[n].chart?.resize());
        }, 80);
    }
}

// ── Panel Picker ─────────────────────────────────────────────────────────────
function openPanelPicker() {
    _renderPanelPicker();
    document.getElementById('panel-picker-overlay').classList.remove('hidden');
}
function closePanelPicker() {
    document.getElementById('panel-picker-overlay').classList.add('hidden');
}
function togglePanel(id) {
    _panelPrefs[id] = !_isPanelOn(id);
    localStorage.setItem('mob_panels', JSON.stringify(_panelPrefs));
    const activeTab = document.querySelector('.mob-tab.active')?.dataset.tab || 'market';
    switchMobileTab(activeTab);
    _renderPanelPicker();
}
function resetAllPanels() {
    _panelPrefs = {};
    localStorage.removeItem('mob_panels');
    const activeTab = document.querySelector('.mob-tab.active')?.dataset.tab || 'market';
    switchMobileTab(activeTab);
    _renderPanelPicker();
}
function _renderPanelPicker() {
    const body = document.getElementById('panel-picker-body');
    if (!body) return;
    body.innerHTML = `<div style="padding:0 16px 8px;text-align:left">
        <button onclick="resetAllPanels()" style="font-size:11px;color:var(--primary);background:none;border:none;cursor:pointer;padding:0">↺ הצג הכל</button>
    </div>` + Object.entries(PANEL_DEFS).map(([tab, panels]) => `
        <div class="picker-group">
            <div class="picker-group-label">${PANEL_TAB_LABELS[tab]}</div>
            <div class="picker-chips">
                ${panels.map(p => `
                    <button class="picker-chip ${_isPanelOn(p.id) ? 'active' : ''}"
                            onclick="togglePanel('${p.id}')">${p.label}</button>
                `).join('')}
            </div>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.innerWidth <= 768) switchMobileTab('market');
    else resetWindows();   // apply default layout on desktop first load
    try { initWindowManager(); } catch(e) { console.error("Window manager failed:", e); }
    const insightsPanel = document.getElementById('win-ai-insights');
    if (insightsPanel) makeDraggable(insightsPanel);
    requestNotifPermission();

    initTicker(); initStockSuggestions(); updateStockList(); updateRealEstateList(); updatePortfolioList(); updateTransactionHistory();
    fetchScanStrip();
    drawChart(); drawIndexChart();
    setTimeout(initPortfolioAnalytics, 3000);

    document.getElementById('buy-btn').onclick      = buyStock;
    document.getElementById('sell-btn-sim').onclick = sellStockSim;
    document.getElementById('refresh-btn').onclick  = () => refreshRealData();
    // Mark alerts read when AI chat window is focused (desktop)
    const aiWin = document.getElementById('win-ai-chat');
    if (aiWin) aiWin.addEventListener('mousedown', markAlertsRead, { once: false });

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
    if (new URLSearchParams(location.search).has('toast'))
        setTimeout(() => showToast('✅ MyBursa מחובר ועדכני'), 1000);

    // ── ברכת כניסה ──────────────────────────────────────────────────────────
    const _h = new Date().getHours();
    const _greet = _h < 12 ? 'בוקר טוב ☀️' : _h < 17 ? 'צהריים טובים 🌤️' : _h < 21 ? 'ערב טוב 🌆' : 'לילה טוב 🌙';
    setTimeout(() => showToast(`${_greet} — MyBursa מוכן`, { duration: 4000, color: '#1a73e8' }), 600);

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

    // Check portfolio alerts on load and every minute
    checkAlerts();
    setInterval(checkAlerts, 60_000);
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
    const isMax = win.classList.contains('maximized');

    if (winId === 'win-indices-tase' && indexChart) setTimeout(() => indexChart.resize(), 50);

    if (winId === 'win-portfolio-analytics') {
        setTimeout(() => {
            const sz = isMax ? 200 : 72;
            const c  = document.getElementById('portfolio-donut');
            if (c) {
                c.width = sz; c.height = sz;
                c.style.width = sz + 'px'; c.style.height = sz + 'px';
                if (c.parentElement) {
                    c.parentElement.style.width  = sz + 'px';
                    c.parentElement.style.height = sz + 'px';
                }
            }
            // Widen donut grid column
            const grid = win.querySelector('[style*="grid-template-columns"]');
            if (grid) grid.style.gridTemplateColumns = isMax ? `${sz + 24}px 1fr 1fr` : '82px 1fr 1fr';
            // Re-render (shows all sectors when maximized)
            win.dataset.maxMode = isMax ? '1' : '';
            initPortfolioAnalytics();
        }, 50);
    }

    // LW Charts uses autoSize — no manual resize needed for win-main-chart
    const nameMatch = winId.match(/win-detail-(.+)/);
    if (nameMatch && activeStockWindows[nameMatch[1]]) {
        setTimeout(() => activeStockWindows[nameMatch[1]].chart.resize(), 50);
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

const POPUP_WINDOWS = ['win-portfolio-chart', 'win-ai-insights'];

function resetWindows() {
    // Clear all card styles
    document.querySelectorAll('.card').forEach(card => {
        card.removeAttribute('style');
        card.classList.remove('maximized', 'mob-hidden');
    });

    // Keep popup windows hidden
    POPUP_WINDOWS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Restore insights modal as hidden centered modal
    const insightsWin = document.getElementById('win-ai-insights');
    if (insightsWin) {
        insightsWin.style.cssText = 'display:none;flex-direction:column;position:fixed;top:50%;left:50%;transform:translate(-50%,-48%) scale(0.96);width:min(760px,90vw);max-height:82vh;z-index:10001;box-shadow:0 24px 80px rgba(0,0,0,0.28);border-radius:20px;transition:opacity .22s,transform .22s;opacity:0';
    }
    const overlay = document.getElementById('ai-insights-overlay');
    if (overlay) { overlay.style.display = 'none'; overlay.style.opacity = '0'; }

    // Restore chat as fixed hidden panel (not part of grid)
    const chat = document.getElementById('win-ai-chat');
    if (chat) {
        chat.style.cssText = 'display:none;flex-direction:column;position:fixed;bottom:148px;left:24px;width:360px;height:520px;z-index:500;box-shadow:0 8px 40px rgba(0,0,0,0.22);border-radius:16px;transition:opacity .25s,transform .25s;transform:translateY(16px);opacity:0';
        window._chatOpen = false;
        const fab = document.getElementById('chat-fab-btn');
        if (fab) fab.style.transform = '';
    }

    // Apply fully dynamic layout that fills the dashboard exactly — no scroll, no gaps
    const dashboard = document.getElementById('dashboard');
    const dw = dashboard?.clientWidth  || window.innerWidth;
    const dh = dashboard?.clientHeight || 600;

    const lw  = 362, gap = 8;
    const cl  = lw + gap;
    const cw  = Math.max(380, dw - lw * 2 - gap * 3);
    const rl  = cl + cw + gap;

    const indH = 228;                                   // indices card (fixed)
    const anaH = 226;                                   // analytics card (fixed, +15%)
    const ch   = Math.max(180, dh - gap - anaH);       // chart: fills remaining center height
    const ph   = Math.round(dh * 0.68);                // portfolio: 68 % of height
    const simH = Math.max(100, dh - ph - gap);         // simulator: fills rest of left column
    const stH  = Math.max(100, dh - indH - gap);       // stocks: fills rest of right column

    const LAYOUT = {
        'win-portfolio':           { top:0,         left:0,  width:lw, height:ph   },
        'win-simulator':           { top:ph+gap,    left:0,  width:lw, height:simH },
        'win-main-chart':          { top:0,         left:cl, width:cw, height:ch   },
        'win-portfolio-analytics': { top:ch+gap,    left:cl, width:cw, height:anaH },
        'win-indices-tase':        { top:0,         left:rl, width:lw, height:indH },
        'win-stocks':              { top:indH+gap,  left:rl, width:lw, height:stH  },
    };

    Object.entries(LAYOUT).forEach(([id, styles]) => {
        const el = document.getElementById(id);
        if (!el) return;
        Object.entries(styles).forEach(([k, v]) => {
            el.style[k] = typeof v === 'number' ? v + 'px' : v;
        });
    });

    if (indexChart) indexChart.resize();
    Object.keys(activeStockWindows).forEach(name => {
        if (activeStockWindows[name].chart) activeStockWindows[name].chart.resize();
    });
}

function makeDraggable(el) {
    const header = el.querySelector('.window-header');
    if (!header || header._dragInit) return;
    header._dragInit = true;

    const isFixed = () => getComputedStyle(el).position === 'fixed';

    function startDrag(clientX, clientY) {
        el.style.zIndex = ++highestZIndex;
        el.classList.add('dragging');
        const elRect = el.getBoundingClientRect();

        if (isFixed()) {
            // top:50% left:50% are CSS-forced (!important) — move via transform only
            const startCX = elRect.left + elRect.width  / 2;
            const startCY = elRect.top  + elRect.height / 2;
            return function onMove(cx, cy) {
                const newCX = startCX + (cx - clientX);
                const newCY = startCY + (cy - clientY);
                const tx = newCX - window.innerWidth  / 2;
                const ty = newCY - window.innerHeight / 2;
                const maxTX = (window.innerWidth  - el.offsetWidth)  / 2;
                const maxTY = (window.innerHeight - el.offsetHeight) / 2;
                const clampedTX = Math.max(-window.innerWidth  / 2, Math.min(maxTX, tx));
                const clampedTY = Math.max(-window.innerHeight / 2, Math.min(maxTY, ty));
                el.style.transform = `translate(calc(-50% + ${clampedTX}px), calc(-50% + ${clampedTY}px))`;
            };
        } else {
            const dashboard = document.getElementById('dashboard');
            if (!dashboard) return null;
            const dashRect = dashboard.getBoundingClientRect();
            const shiftX = clientX - elRect.left;
            const shiftY = clientY - elRect.top;
            return function onMove(cx, cy) {
                let x = cx - dashRect.left - shiftX;
                let y = cy - dashRect.top  - shiftY;
                if (x < 0) x = 0;
                if (y < 0) y = 0;
                if (x + el.offsetWidth  > dashRect.width)  x = dashRect.width  - el.offsetWidth;
                if (y + el.offsetHeight > dashRect.height) y = dashRect.height - el.offsetHeight;
                el.style.left  = x + 'px';
                el.style.top   = y + 'px';
                el.style.right = 'auto';
            };
        }
    }

    // Mouse drag (desktop)
    header.addEventListener('mousedown', function(e) {
        if (e.target.closest('button') || e.target.closest('input')) return;
        e.preventDefault();
        document.body.style.cursor = 'grabbing';
        const onMove = startDrag(e.clientX, e.clientY);
        if (!onMove) return;
        function onMouseMove(ev) { onMove(ev.clientX, ev.clientY); }
        function onMouseUp() {
            el.classList.remove('dragging');
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        }
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    // Touch drag (mobile)
    header.addEventListener('touchstart', function(e) {
        if (e.target.closest('button') || e.target.closest('input')) return;
        const t = e.touches[0];
        const onMove = startDrag(t.clientX, t.clientY);
        if (!onMove) return;
        function onTouchMove(ev) {
            ev.preventDefault();
            const touch = ev.touches[0];
            onMove(touch.clientX, touch.clientY);
        }
        function onTouchEnd() {
            el.classList.remove('dragging');
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        }
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
    }, { passive: true });

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
            const reEl = document.getElementById('win-realestate');
            if (reEl) {
                maxH = reEl.getBoundingClientRect().top - dashRect2.top - elTop0 - 4;
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
    return out;
}

function addAIMessage(role, text) {
    const box = document.getElementById('ai-messages');
    const empty = document.getElementById('ai-empty-state');
    if (empty) empty.remove();
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

async function requestNotifPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        await Notification.requestPermission();
    }
    if (Notification.permission === 'granted') {
        await _subscribeToPush();
    }
}

async function _subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
            // Refresh subscription on server (in case it expired)
            await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(existing) });
            return;
        }
        const { publicKey } = await fetch('/api/push/vapid-public-key').then(r => r.json());
        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: _urlBase64ToUint8Array(publicKey),
        });
        await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
        console.log('[push] subscribed');
    } catch (e) {
        console.warn('[push] subscribe failed:', e.message);
    }
}

function _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
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
    const pctVals = data.map(p => parseFloat(((p.value - baseVal) / baseVal * 100).toFixed(3)));
    const lastPct = pctVals[pctVals.length - 1];
    const isUp    = lastPct >= 0;
    const color   = isUp ? '#34a853' : '#ea4335';

    // Summary bar (shared desktop + mobile)
    const summaryEl = document.getElementById('portfolio-chart-summary');
    if (summaryEl) {
        const sign   = lastPct >= 0 ? '+' : '';
        const ilsChg = lastVal - baseVal;
        const ilsS   = ilsChg >= 0 ? '+' : '';
        summaryEl.innerHTML = `<span style="color:${color};font-weight:700;font-size:0.95rem">${sign}${lastPct.toFixed(2)}%</span>&nbsp;<span style="color:#9aa0a6;font-size:0.8rem">(${ilsS}₪${Math.round(ilsChg).toLocaleString('he-IL')})</span>`;
    }

    _renderPortfolioSVG(el, data, pctVals, color, isUp);
    return;

    // ── Desktop: LightweightCharts ────────────────────────────────────────
    const todayBase  = Math.floor(Date.now() / 86400000) * 86400;
    const dataBase   = Math.floor(data[0].time / 86400) * 86400;
    const tsShift    = todayBase - dataBase;
    const pctData    = data.map((p, i) => ({ time: p.time + tsShift, value: pctVals[i] }));

    el.style.bottom = '';   // reset — let inset:0 apply fully
    const elH = el.clientHeight || 300;
    _lwPortfolio = LightweightCharts.createChart(el, {
        width:  el.clientWidth  || 400,
        height: elH,
        layout:  { background: { color: '#ffffff' }, textColor: '#5f6368' },
        grid:    { vertLines: { color: 'rgba(0,0,0,0.04)' }, horzLines: { color: 'rgba(0,0,0,0.04)' } },
        rightPriceScale: { borderColor: 'rgba(0,0,0,0.1)', scaleMargins: { top: 0.08, bottom: 0.04 } },
        timeScale: {
            visible: true,
            borderColor: 'rgba(0,0,0,0.08)',
            tickMarkFormatter: t => {
                const d = new Date(t * 1000);
                return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
            },
        },
        handleScroll: true, handleScale: true,
    });
    const series = _lwPortfolio.addAreaSeries({
        lineColor: color,
        topColor: isUp ? 'rgba(52,168,83,0.2)' : 'rgba(234,67,53,0.2)',
        bottomColor: 'rgba(0,0,0,0)',
        lineWidth: 2,
        priceFormat: { type: 'custom', formatter: v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` },
    });
    series.setData(pctData);
    series.createPriceLine({ price: 0, color: 'rgba(0,0,0,0.15)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
    _lwPortfolio.timeScale().fitContent();
}

function _renderPortfolioSVG(el, data, pctVals, color, isUp) {
    const isMobile = window.innerWidth <= 768;
    const chartWrap = document.getElementById('ptf-chart-wrap') || el.parentElement;

    const LBAR = 24; // time-label bar height px
    const H = isMobile
        ? Math.round(window.innerHeight * 0.72)
        : Math.round(window.innerHeight * 0.42);

    // Give chartWrap an explicit height; read its width BEFORE restyling el
    chartWrap.style.height    = (H + LBAR) + 'px';
    chartWrap.style.flex      = 'none';
    chartWrap.style.position  = 'relative';
    chartWrap.style.overflow  = 'hidden';

    const W = chartWrap.offsetWidth || (isMobile ? window.innerWidth : 400);

    // el fills the full wrap area; labels sit inside at the bottom
    el.style.cssText = `position:absolute;top:0;left:0;width:${W}px;height:${H + LBAR}px`;

    // Hide the old sibling timerange div (no longer used)
    const oldTr = document.getElementById('portfolio-chart-timerange');
    if (oldTr) oldTr.style.display = 'none';

    // Time labels — pick up to 5 evenly-spaced, deduplicate consecutive identical values
    const fmtT = t => { const d = new Date(t*1000); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); };
    const tCount = Math.min(5, data.length);
    const rawLabels = tCount < 2
        ? (tCount === 1 ? [fmtT(data[0].time)] : [])
        : Array.from({length: tCount}, (_, i) => {
            const idx = Math.round(i * (data.length - 1) / (tCount - 1));
            return fmtT(data[idx].time);
          });
    const uniqLabels = rawLabels.filter((l, i) => i === 0 || l !== rawLabels[i - 1]);
    const tSpans = uniqLabels.map(l => `<span>${l}</span>`).join('');

    const PAD = { top: 14, right: 56, bottom: 6, left: 22 };
    const iW  = W - PAD.left - PAD.right;
    const iH  = H - PAD.top  - PAD.bottom;

    const minV = Math.min(...pctVals);
    const maxV = Math.max(...pctVals);
    const span = maxV - minV || 0.5;
    const vPad = span * 0.12 + 0.08;
    const lo   = minV - vPad, hi = maxV + vPad * 0.5;
    const rng  = hi - lo;

    const xS    = i => PAD.left + (i / (pctVals.length - 1)) * iW;
    const yS    = v => PAD.top  + iH - ((v - lo) / rng) * iH;
    const zeroY = Math.min(Math.max(yS(0), PAD.top), PAD.top + iH);

    // ── קו פתיחת תיק ─────────────────────────────────────────────────────────
    // מחשב מהעסקה הראשונה בהיסטוריה
    const firstTx = (transactionHistory ?? []).slice().sort((a, b) => {
        const ta = a.date ? new Date(a.date).getTime() : 0;
        const tb = b.date ? new Date(b.date).getTime() : 0;
        return ta - tb;
    })[0];
    const openTs = firstTx?.date ? new Date(firstTx.date).getTime() / 1000 : null;
    let openLineX = null;
    if (openTs && data.length >= 2) {
        const t0 = data[0].time, t1 = data[data.length - 1].time;
        if (openTs >= t0 && openTs <= t1) {
            openLineX = PAD.left + ((openTs - t0) / (t1 - t0)) * iW;
        }
    }
    const openLineDate = firstTx?.date
        ? new Date(firstTx.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
        : null;

    const pts = pctVals.map((v, i) => [xS(i), yS(v)]);
    let line = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
        const cpx = ((pts[i-1][0] + pts[i][0]) / 2).toFixed(1);
        line += ` C${cpx},${pts[i-1][1].toFixed(1)} ${cpx},${pts[i][1].toFixed(1)} ${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`;
    }
    const baseY = isUp ? zeroY : (PAD.top + iH);
    const fill  = line + ` L${pts[pts.length-1][0].toFixed(1)},${baseY.toFixed(1)} L${pts[0][0].toFixed(1)},${baseY.toFixed(1)}Z`;

    const pLabels = [hi, (hi+lo)/2, lo].map(v => ({ y: yS(v), label: `${v>=0?'+':''}${v.toFixed(1)}%` }));
    const gid  = `pg${Date.now()}`;
    const gY1  = Math.min(...pts.map(p=>p[1]));
    const gY2  = baseY;

    el.innerHTML = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;top:0;left:0;display:block">
  <defs>
    <linearGradient id="${gid}" x1="0" y1="${gY1}" x2="0" y2="${gY2}" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="${color}" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.01"/>
    </linearGradient>
  </defs>
  ${pLabels.map(p=>`<line x1="${PAD.left}" y1="${p.y.toFixed(1)}" x2="${W-PAD.right}" y2="${p.y.toFixed(1)}" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>`).join('')}
  <line x1="${PAD.left}" y1="${zeroY.toFixed(1)}" x2="${W-PAD.right}" y2="${zeroY.toFixed(1)}" stroke="rgba(0,0,0,0.18)" stroke-width="1" stroke-dasharray="4,3"/>
  ${openLineX != null ? `
  <line x1="${openLineX.toFixed(1)}" y1="${PAD.top}" x2="${openLineX.toFixed(1)}" y2="${(PAD.top+iH).toFixed(1)}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.8"/>
  <rect x="${(openLineX - 20).toFixed(1)}" y="${PAD.top}" width="40" height="16" rx="4" fill="#f59e0b" opacity="0.9"/>
  <text x="${openLineX.toFixed(1)}" y="${(PAD.top+11).toFixed(1)}" font-size="10" font-family="Inter,sans-serif" fill="#fff" text-anchor="middle" font-weight="600">פתיחה${openLineDate ? ' '+openLineDate : ''}</text>
  ` : ''}
  <path d="${fill}" fill="url(#${gid})"/>
  <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${pts[pts.length-1][0].toFixed(1)}" cy="${pts[pts.length-1][1].toFixed(1)}" r="5" fill="${color}" stroke="#fff" stroke-width="2"/>
  ${pLabels.map(p=>`<text x="${(W-PAD.right+4).toFixed(1)}" y="${(p.y+4).toFixed(1)}" font-size="11" font-family="Inter,sans-serif" fill="#9aa0a6">${p.label}</text>`).join('')}
</svg>
<div style="position:absolute;top:${H}px;left:0;width:${W}px;height:${LBAR}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${PAD.right}px 0 ${PAD.left}px;font-size:11px;color:#9aa0a6;font-family:Inter,sans-serif;direction:ltr;border-top:1px solid rgba(0,0,0,0.08);box-sizing:border-box">${tSpans}</div>`;
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
        requestAnimationFrame(() => requestAnimationFrame(() => drawPortfolioChart()));
    } else {
        win.style.display = 'none';
        win.classList.add('mob-hidden');
        document.getElementById('ptf-cv')?.remove();
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

    // ── חסום שאלות היסטוריות לפני קריאה לשרת ─────────────────────────────
    if (/אתמול|שלשום|שבוע שעבר|חודש שעבר|לפני שבוע|לפני חודש|ביום שישי|ביום חמישי/.test(text)) {
        addAIMessage('assistant', 'אין לי גישה לנתונים היסטוריים — אני עובד עם מחירים חיים של היום בלבד.\nלנתוני ימים קודמים — בדוק ב-Bizportal או ב-Google Finance.');
        btn.disabled = false;
        return;
    }

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
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); }
        catch { data = { error: 'שגיאת תקשורת עם השרת — נסה שוב' }; }
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


// ── Scan Strip ───────────────────────────────────────────────────────────────

async function fetchScanStrip() {
    try {
        const res  = await fetch('/api/latest-scans?limit=5');
        if (!res.ok) return;
        const data = await res.json();
        const scans = Array.isArray(data) ? data : (data.scans ?? []);
        if (!scans.length) return;

        const strip = document.getElementById('scan-strip');
        const items = document.getElementById('scan-strip-items');
        if (!strip || !items) return;

        items.innerHTML = scans.slice(0, 5).map(s => {
            const rec = (s.recommendation || '').toLowerCase();
            const isBuy  = rec.includes('buy')  || rec.includes('קנה');
            const isSell = rec.includes('sell') || rec.includes('מכור');
            const cls    = isBuy ? 'buy' : isSell ? 'sell' : 'hold';
            const emoji  = isBuy ? '🟢' : isSell ? '🔴' : '🟡';
            const name   = s.company || s.title || '—';
            const tip    = s.summary ? s.summary.slice(0, 120) : '';
            return `<span class="scan-chip ${cls}" title="${tip}" onclick="openScanDetail(${JSON.stringify(JSON.stringify(s))})">${emoji} ${name}</span>`;
        }).join('');

        strip.style.display = 'flex';
    } catch (e) {
        console.warn('[scan-strip]', e.message);
    }
}

function openScanDetail(jsonStr) {
    try {
        const s   = JSON.parse(jsonStr);
        const rec = s.recommendation || '—';
        const isBuy  = rec.toLowerCase().includes('buy')  || rec.includes('קנה');
        const isSell = rec.toLowerCase().includes('sell') || rec.includes('מכור');
        const emoji  = isBuy ? '🟢' : isSell ? '🔴' : '🟡';
        const msg    = `**${emoji} ${s.company || s.title}**\n` +
                       `המלצה: ${rec}\n` +
                       (s.summary ? `\n${s.summary}` : '') +
                       (s.url ? `\n\n[מקור](${s.url})` : '');
        const box = document.getElementById('chat-messages') || document.getElementById('ai-messages');
        if (box) {
            const div = document.createElement('div');
            div.className = 'chat-msg ai';
            div.innerHTML = tagStockMentions(msg);
            box.appendChild(div);
            box.scrollTop = box.scrollHeight;
            // Open chat FAB on mobile when AI responds
            if (window._chatOpen === false && window.toggleAIChat) toggleAIChat();
        }
    } catch {}
}

// Refresh strip every 10 minutes
setInterval(fetchScanStrip, 10 * 60 * 1000);

// ── Portfolio Alerts ────────────────────────────────────────────────────────
async function checkAlerts() {
    try {
        const res = await fetch('/api/my-alerts');
        if (!res.ok) return;
        const { alerts, unreadCount } = await res.json();

        // Update badge
        const badge = document.getElementById('alerts-badge');
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }

        // Update hot alerts panel
        const panel = document.getElementById('hot-alerts-panel');
        const list  = document.getElementById('hot-alerts-list') ?? panel;
        if (panel && alerts.length > 0) {
            panel.style.display = 'block';
            list.innerHTML = alerts.map((a, i) => {
                const rec = a.recommendation ?? 'HOLD';
                const recColor = rec === 'BUY' ? '#16a34a' : rec === 'SELL' ? '#dc2626' : '#d97706';
                const recBg   = rec === 'BUY' ? '#dcfce7' : rec === 'SELL' ? '#fee2e2' : '#fef9c3';
                const recHe   = rec === 'BUY' ? 'קנייה' : rec === 'SELL' ? 'מכירה' : 'החזק';
                const conf    = Math.min(100, Math.max(0, (a.confidence ?? 0.7) * 100));
                const confColor = conf >= 75 ? '#16a34a' : conf >= 50 ? '#d97706' : '#dc2626';
                const id = `alert-body-${i}`;
                const timeAgo = a.createdAt ? _timeAgo(new Date(a.createdAt)) : '';
                return `
                <div style="background:#fff;border:1px solid rgba(251,191,36,0.4);border-radius:10px;margin-bottom:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06)">
                    <div onclick="document.getElementById('${id}').style.display=document.getElementById('${id}').style.display==='none'?'block':'none'"
                         style="display:flex;align-items:center;gap:8px;padding:9px 11px;cursor:pointer">
                        <span style="font-size:16px">🔔</span>
                        <div style="flex:1;min-width:0">
                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                                <span style="font-weight:700;color:#111;font-size:13px">${a.company}</span>
                                <span style="background:${recBg};color:${recColor};font-size:10px;font-weight:700;padding:1px 8px;border-radius:20px;border:1px solid ${recColor}40">${recHe}</span>
                                ${a.unread !== false ? '<span style="background:#ef4444;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:10px">חדש</span>' : ''}
                            </div>
                            <div style="font-size:10px;color:#9ca3af;margin-top:1px">${timeAgo} · דוח מאיה</div>
                        </div>
                        <span style="color:#9ca3af;font-size:12px">▾</span>
                    </div>
                    <div id="${id}" style="display:none;padding:0 11px 10px;border-top:1px solid #fef3c7">
                        ${a.holderSummary ? `<div style="color:#374151;line-height:1.6;font-size:12px;direction:rtl;margin:8px 0;white-space:pre-line">${a.holderSummary}</div>` : ''}
                        <div style="display:flex;align-items:center;gap:6px;margin-top:8px">
                            <span style="font-size:10px;color:#6b7280;white-space:nowrap">אמינות</span>
                            <div style="flex:1;height:4px;background:#f3f4f6;border-radius:4px;overflow:hidden">
                                <div style="width:${conf}%;height:100%;background:${confColor};border-radius:4px;transition:width 0.6s"></div>
                            </div>
                            <span style="font-size:10px;font-weight:700;color:${confColor}">${Math.round(conf)}%</span>
                        </div>
                        ${a.url ? `<a href="${a.url}" target="_blank" style="display:inline-block;margin-top:8px;font-size:11px;color:#059669;text-decoration:none;font-weight:600">← לדוח המלא במאיה</a>` : ''}
                    </div>
                </div>`;
            }).join('');
        } else if (panel) {
            panel.style.display = 'none';
        }
    } catch(e) { console.warn('checkAlerts:', e); }
}

function _timeAgo(date) {
    const s = Math.floor((Date.now() - date) / 1000);
    if (s < 60) return 'עכשיו';
    if (s < 3600) return `לפני ${Math.floor(s/60)} דקות`;
    if (s < 86400) return `לפני ${Math.floor(s/3600)} שעות`;
    return `לפני ${Math.floor(s/86400)} ימים`;
}

async function markAlertsRead() {
    await fetch('/api/alerts/mark-read', { method: 'POST' }).catch(() => {});
    const badge = document.getElementById('alerts-badge');
    if (badge) badge.style.display = 'none';
}

// ── Portfolio Equity Summary ───────────────────────────────────────────────────
let _portfolioSummary = null;  // { totalMarketValue, availableCash, totalEquity, investedPct, cashPct }

async function fetchPortfolioSummary() {
    try {
        const r = await fetch('/api/portfolio/summary');
        if (!r.ok) return;
        _portfolioSummary = await r.json();
        renderEquityBar();
    } catch(e) { /* silent */ }
}

function renderEquityBar() {
    const s   = _portfolioSummary;
    const bar = document.getElementById('equity-progress-bar');
    const lbl = document.getElementById('equity-bar-labels');
    const eq  = document.getElementById('total-equity-value');
    const trend = document.getElementById('equity-daily-trend');
    if (!s) return;
    const fmt = v => '₪' + Math.round(v).toLocaleString('he-IL');
    if (eq) eq.textContent = fmt(s.totalEquity);
    if (bar) bar.style.width = `${s.investedPct}%`;
    if (lbl) lbl.innerHTML =
        `<span style="color:#1e40af;font-weight:600;font-size:10px">▪ מושקע ${fmt(s.totalMarketValue)} (${s.investedPct}%)</span>` +
        `<span style="color:#059669;font-weight:600;font-size:10px">▪ מזומן ${fmt(s.availableCash)} (${s.cashPct}%)</span>`;
    // Daily trend: use totalDailyPL stored from updatePortfolioList
    if (trend) {
        const dailyPL = window._portfolioDailyPL ?? 0;
        const eq2 = s.totalEquity || 1;
        const pct = ((dailyPL / eq2) * 100).toFixed(2);
        if (dailyPL !== 0) {
            const up = dailyPL >= 0;
            trend.innerHTML = `<span style="color:${up?'#16a34a':'#dc2626'}">${up?'▲':'▼'} ${up?'+':''}${pct}% היום</span>`;
        } else {
            trend.textContent = '';
        }
    }
}

// ── Sales History ─────────────────────────────────────────────────────────────
let _salesData       = [];
let _salesPeriod     = 'all';
let _salesSummary    = null;
let _salesAssetFilter = 'all';   // 'all' | 'stock' | 'index'

function setSalesAssetFilter(filter) {
    _salesAssetFilter = filter;
    document.querySelectorAll('.sales-asset-btn').forEach(b => {
        const active = b.dataset.filter === filter;
        b.classList.toggle('active', active);
        b.style.background  = active ? '#0f172a' : '#fff';
        b.style.color       = active ? '#fff'    : '#374151';
        b.style.borderColor = active ? '#0f172a' : '#e5e7eb';
    });
    renderSalesLog();
}

async function openSalesModal() {
    document.getElementById('sales-modal').style.display = 'flex';
    await Promise.all([refreshSalesData(), fetchPortfolioSummary()]);
}

function closeSalesModal() {
    document.getElementById('sales-modal').style.display = 'none';
}

async function refreshSalesData() {
    try {
        const [salesRes, summaryRes] = await Promise.all([
            fetch(`/api/sales?period=${_salesPeriod}`),
            fetch('/api/sales/summary'),
        ]);
        _salesData    = await salesRes.json();
        _salesSummary = await summaryRes.json();
        renderSalesLog();
        renderSalesSummary();
        renderSalesInline();
    } catch(e) { console.warn('refreshSalesData:', e); }
}

function setSalesPeriod(p) {
    _salesPeriod = p;
    document.querySelectorAll('.sales-period-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.period === p);
    });
    refreshSalesData();
}

function renderSalesSummary() {
    const s = _salesSummary;
    if (!s) return;
    const data = _salesPeriod === 'ytd' ? s.ytd : _salesPeriod === '12m' ? s.last12m : s.all;

    // Primary: total account value = baseCash + realizedPNL (all time, not filtered by period)
    const tav = s.totalAccountValue ?? s.totalCashBalance ?? 0;
    const el = id => document.getElementById(id);

    // Primary: available cash = 500k + proceeds - purchases
    const cash = s.cashBalance ?? s.totalCashBalance ?? 0;
    if (el('sales-total-cash'))
        el('sales-total-cash').textContent = `₪${cash.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Total Equity from portfolio summary
    if (el('sales-total-equity') && _portfolioSummary) {
        const te = _portfolioSummary.totalEquity;
        el('sales-total-equity').textContent = `₪${Math.round(te).toLocaleString('he-IL')}`;
    }

    // Base cash card
    if (el('sales-base-cash'))
        el('sales-base-cash').textContent = `₪${(s.baseCash ?? 500000).toLocaleString('he-IL', { minimumFractionDigits: 0 })}`;

    // Invested card — current market value of open positions (not cumulative purchases)
    const investedNow = _portfolioSummary?.totalMarketValue ?? s.purchaseCosts ?? 0;
    if (el('sales-invested'))
        el('sales-invested').textContent = `₪${Math.round(investedNow).toLocaleString('he-IL')}`;

    // Realized P&L (period-aware)
    const pnl = (_salesPeriod === 'all' ? (s.realizedPNL ?? data?.totalProfitLoss) : data?.totalProfitLoss) ?? 0;
    if (el('sales-total-pnl')) {
        el('sales-total-pnl').textContent = `${pnl >= 0 ? '+' : ''}₪${Math.abs(pnl).toLocaleString('he-IL', { minimumFractionDigits: 2 })}`;
        el('sales-total-pnl').style.color = pnl >= 0 ? '#16a34a' : '#dc2626';
    }

    // Avg ROI (period)
    const roi = data?.avgROI ?? 0;
    if (el('sales-avg-roi')) {
        el('sales-avg-roi').textContent = `${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`;
        el('sales-avg-roi').style.color = roi >= 0 ? '#16a34a' : '#dc2626';
    }

    // Trade count (period, excludes purchases)
    if (el('sales-count')) el('sales-count').textContent = (data?.count ?? 0);

    // Monthly average P/L (always all-time, from server)
    const mPnl = s.monthlyAvgPNL ?? 0;
    if (el('sales-monthly-pnl')) {
        el('sales-monthly-pnl').textContent = `${mPnl >= 0 ? '+' : ''}₪${Math.abs(mPnl).toLocaleString('he-IL', { minimumFractionDigits: 0 })}`;
        el('sales-monthly-pnl').style.color = mPnl >= 0 ? '#16a34a' : '#dc2626';
    }
    if (el('sales-months-active'))
        el('sales-months-active').textContent = `ממוצע / ${s.monthsActive ?? 1} חודשים`;
}

// ── Inline Sales Card (replaces portfolio chart window) ───────────────────────
function renderSalesInline() {
    const tbody = document.getElementById('sales-inline-body');
    const sumEl = document.getElementById('sales-inline-summary');
    if (!tbody) return;

    const real = (_salesData ?? []).filter(s => s.entryType === 'current' || s.entryType === 'historical');

    // Summary bar
    if (sumEl && _salesSummary) {
        const pnl = _salesSummary.realizedPNL ?? 0;
        const col = pnl >= 0 ? '#16a34a' : '#dc2626';
        const mPnl = _salesSummary.monthlyAvgPNL ?? 0;
        sumEl.innerHTML = `
            <span style="font-size:10px;color:#9ca3af">רווח ממומש:</span>
            <span style="font-size:12px;font-weight:700;color:${col}">${pnl>=0?'+':''}₪${Math.abs(Math.round(pnl)).toLocaleString('he-IL')}</span>
            <span style="font-size:10px;color:#9ca3af;margin-right:8px">ממוצע/חודש:</span>
            <span style="font-size:12px;font-weight:700;color:${mPnl>=0?'#16a34a':'#dc2626'}">${mPnl>=0?'+':''}₪${Math.abs(Math.round(mPnl)).toLocaleString('he-IL')}</span>
            <span style="font-size:10px;color:#9ca3af;margin-right:8px">עסקאות:</span>
            <span style="font-size:12px;font-weight:700;color:#374151">${real.length}</span>`;
    }

    if (!real.length) {
        tbody.innerHTML = `<tr><td style="text-align:center;padding:18px;color:#9ca3af;font-size:12px">אין עסקאות</td></tr>`;
        return;
    }

    // Show last 8 trades
    tbody.innerHTML = real.slice(0, 8).map(s => {
        const pnl = s.profitLoss ?? 0;
        const roi = s.roi ?? 0;
        const col = pnl >= 0 ? '#16a34a' : '#dc2626';
        return `<tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:5px 10px;font-weight:600;white-space:nowrap">${s.symbol}</td>
            <td style="padding:5px 4px;color:#6b7280;font-size:10.5px;white-space:nowrap">${s.sellDate ?? '—'}</td>
            <td style="padding:5px 4px;text-align:left;font-weight:700;color:${col}" dir="ltr">${pnl>=0?'+':''}₪${Math.abs(Math.round(pnl)).toLocaleString('he-IL')}</td>
            <td style="padding:5px 10px 5px 4px;text-align:left;color:${col};font-size:10.5px" dir="ltr">${roi>=0?'+':''}${roi.toFixed(1)}%</td>
        </tr>`;
    }).join('');
}

function renderSalesLog() {
    const tbody = document.getElementById('sales-log-body');
    if (!tbody) return;

    // Asset type filter
    const _isIndex = s => !s.symbol || s.entryType === 'initial_setup'
        || ['TA35','TA90','TA125','^TA35','^TA90','^TA125'].includes(s.symbol)
        || (s.symbol && !s.symbol.endsWith('.TA') && !s.symbol.match(/^[A-Z]{1,5}$/));
    let data = _salesData;
    if (_salesAssetFilter === 'index') data = data.filter(_isIndex);
    else if (_salesAssetFilter === 'stock') data = data.filter(s => !_isIndex(s) && s.entryType !== 'initial_setup');

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#9ca3af;font-size:12px">אין עסקאות להצגה</td></tr>`;
        return;
    }
    // Separate setup row (show once as footer, not inline)
    const trades = data.filter(s => s.entryType !== 'initial_setup');
    const hasSetup = data.some(s => s.entryType === 'initial_setup');

    const tradeRows = trades.map(s => {
        const pnl    = s.profitLoss ?? 0;
        const roi    = s.roi ?? 0;
        const col    = pnl >= 0 ? '#16a34a' : '#dc2626';
        const methodBadge = s.method === 'fifo'
            ? `<span style="font-size:8px;background:#ede9fe;color:#5b21b6;border-radius:3px;padding:1px 4px;font-weight:600;margin-right:2px">FIFO</span>`
            : '';
        const tag = s.entryType === 'current'
            ? `${methodBadge}<span style="font-size:9px;background:#dcfce7;color:#166534;border-radius:4px;padding:1px 5px;font-weight:600">נוכחי</span>`
            : `${methodBadge}<span style="font-size:9px;background:#fef3c7;color:#92400e;border-radius:4px;padding:1px 5px;font-weight:600">היסטורי</span>`;
        return `<tr style="border-bottom:1px solid #f3f4f6;font-size:12px">
            <td style="padding:6px 4px;white-space:nowrap">${s.sellDate ?? '—'}</td>
            <td style="padding:6px 4px;font-weight:600">${s.symbol}</td>
            <td class="sales-col-name" style="padding:6px 4px;color:#374151">${s.name ?? s.symbol}</td>
            <td style="padding:6px 4px;text-align:right" dir="ltr">${s.quantity}</td>
            <td style="padding:6px 4px;text-align:right;font-weight:600;color:${col}" dir="ltr">${pnl >= 0 ? '+' : ''}₪${Math.abs(pnl).toLocaleString('he-IL',{minimumFractionDigits:2})}</td>
            <td style="padding:6px 4px;text-align:right;color:${col}" dir="ltr">${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%</td>
            <td style="padding:6px 4px">${tag}</td>
        </tr>`;
    });

    tbody.innerHTML = !tradeRows.length
        ? `<tr><td colspan="7" style="text-align:center;padding:20px;color:#9ca3af;font-size:12px">אין עסקאות להצגה</td></tr>`
        : tradeRows.join('');
}

// ── Sales-form autocomplete (ms-symbol field) ──────────────────────────────
function salesAutocomplete(q) {
    const dd = document.getElementById('ms-ac-dd');
    if (!dd) return;
    const ql  = q.trim().toLowerCase();
    if (!ql) { dd.style.display = 'none'; return; }

    const hits = TASE125_DATA.filter(s =>
        s.nameHe.includes(q.trim()) ||
        s.nameEn.toLowerCase().includes(ql) ||
        s.ticker.toLowerCase().includes(ql)
    ).slice(0, 10);

    if (!hits.length) { dd.style.display = 'none'; return; }
    dd.innerHTML = hits.map(s => {
        return `<div data-ticker="${escAttr(s.ticker)}" data-name="${escAttr(s.nameHe)}" onmousedown="selectSalesStock(this.dataset.ticker,this.dataset.name)"
            style="padding:7px 10px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:12px;border-bottom:1px solid #f3f4f6">
            <div>
                <span style="font-weight:700">${s.nameHe}</span>
                <span style="font-size:9.5px;color:#9ca3af;margin-right:4px">${s.nameEn}</span>
            </div>
            <div style="text-align:left">
                ${_sectorBadge(s.sector)}
                <div style="font-size:9px;color:#9ca3af;font-family:monospace;text-align:left">${s.ticker}</div>
            </div>
        </div>`;
    }).join('');
    dd.style.display = 'block';
}

function selectSalesStock(ticker, nameHe) {
    const sym  = document.getElementById('ms-symbol');
    const name = document.getElementById('ms-name');
    const dd   = document.getElementById('ms-ac-dd');
    if (sym)  sym.value  = ticker;
    if (name) name.value = nameHe;
    if (dd)   dd.style.display = 'none';
    // Agurot hint: if stock is on TASE and typically priced in agurot (most are)
    const pu = document.getElementById('ms-price-unit');
    if (pu && ticker.endsWith('.TA')) pu.value = 'agorot';
    document.getElementById('ms-buy-date')?.focus();
}

async function submitManualSale() {
    const get = id => document.getElementById(id)?.value?.trim() ?? '';
    const body = {
        symbol:    get('ms-symbol').toUpperCase(),
        name:      get('ms-name') || get('ms-symbol'),
        buyDate:   get('ms-buy-date') || null,
        sellDate:  get('ms-sell-date'),
        buyPrice:  parseFloat(get('ms-buy-price')) || 0,
        sellPrice: parseFloat(get('ms-sell-price')) || 0,
        quantity:  parseFloat(get('ms-qty')) || 0,
        priceUnit: document.getElementById('ms-price-unit')?.value ?? 'NIS',
        entryType: 'historical',
    };
    if (!body.symbol || !body.sellDate || !body.sellPrice || !body.quantity) {
        return alert('נא למלא: טיקר, תאריך מכירה, מחיר מכירה, כמות');
    }
    try {
        const r = await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json();
        if (!j.ok) { alert('שגיאה: ' + j.error); return; }
        document.getElementById('manual-sale-form').reset();
        document.getElementById('manual-sale-form').style.display = 'none';
        await refreshSalesData();
    } catch(e) { alert('שגיאת רשת: ' + e.message); }
}

async function submitBulkImport() {
    const raw = document.getElementById('bulk-import-text')?.value?.trim();
    if (!raw) return alert('הדבק JSON או CSV');
    let body;
    try {
        const parsed = JSON.parse(raw);
        body = JSON.stringify(parsed);
    } catch {
        // Treat as CSV
        body = JSON.stringify({ csv: raw });
    }
    try {
        const r = await fetch('/api/sales/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        const j = await r.json();
        const msg = `יובאו ${j.imported} עסקאות` + (j.errors?.length ? `\n${j.errors.join('\n')}` : '');
        alert(msg);
        document.getElementById('bulk-import-text').value = '';
        document.getElementById('bulk-import-area').style.display = 'none';
        await refreshSalesData();
    } catch(e) { alert('שגיאת רשת: ' + e.message); }
}


