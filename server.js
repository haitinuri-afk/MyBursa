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
    "הפניקס":"PHOE.TA","הראל":"HARL.TA","כלל ביטוח":"KLLI.TA",
    "עזריאלי":"AZRG.TA","מליסרון":"MLSR.TA","אמות":"AMOT.TA","ביג":"BIG.TA","גב ים":"GVYM.TA","שיכון ובינוי":"SKBN.TA",
    "אנרג'יקס":"ENRG.TA","אנלייט":"ENLT.TA","אורמת":"ORA.TA","קבוצת דלק":"DLEKG.TA",
    "בזק":"BEZQ.TA","סלקום":"SELC.TA","פרטנר":"PTNR.TA",
    "שטראוס":"STRS.TA","שופרסל":"SAE.TA","פוקס":"FOX.TA","רמי לוי":"RMLI.TA",
};

let _usdIlsRate = 3.004;
async function refreshUsdIlsRate() {
    try {
        const { body } = await httpsGet('https://open.er-api.com/v6/latest/USD');
        const ils = body?.rates?.ILS;
        if (ils > 0) { _usdIlsRate = parseFloat(ils.toFixed(4)); console.log(`[rate] USD/ILS = ${_usdIlsRate}`); }
    } catch(e) { console.warn('[rate]', e.message); }
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

const BASE_HEADERS = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection':      'keep-alive',
    'Referer':         'https://finance.yahoo.com/',
};

const zlib = require('zlib');

function httpsGet(url, extraHeaders = {}, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const options = {
            hostname: parsed.hostname,
            path:     parsed.pathname + parsed.search,
            headers:  { ...BASE_HEADERS, ...extraHeaders },
        };
        const req = https.get(options, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return httpsGet(res.headers.location, extraHeaders, timeoutMs)
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
    return dow >= 0 && dow <= 4 && mins >= 540 && mins < 1040;
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

        const closes = (q.close ?? [])
            .filter(v => v != null && v > 0)
            .map(v => applyDivisor(canonicalSymbol, v, currency));

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
            ohlc
        });
    } catch(e) {
        console.error('[/api/stock/history]', e.message);
        res.status(404).json({ error: e.message, closes: [], ohlc: [] });
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
    const info    = read('info.txt');

    // ── Sector mapping ────────────────────────────────────────────────────────
    const SECTORS = {
        'בנקים':          ['לאומי','פועלים','דיסקונט','מזרחי טפחות'],
        'ביטוח':          ['הפניקס','הראל','כלל ביטוח'],
        'ביטחון':         ['אלביט'],
        'טכנולוגיה':      ['נייס','טאוור'],
        'פארמה':          ['טבע'],
        'כימיה':          ['כיל'],
        'אנרגיה':         ['אנרג\'יקס','אנלייט','אורמת','קבוצת דלק'],
        'נדל"ן':          ['עזריאלי','מליסרון','אמות','ביג','גב ים','שיכון ובינוי'],
        'תקשורת':         ['בזק','סלקום','פרטנר'],
        'מזון/קמעונאות':  ['שטראוס','שופרסל','פוקס','רמי לוי'],
    };
    const nameToSector = {};
    Object.entries(SECTORS).forEach(([sec, names]) => names.forEach(n => nameToSector[n] = sec));

    // ── Portfolio with P&L and support/resistance ─────────────────────────────
    const portfolioData = loadPortfolioFile();
    const portfolioLines = Object.entries(portfolioData.portfolio ?? {}).map(([name, h]) => {
        const qty      = h.qty      ?? h.quantity ?? 0;
        const avgCost  = h.buyPrice ?? h.avgCost  ?? h.purchasePrice ?? 0;
        const yahooSym = STOCK_SYMBOLS_HE[name] ?? name;
        const quote    = quotes.find(q => q.symbol === yahooSym);
        const curPrice = quote?.regularMarketPrice ?? 0;
        const prevClose= quote?.regularMarketPreviousClose ?? 0;
        const value    = (curPrice * qty).toFixed(2);
        const pl       = avgCost && curPrice ? (((curPrice - avgCost) / avgCost) * 100).toFixed(2) : '?';
        const dayPct   = prevClose && curPrice ? (((curPrice - prevClose) / prevClose) * 100).toFixed(2) : '?';
        const support  = prevClose && curPrice
            ? (curPrice < prevClose ? '⚠ מתחת לבסיס — שבירת מומנטום' : '✓ מעל בסיס — תמיכה מחזיקה')
            : '';
        const sector   = nameToSector[name] ?? 'אחר';
        return `  ${name} | סקטור: ${sector} | ${qty} יח׳ | עלות: ₪${avgCost} | עכשיו: ₪${curPrice} | יומי: ${dayPct}% | P/L: ${pl}% | שווי: ₪${value} | ${support}`;
    });
    const portfolioSection = portfolioLines.length
        ? `## תיק השקעות נוכחי:\n${portfolioLines.join('\n')}`
        : '## תיק השקעות: ריק';

    // ── Sector rotation analysis ──────────────────────────────────────────────
    const sectorMoves = {};
    quotes.forEach(q => {
        if (!q.regularMarketPreviousClose) return;
        const pct  = ((q.regularMarketPrice - q.regularMarketPreviousClose) / q.regularMarketPreviousClose) * 100;
        const name = Object.entries(STOCK_SYMBOLS_HE).find(([,sym]) => sym === q.symbol)?.[0];
        const sec  = name ? (nameToSector[name] ?? 'אחר') : null;
        if (!sec) return;
        if (!sectorMoves[sec]) sectorMoves[sec] = [];
        sectorMoves[sec].push(pct);
    });
    const sectorSummary = Object.entries(sectorMoves).map(([sec, pcts]) => {
        const avg = (pcts.reduce((a,b) => a+b, 0) / pcts.length).toFixed(2);
        return `  ${sec}: ${avg >= 0 ? '+' : ''}${avg}% (${pcts.length} מניות)`;
    }).join('\n');

    // ── Live prices with anomaly flags ────────────────────────────────────────
    const liveData = quotes.length ? quotes.map(q => {
        const price  = q.regularMarketPrice;
        const prev   = q.regularMarketPreviousClose;
        const pct    = prev ? (((price - prev) / prev) * 100).toFixed(2) : null;
        const flag   = pct !== null && Math.abs(pct) >= 5 ? ' 🚨 תנועה קיצונית' : '';
        const trend  = pct !== null ? (price < prev ? '⚠ מתחת לבסיס' : '✓ מעל בסיס') : '';
        return `${q.symbol}: ₪${price} (${pct >= 0 ? '+' : ''}${pct}%) ${trend}${flag}`;
    }).join('\n') : '';

    // ── Extreme movers ────────────────────────────────────────────────────────
    const extremes = quotes
        .filter(q => q.regularMarketPreviousClose)
        .map(q => ({ symbol: q.symbol, pct: ((q.regularMarketPrice - q.regularMarketPreviousClose) / q.regularMarketPreviousClose) * 100 }))
        .filter(m => Math.abs(m.pct) >= 4)
        .sort((a,b) => Math.abs(b.pct) - Math.abs(a.pct))
        .map(m => `${m.symbol}: ${m.pct >= 0 ? '+' : ''}${m.pct.toFixed(2)}% — ${Math.abs(m.pct) >= 7 ? 'בדוק אירוע ספציפי לחברה' : 'חולשת/חוזקת ענף'}`)
        .join('\n');

    const retrieved = retrieveRelevantChunks(query, _knowledgeChunks);
    const knowledgeSection = retrieved.length
        ? `## ידע רלוונטי:\n${retrieved.join('\n\n---\n\n')}` : '';

    return `אתה אסטרטג שוק הון בכיר המתמחה בבורסת תל אביב. הטון שלך: מקצועי, חד, ישיר — כמו יועץ בחדר מסחר.
ענה תמיד בעברית. פעל אך ורק לפי הנתונים שסופקו; אל תסתמך על נתוני אימון.

## עקרונות ניתוח:
- זהה רוטציה סקטוריאלית: אם ענף שלם עולה/יורד יחד, ציין זאת במפורש.
- תמיכה/התנגדות: מניה מתחת לבסיס יומי = שבירת מומנטום; מעל בסיס = תמיכה מחזיקה.
- תנועה קיצונית (±5%+): בדוק האם זה אירוע ספציפי לחברה או ירידה רוחבית בסקטור.
- היה סקפטי לגבי "Buy the Dip" במניות ששברו תמיכה.
- כשמדברים על תיק: הצע מימוש רווחים בסקטורים חזקים כדי לאזן חשיפה לסקטורים חלשים.
- אל תציג רק מספרים — תמיד הוסף משפט אסטרטגי אחד לפחות.

${knowledgeSection}

## שערי חליפין:
USD/ILS: ${_usdIlsRate} ₪

## היסטוריית מסחר:
${history}

${portfolioSection}

## ביצועי סקטורים היום:
${sectorSummary || 'אין נתונים'}

## מחירים חיים + תמיכה/התנגדות:
${liveData}
${extremes ? `\n## תנועות קיצוניות — דורשות בדיקה:\n${extremes}` : ''}`;
}

const _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

let _chatBusy       = false;
let _lastChatAt     = 0;
const CHAT_MIN_GAP  = 1000;

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
        const systemCtx = buildRAGContext(lastMsg, quotes);
        console.log('[chat] quotes used:', quotes.length, '| portfolio:', systemCtx.slice(systemCtx.indexOf('## תיק'), systemCtx.indexOf('## תיק') + 200));

        const groqMessages = [
            { role: 'system', content: systemCtx },
            ...messages.slice(0, -1).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
            { role: 'user', content: lastMsg },
        ];

        const result = await _groq.chat.completions.create({
            model:      'llama-3.3-70b-versatile',
            max_tokens: 1024,
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

app.get('/api/rate', (req, res) => res.json({ usdIls: _usdIlsRate }));

// ── Portfolio persistence ──────────────────────────────────────────────────

const PORTFOLIO_FILE = path.join(__dirname, 'portfolio.json');

function loadPortfolioFile() {
    try { return JSON.parse(fs.readFileSync(PORTFOLIO_FILE, 'utf8')); }
    catch { return { portfolio: {}, transactionHistory: [] }; }
}

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
    refreshUsdIlsRate();
    setInterval(refreshUsdIlsRate, 3600_000);
});
