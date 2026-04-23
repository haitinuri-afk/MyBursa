# Bursa — גרסה נוכחית

**Branch:** `claude/admiring-clarke-4f00a8`

**תיאור:** גרסה טובה — רקע לבן, AI אסטרטג

## מה יש בגרסה זו

- **UI לבן** — עיצוב Google Finance סגנון, כרטיסים עם צל עדין
- **טיקר רץ** — requestAnimationFrame, לא נעצר
- **גרף TA-35** — LightweightCharts, area chart ירוק
- **גרף מניה ראשי** — candlestick + volume histogram
- **צבעים לפי עוצמה** — gradient ירוק/אדום לפי גודל השינוי
- **תיק מסונכרן** — server-side portfolio.json, עובד בין מחשב לטלפון
- **קנייה מהירה** — כפתור "קנה" בכל שורת מניה
- **AI אסטרטג** — רואה תיק, סקטורים, תמיכה/התנגדות, אנומליות

## Commits עיקריים

```
75eaf7e  AI אסטרטג — ניתוח סקטורים, תמיכה/התנגדות, אנומליות
2978906  גירסה טובה — צבעים, AI אנליסט, טיקר חלק
4b07bc0  רקע לבן - גרסה טובה
853e8cc  Switch AI to Groq, fix market state and USD/ILS rate source
```

## איך לחזור לגרסה זו

```bash
git checkout claude/admiring-clarke-4f00a8
```

או לפי commit ספציפי:

```bash
git checkout 75eaf7e
```
