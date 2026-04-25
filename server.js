require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
const express   = require('express');
const path      = require('path');
const https     = require('https');
const fs        = require('fs');
const Groq = require('groq-sdk');

const app  = express();
const PORT = process.env.PORT || 3000;

const BUILD_VERSION = `bursa-${Date.now()}`;

app.get('/sw.js', (req, res) => {
    const swPath = path.join(__dirname, 'sw.js');
    let sw = fs.readFileSync(swPath, 'utf8');
    sw = sw.replace("'bursa-v1'", `'${BUILD_VERSION}'`);
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(sw);
});

app.use(express.static(path.join(__dirname)));

// ── Yahoo Finance helpers ─────────────────────────────────────────────────

const SYMBOL_FALLBACKS = { '^TA35':'TA35.TA', '^TA125':'TA125.TA', '^TA90':'TA90.TA' };

const STOCK_SYMBOLS_HE = {
    "מדד תא-35":"^TA35","מדד תא-90":"^TA90",
    "לאומי":"LUMI.TA","פועלים":"POLI.TA","דיסקונט":"DSCT.TA","מזרחי טפחות":"MZTF.TA",
    "אלביט":"ESLT.TA","נייס":"NICE.TA","טאוור":"TSEM.TA",
    "טבע":"TEVA.TA","כיל":"ICL.TA",
    "הפניקס":"PHOE.TA","הראל":"HARL.TA","כלל ביטוח":"CLIS.TA",
    "עזריאלי":"AZRG.TA","מליסרון":"MLSR.TA","אמות":"AMOT.TA","ביג":"BIG.TA","גב ים":"GVYM.TA","שיכון ובינוי":"SKBN.TA",
    "אנרג'יקס":"ENRG.TA","אנלייט":"ENLT.TA","אורמת":"ORA.TA","קבוצת דלק":"DLEKG.TA",
    "בזק":"BEZQ.TA","סלקום":"CEL.TA","פרטנר":"PTNR.TA",
    "שטראוס":"STRS.TA","שופרסל":"SAE.TA","פוקס":"FOX.TA","רמי לוי":"RMLI.TA",
};

let _usdIlsRate = 3.00;
let _eurIlsRate = 3.50;

async function refreshFxRates() {
    // USD/ILS — Primary: Yahoo Finance
    try {
        const { meta } = await fetchChartMeta('USDILS=X', '1d');
        const val = parseFloat(meta?.regularMarketPrice);
        if (val > 0) { _usdIlsRate = parseFloat(val.toFixed(4)); console.log(`[rate] USD/ILS = ${_usdIlsRate}`); }
    } catch(e) { console.warn('[rate] USD yahoo failed:', e.message); }

    // EUR/ILS — Primary: Yahoo Finance
    try {
        const { meta } = await fetchChartMeta('EURILS=X', '1d');
        const val = parseFloat(meta?.regularMarketPrice);
        if (val > 0) { _eurIlsRate = parseFloat(val.toFixed(4)); console.log(`[rate] EUR/ILS = ${_eurIlsRate}`); return; }
    } catch(e) { console.warn('[rate] EUR yahoo failed:', e.message); }

    // Fallback: open.er-api.com (fetches both at once)
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
    // Try original symbol first, fallback only if it fails
    const fallback   = SYMBOL_FALLBACKS[symbol];
    const candidates = fallback ? [symbol, fallback] : [symbol];
    for (const candidate of candidates) {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(candidate)}?range=${range}&interval=${interval}&includePrePost=false`;
        try {
            const { body } = await httpsGet(url, { Referer: 'https://finance.yahoo.com/' });
            const result = body?.chart?.result?.[0];
            const meta   = result?.meta;
            if (!meta?.regularMarketPrice) continue;
            return { meta, result, canonicalSymbol: symbol };
        } catch(e) { console.warn(`[chart] ${candidate} → ${e.message}`); }
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
        const options = {
            hostname: parsed.hostname,
            path:     parsed.pathname + parsed.search,
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

// GET /api/stock/batch?symbols=LUMI.TA,POLI.TA,^TA35,...
app.get('/api/stock/batch', async (req, res) => {
    const { symbols } = req.query;
    if (!symbols) return res.status(400).json({ error: 'symbols required' });

    const symList  = symbols.split(',').map(s => s.trim()).filter(Boolean);
    const settled  = await Promise.allSettled(symList.map(async sym => {
        const isIndex = sym.startsWith('^');
        const { meta, result: chartResult, canonicalSymbol } = await fetchChartMeta(sym, '5d');
        const currency = meta.currency;

        // Get all valid daily closes from the 5d chart
        const closes = (chartResult?.indicators?.quote?.[0]?.close ?? []).filter(v => v != null && v > 0);

        // prevClose = second-to-last close from chart (= last full session's close)
        // Fall back to Yahoo's metadata fields if chart doesn't have enough data
        let prevClose = closes.length >= 2
            ? closes[closes.length - 2]
            : (meta.regularMarketPreviousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice);

        const result = {
            symbol: canonicalSymbol,
            regularMarketPrice:         applyDivisor(canonicalSymbol, meta.regularMarketPrice, currency),
            regularMarketPreviousClose: applyDivisor(canonicalSymbol, prevClose, currency),
            marketState: meta.marketState ?? 'CLOSED'
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

    const yahooState  = results.find(r => r.marketState)?.marketState;
    // isMarketOpen() is primary for TASE — Yahoo's marketState is unreliable for Israeli hours
    const serverOpen  = isMarketOpen();
    const marketState = serverOpen ? 'REGULAR' : 'CLOSED';
    console.log(`[batch] ${results.length}/${symList.length} | open=${serverOpen} (yahoo:${yahooState ?? 'n/a'})`);
    _cachedQuotes = results;   // keep for AI chat context
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

        const ohlc = timestamps.map((t, i) => ({
            time:   t,
            open:   applyDivisor(canonicalSymbol, q.open?.[i],  currency),
            high:   applyDivisor(canonicalSymbol, q.high?.[i],  currency),
            low:    applyDivisor(canonicalSymbol, q.low?.[i],   currency),
            close:  applyDivisor(canonicalSymbol, q.close?.[i], currency),
            volume: q.volume?.[i] ?? 0,
        })).filter(d => d.close > 0 && d.open > 0 && d.high > 0 && d.low > 0);

        res.json({
            symbol: canonicalSymbol,
            price:     applyDivisor(canonicalSymbol, meta.regularMarketPrice, currency),
            prevClose: applyDivisor(canonicalSymbol, meta.regularMarketPreviousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice, currency),
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

// Load all .txt files from ContextIQ/data and split into chunks
function loadKnowledgeChunks() {
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

// Simple TF-IDF style keyword retrieval
function retrieveRelevantChunks(query, chunks, topK = 4) {
    const queryWords = query.toLowerCase().split(/\s+/);
    const scored = chunks.map(chunk => {
        const lower = chunk.toLowerCase();
        const score = queryWords.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0);
        return { chunk, score };
    });
    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(s => s.chunk);
}

const _knowledgeChunks = loadKnowledgeChunks();
console.log(`[RAG] Loaded ${_knowledgeChunks.length} knowledge chunks`);

function buildRAGContext(query, quotes) {
    const read = f => { try { return fs.readFileSync(path.join(CONTEXT_IQ_PATH, f), 'utf8'); } catch { return ''; } };
    const history = read('history.txt');

    // ── Sector mapping ────────────────────────────────────────────────────────
    const SECTORS = {
        'בנקים':          ['לאומי','פועלים','דיסקונט','מזרחי טפחות'],
        'ביטוח':          ['הפניקס','הראל','כלל ביטוח'],
        'ביטחון':         ['אלביט'],
        'טכנולוגיה':      ['נייס','טאוור'],
        'פארמה':          ['טבע'],
        'כימיה':          ['כיל'],
        'אנרגיה':         ["אנרג'יקס",'אנלייט','אורמת','קבוצת דלק'],
        'נדל"ן':          ['עזריאלי','מליסרון','אמות','ביג','גב ים','שיכון ובינוי'],
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
    const portfolioData = loadPortfolioFile();
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
            const trend  = pct != null ? (price < prev ? '⚠' : '✓') : '';
            return `${q.symbol}: ₪${price} (${pctStr}) ${trend}${flag}`;
        }).join('\n') : 'אין נתוני מחיר זמינים';

    // ── Extreme movers ────────────────────────────────────────────────────────
    const extremes = quotes
        .filter(q => q.regularMarketPreviousClose)
        .map(q => ({ symbol: q.symbol, pct: ((q.regularMarketPrice - q.regularMarketPreviousClose) / q.regularMarketPreviousClose) * 100 }))
        .filter(m => Math.abs(m.pct) >= 4)
        .sort((a,b) => Math.abs(b.pct) - Math.abs(a.pct))
        .map(m => `${m.symbol}: ${m.pct >= 0 ? '+' : ''}${m.pct.toFixed(2)}% — ${Math.abs(m.pct) >= 7 ? 'בדוק אירוע ספציפי לחברה' : 'חולשת/חוזקת ענף'}`)
        .join('\n');

    const retrieved = retrieveRelevantChunks(query, _knowledgeChunks, 2);
    const knowledgeSection = retrieved.length
        ? `## ידע רלוונטי:\n${retrieved.join('\n\n---\n\n')}` : '';

    const newsSection = _cachedNews.length
        ? `## חדשות פיננסיות אחרונות:\n${_cachedNews.slice(0,6).map(n => `- [${n.source}] ${n.title}`).join('\n')}`
        : '';

    const xSection = _cachedXPosts.length
        ? `## X / Twitter — פוסטים רלוונטיים:\n${_cachedXPosts.slice(0,6).map(n => `- [${n.source}] ${n.title}`).join('\n')}`
        : '';

    // ── System prompt ─────────────────────────────────────────────────────────
    const systemPrompt = `אתה אנליסט שוק הון בכיר המתמחה בבורסת תל אביב. הטון שלך: מקצועי, חד, ישיר — כמו יועץ בחדר מסחר אמיתי.
ענה תמיד בעברית. השתמש במושגים מקצועיים: "מימוש רווחים", "רוטציה סקטוריאלית", "שבירת מומנטום", "איזון תיק", "לחץ מכירות".
**אורך תגובה: ממוקד ומועיל — עד 8-10 שורות. השתמש בנקודות כשיש מספר נקודות. שאלה מכווינה אחת בסוף.**

## כללי דיוק — חובה:
- פעל אך ורק לפי הנתונים שמופיעים ב-Context שלמטה. אל תסתמך על ידע אימון לגבי מחירים ספציפיים.
- אם נתון רלוונטי (כגון מחיר, P/L, שינוי יומי) מסומן "אין נתון" — ציין זאת במפורש. אל תמציא מספרים.

## כללי ניתוח:
1. **חדשות ודוחות:** אם ישנן כותרות חדשות ב-Context — השתמש בהן כדי לתת הקשר לתנועות המחיר. ציין את המקור. אם אין חדשות רלוונטיות, אמור זאת בכנות.
2. **זיהוי רוטציה סקטוריאלית:** כאשר ענף שלם עולה או יורד יחד, ציין זאת — "חוזקה במגזר הבנקים", "לחץ רוחבי בנדל"ן" וכו׳.
2. **שבירת תמיכה:** מניה שמחירה מתחת לבסיס היומי (prevClose) נמצאת בשבירת מומנטום. אל תמליץ "Buy the Dip" אוטומטית — בדוק תחילה האם זה אירוע חברה או לחץ סקטוריאלי רוחבי.
3. **רמות פסיכולוגיות:** ירידה מתחת למספר עגול (כגון 92.50 → 91.99) היא שבירת מומנטום פסיכולוגי — הזהר מפני תנודתיות מוגברת.
4. **תנועה קיצונית (±5%+):** זהה אם זה אירוע ספציפי לחברה (דוחות, רגולציה) או ירידה/עלייה סקטוריאלית.
5. **ניהול תיק:** כאשר סקטור בתיק חזק, הצע בחינת מימוש חלקי כדי לאזן חשיפה לסקטורים חלשים יותר.
6. **שאלה מכווינה:** בסוף כל ניתוח שמתייחס לתיק, הוסף שאלת המשך אחת שמעודדת החלטה — לדוגמה: "האם תרצה שנבדוק אם כדאי לממש חלק מהרווח ב[מניה] כדי להקטין חשיפה?" או "האם נבחן חלופות בסקטור [X] שמראה חוזקה יחסית?".

${knowledgeSection}

## שערי חליפין:
USD/ILS: ${_usdIlsRate} ₪

## היסטוריית מסחר:
${history || 'אין היסטוריה'}`;

    // ── Assembled context (system + data) ─────────────────────────────────────
    return `${systemPrompt}

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
        const { messages = [], quotes: clientQuotes = [] } = req.body;
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

            const data = loadPortfolioFile();
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
                fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(data, null, 2));
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
                fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(data, null, 2));
                const plStr = parseFloat(pl) >= 0 ? `+₪${pl}` : `-₪${Math.abs(pl)}`;
                return res.json({
                    reply: `✅ בוצע! מכרתי ${qty} מניות ${stockName} במחיר ₪${price}.\nרווח/הפסד: ${plStr} (${plPct >= 0 ? '+' : ''}${plPct}%)\n${port[stockName] ? `נשארו ${port[stockName].qty} מניות בתיק.` : 'כל המניות נמכרו.'}`,
                    action: { type: 'sell', name: stockName, qty, price }
                });
            }
        }
        // ── End fast-path ──────────────────────────────────────────────────────

        await Promise.all([fetchNews(), fetchXPosts()]);
        const systemCtx = buildRAGContext(lastMsg, quotes);
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
            max_tokens: 380,
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

app.get('/api/rate', (req, res) => res.json({ usdIls: _usdIlsRate, eurIls: _eurIlsRate }));

// ── Portfolio persistence ──────────────────────────────────────────────────

const PORTFOLIO_FILE = path.join(__dirname, 'portfolio.json');

function loadPortfolioFile() {
    try { return JSON.parse(fs.readFileSync(PORTFOLIO_FILE, 'utf8')); }
    catch { return { portfolio: {}, transactionHistory: [] }; }
}

app.get('/api/news', async (req, res) => {
    await Promise.all([fetchNews(), fetchXPosts()]);
    res.json({ news: _cachedNews, xPosts: _cachedXPosts });
});

app.get('/api/portfolio', (req, res) => res.json(loadPortfolioFile()));

app.post('/api/portfolio', express.json(), (req, res) => {
    try {
        fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(req.body, null, 2));
        res.json({ ok: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`Trading Station server running at http://localhost:${PORT}`);
    refreshFxRates();
    setInterval(refreshFxRates, 3600_000);
});
