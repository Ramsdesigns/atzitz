// care.js — לוח הזמנים של הטיפול: מתי להשקות/לדשן/לרסס, כמה מים, ומה מזג האוויר משנה.
// קובץ טהור (בלי DOM ובלי רשת) — רץ גם באפליקציה וגם בפונקציית ההתראות של Supabase (build.mjs מעתיק אותו).
//
// species = רשומה מהאינדקס (data/index.json) או כרטיס שנוצר ע"י Gemini — אותו מבנה.
// plant   = שורה מ-pl_plants: { location: "indoor"|"balcony", pot_cm, care: {...דריסות}, last_watered, ... }
// wx      = סיכום מזג אוויר מ-summarizeWeather() או null.

export const DAY = 86400000;
export const TZ = "Asia/Jerusalem";

/** תאריך מקומי בישראל כ-"YYYY-MM-DD" */
export function ymd(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
/** חודש מקומי 1–12 */
export function monthOf(d = new Date()) { return Number(ymd(d).slice(5, 7)); }
/** מספר ימים שלמים בין שני תאריכים מקומיים (b - a) */
export function daysBetween(a, b) {
  return Math.round((Date.parse(ymd(b) + "T00:00:00Z") - Date.parse(ymd(a) + "T00:00:00Z")) / DAY);
}
/** קיץ = מאי–אוקטובר (בישראל החום נמשך עד סוף אוקטובר) */
export function isSummer(d = new Date()) { const m = monthOf(d); return m >= 5 && m <= 10; }

/** הפרמטרים בפועל: מה שבמאגר, אחרי דריסות של המשתמשת לצמח הספציפי */
export function careParams(species, plant = {}) {
  const s = species || {};
  const o = plant.care || {};
  const pick = (v, d) => (v === undefined || v === null || v === "" ? d : v);
  return {
    waterSummer: Number(pick(o.water_summer, s.water?.summer_days ?? 7)),
    waterWinter: Number(pick(o.water_winter, s.water?.winter_days ?? 14)),
    drought: s.water?.drought_tolerance || "medium",
    fertDays: Number(pick(o.fertilize_days, s.fertilizer?.days ?? 30)),
    fertMonths: s.fertilizer?.months?.length ? s.fertilizer.months : [3, 4, 5, 6, 7, 8, 9],
    mistDays: Number(pick(o.mist_days, s.humidity?.mist_days ?? 0)),
    rotateDays: Number(pick(o.rotate_days, s.rotate_days ?? 0)),
    repotYears: Number(s.pot?.repot_years ?? 2),                  // 0 = לא מחליפים עציץ (טילנדסיה, ברומליה)
    repotMonths: s.pot?.repot_months?.length ? s.pot.repot_months : [3, 4],
    // undefined = לא ידוע → ברירת מחדל לפי סוג המרפסת; null מפורש = הצמח עמיד, בלי התראה
    shadeAbove: s.placement && "move_to_shade_above" in s.placement ? s.placement.move_to_shade_above : undefined,
    insideBelow: s.placement && "bring_inside_below" in s.placement ? s.placement.bring_inside_below : undefined,
    balcony: s.placement?.balcony || "ok_shade",
  };
}

/**
 * מקדם למרווח ההשקיה לפי מזג האוויר (1 = רגיל, 0.6 = להשקות הרבה יותר מוקדם).
 * במרפסת ההשפעה מלאה; בבית מתונה (קירות, מזגן), אבל שרב מייבש גם בפנים.
 */
export function weatherFactor(plant, wx) {
  if (!wx) return 1;
  const out = plant.location === "balcony";
  const t = wx.tmaxRecent;                       // ממוצע מקסימום ב-3 הימים האחרונים + היום
  let f = 1;
  if (out) {
    if (t >= 37) f = 0.55; else if (t >= 33) f = 0.7; else if (t >= 29) f = 0.85;
    else if (t <= 14) f = 1.4; else if (t <= 18) f = 1.2;
    if (wx.windy) f *= 0.9;
  } else {
    if (t >= 35) f = 0.85; else if (t >= 31) f = 0.92; else if (t <= 14) f = 1.1;
  }
  if (wx.sharav) f *= out ? 0.85 : 0.9;          // חם + יבש מאוד
  return Math.round(f * 100) / 100;
}

/** מקדם לפי גודל העציץ: עציץ קטן מתייבש מהר, גדול מחזיק מים */
export function potFactor(potCm) {
  const d = Number(potCm) || 0;
  if (!d) return 1;
  if (d <= 10) return 0.8;
  if (d <= 14) return 0.9;
  if (d >= 35) return 1.25;
  if (d >= 25) return 1.12;
  return 1;
}

/**
 * כמה מים בערך (מ״ל) — לפי נפח העציץ. עציץ סטנדרטי: גובה ≈ קוטר, צורה מעט חרוטית.
 * צמחים שסובלים יובש מקבלים פחות לכל השקיה (אבל עדיין השקיה יסודית ונדירה).
 */
export function waterMl(potCm, drought = "medium", location = "indoor") {
  const d = Number(potCm) || 15;
  const volume = Math.PI * (d / 2) ** 2 * d * 0.75;             // סמ״ק = מ״ל
  const share = drought === "high" ? 0.15 : drought === "low" ? 0.28 : 0.22;
  const ml = volume * share * (location === "balcony" ? 1.15 : 1);
  if (ml < 100) return Math.max(30, Math.round(ml / 10) * 10);
  if (ml < 1000) return Math.round(ml / 50) * 50;
  return Math.round(ml / 100) * 100;
}

export function formatMl(ml) {
  if (ml >= 1000) return `${(ml / 1000).toFixed(ml % 1000 ? 1 : 0)} ליטר`;
  return `${ml} מ״ל`;
}

/** המרווח בימים להשקיה הבאה, אחרי עונה, מזג אוויר ועציץ */
export function waterInterval(species, plant, wx, date = new Date()) {
  const p = careParams(species, plant);
  const base = isSummer(date) ? p.waterSummer : p.waterWinter;
  return Math.max(1, Math.round(base * weatherFactor(plant, wx) * potFactor(plant.pot_cm)));
}

function dueInfo(last, intervalDays, date) {
  if (!last) return { dueIn: 0, since: null, unknown: true };
  const since = daysBetween(new Date(last), date);
  return { dueIn: intervalDays - since, since, unknown: false };
}

/**
 * כל המשימות של צמח אחד, כולל העתידיות (dueIn > 0). dueIn <= 0 = להיום (או באיחור).
 * kind: water | fertilize | mist | rotate | repot | shade | inside | rain
 */
export function plantTasks(species, plant, wx, date = new Date()) {
  const p = careParams(species, plant);
  const tasks = [];
  const snoozed = plant.snooze ?? {};
  const isSnoozed = kind => snoozed[kind] && snoozed[kind] >= ymd(date);

  // השקיה — אם ירד גשם משמעותי על צמח מרפסת חשוף, הגשם "השקה" אותו
  const wi = waterInterval(species, plant, wx, date);
  let w = dueInfo(plant.last_watered, wi, date);
  const rained = plant.location === "balcony" && !plant.covered && wx?.rainRecentMm >= 6;
  if (rained && w.dueIn <= 1) {
    tasks.push({ kind: "rain", dueIn: 99, text: `ירדו ${Math.round(wx.rainRecentMm)} מ״מ גשם, אין צורך להשקות` });
  } else {
    const mode = species?.water?.mode;
    const ml = mode ? null : waterMl(plant.pot_cm, p.drought, plant.location);
    const text = mode === "soak" ? "לטבול במים 20–30 דקות ולנער היטב"
      : mode === "cup" ? "למלא מעט מים בגביע שבמרכז ולהרטיב קלות את המצע"
      : `להשקות כ-${formatMl(ml)}`;
    tasks.push({ kind: "water", dueIn: w.dueIn, since: w.since, unknown: w.unknown, interval: wi, ml, text, snoozed: isSnoozed("water") });
  }

  // דישון — רק בחודשי הגדילה
  const m = monthOf(date);
  if (p.fertDays > 0 && p.fertMonths.includes(m)) {
    const f = dueInfo(plant.last_fertilized, p.fertDays, date);
    tasks.push({ kind: "fertilize", dueIn: f.unknown ? Math.min(7, p.fertDays) : f.dueIn, since: f.since,
      text: "לדשן (דשן נוזלי בחצי ריכוז, יחד עם ההשקיה)", snoozed: isSnoozed("fertilize") });
  }

  // ריסוס — בקיץ ובמזגן הצורך עולה
  if (p.mistDays > 0) {
    const md = wx?.sharav ? Math.max(1, Math.round(p.mistDays / 2)) : p.mistDays;
    const ms = dueInfo(plant.last_misted, md, date);
    tasks.push({ kind: "mist", dueIn: ms.unknown ? 0 : ms.dueIn, since: ms.since, text: "לרסס את העלים במים", snoozed: isSnoozed("mist") });
  }

  // סיבוב העציץ לגדילה אחידה
  if (p.rotateDays > 0) {
    const r = dueInfo(plant.last_rotated, p.rotateDays, date);
    tasks.push({ kind: "rotate", dueIn: r.unknown ? 3 : r.dueIn, since: r.since, text: "לסובב את העציץ רבע סיבוב", snoozed: isSnoozed("rotate") });
  }

  // החלפת עציץ — בחודשי ההעברה, אם עברו מספיק שנים מההחלפה (או מהקנייה)
  const ref = plant.last_repotted || plant.acquired;
  if (ref && p.repotYears > 0 && p.repotMonths.includes(m)) {
    const years = daysBetween(new Date(ref), date) / 365;
    if (years >= p.repotYears) tasks.push({ kind: "repot", dueIn: 0, text: "הגיע הזמן להעביר לעציץ גדול יותר (2–4 ס״מ יותר)", snoozed: isSnoozed("repot") });
  }

  return tasks.concat(weatherAlerts(species, plant, wx));
}

/** התראות מזג אוויר — רלוונטיות לצמחים במרפסת (ולשרב קיצוני גם ליד חלון) */
export function weatherAlerts(species, plant, wx) {
  if (!wx) return [];
  const p = careParams(species, plant);
  const out = [];
  if (plant.location === "balcony") {
    const hot = p.shadeAbove === undefined ? (p.balcony === "ok_sun" ? 38 : 33) : p.shadeAbove;
    if (hot != null && wx.tmaxNext >= hot) out.push({ kind: "shade", dueIn: 0, alert: true,
      text: `צפוי ${Math.round(wx.tmaxNext)}°. להעביר לצל או להצל בבוקר, ולוודא שהאדמה לחה` });
    const cold = p.insideBelow === undefined ? (p.balcony === "ok_sun" ? 3 : 10) : p.insideBelow;
    if (cold != null && wx.tminNext <= cold) out.push({ kind: "inside", dueIn: 0, alert: true,
      text: `צפוי קור של ${Math.round(wx.tminNext)}° בלילה, כדאי להכניס פנימה` });
    if (wx.windNext >= 50) out.push({ kind: "wind", dueIn: 0, alert: true,
      text: `רוח חזקה צפויה (${Math.round(wx.windNext)} קמ״ש). להצמיד לקיר או להוריד מהמעקה` });
  } else if (wx.tmaxNext >= 38 && plant.spot === "window") {
    out.push({ kind: "shade", dueIn: 0, alert: true, text: `שרב של ${Math.round(wx.tmaxNext)}°. להרחיק מהחלון או לסגור וילון בצהריים` });
  }
  return out;
}

/** המשימות שצריך לעשות היום (כולל איחורים), בלי דחויות */
export function todayTasks(species, plant, wx, date = new Date()) {
  return plantTasks(species, plant, wx, date).filter(t => t.dueIn <= 0 && !t.snoozed);
}

/**
 * מזג אוויר מ-Open-Meteo (daily, past_days=3, forecast_days=3) → סיכום שהלוגיקה צריכה.
 * https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_min,wind_speed_10m_max,wind_gusts_10m_max&past_days=3&forecast_days=3&timezone=Asia%2FJerusalem
 */
export function summarizeWeather(json, date = new Date()) {
  const d = json?.daily;
  if (!d?.time?.length) return null;
  const today = ymd(date);
  const i = Math.max(0, d.time.indexOf(today));
  const at = (arr, k) => (arr && arr[k] != null ? arr[k] : null);
  const avg = xs => { const v = xs.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const recent = k => d[k] ? d[k].slice(Math.max(0, i - 3), i + 1) : [];
  const tmaxRecent = avg(recent("temperature_2m_max")) ?? 25;
  const rainRecentMm = recent("precipitation_sum").slice(-2).reduce((a, b) => a + (b || 0), 0);
  const tmaxNext = Math.max(at(d.temperature_2m_max, i) ?? -99, at(d.temperature_2m_max, i + 1) ?? -99);
  const tminNext = Math.min(at(d.temperature_2m_min, i) ?? 99, at(d.temperature_2m_min, i + 1) ?? 99);
  const hum = at(d.relative_humidity_2m_min, i);
  const windNext = Math.max(at(d.wind_gusts_10m_max, i) ?? 0, at(d.wind_gusts_10m_max, i + 1) ?? 0);
  return {
    today: { tmax: at(d.temperature_2m_max, i), tmin: at(d.temperature_2m_min, i), rain: at(d.precipitation_sum, i), humMin: hum },
    tmaxRecent, rainRecentMm, tmaxNext, tminNext, windNext,
    windy: (at(d.wind_speed_10m_max, i) ?? 0) >= 30,
    sharav: (at(d.temperature_2m_max, i) ?? 0) >= 32 && hum != null && hum <= 25,
  };
}

export const WEATHER_URL = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_min,wind_speed_10m_max,wind_gusts_10m_max,weather_code,precipitation_probability_max,uv_index_max" +
  "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day" +
  "&past_days=3&forecast_days=7&timezone=Asia%2FJerusalem";

/** קוד מזג אוויר (WMO) → תיאור קצר בעברית */
export function wxText(code) {
  if (code == null) return "";
  if (code === 0) return "בהיר";
  if (code <= 2) return "מעונן חלקית";
  if (code === 3) return "מעונן";
  if (code <= 48) return "ערפל";
  if (code <= 57) return "טפטוף";
  if (code <= 67) return code >= 65 ? "גשם חזק" : "גשם";
  if (code <= 77) return "שלג";
  if (code <= 82) return code === 82 ? "ממטרים חזקים" : "ממטרים";
  return "סופת רעמים";
}

/** התחזית מהיום והלאה (עד 7 ימים) בצורה נוחה לתצוגה ולהמלצות */
export function forecastDays(json, date = new Date()) {
  const d = json?.daily;
  if (!d?.time?.length) return [];
  const i0 = Math.max(0, d.time.indexOf(ymd(date)));
  return d.time.slice(i0, i0 + 7).map((t, k) => {
    const i = i0 + k, v = key => d[key]?.[i] ?? null;
    return { date: t, tmax: v("temperature_2m_max"), tmin: v("temperature_2m_min"), rain: v("precipitation_sum") ?? 0,
      rainProb: v("precipitation_probability_max"), gust: v("wind_gusts_10m_max") ?? 0, uv: v("uv_index_max"),
      humMin: v("relative_humidity_2m_min"), code: v("weather_code") };
  });
}

/**
 * המלצות ליום אחד בתחזית, לצמח אחד. מחזיר [{key, text}] — key משמש לקיבוץ צמחים עם אותה המלצה.
 * `outing` = האם כבר הוצע להוציא את הצמח למרפסת השבוע (מציעים פעם אחת בשבוע, לא כל יום נעים).
 */
export function dayAdvice(species, plant, day, { outing = false } = {}) {
  if (!day || day.tmax == null) return [];
  const p = careParams(species, plant);
  const dry = ["succulent", "cactus"].includes(species?.category);
  const out = [];
  if (plant.location === "balcony") {
    const hot = p.shadeAbove === undefined ? (p.balcony === "ok_sun" ? 38 : 33) : p.shadeAbove;
    const cold = p.insideBelow === undefined ? (p.balcony === "ok_sun" ? 3 : 10) : p.insideBelow;
    if (hot != null && day.tmax >= hot) out.push({ key: "shade", text: "להעביר לצל או להצל בצהריים, ולוודא שהאדמה לחה" });
    else if (p.balcony === "ok_shade" && (day.uv ?? 0) >= 9) out.push({ key: "uv", text: "שמש חזקה במיוחד: עדיף מקום מוצל בצהריים" });
    if (cold != null && day.tmin <= cold) out.push({ key: "inside", text: `קור של ${Math.round(day.tmin)}° בלילה: להכניס פנימה` });
    if (day.gust >= 50) out.push({ key: "wind", text: "רוח חזקה: להצמיד לקיר או להוריד מהמעקה" });
    if (!plant.covered && day.rain >= 25 && dry) out.push({ key: "rain-dry", text: "גשם חזק: לכסות או להכניס, סוקולנטים לא אוהבים להירטב ככה" });
    else if (!plant.covered && day.rain >= 6) out.push({ key: "rain", text: "הגשם ישקה, אפשר לדלג על ההשקיה" });
  } else {
    if (day.tmax >= 38 && plant.spot === "window") out.push({ key: "window", text: "שרב: להרחיק מהחלון או לסגור וילון בצהריים" });
    const canGoOut = p.balcony && p.balcony !== "never";
    const mild = day.tmax >= 20 && day.tmax <= 30 && day.tmin >= 14 && day.gust < 40;
    if (canGoOut && mild && !outing) {
      if (day.rain >= 2 && day.rain <= 10 && !dry) out.push({ key: "out-rain", text: "גשם קל: אפשר להוציא למרפסת לשטיפה טבעית, ולהחזיר בערב" });
      else if (day.rain < 1) out.push({ key: "out", text: "יום נעים: אפשר להוציא למרפסת מוצלת לכמה שעות" });
    }
  }
  return out;
}

export const KIND = {
  water: { label: "השקיה", done: "השקיתי", icon: "💧", field: "last_watered" },
  fertilize: { label: "דישון", done: "דישנתי", icon: "🌱", field: "last_fertilized" },
  mist: { label: "ריסוס", done: "ריססתי", icon: "💦", field: "last_misted" },
  rotate: { label: "סיבוב", done: "סובבתי", icon: "🔄", field: "last_rotated" },
  repot: { label: "החלפת עציץ", done: "העברתי עציץ", icon: "🪴", field: "last_repotted" },
  shade: { label: "להעביר לצל", done: "העברתי", icon: "☀️", field: null },
  inside: { label: "להכניס פנימה", done: "הכנסתי", icon: "🥶", field: null },
  wind: { label: "רוח חזקה", done: "טיפלתי", icon: "🌬️", field: null },
  rain: { label: "גשם", done: "", icon: "🌧️", field: null },
};

/** טקסט קצר למצב ההשקיה בכרטיס */
export function waterStatus(t) {
  if (!t) return "";
  if (t.kind === "rain") return "הגשם השקה";
  if (t.unknown) return "לבדוק את האדמה";
  if (t.dueIn < -1) return `באיחור של ${-t.dueIn} ימים`;
  if (t.dueIn === -1) return "באיחור של יום";
  if (t.dueIn === 0) return "היום";
  if (t.dueIn === 1) return "מחר";
  return `עוד ${t.dueIn} ימים`;
}
