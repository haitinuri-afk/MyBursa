'use strict';

/**
 * automationService.js — MyBursa Daily Risk Controller
 *
 * Runs a cron job at 23:30 Sun–Thu (Jerusalem time) that:
 *   1. Fetches closing prices from Yahoo Finance for all portfolio holdings
 *   2. Checks portfolio beta (threshold: 1.1)
 *   3. Identifies stop-loss breaches (>10% below avgPurchasePrice)
 *   4. Flags stocks responsible for >50% of the day's loss
 *   5. Saves a structured daily report as a RAG chunk in MongoDB
 *      so the AI picks it up automatically on next "תובנות AI" press
 */

const https          = require('https');
const cron           = require('node-cron');
const { createHash } = require('crypto');
const { STOCK_SYMBOLS_HE: SYMBOLS, BENCHMARK_SYMBOL, BENCHMARK_NAME } = require('./dataConstants');

const MARKET_BENCHMARK = '^TA90';   // used for portfolio-beta context
const STOP_LOSS_PCT    = -10;       // % below avgPurchasePrice
const BETA_THRESHOLD   = 1.1;
const LOSS_CONTRIB_PCT = 50;        // % of daily loss to flag a stock

// ── Minimal HTTPS GET → parsed JSON ───────────────────────────────────────
function _httpsGetJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept':     'application/json',
                'Referer':    'https://finance.yahoo.com/',
            },
        }, res => {
            const bufs = [];
            res.on('data', d => bufs.push(d));
            res.on('end', () => {
                try { resolve(JSON.parse(Buffer.concat(bufs).toString())); }
                catch { resolve(null); }
            });
        });
        req.on('error', reject);
        req.setTimeout(20_000, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

// ── Yahoo v7 quote batch (price + beta + day change) ──────────────────────
async function _fetchYahooQuotes(tickers) {
    const fields   = 'regularMarketPrice,regularMarketPreviousClose,' +
                     'regularMarketChangePercent,regularMarketChange,beta';
    const symsParam = tickers.map(encodeURIComponent).join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote` +
                `?symbols=${symsParam}&fields=${fields}&formatted=false`;
    try {
        const data = await _httpsGetJson(url);
        return data?.quoteResponse?.result ?? [];
    } catch(e) {
        console.warn('[automation] Yahoo fetch failed:', e.message);
        return [];
    }
}

// ── Save a RAG chunk to MongoDB (upsert by hash) ──────────────────────────
async function _saveRagChunk(ragCol, text, tags = []) {
    if (!ragCol) return;
    const hash = createHash('md5').update(text).digest('hex');
    await ragCol.updateOne(
        { hash },
        { $set: { hash, text, source: 'automation', tags, createdAt: new Date() } },
        { upsert: true }
    );
    return hash.slice(0, 8);
}

// ── Save alerts to alertsCol ──────────────────────────────────────────────
async function _saveAlerts(alertsCol, findings) {
    if (!alertsCol || !findings.length) return;
    await alertsCol.insertMany(
        findings.map(f => ({ ...f, createdAt: new Date(), read: false, source: 'automation' }))
    );
}

// ─────────────────────────────────────────────────────────────────────────
//  MAIN DAILY CHECK
// ─────────────────────────────────────────────────────────────────────────
async function runDailyCheck({ loadPortfolio, ragCol, alertsCol }) {
    const startedAt = new Date();
    console.log(`[automation] ▶ Daily risk check — ${startedAt.toISOString()}`);

    const findings = [];   // will be persisted as alerts
    const lines    = [];   // will form the RAG chunk text

    try {
        // ── 1. Load portfolio ─────────────────────────────────────────────
        const pd   = await loadPortfolio();
        const port = pd.portfolio ?? {};
        const names = Object.keys(port).filter(n => SYMBOLS[n]);

        if (!names.length) {
            console.warn('[automation] No recognised holdings — aborting');
            return;
        }

        // ── 2. Build ticker list & fetch quotes ───────────────────────────
        const tickerToName = {};
        const tickers = [...new Set([
            MARKET_BENCHMARK,
            BENCHMARK_SYMBOL,   // TA-125 for alpha
            ...names.map(n => { const t = SYMBOLS[n]; tickerToName[t] = n; return t; }),
        ])];

        const rawQuotes = await _fetchYahooQuotes(tickers);
        const qMap = Object.fromEntries(rawQuotes.map(q => [q.symbol, q]));

        const benchQuote  = qMap[MARKET_BENCHMARK];
        const benchDayPct = benchQuote?.regularMarketChangePercent ?? 0;

        // TA-125 for alpha calculation
        const ta125Quote  = qMap[BENCHMARK_SYMBOL];
        const ta125DayPct = ta125Quote?.regularMarketChangePercent ?? null;

        // ── 3. Per-stock stats ────────────────────────────────────────────
        let totalMktVal  = 0;
        let totalDayPnl  = 0;
        let portfolioBeta = 0;

        const stats = [];

        for (const name of names) {
            const h       = port[name];
            const qty     = parseFloat(h.qty ?? h.quantity ?? h.shares ?? 0);
            const avgBuy  = parseFloat(h.buyPrice ?? h.avgCost ?? 0);
            const ticker  = SYMBOLS[name];
            const q       = qMap[ticker];

            if (!q || qty <= 0 || avgBuy <= 0) continue;

            const cur      = q.regularMarketPrice           ?? avgBuy;
            const prev     = q.regularMarketPreviousClose   ?? cur;
            const dayPnl   = (cur - prev) * qty;            // today's gain/loss in ₪
            const mktVal   = cur * qty;
            const beta     = q.beta ?? 1.0;
            const drawdown = ((cur - avgBuy) / avgBuy) * 100;

            totalMktVal  += mktVal;
            totalDayPnl  += dayPnl;

            stats.push({ name, ticker, qty, avgBuy, cur, prev, dayPnl, mktVal, beta, drawdown });
        }

        // ── 4. Portfolio beta (value-weighted) ────────────────────────────
        if (totalMktVal > 0) {
            for (const s of stats) {
                portfolioBeta += (s.mktVal / totalMktVal) * s.beta;
            }
        }

        // ── 4b. Alpha vs TA-125 ───────────────────────────────────────────
        // Portfolio daily return = totalDayPnl / (totalMktVal - totalDayPnl)
        const portfolioDayPct = totalMktVal > 0
            ? (totalDayPnl / (totalMktVal - totalDayPnl)) * 100
            : null;
        const alphaPct = (portfolioDayPct !== null && ta125DayPct !== null)
            ? portfolioDayPct - ta125DayPct
            : null;

        const dateStr  = startedAt.toISOString().slice(0, 10);
        const totalStr = `₪${Math.round(totalDayPnl).toLocaleString('he-IL')}`;

        lines.push(`[דוח סיכום יומי אוטומטי — ${dateStr}]`);
        lines.push(`שינוי יומי: ${totalStr} | בטא תיק: ${portfolioBeta.toFixed(2)} | שוק (ת"א 90): ${benchDayPct >= 0 ? '+' : ''}${benchDayPct.toFixed(2)}%`);

        // ── Alpha line ────────────────────────────────────────────────────
        if (alphaPct !== null) {
            const portPctStr = `${portfolioDayPct >= 0 ? '+' : ''}${portfolioDayPct.toFixed(2)}%`;
            const ta125Str   = `${ta125DayPct   >= 0 ? '+' : ''}${ta125DayPct.toFixed(2)}%`;
            const alphaStr   = `${alphaPct       >= 0 ? '+' : ''}${alphaPct.toFixed(2)}%`;
            const beatStr    = alphaPct >= 0
                ? `✅ התיק הכה את ${BENCHMARK_NAME} היום`
                : `❌ התיק לא הכה את ${BENCHMARK_NAME} היום`;
            lines.push(`${beatStr} | תיק: ${portPctStr} | ${BENCHMARK_NAME}: ${ta125Str} | אלפא: ${alphaStr}`);
        }
        lines.push('');

        // ── 5a. Beta check ────────────────────────────────────────────────
        if (portfolioBeta > BETA_THRESHOLD) {
            const msg = `⚠️ בטא תיק גבוהה: ${portfolioBeta.toFixed(2)} (סף: ${BETA_THRESHOLD}). ` +
                        `התיק תנודתי יותר מהשוק — שקול הפחתת חשיפה במניות בטא גבוהה.`;
            lines.push(msg);
            findings.push({ type: 'beta', severity: 'warning', portfolioBeta, message: msg });
            console.log('[automation]', msg);
        }

        // ── 5b. Stop-loss breaches ────────────────────────────────────────
        const stopLossBreaches = stats.filter(s => s.drawdown < STOP_LOSS_PCT);
        for (const s of stopLossBreaches) {
            const msg = `🛑 סטופ-לוס: ${s.name} ירד ${s.drawdown.toFixed(1)}% ממחיר הקנייה ` +
                        `(₪${s.avgBuy.toFixed(2)} → ₪${s.cur.toFixed(2)}). שקול יציאה.`;
            lines.push(msg);
            findings.push({ type: 'stopLoss', severity: 'critical', stock: s.name, drawdown: s.drawdown, message: msg });
            console.log('[automation]', msg);
        }

        // ── 5c. Major daily-loss contributor (>50%) ───────────────────────
        if (totalDayPnl < 0) {
            for (const s of stats) {
                if (s.dayPnl >= 0) continue;
                const contrib = (s.dayPnl / totalDayPnl) * 100;
                if (contrib > LOSS_CONTRIB_PCT) {
                    const msg = `🔍 ${s.name} אחראית ל-${contrib.toFixed(0)}% מההפסד היומי ` +
                                `(₪${Math.round(s.dayPnl).toLocaleString('he-IL')} מתוך ${totalStr}). דרושה בדיקה.`;
                    lines.push(msg);
                    findings.push({ type: 'majorLoss', severity: 'warning', stock: s.name, contribution: contrib, message: msg });
                    console.log('[automation]', msg);
                }
            }
        }

        // ── 5d. Worst cumulative contributor (for AI context) ─────────────
        if (stats.length) {
            const worst = [...stats].sort((a, b) =>
                (a.cur - a.avgBuy) * a.qty - (b.cur - b.avgBuy) * b.qty
            )[0];
            const cumulPnl = Math.round((worst.cur - worst.avgBuy) * worst.qty);
            lines.push(`📊 המניה עם התרומה המצטברת הנמוכה ביותר: ${worst.name} (P&L מצטבר ₪${cumulPnl.toLocaleString('he-IL')}, ` +
                       `${((worst.cur - worst.avgBuy) / worst.avgBuy * 100).toFixed(1)}%).`);
        }

        if (findings.length === 0) {
            lines.push('✅ לא זוהו חריגות סיכון — תיק תקין.');
        }

        // ── 6. Persist to MongoDB ─────────────────────────────────────────
        const chunkText = lines.join('\n');
        const alphaTag  = alphaPct !== null ? (alphaPct >= 0 ? 'alpha-positive' : 'alpha-negative') : null;
        const ragTags   = ['risk', 'daily', 'automation', dateStr, ...(alphaTag ? [alphaTag] : [])];
        const chunkId   = await _saveRagChunk(ragCol, chunkText, ragTags);
        await _saveAlerts(alertsCol, findings);

        console.log(`[automation] ✓ Done in ${Date.now() - startedAt}ms | ` +
                    `findings=${findings.length} | ragChunk=${chunkId ?? 'skipped (no MongoDB)'}`);

    } catch(e) {
        console.error('[automation] ✗ Error:', e.message, e.stack);
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────────────────────────

/**
 * startAutomation({ loadPortfolio, ragCol, alertsCol })
 *
 * Call once after MongoDB is ready (inside app.listen callback in server.js).
 * Returns { runNow } for manual trigger via /api/automation/run endpoint.
 */
function startAutomation(deps) {
    // Validate deps
    if (typeof deps.loadPortfolio !== 'function') {
        throw new Error('[automation] deps.loadPortfolio must be a function');
    }

    // 23:30 Sun(0)–Thu(4) Jerusalem time — after TASE settlement
    cron.schedule('30 23 * * 0-4', () => {
        console.log('[automation] Cron fired: 23:30 daily check');
        runDailyCheck(deps).catch(e => console.error('[automation] cron error:', e.message));
    }, { timezone: 'Asia/Jerusalem' });

    console.log('[automation] ✓ Scheduler active — daily check 23:30 Sun–Thu (Jerusalem)');

    return {
        runNow: () => runDailyCheck(deps),
    };
}

module.exports = { startAutomation, runDailyCheck };
