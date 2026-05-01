/**
 * maya-scraper.js — Maya (TASE) Automated Report Scanner
 *
 * Exports:
 *   runScan({ groq, ragCol, usdRate })  → array of scan results
 *   getLatestScans()                    → last N cached results
 */

'use strict';

const axios    = require('axios');
const cheerio  = require('cheerio');
const { analyzeReport } = require('./agent');

// ── Config ────────────────────────────────────────────────────────────────────

const MAYA_API = 'https://mayaapi.tase.co.il/api/report/allreports';

const REPORT_KEYWORDS = [
    'דוח רבעוני', 'דוח תקופתי', 'תוצאות כספיות', 'דוח כספי שנתי',
    'דוח שנתי', 'תוצאות רבעון', 'הודעה על תוצאות', 'סקירת הנהלה',
];

const TA35_COMPANIES = [
    'לאומי', 'פועלים', 'דיסקונט', 'מזרחי', 'הפניקס', 'הראל', 'מגדל',
    'אלביט', 'נייס', 'כיל', 'טבע', 'עזריאלי', 'מליסרון', 'אמות',
    'בזק', 'סלקום', 'פרטנר', 'שטראוס', 'שופרסל', 'אורמת',
    'ICL', 'NICE', 'TEVA', 'ESLT', 'LUMI', 'POLI',
];

const SCAN_CACHE_SIZE = 50;
let _scanCache = [];        // { title, company, date, url, analysis, savedToRag }
let _seenUrls  = new Set(); // prevent duplicate processing

// ── Maya API fetch ────────────────────────────────────────────────────────────

async function _fetchMayaReports(pageSize = 40) {
    const headers = {
        'Accept':       'application/json',
        'User-Agent':   'Mozilla/5.0 (compatible; BursaBot/1.0)',
        'Referer':      'https://maya.tase.co.il/',
        'Origin':       'https://maya.tase.co.il',
    };

    try {
        // Primary: Maya JSON API
        const { data } = await axios.get(MAYA_API, {
            params:  { pageNumber: 1, pageSize },
            headers,
            timeout: 15000,
        });

        const reports = data?.data ?? data?.Data ?? data ?? [];
        if (!Array.isArray(reports)) throw new Error('Unexpected Maya API response');
        return reports.map(r => ({
            title:   r.Title   ?? r.title   ?? '',
            company: r.CompanyName ?? r.companyName ?? r.Company ?? '',
            date:    r.ReportDate  ?? r.reportDate  ?? r.Date ?? new Date().toISOString(),
            url:     r.DocumentPath ? `https://maya.tase.co.il${r.DocumentPath}` : null,
            type:    r.ReportType  ?? r.reportType  ?? '',
        }));
    } catch (err) {
        console.warn('[maya] API failed, trying HTML fallback:', err.message);
        return _fetchMayaHTML(headers);
    }
}

async function _fetchMayaHTML(headers) {
    const { data: html } = await axios.get('https://maya.tase.co.il/reports/company', {
        headers, timeout: 15000,
    });
    const $ = cheerio.load(html);
    const rows = [];
    $('table tr, .report-row, [class*="report"]').each((_, el) => {
        const title   = $(el).find('[class*="title"], td:nth-child(2)').first().text().trim();
        const company = $(el).find('[class*="company"], td:first-child').first().text().trim();
        const link    = $(el).find('a[href*="report"]').attr('href') || '';
        if (title) rows.push({ title, company, date: new Date().toISOString(),
                                url: link ? `https://maya.tase.co.il${link}` : null });
    });
    return rows;
}

// ── Report text extraction ────────────────────────────────────────────────────

async function _extractReportText(url) {
    if (!url) return null;
    try {
        const { data: html } = await axios.get(url, {
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BursaBot/1.0)' },
        });
        const $ = cheerio.load(html);
        // Remove noise
        $('script, style, nav, header, footer, [class*="menu"], [class*="nav"]').remove();
        const text = $('body').text().replace(/\s{3,}/g, '\n').trim();
        return text.length > 100 ? text.slice(0, 8000) : null;
    } catch {
        return null;
    }
}

// ── Filter logic ─────────────────────────────────────────────────────────────

function _isRelevantReport(report) {
    const haystack = `${report.title} ${report.type}`.toLowerCase();
    return REPORT_KEYWORDS.some(kw => haystack.includes(kw.toLowerCase()));
}

function _isTA35Company(report) {
    if (!report.company) return true; // if unknown, include
    const c = report.company;
    return TA35_COMPANIES.some(name => c.includes(name));
}

// ── Main scan ─────────────────────────────────────────────────────────────────

/**
 * runScan — fetches Maya reports, filters, analyzes new ones
 * @param {{ groq, ragCol, usdRate }} ctx
 * @returns {Promise<Array>}  new scan results
 */
async function runScan({ groq, ragCol, usdRate = 3.7, portfolioCol, alertsCol, sendPush }) {
    console.log('[maya] Starting scan…');
    const newResults = [];

    let reports;
    try {
        reports = await _fetchMayaReports(40);
    } catch (err) {
        console.error('[maya] Fetch failed:', err.message);
        return [];
    }

    // Filter: relevant type + TA35 + not already seen
    const candidates = reports.filter(r =>
        _isRelevantReport(r) &&
        _isTA35Company(r) &&
        r.url && !_seenUrls.has(r.url)
    );

    console.log(`[maya] Found ${reports.length} reports, ${candidates.length} new candidates`);

    for (const report of candidates.slice(0, 5)) { // max 5 per scan
        _seenUrls.add(report.url);

        let analysis = null;
        let savedToRag = false;
        let holderSummary = null;
        let isPortfolioStock = false;

        try {
            const text = await _extractReportText(report.url);
            if (!text) {
                console.warn('[maya] Could not extract text from', report.url);
                continue;
            }

            // Send to agent for analysis
            analysis = await analyzeReport(text, { groq, ragCol, usdRate });

            // ── Smart Matcher: check if this company is in user's portfolio ──────
            if (portfolioCol && alertsCol) {
                const userPortfolio = await portfolioCol.findOne({ _id: 'main' }).catch(() => null);
                const userSymbols = userPortfolio?.symbols ?? [];
                // Match by company name (Hebrew) or symbol
                isPortfolioStock = userSymbols.some(sym =>
                    report.company?.includes(sym) ||
                    (analysis?.company ?? '').includes(sym) ||
                    sym.includes(report.company?.split(' ')[0] ?? '___')
                );
                if (isPortfolioStock && analysis?.summary) {
                    // Generate holder's summary using groq
                    try {
                        const holderPrompt = `אתה יועץ השקעות. המשתמש מחזיק במניית ${analysis?.company || report.company}.
דוח חדש פורסם. תקציר הדוח: ${analysis.summary}
שער דולר נוכחי: ${usdRate} ₪

כתוב 'תקציר למחזיקים' בעברית פשוטה — 3 שורות בלבד:
1. מה המשמעות לבעל המניה (חיובי/שלילי/ניטרלי)
2. האם כדאי להחזיק/לחזק/לצמצם
3. משפט אחד על השפעת שער הדולר אם רלוונטי`;

                        const chat = await groq.chat.completions.create({
                            model: 'llama-3.3-70b-versatile',
                            messages: [{ role: 'user', content: holderPrompt }],
                            max_tokens: 200,
                            temperature: 0.4,
                        });
                        holderSummary = chat.choices[0]?.message?.content?.trim() ?? null;
                    } catch(e) { console.warn('[maya] holderSummary failed:', e.message); }

                    // Save alert to MongoDB
                    const matchedSymbol = userSymbols.find(s =>
                        report.company?.includes(s) || s.includes(report.company?.split(' ')[0] ?? '___')
                    ) ?? '';
                    const companyName = analysis?.company || report.company;
                    await alertsCol.insertOne({
                        company: companyName,
                        symbol: matchedSymbol,
                        summary: analysis.summary,
                        holderSummary,
                        recommendation: analysis.recommendation,
                        confidence: analysis.confidence,
                        url: report.url,
                        createdAt: new Date(),
                        read: false,
                    }).catch(e => console.warn('[maya] alert insert failed:', e.message));

                    console.log(`[maya] 🔔 Portfolio alert created for ${companyName}`);

                    // ── Web Push ──────────────────────────────────────────────
                    if (sendPush) {
                        const rec = analysis.recommendation ?? '';
                        const emoji = rec === 'BUY' ? '📈' : rec === 'SELL' ? '📉' : '📋';
                        sendPush({
                            title: `${emoji} דוח חדש — ${companyName}`,
                            body: analysis.summary ? analysis.summary.slice(0, 120) : 'דוח חדש פורסם על מניה בתיקך',
                            url: report.url ?? '/',
                        }).catch(e => console.warn('[push] send failed:', e.message));
                    }
                }
            }
            // ── End Smart Matcher ─────────────────────────────────────────────────

            // Override source tag in MongoDB
            if (ragCol && analysis) {
                await ragCol.updateOne(
                    { hash: analysis._savedToRag ? undefined : null },
                    { $set: { source: 'automated_scan', automatedAt: new Date() } },
                    { upsert: false }
                ).catch(() => {}); // best-effort
                savedToRag = true;
            }
        } catch (err) {
            console.error('[maya] Analysis error for', report.title, ':', err.message);
        }

        const result = {
            title:      report.title,
            company:    report.company || analysis?.company || '—',
            date:       report.date,
            url:        report.url,
            recommendation: analysis?.recommendation ?? null,
            confidence:     analysis?.confidence ?? 0,
            summary:        analysis?.summary ?? null,
            holderSummary:  holderSummary ?? null,
            isPortfolioStock: isPortfolioStock ?? false,
            savedToRag,
            scannedAt:  new Date().toISOString(),
        };

        newResults.push(result);

        // Prepend to cache
        _scanCache.unshift(result);
        if (_scanCache.length > SCAN_CACHE_SIZE) _scanCache.length = SCAN_CACHE_SIZE;

        console.log(`[maya] ✓ Analyzed: ${result.company} — ${result.recommendation}`);
    }

    console.log(`[maya] Scan complete. ${newResults.length} new reports analyzed.`);
    return newResults;
}

/**
 * getLatestScans — returns cached scan results
 * @param {number} limit
 */
function getLatestScans(limit = 20) {
    return _scanCache.slice(0, limit);
}

module.exports = { runScan, getLatestScans };
