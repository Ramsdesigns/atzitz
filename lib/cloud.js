// cloud.js — כל הדיבור עם Supabase: התחברות, צמחים, יומן, תמונות, מנויי push, פונקציות שרת.
import { createClient } from "../vendor/supabase.js";
import { CONFIG } from "./config.js";

export const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "atzitz-auth" },
});

export let user = null;
export async function getUser() {
  const { data } = await sb.auth.getSession();
  user = data.session?.user ?? null;
  return user;
}
export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  user = data.user;
  return user;
}
export async function signOut() { await sb.auth.signOut(); user = null; localStorage.removeItem("atzitz-cache"); }

const must = ({ data, error }) => { if (error) throw error; return data; };

// ---------- פרופיל ----------
export async function getProfile() {
  const p = must(await sb.from("pl_profiles").select("*").eq("user_id", user.id).maybeSingle());
  if (p) return p;
  return must(await sb.from("pl_profiles").insert({ user_id: user.id, name: "טל" }).select().single());
}
export async function saveProfile(patch) {
  return must(await sb.from("pl_profiles").upsert({ user_id: user.id, ...patch }).select().single());
}

// ---------- צמחים ----------
export async function listPlants() {
  const rows = must(await sb.from("pl_plants").select("*").eq("archived", false).order("created_at"));
  try { localStorage.setItem("atzitz-cache", JSON.stringify(rows)); } catch {}
  return rows;
}
export function cachedPlants() {
  try { return JSON.parse(localStorage.getItem("atzitz-cache") || "null"); } catch { return null; }
}
export async function addPlant(row) { return must(await sb.from("pl_plants").insert(row).select().single()); }
export async function updatePlant(id, patch) { return must(await sb.from("pl_plants").update(patch).eq("id", id).select().single()); }
export async function archivePlant(id) { return updatePlant(id, { archived: true }); }

// ---------- יומן ----------
export async function logEvent(plant, kind, extra = {}) {
  const at = extra.at ?? new Date().toISOString();
  const ev = must(await sb.from("pl_events").insert({ plant_id: plant.id, kind, at, ...extra }).select().single());
  const field = { water: "last_watered", fertilize: "last_fertilized", mist: "last_misted", rotate: "last_rotated", repot: "last_repotted" }[kind];
  let updated = plant;
  if (field) {
    const patch = { [field]: at };
    if (kind === "fertilize") patch.last_watered = at;        // מדשנים עם מי ההשקיה
    if (plant.snooze?.[kind]) { const s = { ...plant.snooze }; delete s[kind]; patch.snooze = s; }
    updated = await updatePlant(plant.id, patch);
  }
  return { ev, plant: updated };
}
export async function deleteEvent(id) { must(await sb.from("pl_events").delete().eq("id", id)); }
export async function listEvents(plantId, limit = 60) {
  return must(await sb.from("pl_events").select("*").eq("plant_id", plantId).order("at", { ascending: false }).limit(limit));
}
export async function recentEvents(days = 8) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  return must(await sb.from("pl_events").select("plant_id,kind,at").gte("at", since));
}

// ---------- תמונות ----------
export async function uploadPhoto(blob, folder) {
  const path = `${user.id}/${folder}/${Date.now()}.jpg`;
  must(await sb.storage.from("pl-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false }));
  return path;
}
const urlCache = new Map();
export async function photoUrls(paths) {
  const need = [...new Set(paths.filter(p => p && !urlCache.has(p)))];
  if (need.length) {
    const { data } = await sb.storage.from("pl-photos").createSignedUrls(need, 60 * 60 * 6);
    for (const r of data ?? []) if (r.signedUrl) urlCache.set(r.path, r.signedUrl);
  }
  return Object.fromEntries(paths.filter(Boolean).map(p => [p, urlCache.get(p)]));
}

// ---------- כרטיסי AI ----------
export async function aiSpecies(id) {
  return must(await sb.from("pl_species_ai").select("data").eq("id", id).maybeSingle())?.data ?? null;
}

// ---------- לימוד ----------
export async function lessonsDone() { return must(await sb.from("pl_lessons").select("*")); }
export async function markLesson(lesson_id, quiz_ok) {
  must(await sb.from("pl_lessons").upsert({ user_id: user.id, lesson_id, quiz_ok, at: new Date().toISOString() }));
}

// ---------- פונקציות שרת ----------
export async function ai(action, body = {}) {
  const { data, error } = await sb.functions.invoke("ai", { body: { action, ...body } });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error ?? msg; } catch {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// ---------- push ----------
function b64ToBytes(b64) {
  const s = atob((b64 + "=".repeat((4 - b64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
export function pushSupported() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
export async function currentSub() {
  if (!pushSupported()) return null;
  // ready לא נפתר לעולם אם ה-service worker לא נרשם — לא נותנים למסך ההגדרות להיתקע בגלל זה
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 2000))]);
  return reg ? reg.pushManager.getSubscription() : null;
}
export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied" ? "ההתראות חסומות בהגדרות הטלפון" : "לא אושרו התראות");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CONFIG.vapidPublic) });
  const j = sub.toJSON();
  must(await sb.from("pl_push_subs").upsert({ user_id: user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) }, { onConflict: "endpoint" }));
  return sub;
}
export async function disablePush() {
  const sub = await currentSub();
  if (!sub) return;
  await sb.from("pl_push_subs").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
