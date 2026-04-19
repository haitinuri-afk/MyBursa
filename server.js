const express = require('express');
const path    = require('path');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

// ── Helpers ────────────────────────────────────────────────────────────────

function applyDivisor(symbol, value, currency) {
    if (value == null) return null;
    const isTA = !symbol.startsWith('^') && symbol.endsWith('.TA');
    if (!isTA) return parseFloat(value.toFixed(2));
    // Yahoo returns some .TA stocks (e.g. TSEM.TA) in USD — convert to NIS
    if (currency === 'USD') return parseFloat((value * _usdIlsRate).toFixed(2));
    // ILS in agorot (value typically >1000 when in agorot) — divide by 100
    if (value > 1000) return parseFloat((value / 100).toFixed(2));
    return parseFloat(value.toFixed(2));
}

const SYMBOL_FALLBACKS = {
    '^TA35':  'TA35.TA',
    '^TA125': 'TA125.TA',
    '^TA90':  'TA90.TA'
};

let _usdIlsRate = 3.65;
async function refreshUsdIlsRate() {
    try {
        const { meta } = await fetchChartMeta('USDILS=X', '1d');
        if (meta?.regularMarketPrice) { _usdIlsRate = meta.regularMarketPrice; console.log(`[rate] USD/ILS = ${_usdIlsRate}`); }
    } catch (e) { console.warn('[rate] USDILS fetch failed:', e.message); }
}

// Last-known prices cache — keyed by symbol
const _lastKnownPrices = {};

const BASE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':     'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer':    'https://finance.yahoo.com/',
};

function httpsGet(url, extraHeaders = {}, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const options = {
            hostname: parsed.hostname,
            path:     parsed.pathname + parsed.search,
            headers:  { ...BASE_HEADERS, ...extraHeaders },
        };
        const req = https.get(options, res => {
            // Follow single redirect
            if (res.statusCode === 301 || res.statusCode === 302) {
                return httpsGet(res.headers.location, extraHeaders, timeoutMs)
                    .then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve({ body: JSON.parse(raw), headers: res.headers }); }
                catch(e) { reject(new Error('JSON parse error')); }
            });
        });
        req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
        req.on('error', reject);
    });
}

function httpsGetRaw(url, extraHeaders = {}, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const options = {
            hostname: parsed.hostname,
            path:     parsed.pathname + parsed.search,
            headers:  { ...BASE_HEADERS, ...extraHeaders },
        };
        const req = https.get(options, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return httpsGetRaw(res.headers.location, extraHeaders, timeoutMs)
                    .then(resolve).catch(reject);
            }
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', c => raw += c);
            res.on('end', () => resolve({ body: raw, headers: res.headers, status: res.statusCode }));
        });
        req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
        req.on('error', reject);
    });
}

// fetchCrumb disabled — v8/finance/chart works without crumb when using browser headers
async function fetchCrumb() { /* no-op */ }

async function fetchChartMeta(symbol, range, interval = '1d') {
    const candidates = [symbol, SYMBOL_FALLBACKS[symbol]].filter(Boolean);

    for (const candidate of candidates) {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(candidate)}` +
                    `?range=${range}&interval=${interval}&includePrePost=false`;
        try {
            const { body } = await httpsGet(url);
            const result = body?.chart?.result?.[0];
            const meta   = result?.meta;
            if (!meta?.regularMarketPrice) { console.warn(`[chart] ${candidate} no price`); continue; }
            return { meta, result, canonicalSymbol: symbol };
        } catch (e) {
            console.warn(`[chart] ${candidate} → ${e.message}`);
        }
    }
    throw new Error(`no data for ${symbol}`);
}

// ── Proxy: batch quote prices ──────────────────────────────────────────────

async function fetchSymbolPrice(symbol) {
    const range = symbol.startsWith('^') ? '5d' : '1d';
    try {
        const { meta, canonicalSymbol } = await fetchChartMeta(symbol, range);
        const currency = meta.currency;
        console.log(`[price] ${canonicalSymbol} currency=${currency} raw=${meta.regularMarketPrice}`);
        const result = {
            symbol:                     canonicalSymbol,
            regularMarketPrice:         applyDivisor(canonicalSymbol, meta.regularMarketPrice, currency),
            regularMarketPreviousClose: applyDivisor(canonicalSymbol, meta.regularMarketPreviousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice, currency),
            marketState:                meta.marketState ?? 'CLOSED'
        };
        _lastKnownPrices[symbol] = result;
        return result;
    } catch (e) {
        if (_lastKnownPrices[symbol]) {
            console.warn(`[price] ${symbol} fetch failed (${e.message}) — using last known price`);
            return _lastKnownPrices[symbol];
        }
        throw e;
    }
}

function isMarketOpen() {
    const il = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' });
    const [d, t] = il.split(' ');
    const [y, mo, day] = d.split('-').map(Number);
    const [h, m] = t.split(':').map(Number);
    const dow = new Date(y, mo - 1, day).getDay(); // 0=Sun..6=Sat
    const mins = h * 60 + m;
    return dow >= 0 && dow <= 4 && mins >= 590 && mins < 1050; // 09:50–17:30 IL
}

// GET /api/stock/batch?symbols=LUMI.TA,POLI.TA,^TA35,...
app.get('/api/stock/batch', async (req, res) => {
    const { symbols } = req.query;
    if (!symbols) return res.status(400).json({ error: 'symbols required' });

    const symList = symbols.split(',').map(s => s.trim()).filter(Boolean);
    const settled = await Promise.allSettled(symList.map(fetchSymbolPrice));

    const results = [];
    settled.forEach((r, i) => {
        if (r.status === 'fulfilled') results.push(r.value);
        else console.warn(`[batch] ${symList[i]}: ${r.reason?.message}`);
    });

    const ta35 = results.find(q => q.symbol === '^TA35') ?? results[0];
    const marketState = ta35?.marketState ?? 'CLOSED';
    console.log(`[batch] ${results.length}/${symList.length} resolved | marketState=${marketState}`);
    res.json({ marketOpen: marketState === 'REGULAR', marketState, quotes: results });
});

// ── Proxy: historical chart closes ────────────────────────────────────────

// GET /api/stock/history?symbol=LUMI.TA&range=5d&interval=1d
app.get('/api/stock/history', async (req, res) => {
    const { symbol, range, interval = '1d' } = req.query;
    if (!symbol || !range) return res.status(400).json({ error: 'symbol and range required' });

    try {
        const { meta, result, canonicalSymbol } = await fetchChartMeta(symbol, range, interval);

        const currency = meta.currency;
        const closes = (result?.indicators?.quote?.[0]?.close ?? [])
            .filter(v => v != null && v > 0)
            .map(v => applyDivisor(canonicalSymbol, v, currency));

        res.json({
            symbol:    canonicalSymbol,
            price:     applyDivisor(canonicalSymbol, meta.regularMarketPrice, currency),
            prevClose: applyDivisor(canonicalSymbol, meta.regularMarketPreviousClose ?? meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice, currency),
            closes
        });
    } catch (e) {
        console.error('[/api/stock/history]', e.message);
        res.status(404).json({ error: e.message });
    }
});

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`Trading Station server running at http://localhost:${PORT}`);
    refreshUsdIlsRate();
    setInterval(refreshUsdIlsRate, 3600_000);
});
