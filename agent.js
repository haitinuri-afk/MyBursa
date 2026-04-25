/**
 * agent.js — Bursa Agentic Workflow
 *
 * Exports:
 *   analyzeReport(text, { groq, ragCol, usdRate })   → analysis object
 *   screenStocks(query, { groq, quotes })             → filtered stocks + explanation
 */

'use strict';

const { createHash } = require('crypto');

// ── 1. Analyst Agent ─────────────────────────────────────────────────────────

const ANALYST_SYSTEM = `אתה אנליסט פיננסי בכיר המתמחה בשוק ההון הישראלי.
כאשר מקבל דוח פיננסי גולמי, עליך לחלץ ממנו מידע מובנה בפורמט JSON בלבד.

החזר אובייקט JSON עם המבנה הבא (ללא markdown, ללא הסברים, רק JSON):
{
  "company": "שם החברה",
  "period": "רבעון/שנה",
  "metrics": {
    "revenue": null,
    "ebitda": null,
    "netProfit": null,
    "eps": null,
    "peRatio": null,
    "debtToEquity": null,
    "roe": null
  },
  "swot": {
    "strengths": [],
    "weaknesses": [],
    "opportunities": [],
    "threats": []
  },
  "fxImpact": {
    "exposure": "גבוהה/בינונית/נמוכה",
    "direction": "חיובי/שלילי/ניטרלי",
    "explanation": ""
  },
  "summary": "",
  "recommendation": "קנייה/המתנה/מכירה",
  "confidence": 0
}

כל שדה שאינו מופיע בדוח — השאר null.
confidence הוא 0–100 (כמה הנתונים מלאים).`;

/**
 * analyzeReport — מנתח דוח פיננסי גולמי
 * @param {string} reportText  — טקסט הדוח
 * @param {{ groq, ragCol, usdRate }} ctx
 * @returns {Promise<object>}  — אובייקט ניתוח מובנה
 */
async function analyzeReport(reportText, { groq, ragCol, usdRate = 3.0 }) {
    if (!reportText || reportText.trim().length < 50)
        throw new Error('הדוח קצר מדי לניתוח');

    // ── שלב 1: חילוץ מדדים + SWOT ──────────────────────────────────────────
    const extractResp = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1200,
        temperature: 0.1,
        messages: [
            { role: 'system', content: ANALYST_SYSTEM },
            { role: 'user',   content: `שער הדולר הנוכחי: ₪${usdRate}\n\n${reportText}` },
        ],
    });

    let analysis;
    try {
        const raw = extractResp.choices[0]?.message?.content ?? '{}';
        // Strip markdown fences if model added them
        const clean = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        analysis = JSON.parse(clean);
    } catch {
        throw new Error('המודל החזיר פורמט לא תקין — נסה שוב');
    }

    analysis._usdRate    = usdRate;
    analysis._analyzedAt = new Date().toISOString();

    // ── שלב 2: שמירה אוטומטית ל-MongoDB ─────────────────────────────────────
    const saved = await _saveAnalysisChunk(analysis, ragCol);
    analysis._savedToRag = saved;

    return analysis;
}

// ── 2. Auto-Knowledge Update ─────────────────────────────────────────────────

async function _saveAnalysisChunk(analysis, ragCol) {
    if (!ragCol) return false;

    const company = analysis.company ?? 'חברה לא ידועה';
    const period  = analysis.period  ?? '';

    const lines = [
        `ניתוח פיננסי: ${company} ${period}`.trim(),
        analysis.summary ?? '',
        analysis.metrics?.peRatio    != null ? `מכפיל רווח: ${analysis.metrics.peRatio}` : '',
        analysis.metrics?.ebitda     != null ? `EBITDA: ${analysis.metrics.ebitda}` : '',
        analysis.metrics?.debtToEquity != null ? `חוב להון: ${analysis.metrics.debtToEquity}` : '',
        analysis.fxImpact?.explanation ?? '',
        `המלצה: ${analysis.recommendation ?? 'לא נקבעה'} (ביטחון: ${analysis.confidence ?? 0}%)`,
        analysis.swot?.strengths?.length  ? `חוזקות: ${analysis.swot.strengths.join(', ')}`  : '',
        analysis.swot?.weaknesses?.length ? `חולשות: ${analysis.swot.weaknesses.join(', ')}` : '',
        analysis.swot?.opportunities?.length ? `הזדמנויות: ${analysis.swot.opportunities.join(', ')}` : '',
        analysis.swot?.threats?.length    ? `סיכונים: ${analysis.swot.threats.join(', ')}`   : '',
    ].filter(Boolean);

    const text = lines.join('\n');
    const hash = createHash('md5').update(text).digest('hex');

    await ragCol.updateOne(
        { hash },
        {
            $setOnInsert: {
                hash,
                text,
                tags:      ['analysis', company.toLowerCase(), period].filter(Boolean),
                source:    'analyst-agent',
                company,
                period,
                metrics:   analysis.metrics   ?? {},
                swot:      analysis.swot       ?? {},
                recommendation: analysis.recommendation ?? null,
                confidence: analysis.confidence ?? 0,
                usdRate:   analysis._usdRate,
                createdAt: new Date(),
            },
        },
        { upsert: true }
    );

    return true;
}

// ── 3. Natural Language Screener ─────────────────────────────────────────────

const SCREENER_SYSTEM = `אתה מנוע סינון מניות המתרגם שאלות בעברית לסינון מובנה.

קבל: שאלה בשפה טבעית + רשימת מניות עם נתוניהן.
החזר JSON בלבד (ללא markdown):
{
  "filter": { "field": "...", "op": "lt|gt|eq|contains", "value": ... },
  "sort":   { "field": "...", "dir": "asc|desc" },
  "limit":  10,
  "explanation": "הסבר קצר מה הסינון עושה",
  "results": [ ...מניות שעוברות את הסינון... ]
}

שדות זמינים לסינון: symbol, name, price, change, changePct, peRatio, sector.
אם שדה לא קיים בנתונים, סנן לפי מה שיש.
החזר תמיד את results עם המניות המסוננות.`;

/**
 * screenStocks — מסנן מניות לפי שאלה בשפה טבעית
 * @param {string} query   — "מצא מניות עם מכפיל נמוך מ-15"
 * @param {{ groq, quotes }} ctx
 * @returns {Promise<{ results, explanation, filter, sort }>}
 */
async function screenStocks(query, { groq, quotes = [] }) {
    if (!query?.trim()) throw new Error('שאלת הסינון ריקה');
    if (!quotes.length)  throw new Error('אין נתוני מניות זמינים');

    // Build compact stock list for the prompt
    const stockList = quotes.map(q => ({
        symbol:    q.symbol,
        name:      q.name ?? q.symbol,
        price:     q.regularMarketPrice,
        changePct: q.regularMarketChangePercent != null
                   ? parseFloat(q.regularMarketChangePercent.toFixed(2)) : null,
    }));

    const resp = await groq.chat.completions.create({
        model:       'llama-3.3-70b-versatile',
        max_tokens:  1000,
        temperature: 0.1,
        messages: [
            { role: 'system', content: SCREENER_SYSTEM },
            {
                role: 'user',
                content: `שאלה: ${query}\n\nמניות:\n${JSON.stringify(stockList, null, 2)}`,
            },
        ],
    });

    const raw   = resp.choices[0]?.message?.content ?? '{}';
    const clean = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    try {
        return JSON.parse(clean);
    } catch {
        throw new Error('המודל החזיר פורמט לא תקין');
    }
}

module.exports = { analyzeReport, screenStocks };
