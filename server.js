require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
const express   = require('express');
const path      = require('path');
const https     = require('https');
const fs        = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

// ── Yahoo Finance helpers ─────────────────────────────────────────────────

const SYMBOL_FALLBACKS = { '^TA35':'TA35.TA', '^TA125':'TA125.TA', '^TA90':'TA90.TA' };

let _usdIlsRate = 3.65;
async function refreshUsdIlsRate() {
    try {
        const { meta } = await fetchChartMeta('USDILS=X', '1d');
        if (meta?.regularMarketPrice) { _usdIlsRate = meta.regularMarketPrice; console.log(`[rate] USD/ILS = ${_usdIlsRate}`); }
    } catch(e) { console.warn('[rate]', e.message); }
}

function applyDivisor(sym, value, currency) {
    if (value == null) return null;
    const isTA = !sym.startsWith('^') && sym.endsWith('.TA');
    if (!isTA) return parseFloat(value.toFixed(2));
    if (currency === 'USD') return parseFloat((value * _usdIlsRate).toFixed(2));
    if (value > 1000) return parseFloat((value / 100).toFixed(2));
    return parseFloat(value.toFixed(2));
}

async function fetchChartMeta(symbol, range, interval = '1d') {
    // Try known-good fallback first, then original symbol
    const fallback   = SYMBOL_FALLBACKS[symbol];
    const candidates = fallback ? [fallback, symbol] : [symbol];
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
    return dow >= 0 && dow <= 4 && mins >= 590 && mins < 1050;
}

// GET /api/stock/batch?symbols=LUMI.TA,POLI.TA,^TA35,...
app.get('/api/stock/batch', async (req, res) => {
    const { symbols } = req.query;
    if (!symbols) return res.status(400).json({ error: 'symbols required' });

    const symList  = symbols.split(',').map(s => s.trim()).filter(Boolean);
    const settled  = await Promise.allSettled(symList.map(async sym => {
        const isIndex = sym.startsWith('^');
        const range   = isIndex ? '5d' : '1d';
        const { meta, result: chartResult, canonicalSymbol } = await fetchChartMeta(sym, range);
        const currency = meta.currency;

        // For indices (5d range): use second-to-last close as prev close (= last session's close)
        let prevClose = meta.regularMarketPreviousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice;
        if (isIndex && chartResult) {
            const closes = (chartResult.indicators?.quote?.[0]?.close ?? []).filter(v => v != null && v > 0);
            if (closes.length >= 2) prevClose = closes[closes.length - 2];
        }

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

    const serverOpen  = isMarketOpen();
    const marketState = serverOpen ? 'REGULAR' : 'CLOSED';
    console.log(`[batch] ${results.length}/${symList.length} | open=${serverOpen}`);
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
    const liveData = quotes.length
        ? quotes.map(q => `${q.symbol}: ${q.regularMarketPrice} ₪`).join('\n')
        : '';

    const retrieved = retrieveRelevantChunks(query, _knowledgeChunks);
    const knowledgeSection = retrieved.length
        ? `## ידע רלוונטי:\n${retrieved.join('\n\n---\n\n')}`
        : '';

    return `אתה יועץ השקעות אישי לבורסה הישראלית. ענה תמיד בעברית, בצורה ממוקדת.

${knowledgeSection}

## היסטוריית מסחר:
${history}

## מצב תיק:
${info}

## מחירים חיים:
${liveData}`;
}

const Anthropic = require('@anthropic-ai/sdk');
const _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.post('/api/chat', express.json(), async (req, res) => {
    try {
        const { messages = [], quotes = [] } = req.body;
        const lastMsg   = messages[messages.length - 1]?.content || '';
        const systemCtx = buildRAGContext(lastMsg, quotes);

        const claudeMsgs = messages.map(m => ({
            role:    m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
        }));

        const result = await _anthropic.messages.create({
            model:      'claude-haiku-4-5',
            max_tokens: 1024,
            system:     systemCtx,
            messages:   claudeMsgs
        });

        res.json({ reply: result.content[0].text });
    } catch (e) {
        console.error('[/api/chat]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`Trading Station server running at http://localhost:${PORT}`);
    refreshUsdIlsRate();
    setInterval(refreshUsdIlsRate, 3600_000);
});
