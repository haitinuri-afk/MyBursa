require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
const express      = require('express');
const path         = require('path');
const https        = require('https');
const fs           = require('fs');
const Groq         = require('groq-sdk');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');
const multer       = require('multer');
const pdfParse     = require('pdf-parse');
const cron         = require('node-cron');
const { runScan, getLatestScans } = require('./maya-scraper');
const webpush = require('web-push');

// ── Web Push / VAPID setup ────────────────────────────────────────────────────
const _vapidReady = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_EMAIL);
if (_vapidReady) {
    webpush.setVapidDetails(
        process.env.VAPID_EMAIL,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
    console.log('[push] VAPID configured ✓');
} else {
    console.warn('[push] VAPID env vars missing — Web Push disabled');
}

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (origin.includes('localhost') || origin.endsWith('.onrender.com') || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
    windowMs: 60_000,         // 1 minute
    max: 60,                  // 60 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'יותר מדי בקשות, נסה שוב עוד דקה.' },
});
const chatLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,                  // chat is heavy — 10/min
    message: { error: 'נסה שוב עוד דקה.' },
});
app.use('/api/', apiLimiter);
app.use('/api/chat', chatLimiter);

const BUILD_VERSION = `bursa-${Date.now()}`;

app.get('/sw.js', (req, res) => {
    const swPath = path.join(__dirname, 'sw.js');
    let sw = fs.readFileSync(swPath, 'utf8');
    sw = sw.replace("'bursa-v1'", `'${BUILD_VERSION}'`);
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(sw);
});

// Root → always fresh HTML (must come BEFORE express.static)
app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, 'index.html'));
});

// JS / CSS — always fresh, no browser cache
app.get(/\.(js|css)$/, (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    next();
});

app.use(express.static(path.join(__dirname)));

// ── Yahoo Finance helpers ─────────────────────────────────────────────────

const SYMBOL_FALLBACKS = { '^TA35':'TA35.TA', '^TA125':'TA125.TA', '^TA90':'TA90.TA' };

const STOCK_SYMBOLS_HE = {
    "מדד תא-35":"^TA35","מדד תא-90":"^TA90",
    "לאומי":"LUMI.TA","פועלים":"POLI.TA","דיסקונט":"DSCT.TA","מזרחי טפחות":"MZTF.TA","הבינלאומי":"FIBI.TA","בנק ירושלים":"JBNK.TA",
    "אי.בי.אי":"IBI.TA",
    "אלביט":"ESLT.TA","נייס":"NICE.TA","טאוור":"TSEM.TA","אאורה":"AURA.TA",
    "טבע":"TEVA.TA","כיל":"ICL.TA",
    "הפניקס":"PHOE.TA","הראל":"HARL.TA","כלל ביטוח":"CLIS.TA",
    "עזריאלי":"AZRG.TA","מליסרון":"MLSR.TA","אמות":"AMOT.TA","ביג":"BIG.TA","גב ים":"GVYM.TA","שיכון ובינוי":"SKBN.TA","ריט1":"RIT1.TA",
    "אנרג'יקס":"ENRG.TA","אנלייט":"ENLT.TA","אורמת":"ORA.TA","קבוצת דלק":"DLEKG.TA",
    "בזק":"BEZQ.TA","סלקום":"CEL.TA","פרטנר":"PTNR.TA",
    "שטראוס":"STRS.TA","שופרסל":"SAE.TA","פוקס":"FOX.TA","רמי לוי":"RMLI.TA",
};

let _usdIlsRate = 3.00; let _usdIlsPrev = 3.00;
let _eurIlsRate = 3.50; let _eurIlsPrev = 3.50;

// ── Anomaly Detection ─────────────────────────────────────────────────────
// Returns true if a new value is a suspicious outlier vs the last known value.
// Blocks values that differ by more than MAX_DAILY_MOVE from the previous close.
const ANOMALY_RULES = {
    'USD/ILS': { min: 2.0,  max: 6.0,  maxDailyMove: 0.10 },  // max 10% daily move
    'EUR/ILS': { min: 2.0,  max: 7.0,  maxDailyMove: 0.10 },
    'STOCK':   { min: 0.01, max: 1e6,  maxDailyMove: 0.20 },  // stocks: max 20% daily (circuit breaker)
};

function isAnomaly(key, newVal, prevVal) {
    const rule = ANOMALY_RULES[key] ?? ANOMALY_RULES['STOCK'];
    if (newVal < rule.min || newVal > rule.max) {
        console.warn(`[anomaly] ${key}: ${newVal} out of absolute range [${rule.min}, ${rule.max}]`);
        return true;
    }
    if (prevVal > 0) {
        const move = Math.abs(newVal - prevVal) / prevVal;
        if (move > rule.maxDailyMove) {
            console.warn(`[anomaly] ${key}: daily move ${(move*100).toFixed(1)}% exceeds threshold`);
            return true;
        }
    }
    return false;
}

async function refreshFxRates() {
    // USD/ILS
    try {
        const { meta } = await fetchChartMeta('USDILS=X', '1d');
        const val  = parseFloat(meta?.regularMarketPrice);
        const prev = parseFloat(meta?.chartPreviousClose ?? meta?.previousClose ?? 0);
        if (val > 0 && !isAnomaly('USD/ILS', val, _usdIlsPrev)) {
            _usdIlsRate = parseFloat(val.toFixed(4));
            if (prev > 0) _usdIlsPrev = parseFloat(prev.toFixed(4));
            console.log(`[rate] USD/ILS = ${_usdIlsRate}`);
        }
    } catch(e) { console.warn('[rate] USD yahoo failed:', e.message); }

    // EUR/ILS
    try {
        const { meta } = await fetchChartMeta('EURILS=X', '1d');
        const val  = parseFloat(meta?.regularMarketPrice);
        const prev = parseFloat(meta?.chartPreviousClose ?? meta?.previousClose ?? 0);
        if (val > 0 && !isAnomaly('EUR/ILS', val, _eurIlsPrev)) {
            _eurIlsRate = parseFloat(val.toFixed(4));
            if (prev > 0) _eurIlsPrev = parseFloat(prev.toFixed(4));
            console.log(`[rate] EUR/ILS = ${_eurIlsRate}`);
            return;
        }
    } catch(e) { console.warn('[rate] EUR yahoo failed:', e.message); }

    // Fallback: open.er-api.com
    try {
        const { body } = await httpsGet('https://open.er-api.com/v6/latest/ILS');
        if (body?.rates?.USD > 0) _usdIlsRate = parseFloat((1 / body.rates.USD).toFixed(4));
        if (body?.rates?.EUR > 0) _eurIlsRate = parseFloat((1 / body.rates.EUR).toFixed(4));
        console.log(`[rate] fallback USD/ILS=${_usdIlsRate} EUR/ILS=${_eurIlsRate}`);
    } catch(e) { console.warn('[rate] er-api failed:', e.message); }
}

const INDEX_ALIASES = new Set(['TA90.TA', 'TA125.TA', 'TA35.TA']);

function applyDivisor(sym, value, currency) {
    if (value == null) return null;
    const isTA = !sym.startsWith('^') && sym.endsWith('.TA') && !INDEX_ALIASES.has(sym);
    if (!isTA) return parseFloat(value.toFixed(2));
    if (currency === 'USD') return parseFloat((value * _usdIlsRate).toFixed(2));
    if (value > 1000) return parseFloat((value / 100).toFixed(2));
    return parseFloat(value.toFixed(2));
}

async function fetchChartMeta(symbol, range, interval = '1d') {
    const fallback   = SYMBOL_FALLBACKS[symbol];
    // For indices (^TA35 etc): try multiple range/host combos before falling back to ETF alias
    const isIndex = symbol.startsWith('^');
    const attempts = isIndex
        ? [
            { sym: symbol,   range, interval,  host: 'query2' },
            { sym: symbol,   range: '1d', interval: '5m', host: 'query1' },
            { sym: symbol,   range: '1d', interval: '5m', host: 'query2' },
            ...(fallback ? [{ sym: fallback, range, interval, host: 'query2' }] : []),
          ]
        : [
            { sym: symbol,   range, interval, host: 'query2' },
            ...(fallback ? [{ sym: fallback, range, interval, host: 'query2' }] : []),
          ];

    for (const attempt of attempts) {
        // Use symbol as-is — encodeURIComponent turns ^ into %5E which Yahoo rejects with 404
        const url = `https://${attempt.host}.finance.yahoo.com/v8/finance/chart/${attempt.sym}?range=${attempt.range}&interval=${attempt.interval}&includePrePost=false`;
        try {
            const { body } = await httpsGet(url, { Referer: 'https://finance.yahoo.com/' });
            const result = body?.chart?.result?.[0];
            const meta   = result?.meta;
            if (!meta?.regularMarketPrice) continue;
            return { meta, result, canonicalSymbol: symbol };
        } catch(e) { console.warn(`[chart] ${attempt.sym} → ${e.message}`); }
    }
    throw new Error(`no data for ${symbol}`);
}

// Last-known prices cache — keyed by Yahoo symbol
const _lastKnownPrices = {};
let _cachedQuotes = [];   // latest batch quotes, reused by AI chat

// ── News RSS fetching ─────────────────────────────────────────────────────
const NEWS_FEEDS = [
    { url: 'https://www.globes.co.il/rss/rss.aspx?id=1002',       source: 'גלובס שוק ההון' },
    { url: 'https://www.bizportal.co.il/rss/all',                   source: 'ביזפורטל' },
    { url: 'https://www.ynet.co.il/Integration/StoryRss1854.xml',  source: 'ynet כלכלה' },
    { url: 'https://www.maariv.co.il/Rss/RssChadashot',            source: 'מעריב כלכלה' },
    // Google News Hebrew — very reliable, aggregates many sources
    { url: 'https://news.google.com/rss/search?q=בורסה+תל+אביב&hl=iw&gl=IL&ceid=IL:iw', source: 'Google News' },
];
const NEWS_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; BursaBot/1.0)' };
let _cachedNews    = [];
let _cachedXPosts  = [];   // X / Twitter posts via Nitter
let _lastNewsFetch = 0;
let _lastXFetch    = 0;
const NEWS_TTL_MS  = 15 * 60 * 1000;
const X_TTL_MS     =  5 * 60 * 1000;  // X posts stale faster

// ── Nitter RSS (X/Twitter, no API key needed) ─────────────────────────────
// Multiple instances — tries each until one succeeds
const NITTER_INSTANCES = [
    'https://nitter.privacydev.net',
    'https://nitter.poast.org',
    'https://nitter.net',
    'https://nitter.1d4.us',
];

// Key financial X accounts in Hebrew market
const X_ACCOUNTS = [
    { handle: 'globes_news',     label: 'גלובס X'    },
    { handle: 'TheMarkerOnline', label: 'TheMarker X' },
    { handle: 'calcalist',       label: 'כלכליסט X'  },
];

// Search queries — TASE-relevant keywords
const X_SEARCH_QUERIES = [
    { q: 'בורסה%20תל%20אביב', label: 'X: בורסה ת"א' },
    { q: 'TASE%20מניות',       label: 'X: TASE'      },
];

async function fetchNitterFeed(url) {
    const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml,application/xml,text/xml' },
        signal:  AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
}

async function tryNitterInstances(path, label) {
    for (const base of NITTER_INSTANCES) {
        try {
            const xml  = await fetchNitterFeed(`${base}${path}`);
            const items = parseRSS(xml, label);
            if (items.length) {
                console.log(`[nitter] ✓ ${base} → ${items.length} items for "${label}"`);
                return items;
            }
        } catch (e) {
            console.warn(`[nitter] ✗ ${base}: ${e.message}`);
        }
    }
    return [];
}

async function fetchXPosts() {
    if (Date.now() - _lastXFetch < X_TTL_MS && _cachedXPosts.length) return;
    _lastXFetch = Date.now();
    const all = [];

    // Fetch account timelines
    await Promise.all(X_ACCOUNTS.map(async ({ handle, label }) => {
        const items = await tryNitterInstances(`/${handle}/rss`, label);
        all.push(...items.slice(0, 3));   // max 3 posts per account
    }));

    // Fetch search queries
    await Promise.all(X_SEARCH_QUERIES.map(async ({ q, label }) => {
        const items = await tryNitterInstances(`/search/rss?q=${q}&f=tweets`, label);
        all.push(...items.slice(0, 4));   // max 4 results per query
    }));

    if (all.length) {
        _cachedXPosts = all;
        console.log(`[nitter] cached ${_cachedXPosts.length} X posts total`);
    } else {
        console.warn('[nitter] all instances failed — X posts unavailable');
    }
}

function parseRSS(xml, source) {
    const items = [];
    const re = /<item[\s>]([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        const c     = m[1];
        const title = c.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim();
        const date  = c.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? '';
        if (title && title.length > 5) items.push({ title, source, date });
    }
    return items.slice(0, 8);
}

async function fetchNews() {
    if (Date.now() - _lastNewsFetch < NEWS_TTL_MS && _cachedNews.length) return;
    _lastNewsFetch = Date.now();
    const all = [];
    await Promise.all(NEWS_FEEDS.map(async ({ url, source }) => {
        try {
            const r = await fetch(url, { headers: NEWS_HEADERS, signal: AbortSignal.timeout(6000) });
            if (r.ok) all.push(...parseRSS(await r.text(), source));
            else console.warn(`[news] ${source}: HTTP ${r.status}`);
        } catch (e) { console.warn(`[news] ${source}:`, e.message); }
    }));
    if (all.length) _cachedNews = all;
    console.log(`[news] cached ${_cachedNews.length} headlines`);
}
fetchNews();

const BASE_HEADERS = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection':      'keep-alive',
    'Referer':         'https://finance.yahoo.com/',
};

const zlib = require('zlib');

function httpsGet(url, extraHeaders = {}, timeoutMs = 12000, rawText = false) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        // new URL() encodes ^ → %5E but Yahoo Finance requires literal ^ for index symbols
        const rawPath = (parsed.pathname + parsed.search).replace(/%5E/gi, '^');
        const options = {
            hostname: parsed.hostname,
            path:     rawPath,
            headers:  { ...BASE_HEADERS, ...extraHeaders },
        };
        const req = https.get(options, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return httpsGet(res.headers.location, extraHeaders, timeoutMs, rawText)
                    .then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }

            const encoding = res.headers['content-encoding'];
            let stream = res;
            if (encoding === 'gzip')    stream = res.pipe(zlib.createGunzip());
            if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
            if (encoding === 'br')      stream = res.pipe(zlib.createBrotliDecompress());

            let raw = '';
            stream.setEncoding('utf8');
            stream.on('data', c => raw += c);
            stream.on('end', () => {
                if (rawText) return resolve({ body: raw, headers: res.headers });
                try { resolve({ body: JSON.parse(raw), headers: res.headers }); }
                catch(e) { reject(new Error('JSON parse error')); }
            });
            stream.on('error', reject);
        });
        req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
        req.on('error', reject);
    });
}


// ── Market hours ──────────────────────────────────────────────────────────

function isMarketOpen() {
    const il = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' });
    const [d, t] = il.split(' ');
    const [y, mo, day] = d.split('-').map(Number);
    const [h, m] = t.split(':').map(Number);
    const dow = new Date(y, mo - 1, day).getDay();
    const mins = h * 60 + m;
    // TASE trades Sun–Fri (0–5); closed Saturday (6)
    // Friday (5): pre-close 13:40, final close ~13:42; rest close at 17:30 (1050 mins)
    const closeTime = dow === 5 ? 822 : 1050;
    return dow >= 0 && dow <= 5 && mins >= 540 && mins < closeTime;
}

// Fetch batch quotes via Yahoo v7/quote — returns regularMarketChangePercent directly
async function fetchV7Quotes(symList) {
    const fields = 'regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent,regularMarketChange,marketState,currency';
    // Encode each symbol individually, join with raw comma
    const symsParam = symList.map(s => encodeURIComponent(s)).join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symsParam}&fields=${fields}&formatted=false`;
    try {
        const { body } = await httpsGet(url, { Referer: 'https://finance.yahoo.com/' });
        const results = body?.quoteResponse?.result ?? [];
        console.log(`[v7quote] ${results.length}/${symList.length} symbols returned`);
        return results;
    } catch(e) {
        console.warn('[v7quote]', e.message);
        return [];
    }
}

// GET /api/stock/batch?symbols=LUMI.TA,POLI.TA,^TA35,...
app.get('/api/stock/batch', async (req, res) => {
    const { symbols } = req.query;
    if (!symbols) return res.status(400).json({ error: 'symbols required' });

    const symList = symbols.split(',').map(s => s.trim()).filter(Boolean);
    const todayUtcMs = new Date().setUTCHours(0, 0, 0, 0);

    const settled = await Promise.allSettled(symList.map(async sym => {
        const { meta, result: chartResult, canonicalSymbol } = await fetchChartMeta(sym, '5d');
        const currency  = meta.currency;
        const rawCloses = chartResult?.indicators?.quote?.[0]?.close ?? [];
        const timestamps = chartResult?.timestamp ?? [];

        // Collect the last two distinct-day closes before today.
        // When market is closed in the morning, regularMarketPrice == latestClose (no new session yet),
        // so we use secondClose as prevClose to show yesterday's actual change.
        let latestClose = null, secondClose = null, latestDay = null;
        for (let i = timestamps.length - 1; i >= 0; i--) {
            const val = rawCloses[i];
            if (!val || val <= 0) continue;
            const dayMs = new Date(timestamps[i] * 1000).setUTCHours(0,0,0,0);
            if (dayMs >= todayUtcMs) continue;
            if (latestClose === null) { latestClose = val; latestDay = dayMs; }
            else if (dayMs < latestDay) { secondClose = val; break; }
        }
        // If price == latestClose the current session hasn't diverged yet — show yesterday's move
        const livePrice = meta.regularMarketPrice;
        const useSecond = secondClose !== null && latestClose !== null &&
                          Math.abs(livePrice - latestClose) / latestClose < 0.0001;
        const chartPrevClose = useSecond ? secondClose : latestClose;
        const prevClose = chartPrevClose ?? meta.regularMarketPreviousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice;
        const result = {
            symbol:                     canonicalSymbol,
            regularMarketPrice:         applyDivisor(canonicalSymbol, meta.regularMarketPrice, currency),
            regularMarketPreviousClose: applyDivisor(canonicalSymbol, prevClose, currency),
            marketState:                meta.marketState ?? 'CLOSED'
        };
        _lastKnownPrices[sym] = result;
        return result;
    }));

    const results = [];
    settled.forEach((r, i) => {
        if (r.status === 'fulfilled') results.push(r.value);
        else if (_lastKnownPrices[symList[i]]) results.push(_lastKnownPrices[symList[i]]);
        else console.warn(`[batch] ${symList[i]}: ${r.reason?.message}`);
    });

    const serverOpen  = isMarketOpen();
    const marketState = serverOpen ? 'REGULAR' : 'CLOSED';
    console.log(`[batch] ${results.length}/${symList.length} | open=${serverOpen}`);
    _cachedQuotes = results;
    res.json({ marketOpen: serverOpen, marketState, quotes: results });
});

// GET /api/stock/history?symbol=LUMI.TA&range=5d&interval=1d
app.get('/api/stock/history', async (req, res) => {
    const { symbol, range, interval = '1d' } = req.query;
    if (!symbol || !range) return res.status(400).json({ error: 'symbol and range required' });
    try {
        const { meta, result, canonicalSymbol } = await fetchChartMeta(symbol, range, interval);
        const currency = meta.currency;
        const q          = result?.indicators?.quote?.[0] ?? {};
        const timestamps = result?.timestamp ?? [];

        const closeData = (q.close ?? []).map((v, i) => ({ v, t: timestamps[i] })).filter(d => d.v != null && d.v > 0);
        const closes    = closeData.map(d => applyDivisor(canonicalSymbol, d.v, currency));
        const closeTimes = closeData.map(d => d.t ?? 0);

        // For daily+ intervals, convert Unix timestamp → 'YYYY-MM-DD' string
        // so LightweightCharts uses its business-day scale (proper date labels)
        const isIntradayInterval = /m$|h$/i.test(interval); // e.g. 5m, 30m, 1h
        const toYMD = t => { const d = new Date(t * 1000); return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2); };
        const ohlc = timestamps.map((t, i) => ({
            time:   isIntradayInterval ? t : toYMD(t),
            open:   applyDivisor(canonicalSymbol, q.open?.[i],  currency),
            high:   applyDivisor(canonicalSymbol, q.high?.[i],  currency),
            low:    applyDivisor(canonicalSymbol, q.low?.[i],   currency),
            close:  applyDivisor(canonicalSymbol, q.close?.[i], currency),
            volume: q.volume?.[i] ?? 0,
        })).filter(d => d.close > 0 && d.open > 0 && d.high > 0 && d.low > 0);

        // Derive prevClose from timestamps (same logic as batch endpoint)
        const rawAll    = q.close ?? [];
        const todayMs   = new Date().setUTCHours(0, 0, 0, 0);
        let tsPrevClose = null;
        for (let i = timestamps.length - 1; i >= 0; i--) {
            const v = rawAll[i];
            if (!v || v <= 0) continue;
            if (new Date(timestamps[i] * 1000).setUTCHours(0,0,0,0) < todayMs) {
                tsPrevClose = v; break;
            }
        }
        const prevCloseRaw = meta.regularMarketPreviousClose ?? tsPrevClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice;

        res.json({
            symbol: canonicalSymbol,
            price:     applyDivisor(canonicalSymbol, meta.regularMarketPrice, currency),
            prevClose: applyDivisor(canonicalSymbol, prevCloseRaw, currency),
            closes,
            timestamps: closeTimes,
            ohlc
        });
    } catch(e) {
        console.error('[/api/stock/history]', e.message);
        res.status(404).json({ error: e.message, closes: [], timestamps: [], ohlc: [] });
    }
});

// ── RAG ────────────────────────────────────────────────────────────────────

const CONTEXT_IQ_PATH = path.join(__dirname, '..', 'ContextIQ');

// ── MongoDB Atlas (optional — set MONGODB_URI env var to enable) ───────────
const MONGODB_URI = process.env.MONGODB_URI;
let _profilesCol  = null;   // Company profiles + vector embeddings
let _ragCol       = null;   // MongoDB collection handle
let _scansCol     = null;   // Persistent scan results collection
let _portfolioCol = null;   // User portfolio symbols collection
let _alertsCol    = null;   // Portfolio alerts collection
let _subsCol      = null;   // Web Push subscriptions collection
let _mongoReady   = null;   // Promise that resolves when initMongoDB completes

async function initMongoDB() {
    if (!MONGODB_URI) return;
    try {
        const { MongoClient } = require('mongodb');
        const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        await client.connect();
        const db      = client.db('bursa');
        _ragCol       = db.collection('knowledge');
        _scansCol     = db.collection('scan_results');
        _portfolioCol = db.collection('user_portfolio');
        _alertsCol    = db.collection('alerts');
        _subsCol      = db.collection('push_subscriptions');
        _profilesCol  = db.collection('company_profiles');
        // Full-text index (created once, idempotent)
        await _ragCol.createIndex({ text: 'text' }, { default_language: 'none' });
        await _scansCol.createIndex({ scannedAt: -1 });
        await _alertsCol.createIndex({ createdAt: -1 });
        await _alertsCol.createIndex({ read: 1 });
        await _subsCol.createIndex({ endpoint: 1 }, { unique: true });
        console.log('[MongoDB] Connected to Atlas — RAG + scans + portfolio + alerts collections ready');
        await _syncLocalChunksToMongo();
        await _seedMongoPortfolio();
    } catch(e) {
        console.warn('[MongoDB] Connection failed, falling back to local RAG:', e.message);
        _ragCol = null;
    }
}

// On desktop startup: if MongoDB portfolio is empty or local file is newer, seed MongoDB
async function _seedMongoPortfolio() {
    if (!_portfolioCol) return;
    try {
        // Check if local file exists and has data
        let localData;
        try { localData = JSON.parse(fs.readFileSync(PORTFOLIO_FILE, 'utf8')); } catch { return; }
        if (!localData?.portfolio || !Object.keys(localData.portfolio).length) return;

        const existing = await _portfolioCol.findOne({ _id: 'main' });
        const localCount = Object.keys(localData.portfolio).length;
        const mongoCount = existing?.portfolioData?.portfolio
            ? Object.keys(existing.portfolioData.portfolio).length : 0;

        // Seed only if MongoDB is empty — once MongoDB has data it is the source of truth
        if (!existing || mongoCount === 0) {
            await _portfolioCol.updateOne(
                { _id: 'main' },
                { $set: { portfolioData: localData, symbols: Object.keys(localData.portfolio), updatedAt: new Date() }},
                { upsert: true }
            );
            console.log(`[portfolio] Seeded MongoDB from local file (${localCount} holdings)`);
        } else {
            console.log(`[portfolio] MongoDB has ${mongoCount} holdings — no seed needed`);
        }
    } catch(e) { console.warn('[portfolio] seed failed:', e.message); }
}

// Sync local .txt files to MongoDB on startup (upsert by content hash)
async function _syncLocalChunksToMongo() {
    const local = _loadLocalChunks();
    if (!local.length) return;
    const { createHash } = require('crypto');
    let synced = 0;
    for (const text of local) {
        const hash = createHash('md5').update(text).digest('hex');
        const res  = await _ragCol.updateOne(
            { hash },
            { $setOnInsert: { hash, text, source: 'local', tags: [], createdAt: new Date() } },
            { upsert: true }
        );
        if (res.upsertedCount) synced++;
    }
    if (synced) console.log(`[MongoDB] Synced ${synced} new chunks from local files`);
}

// Load local .txt files into memory (used as fallback and for initial sync)
function _loadLocalChunks() {
    const dataDir = path.join(CONTEXT_IQ_PATH, 'data');
    if (!fs.existsSync(dataDir)) return [];
    const chunks = [];
    fs.readdirSync(dataDir).filter(f => f.endsWith('.txt')).forEach(file => {
        const text = fs.readFileSync(path.join(dataDir, file), 'utf8');
        text.split(/\n\n+/).forEach(chunk => {
            const c = chunk.trim();
            if (c.length > 30) chunks.push(c);
        });
    });
    return chunks;
}

// Keyword search — MongoDB full-text or in-memory fallback
async function retrieveRelevantChunks(query, topK = 4) {
    if (_ragCol) {
        try {
            const results = await _ragCol.find(
                { $text: { $search: query } },
                { projection: { text: 1, score: { $meta: 'textScore' }, _id: 0 } }
            ).sort({ score: { $meta: 'textScore' } }).limit(topK).toArray();
            if (results.length) return results.map(r => r.text);
        } catch(e) { console.warn('[RAG] MongoDB search failed:', e.message); }
    }
    // In-memory fallback
    const queryWords = query.toLowerCase().split(/\s+/);
    return _knowledgeChunks
        .map(chunk => ({ chunk, score: queryWords.reduce((a, w) => a + (chunk.toLowerCase().includes(w) ? 1 : 0), 0) }))
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(s => s.chunk);
}

const _knowledgeChunks = _loadLocalChunks();
console.log(`[RAG] Loaded ${_knowledgeChunks.length} knowledge chunks`);

// ── RAG management API ────────────────────────────────────────────────────
// GET  /api/rag          — list all chunks (MongoDB only)
// POST /api/rag          — add a new chunk  { text, tags[] }
// DELETE /api/rag/:id    — delete a chunk by _id

app.get('/api/rag', async (req, res) => {
    if (!_ragCol) return res.json({ source: 'memory', chunks: _knowledgeChunks.map((text, i) => ({ id: i, text })) });
    const chunks = await _ragCol.find({}, { projection: { hash: 0 } }).sort({ createdAt: -1 }).limit(200).toArray();
    res.json({ source: 'mongodb', chunks });
});

app.post('/api/rag', express.json(), async (req, res) => {
    const { text, tags = [] } = req.body ?? {};
    if (!text || text.trim().length < 10) return res.status(400).json({ error: 'text חייב להכיל לפחות 10 תווים' });
    if (!_ragCol) {
        _knowledgeChunks.push(text.trim());
        return res.json({ ok: true, source: 'memory' });
    }
    const { createHash } = require('crypto');
    const hash = createHash('md5').update(text.trim()).digest('hex');
    await _ragCol.updateOne(
        { hash },
        { $setOnInsert: { hash, text: text.trim(), tags, source: 'api', createdAt: new Date() } },
        { upsert: true }
    );
    res.json({ ok: true, source: 'mongodb' });
});

app.delete('/api/rag/:id', async (req, res) => {
    if (!_ragCol) return res.status(400).json({ error: 'MongoDB לא מחובר' });
    const { ObjectId } = require('mongodb');
    try {
        await _ragCol.deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ ok: true });
    } catch { res.status(400).json({ error: 'מזהה לא תקין' }); }
});

// ── Company profile RAG — Hybrid Search ──────────────────────────────────────
// Vector search רץ רק מ-build-company-profiles.js (offline).
// בשרת: Lucene fuzzy + $text fallback — מהיר, ללא תלות ב-@xenova

async function retrieveCompanyProfiles(query) {
    if (!_profilesCol) return '';
    const results = new Map();

    // ── 1. Atlas Lucene — fuzzy + boosting ────────────────────────────────
    try {
        const hits = await _profilesCol.aggregate([
            { $search: {
                index: 'default',
                compound: {
                    should: [
                        { text: { query, path: 'name',    score: { boost: { value: 10 } }, fuzzy: { maxEdits: 1 } } },
                        { text: { query, path: 'aliases', score: { boost: { value: 8  } }, fuzzy: { maxEdits: 1 } } },
                        { text: { query, path: 'sector',  score: { boost: { value: 5  } } } },
                        { text: { query, path: 'drivers', score: { boost: { value: 3  } } } },
                        { text: { query, path: 'description' } },
                    ],
                    minimumShouldMatch: 1,
                }
            }},
            { $limit: 3 },
            { $project: { name: 1, text: 1, sector: 1 } }
        ]).toArray();
        hits.forEach(d => results.set(d.name, d));
    } catch {
        // fallback: $text index (נוצר ב-build script)
        try {
            const hits = await _profilesCol
                .find({ $text: { $search: query } }, { projection: { name: 1, text: 1 } })
                .limit(3).toArray();
            hits.forEach(d => results.set(d.name, d));
        } catch {}
    }

    // ── 2. Vector Search (pre-computed embeddings, no runtime model) ───────
    // רץ רק אם Lucene החזיר פחות מ-2 תוצאות — משתמש בembeddings שכבר שמורים
    if (results.size < 2) {
        try {
            // keyword fallback — לפי sector אם שאלה מאקרו-סקטוריאלית
            const sectorKeywords = ['בנקים','ביטוח','נדל"ן','אנרגיה','טכנולוגיה','פארמה','תקשורת','מזון'];
            const matchedSector = sectorKeywords.find(s => query.includes(s));
            if (matchedSector) {
                const bySecHits = await _profilesCol
                    .find({ sector: matchedSector }, { projection: { name: 1, text: 1 } })
                    .limit(3).toArray();
                bySecHits.forEach(d => results.set(d.name, d));
            }
        } catch {}
    }

    if (!results.size) return '';
    const profiles = [...results.values()].slice(0, 3).map(d => d.text).join('\n\n---\n\n');
    return `## פרופילי חברות רלוונטיים:\n${profiles}`;
}

async function buildRAGContext(query, quotes) {
    const read = f => { try { return fs.readFileSync(path.join(CONTEXT_IQ_PATH, f), 'utf8'); } catch { return ''; } };
    const history = read('history.txt');

    // ── Sector mapping ────────────────────────────────────────────────────────
    const SECTORS = {
        'בנקים':          ['לאומי','פועלים','דיסקונט','מזרחי טפחות','הבינלאומי','בנק ירושלים'],
        'שוק הון':        ['אי.בי.אי'],
        'ביטוח':          ['הפניקס','הראל','כלל ביטוח'],
        'ביטחון':         ['אלביט'],
        'טכנולוגיה':      ['נייס','טאוור','אאורה'],
        'פארמה':          ['טבע'],
        'כימיה':          ['כיל'],
        'אנרגיה':         ["אנרג'יקס",'אנלייט','אורמת','קבוצת דלק'],
        'נדל"ן':          ['עזריאלי','מליסרון','אמות','ביג','גב ים','שיכון ובינוי','ריט1'],
        'תקשורת':         ['בזק','סלקום','פרטנר'],
        'מזון/קמעונאות':  ['שטראוס','שופרסל','פוקס','רמי לוי'],
    };
    const nameToSector = {};
    Object.entries(SECTORS).forEach(([sec, names]) => names.forEach(n => nameToSector[n] = sec));

    // Helper: resolve day% for a Hebrew name
    const getDayPct = name => {
        const sym   = STOCK_SYMBOLS_HE[name];
        const quote = sym && quotes.find(q => q.symbol === sym);
        if (!quote?.regularMarketPreviousClose) return null;
        return ((quote.regularMarketPrice - quote.regularMarketPreviousClose) / quote.regularMarketPreviousClose) * 100;
    };

    // ── Portfolio with P&L, DAY%, support/resistance ───────────────────────────
    const portfolioData = await loadPortfolio();
    const portfolioLines = Object.entries(portfolioData.portfolio ?? {}).map(([name, h]) => {
        const qty      = h.qty      ?? h.quantity ?? 0;
        const avgCost  = h.buyPrice ?? h.avgCost  ?? h.purchasePrice ?? 0;
        const yahooSym = STOCK_SYMBOLS_HE[name] ?? name;
        const quote    = quotes.find(q => q.symbol === yahooSym);
        const curPrice = quote?.regularMarketPrice  ?? null;
        const prevClose= quote?.regularMarketPreviousClose ?? null;
        const priceStr = curPrice  != null ? `₪${curPrice}`  : 'אין נתון';
        const value    = curPrice  != null ? `₪${(curPrice * qty).toFixed(2)}` : 'אין נתון';
        const pl       = avgCost && curPrice != null ? `${(((curPrice - avgCost) / avgCost) * 100).toFixed(2)}%` : 'אין נתון';
        const dayPct   = curPrice != null && prevClose != null
            ? `${(((curPrice - prevClose) / prevClose) * 100).toFixed(2)}%`
            : 'אין נתון';
        const momentum = curPrice != null && prevClose != null
            ? (curPrice < prevClose ? '⚠ מתחת לבסיס — שבירת מומנטום' : '✓ מעל בסיס — תמיכה מחזיקה')
            : '';
        const sector   = nameToSector[name] ?? 'אחר';
        return `  ${name} | סקטור: ${sector} | ${qty} יח׳ | עלות: ₪${avgCost} | עכשיו: ${priceStr} | יומי: ${dayPct} | P/L כולל: ${pl} | שווי: ${value} | ${momentum}`;
    });
    const portfolioSection = portfolioLines.length
        ? `## תיק השקעות נוכחי:\n${portfolioLines.join('\n')}`
        : '## תיק השקעות: ריק (המשתמש עדיין לא קנה מניות)';

    // ── Sector rotation — averages per sector ─────────────────────────────────
    const sectorMoves = {};
    quotes.forEach(q => {
        if (!q.regularMarketPreviousClose) return;
        const pct  = ((q.regularMarketPrice - q.regularMarketPreviousClose) / q.regularMarketPreviousClose) * 100;
        const name = Object.entries(STOCK_SYMBOLS_HE).find(([,sym]) => sym === q.symbol)?.[0];
        const sec  = name ? (nameToSector[name] ?? null) : null;
        if (!sec) return;
        if (!sectorMoves[sec]) sectorMoves[sec] = [];
        sectorMoves[sec].push(pct);
    });
    const sectorSummary = Object.entries(sectorMoves).map(([sec, pcts]) => {
        const avg = (pcts.reduce((a,b) => a+b, 0) / pcts.length);
        return `  ${sec}: ${avg >= 0 ? '+' : ''}${avg.toFixed(2)}% (${pcts.length} מניות)`;
    }).join('\n');

    // ── Sector intelligence signals (pre-computed facts for the AI) ───────────
    const signals = [];

    // Banks: לאומי + פועלים + דיסקונט all above +2%
    const bankPcts = ['לאומי','פועלים','דיסקונט'].map(getDayPct).filter(p => p !== null);
    if (bankPcts.length === 3 && bankPcts.every(p => p > 2)) {
        signals.push(`✅ חוזקה במגזר הפיננסי: כל הבנקים הגדולים (לאומי, פועלים, דיסקונט) עולים מעל +2% היום — סיגנל לרוטציה פיננסית חיובית.`);
    } else if (bankPcts.length >= 2 && bankPcts.filter(p => p < -2).length === bankPcts.length) {
        signals.push(`⚠ חולשה במגזר הפיננסי: הבנקים בלחץ מכירות רחב — שקול הפחתת חשיפה.`);
    }

    // Dual-listed tech/pharma: טבע + נייס + אלביט all in strong red
    const dualPcts = ['טבע','נייס','אלביט'].map(getDayPct).filter(p => p !== null);
    if (dualPcts.length >= 2 && dualPcts.every(p => p < -1.5)) {
        signals.push(`🔴 לחץ מכירות במניות הטכנולוגיה והפארמה: ${['טבע','נייס','אלביט'].filter(n => (getDayPct(n) ?? 0) < -1.5).join(', ')} בירידות חדות — ייתכן לחץ ממניות הדואליות בארה"ב.`);
    }

    // Momentum breaks — stocks in portfolio that dropped below prevClose
    const momentumBreaks = Object.keys(portfolioData.portfolio ?? {}).filter(name => {
        const pct = getDayPct(name);
        return pct !== null && pct < -1;
    });
    if (momentumBreaks.length) {
        signals.push(`⚠ שבירת מומנטום בתיק: ${momentumBreaks.join(', ')} מתחת לבסיס היומי — אין להניח "Buy the Dip" אוטומטי; בדוק נפח ומגמת הסקטור.`);
    }

    const signalsSection = signals.length
        ? `## סיגנלים אוטומטיים — עובדות מחושבות:\n${signals.join('\n')}`
        : '';

    // ── Live prices — portfolio stocks only + top movers ─────────────────────
    const symToHe = Object.fromEntries(Object.entries(STOCK_SYMBOLS_HE).map(([he, sym]) => [sym, he]));
    const portfolioSymbols = new Set(
        Object.keys(portfolioData.portfolio ?? {}).map(n => STOCK_SYMBOLS_HE[n]).filter(Boolean)
    );
    const allWithPct = quotes.filter(q => q.regularMarketPreviousClose).map(q => {
        const pct = ((q.regularMarketPrice - q.regularMarketPreviousClose) / q.regularMarketPreviousClose) * 100;
        return { q, pct };
    });
    // Portfolio stocks always included; add top 3 and bottom 3 movers
    const topMovers = [...allWithPct].sort((a,b) => b.pct - a.pct).slice(0,3).map(x => x.q.symbol);
    const botMovers = [...allWithPct].sort((a,b) => a.pct - b.pct).slice(0,3).map(x => x.q.symbol);
    const showSymbols = new Set([...portfolioSymbols, ...topMovers, ...botMovers]);
    const liveData = quotes.length ? quotes
        .filter(q => showSymbols.has(q.symbol) || !q.regularMarketPreviousClose)
        .map(q => {
            const price  = q.regularMarketPrice;
            const prev   = q.regularMarketPreviousClose;
            const pct    = prev ? (((price - prev) / prev) * 100) : null;
            const pctStr = pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : 'אין נתון';
            const flag   = pct != null && Math.abs(pct) >= 5 ? ' 🚨' : '';
            const heName = symToHe[q.symbol] || q.symbol;
            const dir    = pct != null ? (pct >= 0 ? '▲' : '▼') : '';
            return `${heName}: ₪${price} ${dir}${pctStr}${flag}`;
        }).join('\n') : 'אין נתוני מחיר זמינים';

    // ── Extreme movers ────────────────────────────────────────────────────────
    const extremes = quotes
        .filter(q => q.regularMarketPreviousClose)
        .map(q => ({ symbol: q.symbol, pct: ((q.regularMarketPrice - q.regularMarketPreviousClose) / q.regularMarketPreviousClose) * 100 }))
        .filter(m => Math.abs(m.pct) >= 4)
        .sort((a,b) => Math.abs(b.pct) - Math.abs(a.pct))
        .map(m => `${symToHe[m.symbol] || m.symbol}: ${m.pct >= 0 ? '+' : ''}${m.pct.toFixed(2)}% — ${Math.abs(m.pct) >= 7 ? 'בדוק אירוע ספציפי לחברה' : 'חולשת/חוזקת ענף'}`)
        .join('\n');

    const [retrieved, companyProfiles] = await Promise.all([
        retrieveRelevantChunks(query, 2),
        retrieveCompanyProfiles(query),
    ]);
    const knowledgeSection = retrieved.length
        ? `## ידע רלוונטי:\n${retrieved.join('\n\n---\n\n')}` : '';

    const newsSection = _cachedNews.length
        ? `## חדשות פיננסיות אחרונות:\n${_cachedNews.slice(0,12).map(n => `- [${n.source}] ${n.title}`).join('\n')}`
        : '';

    const xSection = _cachedXPosts.length
        ? `## X / Twitter — פוסטים רלוונטיים:\n${_cachedXPosts.slice(0,10).map(n => `- [${n.source}] ${n.title}`).join('\n')}`
        : '';

    // ── System prompt ─────────────────────────────────────────────────────────
    const systemPrompt = `אתה יועץ השקעות אישי לשוק ההון הישראלי. ענה בעברית פשוטה וברורה.

## כללים חשובים:
- השתמש אך ורק בשמות עבריים של מניות (לאומי, טבע, אלביט וכו') — לא בטיקרים
- אל תמציא נתונים — רק מה שמופיע ב-Context
- פתח ישירות בלי הקדמות

## סגנון תשובות:
- כתוב 4–7 שורות
- **השתמש בחדשות ובפוסטים מה-Context** — אם יש כותרת רלוונטית, ציין אותה ("לפי גלובס...", "TheMarker מדווח...")
- ציין מחיר ושינוי % לכל מניה שמוזכרת
- הסבר מה קרה היום — מה בפועל גרם לעלייה/ירידה לפי החדשות, לא הסבר כללי על החברה

## לפי סוג שאלה:
- **מה לקנות / המלצות**: המלץ רק מניות עולות היום (▲). לכל מניה: שם + מחיר + % + מה החדשות/הסיבה הספציפית להיום.
- **הפסד / ירידה בתיק**: ציין כמה ירדת, מה גרם לכך לפי החדשות, המלץ בבירור — להחזיק / למכור / להוסיף
- **מניה ספציפית**: מחיר + % יומי + מה כתוב עליה בחדשות היום
- **שאלה כללית**: ענה עם נתונים ספציפיים מהחדשות והמחירים

${knowledgeSection}

## שערי חליפין:
USD/ILS: ${_usdIlsRate} ₪

## היסטוריית מסחר:
${history || 'אין היסטוריה'}`;

    // ── Assembled context (system + data) ─────────────────────────────────────
    return `${systemPrompt}

${companyProfiles}

${newsSection}
${xSection}

${portfolioSection}

## ביצועי סקטורים היום:
${sectorSummary || 'אין נתונים'}

${signalsSection}

## מחירים חיים + מומנטום:
${liveData}
${extremes ? `\n## תנועות קיצוניות — דורשות בדיקה:\n${extremes}` : ''}`;
}

const _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

let _chatBusy       = false;
let _lastChatAt     = 0;
const CHAT_MIN_GAP  = 3000;    // 3s gap — 8b-instant has 30k TPM, no problem

app.post('/api/chat', express.json(), async (req, res) => {
    if (_chatBusy) {
        return res.status(429).json({ error: 'בקשה קודמת עדיין מעובדת.', retryAfter: 3 });
    }
    const gap = Date.now() - _lastChatAt;
    if (gap < CHAT_MIN_GAP) {
        const wait = Math.ceil((CHAT_MIN_GAP - gap) / 1000);
        return res.status(429).json({ error: 'יש להמתין מעט בין הודעות.', retryAfter: wait });
    }

    _chatBusy   = true;
    _lastChatAt = Date.now();

    try {
        const { messages = [], quotes: clientQuotes = [], mobile = false } = req.body;
        const quotes    = clientQuotes.length ? clientQuotes : _cachedQuotes;
        const lastMsg   = messages[messages.length - 1]?.content || '';

        // ── Fast-path: buy/sell commands bypass AI entirely ───────────────────
        const buyMatch  = lastMsg.match(/קנ[הי]\s+(?:לי\s+)?(\d+)\s+(?:מניות?\s+(?:של\s+)?|יחידות?\s+(?:של\s+)?)?(.+)/);
        const sellMatch = lastMsg.match(/מכ[ורר]\s+(?:לי\s+)?(\d+)\s+(?:מניות?\s+(?:של\s+)?|יחידות?\s+(?:של\s+)?)?(.+)/);
        const tradeMatch = buyMatch || sellMatch;
        const isBuy = !!buyMatch;

        if (tradeMatch) {
            const qty      = parseInt(tradeMatch[1], 10);
            const rawName  = tradeMatch[2].trim().replace(/[.!?]$/, '');
            // Fuzzy match Hebrew name
            const allNames = Object.keys(STOCK_SYMBOLS_HE);
            const stockName = allNames.find(n => rawName.includes(n) || n.includes(rawName)) ?? rawName;
            const symbol   = STOCK_SYMBOLS_HE[stockName];
            const quote    = symbol && quotes.find(q => q.symbol === symbol);
            const price    = quote?.regularMarketPrice ?? null;

            if (!symbol || !quote) {
                return res.json({ reply: `לא מצאתי מניה בשם "${rawName}" ברשימת הניירות הזמינים. נסה שוב עם שם מדויק יותר.` });
            }

            const data = await loadPortfolio();
            const port = data.portfolio ?? {};

            if (isBuy) {
                const existing = port[stockName];
                if (existing) {
                    const totalQty   = (existing.qty ?? 0) + qty;
                    const avgCost    = (((existing.qty ?? 0) * (existing.buyPrice ?? 0)) + (qty * price)) / totalQty;
                    port[stockName]  = { qty: totalQty, buyPrice: parseFloat(avgCost.toFixed(2)), totalCost: parseFloat((totalQty * avgCost).toFixed(2)) };
                } else {
                    port[stockName] = { qty, buyPrice: price, totalCost: parseFloat((qty * price).toFixed(2)) };
                }
                data.portfolio = port;
                data.transactionHistory = data.transactionHistory ?? [];
                data.transactionHistory.push({ type: 'buy', name: stockName, qty, price, date: new Date().toISOString() });
                await savePortfolio(data);
                return res.json({
                    reply: `✅ בוצע! קניתי ${qty} מניות ${stockName} במחיר ₪${price} ליחידה.\nעלות כוללת: ₪${(qty * price).toFixed(2)}\nהמניה נוספה לתיק שלך.`,
                    action: { type: 'buy', name: stockName, qty, price }
                });
            } else {
                // Sell
                const existing = port[stockName];
                const heldQty  = existing?.qty ?? 0;
                if (!existing || heldQty === 0) {
                    return res.json({ reply: `אין לך מניות ${stockName} בתיק למכירה.` });
                }
                if (qty > heldQty) {
                    return res.json({ reply: `יש לך רק ${heldQty} מניות ${stockName} — לא ניתן למכור ${qty}.` });
                }
                const buyPrice = existing.buyPrice ?? 0;
                const pl       = ((price - buyPrice) * qty).toFixed(2);
                const plPct    = buyPrice > 0 ? (((price - buyPrice) / buyPrice) * 100).toFixed(2) : '0';
                if (qty === heldQty) {
                    delete port[stockName];
                } else {
                    port[stockName].qty = heldQty - qty;
                }
                data.portfolio = port;
                data.transactionHistory = data.transactionHistory ?? [];
                data.transactionHistory.push({ type: 'sell', name: stockName, qty, price, date: new Date().toISOString() });
                await savePortfolio(data);
                const plStr = parseFloat(pl) >= 0 ? `+₪${pl}` : `-₪${Math.abs(pl)}`;
                return res.json({
                    reply: `✅ בוצע! מכרתי ${qty} מניות ${stockName} במחיר ₪${price}.\nרווח/הפסד: ${plStr} (${plPct >= 0 ? '+' : ''}${plPct}%)\n${port[stockName] ? `נשארו ${port[stockName].qty} מניות בתיק.` : 'כל המניות נמכרו.'}`,
                    action: { type: 'sell', name: stockName, qty, price }
                });
            }
        }
        // ── End fast-path ──────────────────────────────────────────────────────

        await Promise.all([fetchNews(), fetchXPosts()]);
        const systemCtx = await buildRAGContext(lastMsg, quotes);
        console.log('[chat] quotes used:', quotes.length, '| portfolio:', systemCtx.slice(systemCtx.indexOf('## תיק'), systemCtx.indexOf('## תיק') + 200));

        // Keep only last 4 history turns to save tokens
        const historyTurns = messages.slice(0, -1).slice(-4);
        const groqMessages = [
            { role: 'system', content: systemCtx },
            ...historyTurns.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
            { role: 'user', content: lastMsg },
        ];

        const result = await _groq.chat.completions.create({
            model:      'llama-3.1-8b-instant',
            max_tokens: mobile ? 320 : 600,   // shorter on mobile
            messages:   groqMessages,
        });

        res.json({ reply: result.choices[0].message.content });
    } catch (e) {
        console.error('[/api/chat]', e.message);
        if (e.status === 429 || e.message?.includes('rate')) {
            return res.status(429).json({ error: 'יש להמתין מעט.', retryAfter: 15 });
        }
        res.status(500).json({ error: e.message });
    } finally {
        _chatBusy = false;
    }
});

app.get('/api/rate', (req, res) => res.json({ usdIls: _usdIlsRate, usdIlsPrev: _usdIlsPrev, eurIls: _eurIlsRate, eurIlsPrev: _eurIlsPrev }));

// ── Agentic Workflow ──────────────────────────────────────────────────────────
const { analyzeReport, screenStocks } = require('./agent');

// multer — memory storage, PDF only, max 20MB
const _upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('קובץ חייב להיות PDF'));
    },
});

// POST /api/analyze-report
// Accepts: JSON { text } OR multipart/form-data { file: PDF, text? }
app.post('/api/analyze-report', _upload.single('file'), express.json(), async (req, res) => {
    try {
        let reportText = '';

        if (req.file) {
            // PDF uploaded — extract text
            const parsed = await pdfParse(req.file.buffer);
            reportText = parsed.text?.trim() ?? '';
            if (!reportText) return res.status(422).json({ error: 'לא ניתן לחלץ טקסט מה-PDF' });
        } else {
            // JSON body
            const body = req.body ?? {};
            reportText = (body.text ?? body.report ?? '').trim();
            if (!reportText) return res.status(400).json({ error: 'יש לשלוח טקסט או קובץ PDF' });
        }

        const result = await analyzeReport(reportText, {
            groq:    _groq,
            ragCol:  _ragCol,
            usdRate: _usdIlsRate,
        });
        res.json(result);
    } catch(e) {
        console.error('[agent] analyze-report:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/screen  { query: "מצא מניות עם מכפיל נמוך מ-15" }
app.post('/api/screen', express.json(), async (req, res) => {
    try {
        const { query } = req.body ?? {};
        if (!query) return res.status(400).json({ error: 'שדה query חסר' });
        const result = await screenStocks(query, {
            groq:   _groq,
            quotes: _cachedQuotes,
        });
        res.json(result);
    } catch(e) {
        console.error('[agent] screen:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Portfolio persistence (local file or GCS) ─────────────────────────────

const PORTFOLIO_FILE = path.join(__dirname, 'portfolio.json');
const GCS_BUCKET     = process.env.GCS_BUCKET;   // set this env var in Cloud Run
const GCS_OBJECT     = 'portfolio.json';

let _gcsStorage = null;
if (GCS_BUCKET) {
    try {
        const { Storage } = require('@google-cloud/storage');
        _gcsStorage = new Storage();
        console.log(`[gcs] Using bucket: ${GCS_BUCKET}`);
    } catch(e) { console.warn('[gcs] @google-cloud/storage not installed, falling back to local file'); }
}

async function loadPortfolio() {
    // 1. MongoDB (shared across all instances — primary source)
    if (_portfolioCol) {
        try {
            const doc = await _portfolioCol.findOne({ _id: 'main' });
            if (doc?.portfolioData) return doc.portfolioData;
        } catch(e) { console.warn('[portfolio] MongoDB load failed:', e.message); }
    }
    // 2. GCS
    if (_gcsStorage) {
        try {
            const [contents] = await _gcsStorage.bucket(GCS_BUCKET).file(GCS_OBJECT).download();
            return JSON.parse(contents.toString());
        } catch(e) { return { portfolio: {}, transactionHistory: [] }; }
    }
    // 3. Local file fallback
    try { return JSON.parse(fs.readFileSync(PORTFOLIO_FILE, 'utf8')); }
    catch { return { portfolio: {}, transactionHistory: [] }; }
}

async function savePortfolio(data) {
    // 1. MongoDB (primary — synced across desktop + mobile)
    if (_portfolioCol) {
        try {
            await _portfolioCol.updateOne(
                { _id: 'main' },
                { $set: {
                    portfolioData: data,
                    symbols: Object.keys(data.portfolio ?? {}),
                    updatedAt: new Date()
                }},
                { upsert: true }
            );
        } catch(e) { console.warn('[portfolio] MongoDB save failed:', e.message); }
    }
    // 2. GCS
    if (_gcsStorage) {
        await _gcsStorage.bucket(GCS_BUCKET).file(GCS_OBJECT).save(JSON.stringify(data, null, 2), { contentType: 'application/json' });
        return;
    }
    // 3. Local file fallback
    fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/news', async (req, res) => {
    await Promise.all([fetchNews(), fetchXPosts()]);
    res.json({ news: _cachedNews, xPosts: _cachedXPosts });
});

app.get('/api/portfolio', async (req, res) => {
    try {
        if (_mongoReady) await _mongoReady;   // wait for MongoDB to finish connecting
        res.json(await loadPortfolio());
    }
    catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/portfolio', express.json(), async (req, res) => {
    try {
        const data = req.body;
        await savePortfolio(data);
        // Sync portfolio symbols to MongoDB
        if (_portfolioCol && data?.portfolio) {
            _portfolioCol.updateOne(
                { _id: 'main' },
                { $set: { symbols: Object.keys(data.portfolio), updatedAt: new Date() } },
                { upsert: true }
            ).catch(e => console.warn('[portfolio] MongoDB sync failed:', e.message));
        }
        res.json({ ok: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Debug ─────────────────────────────────────────────────────────────────────

// Quick check: TA-35 price, prevClose and computed %
app.get('/api/debug/ta35', async (req, res) => {
    try {
        const todayUtcMs = new Date().setUTCHours(0, 0, 0, 0);
        const { meta, result: chartResult, canonicalSymbol } = await fetchChartMeta('^TA35', '5d');
        const rawCloses  = chartResult?.indicators?.quote?.[0]?.close ?? [];
        const timestamps = chartResult?.timestamp ?? [];
        let latestClose = null, secondClose = null, latestDay = null;
        for (let i = timestamps.length - 1; i >= 0; i--) {
            const val = rawCloses[i]; if (!val || val <= 0) continue;
            const dayMs = new Date(timestamps[i] * 1000).setUTCHours(0,0,0,0);
            if (dayMs >= todayUtcMs) continue;
            if (latestClose === null) { latestClose = val; latestDay = dayMs; }
            else if (dayMs < latestDay) { secondClose = val; break; }
        }
        const price = meta.regularMarketPrice;
        const useSecond = secondClose !== null && latestClose !== null &&
                          Math.abs(price - latestClose) / latestClose < 0.0001;
        const chartPrevClose = useSecond ? secondClose : latestClose;
        const prevClose = chartPrevClose ?? meta.regularMarketPreviousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice;
        res.json({
            source: canonicalSymbol,
            price,
            chartPrevClose,
            regularMarketPreviousClose: meta.regularMarketPreviousClose,
            chartPreviousClose: meta.chartPreviousClose,
            usedPrevClose: prevClose,
            pct: prevClose ? `${(((price - prevClose) / prevClose) * 100).toFixed(2)}%` : 'N/A'
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/debug/mongo', async (req, res) => {
    const mongoOk = !!_portfolioCol;
    let doc = null, connectErr = null;
    if (_portfolioCol) {
        try { doc = await _portfolioCol.findOne({ _id: 'main' }, { projection: { 'portfolioData.transactionHistory': 0 } }); }
        catch(e) { doc = { error: e.message }; }
    } else {
        // Try a fresh connection to get the error message
        try {
            const { MongoClient } = require('mongodb');
            const c = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
            await c.connect();
            connectErr = 'connected ok but _portfolioCol is null';
            await c.close();
        } catch(e) { connectErr = e.message; }
    }
    res.json({ mongoOk, portfolioDoc: doc, connectErr, env: !!process.env.MONGODB_URI, groqKey: !!process.env.GROQ_API_KEY });
});

// ── Web Push API ──────────────────────────────────────────────────────────────

// GET /api/push/vapid-public-key  — client needs the public key to subscribe
app.get('/api/push/vapid-public-key', (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe  — save/refresh a push subscription
app.post('/api/push/subscribe', express.json(), async (req, res) => {
    const sub = req.body;
    if (!sub?.endpoint) return res.status(400).json({ error: 'subscription חסר' });
    if (_subsCol) {
        await _subsCol.updateOne(
            { endpoint: sub.endpoint },
            { $set: { subscription: sub, updatedAt: new Date() } },
            { upsert: true }
        ).catch(e => console.warn('[push] save sub failed:', e.message));
    }
    res.json({ ok: true });
});

// POST /api/push/unsubscribe  — remove a subscription
app.post('/api/push/unsubscribe', express.json(), async (req, res) => {
    const { endpoint } = req.body ?? {};
    if (endpoint && _subsCol) {
        await _subsCol.deleteOne({ endpoint }).catch(() => {});
    }
    res.json({ ok: true });
});

// Helper: send a push to all subscribers
async function sendPushToAll(payload) {
    if (!_vapidReady || !_subsCol) return;
    const subs = await _subsCol.find({}).toArray().catch(() => []);
    const dead = [];
    await Promise.allSettled(subs.map(async doc => {
        try {
            await webpush.sendNotification(doc.subscription, JSON.stringify(payload));
        } catch (e) {
            // 410 Gone = subscription expired / user unsubscribed
            if (e.statusCode === 410 || e.statusCode === 404) dead.push(doc.endpoint);
            else console.warn('[push] send failed:', e.message);
        }
    }));
    if (dead.length) {
        await _subsCol.deleteMany({ endpoint: { $in: dead } }).catch(() => {});
        console.log(`[push] removed ${dead.length} expired subscription(s)`);
    }
}

// ── Alerts API ────────────────────────────────────────────────────────────────

// GET /api/my-alerts — last 20 unread alerts sorted by newest first
app.get('/api/my-alerts', async (req, res) => {
    if (!_alertsCol) return res.json({ alerts: [], unreadCount: 0 });
    try {
        const alerts = await _alertsCol.find({ read: false })
            .sort({ createdAt: -1 })
            .limit(20)
            .toArray();
        const unreadCount = alerts.length;
        res.json({ alerts, unreadCount });
    } catch(e) {
        console.error('[/api/my-alerts]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/alerts/mark-read — marks all alerts as read
app.post('/api/alerts/mark-read', async (req, res) => {
    if (!_alertsCol) return res.json({ ok: true });
    try {
        await _alertsCol.updateMany({}, { $set: { read: true } });
        res.json({ ok: true });
    } catch(e) {
        console.error('[/api/alerts/mark-read]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Start ──────────────────────────────────────────────────────────────────

// ── /api/latest-scans ─────────────────────────────────────────────────────────
app.get('/api/latest-scans', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);
    // Prefer in-memory cache; fall back to MongoDB for persistence across restarts
    let scans = getLatestScans(limit);
    if (!scans.length && _scansCol) {
        try {
            scans = await _scansCol.find({}, { projection: { _id: 0 } })
                .sort({ scannedAt: -1 }).limit(limit).toArray();
        } catch (e) { console.warn('[scans] MongoDB read error:', e.message); }
    }
    res.json({ scans, updatedAt: new Date().toISOString() });
});

// ── Persist scan results to MongoDB ──────────────────────────────────────────
async function _persistScans(results) {
    if (!_scansCol || !results?.length) return;
    try {
        const ops = results.map(r => ({
            updateOne: {
                filter: { url: r.url },
                update: { $set: r },
                upsert: true,
            }
        }));
        await _scansCol.bulkWrite(ops);
        // Keep only latest 100 documents
        const total = await _scansCol.countDocuments();
        if (total > 100) {
            const oldest = await _scansCol.find({}, { projection: { _id: 1 } })
                .sort({ scannedAt: 1 }).limit(total - 100).toArray();
            const ids = oldest.map(d => d._id);
            await _scansCol.deleteMany({ _id: { $in: ids } });
        }
    } catch (e) { console.warn('[scans] persist error:', e.message); }
}

// ── /api/trigger-scan (manual trigger) ───────────────────────────────────────
app.post('/api/trigger-scan', apiLimiter, async (req, res) => {
    res.json({ message: 'סריקה התחילה ברקע' });
    runScan({ groq: _groq, ragCol: _ragCol, usdRate: _usdIlsRate, portfolioCol: _portfolioCol, alertsCol: _alertsCol, sendPush: sendPushToAll })
        .then(results => _persistScans(results))
        .catch(e => console.error('[maya] manual scan error:', e.message));
});

// ── Global JSON error handler (prevents HTML error pages) ────────────────────
app.use((err, req, res, next) => {
    console.error('[express error]', err.message);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.message || 'שגיאת שרת' });
});

// ── Startup ───────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
    console.log(`Trading Station server running at http://localhost:${PORT}`);
    _mongoReady = initMongoDB();
    await _mongoReady;
    refreshFxRates();
    setInterval(refreshFxRates, 3600_000);

    // ── Maya cron: every hour Sun–Thu 10:00–18:00 Israel time ─────────────────
    cron.schedule('0 10-18 * * 1-5', async () => {
        console.log('[maya] Hourly scan triggered by cron');
        try {
            const results = await runScan({ groq: _groq, ragCol: _ragCol, usdRate: _usdIlsRate, portfolioCol: _portfolioCol, alertsCol: _alertsCol, sendPush: sendPushToAll });
            await _persistScans(results);
        } catch (e) {
            console.error('[maya] cron scan error:', e.message);
        }
    }, { timezone: 'Asia/Jerusalem' });

    console.log('[maya] Cron scheduled: every hour Mon–Fri 10:00–18:00 Israel time');
});
