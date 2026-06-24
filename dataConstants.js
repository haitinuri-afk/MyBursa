'use strict';

/**
 * dataConstants.js — Single source of truth for stock symbols & categories
 * Used by: server.js, automationService.js
 *
 * Format: "שם עברי": "TICKER.TA"   (Yahoo Finance — .TA suffix for TASE)
 * Covers all TA-125 components (TA-35 + TA-90) plus a handful of dual-listed names.
 */

// ── Hebrew name → Yahoo Finance ticker ────────────────────────────────────
const STOCK_SYMBOLS_HE = {

    // ── מדדים ──────────────────────────────────────────────────────────────
    'מדד תא-35':          '^TA35',
    'מדד תא-90':          '^TA90',
    'מדד תא-125':         '^TA100',

    // ── בנקים ──────────────────────────────────────────────────────────────
    'לאומי':              'LUMI.TA',
    'פועלים':             'POLI.TA',
    'דיסקונט':            'DSCT.TA',
    'מזרחי טפחות':        'MZTF.TA',
    'הבינלאומי':          'FIBI.TA',
    'בנק ירושלים':        'JBNK.TA',
    'מרכנתיל דיסקונט':   'MARC.TA',
    'אי.בי.אי':           'IBI.TA',

    // ── ביטוח ──────────────────────────────────────────────────────────────
    'הפניקס':             'PHOE.TA',
    'הראל':               'HARL.TA',
    'כלל ביטוח':          'CLIS.TA',
    'מנורה מבטחים':       'MNRT.TA',
    'מגדל ביטוח':         'MGDL.TA',

    // ── טכנולוגיה ──────────────────────────────────────────────────────────
    'אלביט':              'ESLT.TA',
    'נייס':               'NICE.TA',
    'טאוור':              'TSEM.TA',
    'נובה':               'NVMI.TA',
    'קמהדע':              'KMDA.TA',
    'סייבר-ארק':          'CYBR.TA',
    'אאורה':              'AURA.TA',
    'מגידו':              'MGRT.TA',
    "ג'נריישן קפיטל":    'GNRS.TA',
    'ספיינס':             'SPEN.TA',
    'פריון':              'PERI.TA',
    'אלוט':               'ALLT.TA',
    'סנו':                'SANO.TA',

    // ── פארמה / כימיה ──────────────────────────────────────────────────────
    'טבע':                'TEVA.TA',
    'כיל':                'ICL.TA',

    // ── נדל"ן ───────────────────────────────────────────────────────────────
    'עזריאלי':            'AZRG.TA',
    'מליסרון':            'MLSR.TA',
    'אמות':               'AMOT.TA',
    'ביג':                'BIG.TA',
    'גב ים':              'GVYM.TA',
    'שיכון ובינוי':       'SKBN.TA',
    'ריט1':               'RIT1.TA',
    'אפי נכסים':          'AFID.TA',
    'אלרוב נדל"ן':        'ALRE.TA',
    'אלוני חץ':           'ALHE.TA',

    // ── אנרגיה ─────────────────────────────────────────────────────────────
    "אנרג'יקס":           'ENRG.TA',
    'אנלייט':             'ENLT.TA',
    'אורמת':              'ORA.TA',
    'קבוצת דלק':          'DLEKG.TA',
    'פז נפט':             'PAZ.TA',
    'דלק קידוחים':        'DLKR.TA',
    'OPC אנרגיה':         'OPCE.TA',

    // ── תקשורת ─────────────────────────────────────────────────────────────
    'בזק':                'BEZQ.TA',
    'סלקום':              'CEL.TA',
    'פרטנר':              'PTNR.TA',

    // ── קמעונאות / מזון ────────────────────────────────────────────────────
    'שטראוס':             'STRS.TA',
    'שופרסל':             'SAE.TA',
    'פוקס':               'FOX.TA',
    'רמי לוי':            'RMLI.TA',
    'אלקטרה מוצרים':      'ELCO.TA',

    // ── תעשייה / תחבורה / שונות ────────────────────────────────────────────
    'אלקטרה':             'ELTR.TA',
    'ישקר':               'ISCR.TA',
    'דיסקאונט השקעות':    'DISI.TA',
    'אל על':              'ELAL.TA',
    'ישראל קורפ':         'ILCO.TA',
    'IDB':                'IDBH.TA',
};

// ── Reverse map: ticker → Hebrew name ─────────────────────────────────────
const SYMBOL_TO_HE = Object.fromEntries(
    Object.entries(STOCK_SYMBOLS_HE).map(([he, sym]) => [sym, he])
);

// ── TA-125 full component list (for API + autocomplete) ───────────────────
const TASE125 = [
    // בנקים
    { ticker:'LUMI.TA', nameHe:'לאומי',              nameEn:'Bank Leumi',               sector:'בנקים' },
    { ticker:'POLI.TA', nameHe:'פועלים',              nameEn:'Bank Hapoalim',            sector:'בנקים' },
    { ticker:'DSCT.TA', nameHe:'דיסקונט',             nameEn:'Bank Discount',            sector:'בנקים' },
    { ticker:'MZTF.TA', nameHe:'מזרחי טפחות',         nameEn:'Mizrahi Tefahot',          sector:'בנקים' },
    { ticker:'FIBI.TA', nameHe:'הבינלאומי',           nameEn:'First International Bank', sector:'בנקים' },
    { ticker:'JBNK.TA', nameHe:'בנק ירושלים',         nameEn:'Bank of Jerusalem',        sector:'בנקים' },
    { ticker:'YAHV.TA', nameHe:'בנק יהב',             nameEn:'Bank Yahav',               sector:'בנקים' },
    { ticker:'BNKI.TA', nameHe:'אוצר החייל',           nameEn:'Otzar Ha-Hayal',           sector:'בנקים' },
    { ticker:'MARC.TA', nameHe:'מרכנתיל דיסקונט',     nameEn:'Mercantile Discount',      sector:'בנקים' },
    { ticker:'IBI.TA',  nameHe:'אי.בי.אי',             nameEn:'IBI Investment House',     sector:'פיננסים' },
    // ביטוח
    { ticker:'PHOE.TA', nameHe:'הפניקס',              nameEn:'Phoenix Holdings',         sector:'ביטוח' },
    { ticker:'HARL.TA', nameHe:'הראל',                nameEn:'Harel Insurance',          sector:'ביטוח' },
    { ticker:'CLIS.TA', nameHe:'כלל ביטוח',           nameEn:'Clal Insurance',           sector:'ביטוח' },
    { ticker:'MNRT.TA', nameHe:'מנורה מבטחים',        nameEn:'Menora Mivtachim',         sector:'ביטוח' },
    { ticker:'MGDL.TA', nameHe:'מגדל ביטוח',          nameEn:'Migdal Insurance',         sector:'ביטוח' },
    { ticker:'HKSH.TA', nameHe:'הכשרה ביטוח',         nameEn:'Hachshara Insurance',      sector:'ביטוח' },
    // טכנולוגיה
    { ticker:'ESLT.TA', nameHe:'אלביט',               nameEn:'Elbit Systems',            sector:'טכנולוגיה' },
    { ticker:'NICE.TA', nameHe:'נייס',                nameEn:'NICE Systems',             sector:'טכנולוגיה' },
    { ticker:'TSEM.TA', nameHe:'טאוור',               nameEn:'Tower Semiconductor',      sector:'טכנולוגיה' },
    { ticker:'NVMI.TA', nameHe:'נובה',                nameEn:'Nova Measuring',           sector:'טכנולוגיה' },
    { ticker:'KMDA.TA', nameHe:'קמהדע',               nameEn:'Camtek',                   sector:'טכנולוגיה' },
    { ticker:'CYBR.TA', nameHe:'סייבר-ארק',           nameEn:'CyberArk Software',        sector:'טכנולוגיה' },
    { ticker:'AURA.TA', nameHe:'אאורה',               nameEn:'Aura Smart Air',           sector:'טכנולוגיה' },
    { ticker:'MGRT.TA', nameHe:'מגידו',               nameEn:'Magisto / Magnet',         sector:'טכנולוגיה' },
    { ticker:'GNRS.TA', nameHe:"ג'נריישן קפיטל",     nameEn:'Generation Capital',       sector:'טכנולוגיה' },
    { ticker:'SPNS.TA', nameHe:'ספיינס',              nameEn:'Sapiens International',    sector:'טכנולוגיה' },
    { ticker:'PERI.TA', nameHe:'פריון',               nameEn:'Perion Network',           sector:'טכנולוגיה' },
    { ticker:'ALLT.TA', nameHe:'אלוט',                nameEn:'Allot Communications',     sector:'טכנולוגיה' },
    { ticker:'SANO.TA', nameHe:'סנו',                 nameEn:'Sano Industries',          sector:'צריכה' },
    // פארמה / כימיה
    { ticker:'TEVA.TA', nameHe:'טבע',                 nameEn:'Teva Pharmaceutical',      sector:'פארמה' },
    { ticker:'ICL.TA',  nameHe:'כיל',                 nameEn:'ICL Group',                sector:'פארמה' },
    // נדל"ן
    { ticker:'AZRG.TA', nameHe:'עזריאלי',             nameEn:'Azrieli Group',            sector:'נדל"ן' },
    { ticker:'MLSR.TA', nameHe:'מליסרון',             nameEn:'Melisron',                 sector:'נדל"ן' },
    { ticker:'AMOT.TA', nameHe:'אמות',                nameEn:'Amot Investments',         sector:'נדל"ן' },
    { ticker:'BIG.TA',  nameHe:'ביג',                 nameEn:'Big Shopping Centers',     sector:'נדל"ן' },
    { ticker:'GVYM.TA', nameHe:'גב ים',               nameEn:'Gav-Yam',                  sector:'נדל"ן' },
    { ticker:'SKBN.TA', nameHe:'שיכון ובינוי',        nameEn:'Shikun & Binui',           sector:'נדל"ן' },
    { ticker:'RIT1.TA', nameHe:'ריט1',                nameEn:'Reit 1',                   sector:'נדל"ן' },
    { ticker:'AFID.TA', nameHe:'אפי נכסים',           nameEn:'Afikim Properties',        sector:'נדל"ן' },
    { ticker:'ALRE.TA', nameHe:'אלרוב נדל"ן',         nameEn:'Alrov Real Estate',        sector:'נדל"ן' },
    { ticker:'ALHE.TA', nameHe:'אלוני חץ',            nameEn:'Alony-Hetz',               sector:'נדל"ן' },
    // אנרגיה
    { ticker:'ENRG.TA', nameHe:"אנרג'יקס",           nameEn:'Energix',                  sector:'אנרגיה' },
    { ticker:'ENLT.TA', nameHe:'אנלייט',              nameEn:'Enlight Energy',           sector:'אנרגיה' },
    { ticker:'ORA.TA',  nameHe:'אורמת',               nameEn:'Ormat Technologies',       sector:'אנרגיה' },
    { ticker:'DLEKG.TA',nameHe:'קבוצת דלק',           nameEn:'Delek Group',              sector:'אנרגיה' },
    { ticker:'PAZ.TA',  nameHe:'פז נפט',              nameEn:'Paz Oil',                  sector:'אנרגיה' },
    { ticker:'DLKR.TA', nameHe:'דלק קידוחים',         nameEn:'Delek Drilling',           sector:'אנרגיה' },
    { ticker:'OPCE.TA', nameHe:'OPC אנרגיה',          nameEn:'OPC Energy',               sector:'אנרגיה' },
    // תקשורת
    { ticker:'BEZQ.TA', nameHe:'בזק',                 nameEn:'Bezeq',                    sector:'תקשורת' },
    { ticker:'CEL.TA',  nameHe:'סלקום',               nameEn:'Cellcom',                  sector:'תקשורת' },
    { ticker:'PTNR.TA', nameHe:'פרטנר',               nameEn:'Partner Communications',   sector:'תקשורת' },
    // קמעונאות / מזון
    { ticker:'STRS.TA', nameHe:'שטראוס',              nameEn:'Strauss Group',            sector:'צריכה' },
    { ticker:'SAE.TA',  nameHe:'שופרסל',              nameEn:'Shufersal',                sector:'צריכה' },
    { ticker:'FOX.TA',  nameHe:'פוקס',                nameEn:'Fox Fashion',              sector:'צריכה' },
    { ticker:'RMLI.TA', nameHe:'רמי לוי',             nameEn:'Rami Levy',                sector:'צריכה' },
    { ticker:'ELCO.TA', nameHe:'אלקטרה מוצרים',       nameEn:'Electra Consumer Products',sector:'צריכה' },
    // תעשייה / שונות
    { ticker:'ELTR.TA', nameHe:'אלקטרה',              nameEn:'Electra',                  sector:'תעשייה' },
    { ticker:'ISCR.TA', nameHe:'ישקר',                nameEn:'Iscar / Iskur',            sector:'תעשייה' },
    { ticker:'DISI.TA', nameHe:'דיסקאונט השקעות',     nameEn:'Discount Investments',     sector:'תעשייה' },
    { ticker:'ELAL.TA', nameHe:'אל על',               nameEn:'El Al Airlines',           sector:'תחבורה' },
    { ticker:'ILCO.TA', nameHe:'ישראל קורפ',          nameEn:'Israel Corporation',       sector:'תעשייה' },
    { ticker:'IDBH.TA', nameHe:'IDB',                 nameEn:'IDB Holdings',             sector:'תעשייה' },
];

// ── Sector classification ──────────────────────────────────────────────────
const SECTORS = {
    'בנקים':        ['לאומי','פועלים','דיסקונט','מזרחי טפחות','הבינלאומי','בנק ירושלים','בנק יהב','אוצר החייל','מרכנתיל דיסקונט'],
    'פיננסים':      ['אי.בי.אי'],
    'ביטוח':        ['הפניקס','הראל','כלל ביטוח','מנורה מבטחים','מגדל ביטוח','הכשרה ביטוח'],
    'טכנולוגיה':   ['אלביט','נייס','טאוור','אאורה','נובה','קמהדע','סייבר-ארק','מגידו',"ג'נריישן קפיטל",'ספיינס','פריון','אלוט'],
    'פארמה':        ['טבע','כיל'],
    'נדל"ן':        ['עזריאלי','מליסרון','אמות','ביג','גב ים','שיכון ובינוי','ריט1','אפי נכסים','נכסים ובנין','אלרוב נדל"ן','גזית גלוב','מניב','אלוני חץ','רבוע כחול נדל"ן'],
    'אנרגיה':       ["אנרג'יקס",'אנלייט','אורמת','קבוצת דלק','פז נפט','דלק רכב','דלק קידוחים','OPC אנרגיה'],
    'תקשורת':       ['בזק','סלקום','פרטנר'],
    'צריכה':        ['שטראוס','שופרסל','פוקס','רמי לוי','אלקטרה מוצרים','סנו'],
    'תעשייה':       ['אלקטרה','ישקר','דיסקאונט השקעות','קרסו מוטורס','ישראל קורפ','IDB'],
    'תחבורה':       ['אל על'],
};

// ── Benchmark for alpha calculation ───────────────────────────────────────
const BENCHMARK_SYMBOL = '^TA100';  // Yahoo Finance ticker for TA-125 index
const BENCHMARK_NAME   = 'מדד תא-125';

module.exports = { STOCK_SYMBOLS_HE, SYMBOL_TO_HE, TASE125, SECTORS, BENCHMARK_SYMBOL, BENCHMARK_NAME };
