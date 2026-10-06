// data.js — המאגר המקומי (אינדקס + כרטיס מלא לכל צמח), תוכן הלימוד, ומזג האוויר.
import { aiSpecies } from "./cloud.js";
import { summarizeWeather, WEATHER_URL } from "./care.js";

let INDEX = null;
const FULL = new Map();
const getJSON = async url => { const r = await fetch(url); if (!r.ok) throw new Error(url + " " + r.status); return r.json(); };

export async function index() {
  return (INDEX ??= await getJSON("data/index.json"));
}

/** רשומת אינדקס (מספיקה ללוח הזמנים) — סינכרוני אחרי index() */
export function speciesLite(id) {
  return INDEX?.find(p => p.id === id) ?? FULL.get(id) ?? null;
}

/** כרטיס מלא: מהמאגר או כרטיס AI מהענן */
export async function species(id) {
  if (FULL.has(id)) return FULL.get(id);
  let s = null;
  if (id.startsWith("ai:")) s = await aiSpecies(id);
  else s = await getJSON(`data/p/${encodeURIComponent(id)}.json`).catch(() => null);
  if (s) FULL.set(id, s);
  return s;
}
/** טעינה מראש של כרטיסי AI של הצמחים שלה (כדי שלוח הזמנים יעבוד גם להם) */
export async function preload(plants) {
  await index();
  await Promise.all(plants.filter(p => p.species_id.startsWith("ai:") && !FULL.has(p.species_id)).map(p => species(p.species_id)));
}

/** חיפוש במאגר לפי שם עברי / אנגלי / מדעי */
export function search(q) {
  const s = q.trim().toLowerCase();
  if (!s) return INDEX ?? [];
  return (INDEX ?? []).filter(p =>
    [p.he, ...(p.he_alt ?? []), p.en, p.scientific, ...(p.synonyms ?? [])].some(n => n?.toLowerCase().includes(s)));
}

let LEARN = null;
export async function learn() {
  if (LEARN) return LEARN;
  const [lessons, tips, diagnosis] = await Promise.all(
    ["lessons", "tips", "diagnosis"].map(n => getJSON(`data/learn/${n}.json`).catch(() => null)));
  return (LEARN = { lessons: lessons ?? [], tips: tips ?? [], diagnosis: diagnosis ?? { symptoms: [], causes: {} } });
}

/** מזג אוויר — שמור חצי שעה ב-localStorage (wx2: המבנה עם תחזית שבועית ומצב נוכחי) */
export async function weather(lat, lon) {
  if (lat == null) return null;
  const key = `atzitz-wx2-${lat.toFixed(2)},${lon.toFixed(2)}`;
  try {
    const c = JSON.parse(localStorage.getItem(key) || "null");
    if (c && Date.now() - c.t < 18e5) return { ...summarizeWeather(c.j), raw: c.j };
  } catch {}
  try {
    const j = await getJSON(WEATHER_URL(lat, lon));
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), j })); } catch {}
    return { ...summarizeWeather(j), raw: j };
  } catch { return null; }
}

/** קואורדינטות → שם היישוב (BigDataCloud, חינמי בלי מפתח). נכשל בשקט. */
export async function placeName(lat, lon) {
  try {
    const j = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=he`);
    return j.city || j.locality || null;
  } catch { return null; }
}

/** חיפוש עיר → קואורדינטות (Open-Meteo geocoding, תומך בעברית) */
export async function geocode(name) {
  const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=he&countryCode=IL`);
  return (j.results ?? []).map(r => ({ name: r.name, admin: r.admin1, lat: r.latitude, lon: r.longitude }));
}

export const LIGHT = {
  low: { label: "אור נמוך", short: "צל" },
  medium: { label: "אור בינוני", short: "בינוני" },
  bright_indirect: { label: "אור בהיר עקיף", short: "בהיר עקיף" },
  partial_sun: { label: "שמש חלקית", short: "שמש חלקית" },
  full_sun: { label: "שמש מלאה", short: "שמש מלאה" },
};
export const CATEGORY = {
  foliage: "צמח עלים", palm: "דקל", fern: "שרך", succulent: "סוקולנט", cactus: "קקטוס", flowering: "צמח פורח",
  herb: "צמח תבלין", edible: "צמח מאכל", balcony: "צמח מרפסת", hanging: "צמח תלוי", orchid: "סחלב",
};
export const DIFFICULTY = { 1: "קל לגידול", 2: "בינוני", 3: "מאתגר" };
