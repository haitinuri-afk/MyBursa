# MyBursa — Architecture & State Context

---

**Branch:** `claude/admiring-clarke-4f00a8`  
**Stable Commit:** `75eaf7e`  
**Stack:** Node.js · Express · Vanilla JS · LightweightCharts · Groq API · MongoDB Atlas

> קובץ זה משמש כ-**context snapshot** לעבודה עם AI coding assistants (Claude / Cursor).  
> הוא מתאר את המצב המדויק של האפליקציה בנקודת ה-branch הנוכחית — ארכיטקטורה, החלטות עיצוב, ומצב הסנכרון.

---

## 1. Frontend & UI/UX

### עיצוב ומבנה ויזואלי
- **Light Theme** — עיצוב בסגנון Google Finance: רקע לבן (`#ffffff`), כרטיסים עם `box-shadow` עדין, טיפוגרפיה clean ללא רעש ויזואלי
- **Color Intensity System** — כל שורת מניה מקבלת גוון **gradient ירוק/אדום דינמי** לפי גודל השינוי היומי; שינוי קטן = גוון חיוור, שינוי גדול = צבע רווי — מאפשר סריקה ויזואלית מהירה של המניות החמות
- **Draggable Windows** — חלונות מניה צפים ניתנים לגרירה ומיקום חופשי על המסך, ממומשים עם `mousedown/mousemove` events וזיכרון מיקום per-window

### Ticker רץ
- ממומש עם **`requestAnimationFrame` loop** — ביצועים גבוהים ללא `setInterval` שנוטה לעצור ב-background tabs
- כיוון LTR מאולץ (`direction: ltr`) בתוך דף RTL, כדי ש-`translateX` יגלול לכיוון הנכון
- אנימציה חלקה ורציפה גם בעומס CPU

### גרפים — LightweightCharts
- **גרף TA-35 (ימין)** — `AreaSeries` עם fill ירוק שקוף, data points מ-Yahoo Finance API, טאבים: `D / W / M`
- **גרף מניה ראשי (חלון צף)** — `CandlestickSeries` + `HistogramSeries` לווליום; tooltip מותאם עם שעה + מחיר
- Crosshair date label מוסתר (`hideText: true`) לממשק נקי יותר
- **Fallback logic לגרף D-tab:** כאשר Yahoo מחזיר תוצאה ריקה עבור intraday (range=`1d`, interval=`5m`) — מוחלף אוטומטית ב-`1mo/1d` כדי למנוע גרף ריק

### ביצועי תיק (Portfolio Performance Chart)
- גרף קווי המציג **equity curve** של שווי התיק לאורך זמן
- מסונכרן עם `portfolio.json` ועם נתוני מחיר real-time

---

## 2. AI & Intelligence Layer

### AI אסטרטג — Groq + LLaMA
- מחובר ל-**Groq API** (מהיר במיוחד ל-inference) עם מודל `llama3-70b`
- ה-Agent רואה: **תיק מלא + חלוקת סקטורים + מחירים נוכחיים + היסטוריה**
- מנתח: **רמות תמיכה/התנגדות**, אנומליות מחיר, ריכוזיות תיק, מניות חמות
- תוצאה: ניתוח אסטרטגי בעברית, markdown-rendered, עם המלצות פעולה קונקרטיות

### RAG — MongoDB Atlas Vector Search
- **Knowledge Base** עם 15+ chunks על שוק ההון הישראלי (מדדים, כללי מסחר, סקטורים)
- Vector embeddings מאוחסנים ב-**MongoDB Atlas** עם local fallback לפיתוח
- `seed-rag.js` / `seed-direct.js` — סקריפטים לאכלוס ועדכון הבסיס
- `/api/rag` endpoint — query interface לחיפוש סמנטי

### Agentic Workflow
- **Analyst Agent** (`agent.js`) — pipeline אוטומטי: קריאת נתוני שוק → ניתוח → עדכון RAG
- **Maya Scraper** (`maya-scraper.js`) — cron job שסורק את מאיה לדוחות חברות, שומר scan results, חושף דרך `/api/latest-scans`
- **Analyze-Report Pipeline** — תמיכה בהעלאת PDF (multer + pdf-parse) → ניתוח AI → הצגה ב-UI

---

## 3. Backend & Data Synchronization

### שרת — `server.js`
- **Express** על Node.js, חושף REST API + static files
- **Yahoo Finance Integration** — dual strategy:
  - `fetchChartMeta('5d')` לנתוני OHLC ומחיר
  - `fetchV7Quotes(symList)` עבור **כל** הסימבולים — מחלץ `regularMarketChangePercent` לחישוב `prevClose` מדויק
- **Stooq Fallback** — כל מניות TA-125 שאינן זמינות ב-Yahoo מקבלות מחיר דרך Stooq API

### prevClose — לוגיקת גזירה
```
Priority 1: ETF changePercent (מדויק ביותר)
Priority 2: v7 regularMarketChangePercent → prevClose = price / (1 + pct/100)
Priority 3: meta.regularMarketPreviousClose (fallback)
```
פתרון זה נדרש כי Yahoo Chart API מחזיר `prevClose = price` עבור מניות TASE בימי פתיחה (באג ידוע), שגרם לכל המניות להציג 0% שינוי.

### תיק — `portfolio.json`
- שמור **server-side** ב-JSON — מסונכרן בין כל מכשירים דרך הסרת התלות ב-localStorage
- FIFO lot tracking לחישוב רווח/הפסד ממומש
- `/api/portfolio/summary` — endpoint ייעודי לסיכום תיק

### isMarketOpen()
```javascript
// ישראל: ימים א׳-ה׳, 09:45–17:30
day >= 0 && day <= 4 && mins >= 585 && mins < 1050
// (timezone: Asia/Jerusalem)
```

---

## 4. Stable Checkpoints

| Commit | תיאור |
|--------|-------|
| `75eaf7e` | ✅ AI אסטרטג — ניתוח סקטורים, תמיכה/התנגדות, אנומליות |
| `2978906` | ✅ צבעים, AI אנליסט, טיקר חלק |
| `4b07bc0` | ✅ רקע לבן — גרסה טובה |
| `853e8cc` | Switch to Groq, תיקון market state + USD/ILS |
| `3ccdd6b` | Fix: D-tab fallback + v7 prevClose לכל המניות |

---

## 5. Known Issues & Decisions

- **Daily P&L freeze כשהשוק סגור** — נסיון יושם ובוטל מספר פעמים; הגישה פגעה בנתונים. **החלטה: לא מיושם**, ה-P&L מתאפס עם פתיחת שוק חדש
- **TA-35 intraday (1d/5m)** — Yahoo מחזיר "Not Found" → fallback ל-1mo/1d תקין
- **localStorage models** — תלוי בדומיין; אם ה-URL משתנה, המודלים נמחקים

---

## 6. How to Restore

```bash
# לפי branch
git checkout claude/admiring-clarke-4f00a8

# לפי commit ספציפי
git checkout 75eaf7e
```
