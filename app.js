// app.js — עציץ. נתב לפי hash, מסכים כפונקציות שמחזירות HTML ומחברות אירועים.
import * as cloud from "./lib/cloud.js";
import * as data from "./lib/data.js";
import { plantTasks, todayTasks, weatherFactor, careParams, KIND, waterStatus, formatMl, ymd, isSummer, DAY, forecastDays, dayAdvice, wxText } from "./lib/care.js";
import { esc, icon, $, $$, paras, toast, sheet, confirmSheet, shrink, pickImage, fallbackImg, ago, fmtDate, isIOS, isStandalone } from "./lib/ui.js";

const app = $("#app");
const S = { profile: null, plants: [], wx: null, urls: {}, ready: false, add: null, chat: {} };

// ---------- מראה: "חמים" (ברירת מחדל), "בהיר" או "לבן" ----------
const LOOKS = { warm: ["חמים", "#f4eee2"], fresh: ["בהיר", "#f2f4ef"], white: ["לבן", "#ffffff"] };
function applyLook(look) {
  if (look && look !== "warm" && LOOKS[look]) document.documentElement.dataset.look = look; else delete document.documentElement.dataset.look;
  document.querySelector('meta[name="theme-color"][media*="light"]')?.setAttribute("content", (LOOKS[look] ?? LOOKS.warm)[1]);
}
const currentLook = () => { try { const l = localStorage.getItem("atzitz-look"); return LOOKS[l] ? l : "warm"; } catch { return "warm"; } };
applyLook(currentLook());

// ---------- עזרים ----------
const plantName = p => p.nickname || p.species_name || "צמח";
const sp = p => data.speciesLite(p.species_id);
const findPlant = id => S.plants.find(p => p.id === id);
const whereOf = p => (p.location === "balcony" ? "מרפסת" : p.room || "בבית");
// התמונה של צמח: הצילום שלה; אם אין, תמונת המין מהמאגר; אם גם זו חסרה, עלה
const ownPhoto = p => (p.photo_path && S.urls[p.photo_path]) || null;
const photoOf = p => ownPhoto(p) || data.speciesImg(p.species_id);
const imgTag = (url, cls = "ph-img") => (url ? `<img src="${esc(url)}" alt="" loading="lazy" class="${cls}">` : fallbackImg());
const imgOf = p => imgTag(photoOf(p));
const KIND_ICON = { water: "water", fertilize: "fertilize", mist: "mist", rotate: "rotate", repot: "repot", shade: "shade", inside: "inside", wind: "wind", rain: "rain",
  photo: "camera", note: "note", prune: "scissors", diagnose: "stethoscope", move: "home", uv: "sun", window: "sun", "rain-dry": "rain", out: "balcony", "out-rain": "rain" };
const kindIcon = k => KIND_ICON[k] ?? "sprout";
/** אייקון מלא בעיגול צבע */
const ib = (kind, cls = "", ic = kindIcon(kind)) => `<span class="ib k-${kind} ${cls}">${icon(ic)}</span>`;
const head = (title, { back, sub, right = "" } = {}) => `
  <header class="screen-head">
    ${back ? `<a class="hbtn" href="${back}" aria-label="חזרה">${icon("back")}</a>` : "<span></span>"}
    <h1>${esc(title)}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</h1>
    ${right || "<span></span>"}
  </header>`;
const loading = (text = "רגע...") => `<div class="loader"><div class="spin"></div><div>${esc(text)}</div></div>`;
const days = n => (n === 1 ? "יום" : n === 2 ? "יומיים" : `${n} ימים`);
const avatars = (plants, cls = "") => `<span class="avatars ${cls}">${plants.slice(0, 5).map(p => `<span class="av">${imgOf(p)}</span>`).join("")}</span>`;
/** טבעת התקדמות (0–1) עם אייקון באמצע */
function ring(pct, kind) {
  const C = 2 * Math.PI * 31, v = Math.max(0.05, Math.min(1, pct));
  return `<div class="ring"><svg viewBox="0 0 68 68"><circle cx="34" cy="34" r="31"/>${pct > 0 ? `<circle class="v" cx="34" cy="34" r="31" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - v)).toFixed(1)}"/>` : ""}</svg>${ib(kind)}</div>`;
}

async function refreshUrls() {
  const paths = S.plants.map(p => p.photo_path).filter(Boolean);
  if (paths.length) Object.assign(S.urls, await cloud.photoUrls(paths));
}
async function loadAll() {
  const cached = cloud.cachedPlants();
  if (cached && !S.plants.length) S.plants = cached;
  const [profile, plants] = await Promise.all([cloud.getProfile(), cloud.listPlants()]);
  S.profile = profile;
  S.plants = plants;
  await data.preload(plants);
  await refreshUrls();
  S.wx = await data.weather(profile.lat, profile.lon);
  S.ready = true;
}
function replacePlant(p) { S.plants = S.plants.map(x => (x.id === p.id ? p : x)); }

// ---------- נתב ----------
const ROUTES = {
  today: screenToday, plants: screenPlants, plant: screenPlant, add: screenAdd, edit: screenEdit,
  learn: screenLearn, lesson: screenLesson, tips: screenTips, diagnose: screenDiagnose, ask: screenAsk,
  library: screenLibrary, species: screenSpecies, settings: screenSettings, weather: screenWeather, credits: screenCredits,
};
const NO_TABS = new Set(["plant", "lesson", "ask", "species", "edit", "weather", "credits"]);

async function render() {
  const [name, ...args] = (location.hash.slice(1) || "today").split("/").map(decodeURIComponent);
  const fn = ROUTES[name] ?? screenToday;
  const tabbar = $("#tabbar");
  tabbar.hidden = NO_TABS.has(name);
  app.classList.toggle("no-tabs", NO_TABS.has(name));
  $$("a", tabbar).forEach(a => {
    if (a.dataset.tab === name || (name === "plant" && a.dataset.tab === "plants")) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
  try {
    await fn(...args);
    app.classList.remove("enter"); void app.offsetWidth; app.classList.add("enter");   // מעבר רך בין מסכים
  }
  catch (e) { console.error(e); app.innerHTML = `${head("אופס")}<div class="card"><p>משהו השתבש: ${esc(e.message)}</p><button class="btn" onclick="location.reload()">לנסות שוב</button></div>`; }
}

// ---------- כניסה ----------
function screenLogin(err = "") {
  $("#tabbar").hidden = true;
  app.classList.add("no-tabs");
  app.innerHTML = `
    <div class="login">
      <img class="logo" src="icons/192.png" alt="">
      <h1>היי טל</h1>
      <p class="lead">מצלמים צמח, מגלים מה הוא צריך, ומקבלים תזכורת בדיוק כשצריך.</p>
      <form id="lf">
        <label class="field"><span>אימייל</span><input type="email" name="email" autocomplete="username" required dir="ltr"></label>
        <label class="field"><span>סיסמה</span><input type="password" name="password" autocomplete="current-password" required dir="ltr"></label>
        ${err ? `<p class="warn">${esc(err)}</p>` : ""}
        <button class="btn block" type="submit">כניסה</button>
      </form>
    </div>`;
  $("#lf").onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    e.target.querySelector("button").disabled = true;
    try { await cloud.signIn(f.get("email").trim(), f.get("password")); await boot(); }
    catch { screenLogin("האימייל או הסיסמה לא נכונים"); }
  };
}

// ---------- היום ----------
function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 5 ? "לילה טוב" : h < 12 ? "בוקר טוב" : h < 17 ? "צהריים טובים" : h < 21 ? "ערב טוב" : "לילה טוב";
}
/** אייקון מזג אוויר לפי קוד WMO: [שם, מחלקת צבע] */
function wxIcon(code, isDay = 1) {
  if (code == null || code === 0) return isDay === 0 ? ["moon", "cool"] : ["sun", ""];
  if (code <= 2) return isDay === 0 ? ["moon", "cool"] : ["cloud-sun", ""];
  if (code === 3) return ["cloud", "grey"];
  if (code <= 48) return ["fog", "grey"];
  if (code <= 67) return ["rain", "cool"];
  if (code <= 77) return ["inside", "cool"];
  if (code <= 82) return ["rain", "cool"];
  return ["storm", "cool"];
}
function weatherCard() {
  const w = S.wx;
  if (!w?.today) {
    return S.profile?.lat == null
      ? `<a class="wx-card" href="#weather">${ib("sun", "", "pin")}<span class="body"><b>איפה הצמחים גרים?</b><span>עם המיקום אדע מתי להכניס, להוציא או להעביר לצל</span></span>${icon("chevron", "chev")}</a>`
      : "";
  }
  let note = "הכל לפי התוכנית";
  if (w.sharav) note = "שרב. הצמחים ישתו מהר יותר היום";
  else if (w.tmaxRecent >= 31) note = "חם, אז ההשקיות הוקדמו קצת";
  else if (w.rainRecentMm >= 6) note = "ירד גשם, צמחי המרפסת קיבלו מים";
  else if (w.tmaxRecent <= 16) note = "קריר. הצמחים שותים פחות";
  const cur = w.raw?.current ?? {};
  const [ic, cls] = wxIcon(cur.weather_code ?? (w.today.rain > 1 ? 61 : 0), cur.is_day);
  const todo = S.plants.length ? weekPlan(forecastDays(w.raw)).reduce((n, g) => n + g.length, 0) : 0;
  return `<a class="wx-card" href="#weather"><span class="wxi ${cls}">${icon(ic)}</span><span class="temp">${Math.round(cur.temperature_2m ?? w.today.tmax)}°</span>
    <span class="body"><b>${esc(S.profile.city || "מזג האוויר")} · <span class="num">${Math.round(w.today.tmin)}°–${Math.round(w.today.tmax)}°</span></b><span>${esc(note)}</span>
      ${todo ? `<span class="todo">${todo === 1 ? "המלצה אחת" : todo + " המלצות"} לשבוע</span>` : ""}</span>${icon("chevron", "chev")}</a>`;
}
function pushPrompt() {
  if (localStorage.getItem("atzitz-push-dismissed")) return "";
  if (!cloud.pushSupported()) {
    if (isIOS() && !isStandalone()) return `<div class="push-card" id="pushCard">${ib("fertilize", "", "bell")}<div class="body"><b>כדי לקבל תזכורות לנייד</b>ב-Safari: כפתור השיתוף ← "הוספה למסך הבית", ואז לפתוח את עציץ משם.</div><button class="x" id="pushLater" aria-label="סגירה">${icon("x")}</button></div>`;
    return "";
  }
  if (Notification.permission === "granted") return "";
  return `<div class="push-card" id="pushCard">${ib("fertilize", "", "bell")}<div class="body"><b>תזכורת כשצריך להשקות?</b>הודעה אחת ביום, רק כשיש מה לעשות.</div>
    <button class="btn small" id="pushOn">להפעיל</button><button class="x" id="pushLater" aria-label="לא עכשיו">${icon("x")}</button></div>`;
}
function bindPushPrompt() {
  $("#pushLater")?.addEventListener("click", () => { localStorage.setItem("atzitz-push-dismissed", "1"); $("#pushCard").remove(); });
  const on = $("#pushOn");
  if (!on) return;
  on.onclick = async () => {
    try { await cloud.enablePush(); $("#pushCard").remove(); toast("מעולה. התזכורות יגיעו בשעה " + (S.profile.remind_hour ?? 9) + ":00"); }
    catch (e) { toast(e.message); }
  };
}

function allTodayTasks() {
  return S.plants.flatMap(p => todayTasks(sp(p), p, S.wx).map(t => ({ p, t })))
    .sort((a, b) => a.t.dueIn - b.t.dueIn);
}
// המשימות מקובצות לפי פעולה (כמו שעובדים בפועל: ממלאים משפך ועוברים בין הצמחים). מזג אוויר קודם.
const SECTIONS = [
  ["alert", "שימי לב היום", "shade", "בגלל התחזית"],
  ["water", "השקיה", "water", ""],
  ["fertilize", "דישון", "fertilize", "דשן נוזלי בחצי ריכוז, יחד עם ההשקיה"],
  ["mist", "ריסוס", "mist", "לרסס את העלים במים, לא בשמש ישירה"],
  ["rotate", "סיבוב", "rotate", "רבע סיבוב, כדי שיגדל ישר ולא ייטה לחלון"],
  ["repot", "עציץ חדש", "repot", "עציץ גדול ב-2–4 ס״מ, עם חור ניקוז"],
];
const secOf = t => (t.alert ? "alert" : t.kind);
function taskRow(p, t) {
  const sec = secOf(t);
  let sub = esc(whereOf(p)), end = "";
  if (t.alert) sub = esc(t.text);
  else if (t.kind === "water") {
    if (t.unknown) sub += " · קודם לבדוק שהאדמה יבשה";
    else if (t.dueIn < 0) sub += ` · <span class="late">באיחור של ${days(-t.dueIn)}</span>`;
    end = `<span class="amount">${t.ml ? esc(formatMl(t.ml)) : sp(p)?.water?.mode === "soak" ? "טבילה" : "בגביע"}</span>`;
  } else if (t.dueIn < 0) sub += ` · <span class="late">באיחור של ${days(-t.dueIn)}</span>`;
  return `<div class="row task ${t.alert ? "alert" : ""}" data-plant="${p.id}" data-kind="${t.kind}" data-sec="${sec}">
    <a class="ph" href="#plant/${p.id}" aria-hidden="true" tabindex="-1">${imgOf(p)}</a>
    <a class="body" href="#plant/${p.id}" style="text-decoration:none;color:inherit"><b>${esc(plantName(p))}</b><span>${sub}</span></a>
    ${end}<button class="check" data-done aria-label="${esc(KIND[t.kind]?.done || "טיפלתי")}"><i>${icon("check")}</i></button></div>`;
}
function taskSection([key, title, ic, hint], items) {
  const list = items.filter(x => secOf(x.t) === key);
  if (!list.length) return "";
  return `<section class="tsec" data-sec="${key}">
    <div class="sec"><h2>${ib(ic, "sm")}${title}<span class="count num">${list.length}</span></h2>${list.length > 1 && key !== "alert" ? `<button class="more" data-all="${key}">סימון הכל</button>` : ""}</div>
    ${hint ? `<p class="small muted" style="margin:-4px 4px 8px">${hint}</p>` : ""}
    <div class="rows">${list.map(x => taskRow(x.p, x.t)).join("")}</div></section>`;
}
const allDoneHTML = (title, sub) => `<div class="card all-done">${avatars(S.plants)}<b>${title}</b><div class="small muted">${sub}</div></div>`;
function weekStrip() {
  const ds = [...Array(7)].map((_, i) => new Date(Date.now() + i * DAY));
  const counts = ds.map(() => ({ w: 0, f: 0 }));
  for (const p of S.plants) {
    for (const t of plantTasks(sp(p), p, S.wx)) {
      if (t.snoozed || t.alert) continue;
      const d = Math.max(0, t.dueIn);
      if (t.kind === "water") {
        // השקיות חוזרות בתוך השבוע
        for (let x = d; x < 7; x += Math.max(1, t.interval)) counts[x].w++;
      } else if (t.kind === "fertilize" && d < 7) counts[d].f++;
    }
  }
  const dn = new Intl.DateTimeFormat("he-IL", { weekday: "narrow", timeZone: "Asia/Jerusalem" });
  const dd = new Intl.DateTimeFormat("he-IL", { day: "numeric", timeZone: "Asia/Jerusalem" });
  return `<div class="card week" style="padding:10px 8px">${ds.map((d, i) => `<div class="d ${i === 0 ? "today" : ""}">${esc(dn.format(d))}<b>${esc(dd.format(d))}</b>
    <div class="dots">${"<i></i>".repeat(Math.min(counts[i].w, 4))}${'<i class="f"></i>'.repeat(Math.min(counts[i].f, 2))}</div></div>`).join("")}</div>`;
}
async function tipOfDay() {
  const { tips } = await data.learn();
  if (!tips.length) return null;
  const m = new Date().getMonth() + 1;
  const cats = new Set(S.plants.map(p => sp(p)?.category).filter(Boolean));
  const pool = tips.filter(t => (!t.months?.length || t.months.includes(m)) && (t.categories?.includes("all") || t.categories?.some(c => cats.has(c))));
  const list = pool.length ? pool : tips;
  return list[Number(ymd().replace(/-/g, "")) % list.length];
}
const todayLabel = () => new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" }).format(new Date());
const STARTERS = ["monstera-deliciosa", "pilea-peperomioides", "ficus-lyrata"];

async function screenToday() {
  if (!S.ready) app.innerHTML = loading();
  const name = S.profile?.name ? `, ${S.profile.name}` : "";
  const hello = `<div class="hello"><h1>${greeting()}${esc(name)}</h1><p>${esc(todayLabel())}</p></div>`;
  if (!S.plants.length) {
    await data.index();
    app.innerHTML = `${hello}
      <div class="empty"><div class="stack">${STARTERS.map(id => imgTag(data.speciesImg(id), "")).join("")}</div>
      <h2>נתחיל מהצמח הראשון</h2>
      <p>מצלמים אותו, ואני אגיד מה הוא, איפה הוא אוהב לעמוד וכמה להשקות. ואזכיר מתי.</p>
      <a class="btn terra" href="#add" style="margin-top:10px">${icon("camera")} לצלם צמח</a>
      <p style="margin-top:14px" class="small"><a href="#library">או לחפש בספרייה לפי שם</a></p></div>${pushPrompt()}`;
    bindPushPrompt();
    return;
  }
  const items = allTodayTasks();
  const tip = await tipOfDay();
  app.innerHTML = `
    ${hello}
    ${weatherCard()}
    <div id="tasks">${items.length ? SECTIONS.map(s => taskSection(s, items)).join("")
      : `<div style="margin-top:12px">${allDoneHTML("הכל מטופל היום", "אין משימות. אפשר פשוט ליהנות מהם.")}</div>`}</div>
    ${pushPrompt()}
    <div class="sec"><h2>השבוע</h2><span class="legend"><i></i>השקיה<i class="f"></i>דישון</span></div>
    ${weekStrip()}
    ${tip ? `<div class="sec"><h2>טיפ של היום</h2><a href="#tips">עוד טיפים</a></div><div class="tip">${ib("fertilize", "", "bulb")}<p>${esc(tip.text)}</p></div>` : ""}`;
  bindPushPrompt();
  $$(".task [data-done]").forEach(b => (b.onclick = () => completeTask(b.closest(".task"))));
  $$("[data-all]").forEach(b => (b.onclick = async () => {
    const rows = $$(`.task[data-sec="${b.dataset.all}"]`);
    b.disabled = true;
    navigator.vibrate?.(12);
    await Promise.all(rows.map(r => completeTask(r, true)));
    toast(`סומנו ${rows.length} צמחים`);
  }));
}
// הסרת שורת משימה; מקטע שהתרוקן נעלם, וכשאין יותר משימות מופיע "הכל מטופל"
function dropTaskRow(row) {
  setTimeout(() => {
    const sec = row.closest(".tsec");
    row.remove();
    if (sec) {
      const left = $$(".task", sec).length;
      if (!left) sec.remove(); else { $(".count", sec).textContent = left; if (left < 2) $("[data-all]", sec)?.remove(); }
    }
    if (!$("#tasks .task")) $("#tasks").innerHTML = `<div style="margin-top:12px">${allDoneHTML("סיימת להיום", "הצמחים מודים לך.")}</div>`;
  }, 300);
}

async function completeTask(row, quiet = false) {
  const p = findPlant(row.dataset.plant);
  const kind = row.dataset.kind;
  // משוב מיידי: העיגול מתמלא, רטט קצר (אנדרואיד), ורק אז השורה יוצאת
  const btn = row.querySelector("[data-done]");
  btn.disabled = true; btn.classList.add("ok");
  if (!quiet) navigator.vibrate?.(12);
  await new Promise(r => setTimeout(r, 380));
  row.classList.add("done");
  const fail = e => { row.classList.remove("done"); btn.disabled = false; btn.classList.remove("ok"); toast("לא נשמר: " + e.message); };
  if (!KIND[kind]?.field) {
    // התראת מזג אוויר — "טיפלתי" = דחייה להיום
    try { replacePlant(await cloud.updatePlant(p.id, { snooze: { ...p.snooze, [kind]: ymd() } })); dropTaskRow(row); } catch (e) { fail(e); }
    return;
  }
  const before = { ...p };
  const t = todayTasks(sp(p), p, S.wx).find(x => x.kind === kind);
  try {
    const { ev, plant } = await cloud.logEvent(p, kind, kind === "water" && t?.ml ? { amount_ml: t.ml } : {});
    replacePlant(plant);
    dropTaskRow(row);
    if (!quiet) toast(`${KIND[kind].done}: ${plantName(p)}`, {
      undo: async () => {
        await cloud.deleteEvent(ev.id);
        const f = KIND[kind].field;
        const patch = { [f]: before[f] };
        if (kind === "fertilize") patch.last_watered = before.last_watered;
        replacePlant(await cloud.updatePlant(p.id, patch));
        render();
      },
    });
  } catch (e) { fail(e); }
}

// ---------- הצמחים שלי ----------
function plantCard(p) {
  const t = plantTasks(sp(p), p, S.wx).find(x => x.kind === "water" || x.kind === "rain");
  let flag = "", status = "";
  if (t?.kind === "rain") status = "הגשם השקה";
  else if (t) {
    if (t.unknown) status = "לבדוק את האדמה";
    else if (t.dueIn < 0) flag = `<span class="flag late">${icon("water")}איחור ${days(-t.dueIn)}</span>`;
    else if (t.dueIn === 0) flag = `<span class="flag">${icon("water")}להשקות</span>`;
    else status = t.dueIn === 1 ? "השקיה מחר" : `השקיה בעוד ${days(t.dueIn)}`;
  }
  return `<a class="pcard" href="#plant/${p.id}" data-where="${esc(whereOf(p))}">${imgOf(p)}${flag}
    <div class="info"><b>${esc(plantName(p))}</b><span>${esc(whereOf(p))}${status ? " · " + esc(status) : ""}</span></div></a>`;
}
async function screenPlants() {
  // מי שצריך מים קודם
  const due = p => plantTasks(sp(p), p, S.wx).find(x => x.kind === "water")?.dueIn ?? 99;
  const list = [...S.plants].sort((a, b) => due(a) - due(b));
  const places = [...new Set(S.plants.map(whereOf))].sort((a, b) => a.localeCompare(b, "he"));
  app.innerHTML = `${head("הצמחים שלי", { sub: S.plants.length ? `${S.plants.length} צמחים` : "", right: `<a class="hbtn" href="#library" aria-label="ספריית צמחים">${icon("book")}</a>` })}
    ${S.plants.length ? `
      ${places.length > 1 ? `<div class="pills scroll" id="places"><button class="pill" data-w="" aria-selected="true">הכל</button>${places.map(w => `<button class="pill" data-w="${esc(w)}" aria-selected="false">${esc(w)}</button>`).join("")}</div>` : ""}
      <div class="grid">${list.map(plantCard).join("")}
        <a class="pcard add" href="#add">${ib("fertilize", "", "camera")}צמח חדש</a></div>`
      : `<div class="empty"><div class="stack">${STARTERS.map(id => imgTag(data.speciesImg(id), "")).join("")}</div><h2>עוד אין צמחים</h2><p>מצלמים את הראשון, זה לוקח חצי דקה.</p><a class="btn terra" href="#add" style="margin-top:10px">${icon("camera")} לצלם צמח</a></div>`}`;
  $$("#places .pill").forEach(b => (b.onclick = () => {
    $$("#places .pill").forEach(x => x.setAttribute("aria-selected", x === b));
    $$(".grid .pcard[data-where]").forEach(c => (c.hidden = !!b.dataset.w && c.dataset.where !== b.dataset.w));
  }));
}

// ---------- מדריך טיפול (משותף לעמוד צמח ולספרייה) ----------
function factsHTML(s, plant) {
  const pc = plant ? careParams(s, plant) : careParams(s);
  const fact = (ic, kind, label, val) => (val ? `<div class="fact">${ib(kind, "", ic)}<div class="body"><span>${label}</span><b>${esc(val)}</b></div></div>` : "");
  return `<div class="facts">
    ${fact("sun", "sun", "אור", data.LIGHT[s.light?.level]?.label)}
    ${fact("water", "water", "השקיה", `כל ${isSummer() ? pc.waterSummer : pc.waterWinter} ימים ${isSummer() ? "בקיץ" : "בחורף"}`)}
    ${fact("humid", "mist", "לחות", { low: "נמוכה", medium: "בינונית", high: "גבוהה" }[s.humidity?.level])}
    ${fact("temp", "repot", "טמפרטורה", s.temperature?.ideal ? `${s.temperature.ideal}°` : "")}
  </div>`;
}
function guideHTML(s, plant) {
  if (!s) return `<div class="card"><p style="margin:0">אין עדיין מידע מלא על הצמח הזה.</p></div>`;
  // אקורדיון: הכל סגור חוץ מאור והשקיה (הכי חשובים)
  const item = (ic, title, val, body, extra = "", open = false) => `<details class="g-item"${open ? " open" : ""}><summary><span class="ib soft">${icon(ic)}</span><h3>${esc(title)}</h3>${val ? `<span class="val">${esc(val)}</span>` : ""}${icon("down", "chev")}</summary><div class="gb">${body}${extra}</div></details>`;
  const dl = pairs => `<dl>${pairs.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
  const pc = plant ? careParams(s, plant) : careParams(s);
  const tox = s.toxicity?.pets || s.toxicity?.kids;
  return `<div class="guide">
    ${s.summary ? `<p class="about">${esc(s.summary)}</p>` : ""}
    ${factsHTML(s, plant)}
    ${tox ? `<div class="warn">${icon("paw")}<div><b>רעיל ${s.toxicity.pets && s.toxicity.kids ? "לחיות מחמד ולילדים" : s.toxicity.pets ? "לחיות מחמד" : "לילדים"}.</b> ${esc(s.toxicity.text || "")}</div></div>` : ""}
    <div class="rows">
    ${item("sun", "אור", "", paras(s.light?.text), dl([["סימנים שחסר אור", s.light?.signs_too_little], ["סימנים שיותר מדי שמש", s.light?.signs_too_much]]), true)}
    ${item("water", "השקיה", `קיץ כל ${pc.waterSummer}, חורף כל ${pc.waterWinter} ימים`, paras(s.water?.check), dl([["כמה", s.water?.amount], ["איך", s.water?.method], ["סימנים של יותר מדי מים", s.water?.signs_over], ["סימנים של מעט מדי מים", s.water?.signs_under]]), true)}
    ${item("home", "איפה לשים בבית", s.placement?.balcony === "ok_sun" ? "גם מרפסת שמשית" : s.placement?.balcony === "ok_shade" ? "גם מרפסת מוצלת" : "רק בפנים", paras(s.placement?.text))}
    ${item("soil", "אדמה", "", paras(s.soil?.text))}
    ${item("repot", "עציץ והעברה", s.pot?.repot_years ? `כל ${s.pot.repot_years} שנים` : "", paras(s.pot?.text))}
    ${item("humid", "לחות", "", paras(s.humidity?.text))}
    ${item("temp", "טמפרטורה", "", paras(s.temperature?.text))}
    ${item("fertilize", "דישון", s.fertilizer?.days ? `כל ${s.fertilizer.days} ימים בעונה` : "", paras(s.fertilizer?.text))}
    ${s.pruning ? item("scissors", "גיזום", "", paras(s.pruning)) : ""}
    ${s.propagation ? item("sprout", "ריבוי", "", paras(s.propagation)) : ""}
    ${s.problems?.length ? item("bug", "בעיות נפוצות", "", s.problems.map(x => `<div class="problem"><b>${esc(x.symptom)}</b><p><strong>למה:</strong> ${esc(x.cause)}</p><p><strong>מה עושים:</strong> ${esc(x.fix)}</p></div>`).join("")) : ""}
    ${s.seasonal ? item("calendar", "לאורך השנה", "", dl([["אביב", s.seasonal.spring], ["קיץ", s.seasonal.summer], ["סתיו", s.seasonal.autumn], ["חורף", s.seasonal.winter]])) : ""}
    ${s.tips?.length ? item("sparkle", "טיפים של מקצוענים", "", `<ul class="tips">${s.tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`) : ""}
    ${s.buying ? item("flower", "כשקונים במשתלה", "", paras(s.buying)) : ""}
    </div>
    ${s.ai ? `<p class="tiny muted" style="margin:0 4px">המידע על הצמח הזה נכתב בעזרת Gemini, כדאי לבדוק גם מקור נוסף.</p>` : ""}
  </div>`;
}

// ---------- עמוד צמח ----------
async function screenPlant(id, tab = "status") {
  const p = findPlant(id);
  if (!p) { location.hash = "#plants"; return; }
  const s = await data.species(p.species_id);
  const tasks = plantTasks(s, p, S.wx);
  const w = tasks.find(t => t.kind === "water");
  const rain = tasks.find(t => t.kind === "rain");
  const fz = tasks.find(t => t.kind === "fertilize");
  const pc = careParams(s, p);
  const f = weatherFactor(p, S.wx);
  const why = f < 0.95 ? `בגלל החום ההשקיה מוקדמת: כל ${w?.interval} ימים במקום ${isSummer() ? pc.waterSummer : pc.waterWinter}`
    : f > 1.05 ? `קריר, אז המרווח ארוך יותר: ${w?.interval} ימים` : `${isSummer() ? "בקיץ" : "בחורף"} משקים כל ${w?.interval} ימים בערך`;
  const L = data.LIGHT[s?.light?.level]?.short;
  const late = w && !w.unknown && w.dueIn < 0;
  const wPct = !w || w.unknown ? 1 : 1 - w.dueIn / Math.max(1, w.interval);
  const fPct = fz ? 1 - fz.dueIn / Math.max(1, pc.fertDays) : 0;
  app.innerHTML = `
    <div class="hero">${imgTag(photoOf(p), "")}
      <div class="top"><a class="hbtn" href="#plants" aria-label="חזרה">${icon("back")}</a><a class="hbtn" href="#edit/${p.id}" aria-label="עריכה">${icon("edit")}</a></div></div>
    <div class="psheet">
      <div class="plant-head">
        <h1>${esc(plantName(p))}</h1>
        <div class="sub">${esc(p.nickname ? p.species_name + " · " : "")}<span class="sci">${esc(s?.scientific || "")}</span></div>
        <div class="pills">
          <span class="pill">${icon(p.location === "balcony" ? "balcony" : "home")}${esc(whereOf(p))}</span>
          ${L ? `<span class="pill sun">${icon("sun")}${esc(L)}</span>` : ""}
          ${s?.difficulty ? `<span class="pill green">${esc(data.DIFFICULTY[s.difficulty])}</span>` : ""}
          ${s?.toxicity?.pets ? `<span class="pill danger">${icon("paw")}רעיל לחיות</span>` : ""}
          ${!ownPhoto(p) ? `<button class="pill" id="snap" style="min-height:0;padding:5px 11px;font-size:13px">${icon("camera")}לצלם את שלי</button>` : ""}
        </div>
      </div>
      <div class="rings">
        <div class="ring-card ${late ? "late" : ""}">${ring(rain ? 0 : wPct, rain ? "rain" : "water")}
          <div class="lbl">השקיה</div><div class="val">${esc(rain ? "הגשם השקה" : waterStatus(w))}</div>
          <div class="sub">${rain ? "אין צורך היום" : w?.ml ? esc(formatMl(w.ml)) : p.last_watered ? "אחרונה " + esc(ago(p.last_watered)) : ""}</div></div>
        <div class="ring-card fert">${ring(fPct, "fertilize")}
          <div class="lbl">דישון</div><div class="val">${fz ? (fz.dueIn <= 0 ? "היום" : `בעוד ${days(fz.dueIn)}`) : "לא בעונה"}</div>
          <div class="sub">${fz ? `כל ${pc.fertDays} ימים` : "מדשנים באביב ובקיץ"}</div></div>
      </div>
      <div class="quick">
        <button data-log="water">${icon("water")}השקיתי</button>
        <button data-log="fertilize">${icon("fertilize")}דישנתי</button>
        <button data-log="mist">${icon("mist")}ריססתי</button>
        <button data-more aria-label="עוד פעולות">${icon("plus")}עוד</button>
      </div>
      <div class="seg" role="tablist">
        ${[["status", "מצב"], ["guide", "מדריך"], ["log", "יומן"], ["photos", "תמונות"]].map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join("")}
      </div>
      <div id="tabc"></div>
    </div>`;

  const tabc = $("#tabc");
  const showTab = async k => {
    $$(".seg button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === k));
    history.replaceState(null, "", `#plant/${p.id}/${k}`);
    if (k === "status") {
      const upcoming = tasks.filter(t => !t.alert && t.kind !== "water" && t.kind !== "rain" && t.kind !== "fertilize").sort((a, b) => a.dueIn - b.dueIn);
      const alerts = tasks.filter(t => t.alert);
      tabc.innerHTML = `
        ${alerts.map(t => `<div class="note">${icon(kindIcon(t.kind))}<div><b>${esc(KIND[t.kind].label)}.</b> ${esc(t.text)}</div></div>`).join("")}
        ${w ? `<div class="card"><b>${esc(w.text)}</b><div class="small muted" style="margin-top:4px">${esc(why)}.${p.last_watered ? ` השקיה אחרונה ${esc(ago(p.last_watered))}.` : ""}</div>
          ${s?.water?.check ? `<div class="small" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line-2);color:var(--ink-2)"><b>לפני שמשקים:</b> ${esc(s.water.check)}</div>` : ""}</div>` : ""}
        ${upcoming.length ? `<div class="sec"><h2>בהמשך</h2></div><div class="rows">${upcoming.map(t => `<div class="row">${ib(t.kind)}<div class="body"><b>${esc(KIND[t.kind].label)}</b><span>${esc(t.text)}</span></div><span class="end">${esc(t.dueIn <= 0 ? "היום" : t.dueIn === 1 ? "מחר" : `בעוד ${days(t.dueIn)}`)}</span></div>`).join("")}</div>` : ""}
        <div class="sec"><h2>עזרה</h2></div>
        <div class="rows">
          <a class="row" href="#diagnose/${p.id}">${ib("diagnose")}<span class="body"><b>משהו לא נראה טוב?</b><span>אבחון לפי סימנים או לפי תמונה</span></span>${icon("chevron", "chev")}</a>
          <a class="row" href="#ask/${p.id}">${ib("water", "", "chat")}<span class="body"><b>לשאול על ${esc(plantName(p))}</b><span>תשובה שמכירה את הצמח ואת המצב שלו</span></span>${icon("chevron", "chev")}</a>
        </div>
        ${p.notes ? `<div class="sec"><h2>הערות</h2></div><div class="card">${paras(p.notes)}</div>` : ""}`;
    } else if (k === "guide") {
      tabc.innerHTML = guideHTML(s, p);
    } else {
      tabc.innerHTML = loading();
      const evs = await cloud.listEvents(p.id, 200);
      const urls = await cloud.photoUrls(evs.map(e => e.photo_path).filter(Boolean));
      if (k === "photos") {
        const ph = evs.filter(e => e.photo_path && urls[e.photo_path]);
        tabc.innerHTML = `<button class="btn secondary block" id="addPhoto" style="margin-bottom:14px">${icon("camera")} תמונת התקדמות</button>
          ${ph.length ? `<div class="photos">${ph.map(e => `<img src="${esc(urls[e.photo_path])}" alt="${esc(fmtDate(e.at))}" data-full="${esc(urls[e.photo_path])}">`).join("")}</div>
          <p class="tiny muted" style="margin-top:10px">כדאי לצלם מאותה זווית כל כמה שבועות, ככה רואים איך הוא גדל.</p>` : `<p class="muted" style="text-align:center">עוד אין תמונות.</p>`}`;
        $("#addPhoto").onclick = () => addProgressPhoto(p);
        $$(".photos img").forEach(i => (i.onclick = () => viewer(i.dataset.full)));
      } else {
        tabc.innerHTML = evs.length ? `<div class="timeline">${evs.map(e => `<div class="ev">${ib(e.kind)}
          <b>${esc(KIND[e.kind]?.done || { photo: "תמונה", note: "הערה", prune: "גיזום", diagnose: "אבחון", move: "הזזה" }[e.kind] || e.kind)}</b>${e.amount_ml ? ` <span class="small muted">${esc(formatMl(e.amount_ml))}</span>` : ""}
          <div class="when">${esc(fmtDate(e.at))} · ${esc(ago(e.at))}</div>${e.note ? `<div class="small">${esc(e.note)}</div>` : ""}
          ${e.photo_path && urls[e.photo_path] ? `<img src="${esc(urls[e.photo_path])}" alt="">` : ""}</div>`).join("")}</div>`
          : `<p class="muted" style="text-align:center">היומן ריק. כל השקיה, דישון ותמונה יופיעו כאן.</p>`;
      }
    }
  };
  $$(".seg button").forEach(b => (b.onclick = () => showTab(b.dataset.tab)));
  $$("[data-log]").forEach(b => (b.onclick = () => { navigator.vibrate?.(12); b.classList.add("ok"); b.disabled = true; quickLog(p, b.dataset.log); }));
  $("[data-more]").onclick = () => moreActions(p);
  $("#snap")?.addEventListener("click", () => addProgressPhoto(p));
  showTab(tab);
}

async function quickLog(p, kind, extra = {}) {
  try {
    const t = plantTasks(sp(p), p, S.wx).find(x => x.kind === "water");
    if (kind === "water" && t?.ml && !extra.amount_ml) extra.amount_ml = t.ml;
    const { plant } = await cloud.logEvent(p, kind, extra);
    replacePlant(plant);
    toast(KIND[kind]?.done ?? "נשמר ביומן");
    const tab = location.hash.split("/")[2] || "status";
    screenPlant(p.id, tab);
  } catch (e) { toast("לא נשמר: " + e.message); }
}

function moreActions(p) {
  const s = sheet(`<h2>מה עשית?</h2><div class="rows">
    ${[["rotate", "סובבתי את העציץ"], ["repot", "העברתי לעציץ חדש"], ["prune", "גזמתי"], ["photo", "תמונת התקדמות"], ["note", "הערה ביומן"]]
      .map(([k, l]) => `<button class="row" data-k="${k}">${ib(k)}<span class="body"><b>${l}</b></span></button>`).join("")}
    </div>`);
  $$("[data-k]", s.el).forEach(b => (b.onclick = async () => {
    const k = b.dataset.k;
    s.close();
    if (k === "photo") return addProgressPhoto(p);
    if (k === "note") return noteSheet(p);
    if (k === "repot") {
      const ok = await confirmSheet("העברת עציץ", "לעדכן גם את גודל העציץ? (עוזר לחשב כמה מים)", "כן, לעדכן גודל");
      if (ok) location.hash = `#edit/${p.id}`;
    }
    quickLog(p, k);
  }));
}
function noteSheet(p) {
  const s = sheet(`<h2>הערה ביומן</h2><label class="field"><textarea id="nt" placeholder="למשל: הופיע עלה חדש!"></textarea></label><button class="btn block" id="ns">שמירה</button>`);
  $("#ns", s.el).onclick = async () => { const note = $("#nt", s.el).value.trim(); if (!note) return; s.close(); await quickLog(p, "note", { note }); };
}
async function addProgressPhoto(p) {
  const file = await pickImage("camera");
  if (!file) return;
  toast("מעלה תמונה...");
  try {
    const img = await shrink(file, 1600);
    const path = await cloud.uploadPhoto(img.blob, p.id);
    await cloud.logEvent(p, "photo", { photo_path: path });
    replacePlant(await cloud.updatePlant(p.id, { photo_path: path }));
    await refreshUrls();
    toast("התמונה נשמרה");
    screenPlant(p.id, "photos");
  } catch (e) { toast("ההעלאה נכשלה: " + e.message); }
}
function viewer(url) {
  const v = document.createElement("div");
  v.className = "viewer";
  v.innerHTML = `<img src="${esc(url)}" alt=""><button class="hbtn" aria-label="סגירה">${icon("x")}</button>`;
  v.onclick = () => v.remove();
  document.body.append(v);
}

// ---------- הוספת צמח: צילום → זיהוי → בחירה → הגדרה ----------
async function screenAdd(step) {
  S.add ??= {};
  if (step === "search") return addSearch();
  if (step === "setup" && S.add.chosen) return addSetup();
  if (step === "results" && S.add.result) return addResults();
  S.add = {};
  app.innerHTML = `${head("צמח חדש", { sub: "צילום אחד, ואני אגיד מה זה" })}
    <div class="capture"><div class="frame" id="frame"><div class="corners"><i></i><i></i><i></i><i></i></div><div class="hint">${ib("fertilize", "lg", "camera")}<b>איך מצלמים כדי שיזהה</b>
      <ul><li>${icon("check")}מקרוב, שרואים טוב את העלים</li><li>${icon("check")}באור יום ובלי פלאש</li><li>${icon("check")}רקע פשוט, בלי עוד צמחים מסביב</li></ul></div></div>
      <div class="btn-row"><button class="btn terra" id="cam">${icon("camera")} צילום</button><button class="btn outline" id="gal">${icon("image")} מהגלריה</button></div>
      <p style="margin-top:18px" class="small">יודעת מה הצמח? <a href="#add/search">חיפוש לפי שם</a></p></div>`;
  const go = async from => {
    const file = await pickImage(from);
    if (!file) return;
    S.add.photo = await shrink(file, 1280);
    $("#frame").innerHTML = `<img src="${S.add.photo.url}" alt="">`;
    $("#frame").classList.add("scan");
    $$(".capture .btn").forEach(b => (b.disabled = true));
    try {
      S.add.result = await cloud.ai("identify", { image: S.add.photo.b64, mime: "image/jpeg" });
      location.hash = "#add/results";
    } catch (e) {
      $("#frame").classList.remove("scan");
      $$(".capture .btn").forEach(b => (b.disabled = false));
      toast("הזיהוי נכשל: " + e.message);
    }
  };
  $("#cam").onclick = () => go("camera");
  $("#gal").onclick = () => go("gallery");
}

// שם עברי מהמאגר רק כשזה באמת אותו צמח: התאמה מדויקת, או רשומת-סוג (למשל "אכבריה")
const sameHe = (x, lite) => (lite && (x.match?.exact || lite.scientific.trim().split(/\s+/).length === 1) ? lite.he : "");
function candidates() {
  const r = S.add.result ?? {};
  const out = [];
  const seen = new Set();
  for (const x of r.results ?? []) {
    const lite = x.match ? data.speciesLite(x.match.id) : null;
    const key = (x.match?.exact ? lite.id : x.scientific).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ scientific: x.scientific, he: sameHe(x, lite), score: x.score, images: x.images, match: x.match, lite, src: "PlantNet" });
  }
  for (const x of r.gemini ?? []) {
    const lite = x.match ? data.speciesLite(x.match.id) : null;
    const key = (x.match?.exact ? lite.id : x.scientific ?? "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ scientific: x.scientific, he: sameHe(x, lite) || x.he || "", score: x.confidence, why: x.why, match: x.match, lite, src: "Gemini" });
  }
  return out.slice(0, 5);
}
function addResults() {
  const c = candidates();
  const r = S.add.result;
  // תמונה להשוואה: מהמאגר שלנו כשזה אותו צמח, אחרת מה שהמזהה החזיר
  const ref = x => (sameHe(x, x.lite) && data.speciesImg(x.lite.id)) || x.images?.[0] || null;
  app.innerHTML = `${head("זה הצמח?", { back: "#add", sub: c.length ? "בחרי את מה שנראה הכי דומה" : "" })}
    ${S.add.photo ? `<img class="shot" src="${S.add.photo.url}" alt="">` : ""}
    ${r.notPlant ? `<div class="warn">${icon("warning")}<div>נראה שאין צמח בתמונה. נסי לצלם שוב מקרוב.</div></div>` : ""}
    ${c.length ? c.map((x, i) => `<button class="result ${i === 0 && x.score >= .5 ? "best" : ""}" data-i="${i}">
      <span class="ph">${imgTag(ref(x), "")}</span>
      <span class="body"><b>${esc(x.he || x.scientific)}</b><span class="sci small">${esc(x.he ? x.scientific : "")}</span>
        <div class="score ${x.score >= .5 ? "hi" : ""}">${Math.round((x.score ?? 0) * 100)}% התאמה${x.lite ? "" : " · יוכן מדריך חדש"}</div>
        ${x.why ? `<div class="tiny muted">${esc(x.why)}</div>` : ""}
        <div class="meter"><i style="width:${Math.round((x.score ?? 0) * 100)}%"></i></div></span>${icon("chevron", "chev")}</button>`).join("")
      : `<div class="card"><p style="margin:0">לא הצלחתי לזהות בוודאות. אפשר לצלם שוב (עלה אחד מקרוב, באור יום) או לחפש לפי שם.</p></div>`}
    <div class="btn-row" style="margin-top:14px"><a class="btn outline" href="#add">צילום חוזר</a><a class="btn outline" href="#add/search">חיפוש לפי שם</a></div>
    ${r.remaining != null && r.remaining < 50 ? `<p class="tiny muted" style="text-align:center;margin-top:10px">נשארו ${r.remaining} זיהויים היום</p>` : ""}`;
  $$(".result").forEach(b => (b.onclick = () => chooseCandidate(c[Number(b.dataset.i)], b)));
}
async function chooseCandidate(x, btn) {
  // התאמה מדויקת למאגר, או רשומת-סוג במאגר (למשל "אכבריה") — משתמשים בה. אחרת Gemini כותב מדריך.
  const genusRecord = x.lite && x.lite.scientific.trim().split(/\s+/).length === 1;
  if (x.lite && (x.match?.exact || genusRecord)) {
    S.add.chosen = { species_id: x.lite.id, species_name: x.lite.he };
    location.hash = "#add/setup";
    return;
  }
  btn.innerHTML = loading("כותבת מדריך טיפול לצמח הזה...");
  try {
    const card = await cloud.ai("card", { scientific: x.scientific, hint: x.he });
    S.add.chosen = { species_id: card.id, species_name: card.he || x.he || x.scientific };
    location.hash = "#add/setup";
  } catch (e) {
    toast("לא הצלחתי להכין מדריך: " + e.message);
    if (x.lite) { S.add.chosen = { species_id: x.lite.id, species_name: x.lite.he }; location.hash = "#add/setup"; }
    else addResults();
  }
}
async function addSearch() {
  await data.index();
  app.innerHTML = `${head("חיפוש צמח", { back: "#add" })}
    <div class="search">${icon("search")}<input class="input" id="q" placeholder="מונסטרה, פוטוס, בזיליקום..." autocomplete="off"></div>
    <div id="res" class="rows"></div>
    <p class="small muted" style="margin:10px 4px 0">לא ברשימה? <button class="link-btn" id="aiq">לבקש מדריך לצמח הזה</button></p>`;
  const draw = () => {
    const list = data.search($("#q").value).slice(0, 40);
    $("#res").innerHTML = list.map(p => `<button class="row" data-id="${p.id}"><span class="ph">${imgTag(data.speciesImg(p.id))}</span>
      <span class="body"><b>${esc(p.he)}</b><span>${esc(data.CATEGORY[p.category] ?? "")} · <span class="sci">${esc(p.scientific)}</span></span></span>${icon("chevron", "chev")}</button>`).join("") || `<p class="muted" style="padding:14px;margin:0">לא נמצא במאגר.</p>`;
    $$("#res [data-id]").forEach(b => (b.onclick = () => {
      const p = data.speciesLite(b.dataset.id);
      S.add.chosen = { species_id: p.id, species_name: p.he };
      location.hash = "#add/setup";
    }));
  };
  $("#q").oninput = draw;
  draw();
  $("#q").focus();
  $("#aiq").onclick = async () => {
    const name = $("#q").value.trim();
    if (!name) { toast("כתבי קודם את שם הצמח (עדיף שם מדעי)"); return; }
    $("#aiq").disabled = true; $("#aiq").textContent = "כותבת מדריך...";
    try {
      const card = await cloud.ai("card", { scientific: name });
      S.add.chosen = { species_id: card.id, species_name: card.he || name };
      location.hash = "#add/setup";
    } catch (e) { toast(e.message); $("#aiq").disabled = false; }
  };
}

const POTS = [[10, "קטן", "עד 10 ס״מ"], [15, "בינוני", "~15 ס״מ"], [22, "גדול", "~22 ס״מ"], [32, "ענק", "30+ ס״מ"]];
function choiceHTML(name, opts, val) {
  return `<div class="choice" data-name="${name}">${opts.map(([v, l, sm]) => `<button type="button" data-v="${v}" aria-pressed="${String(v) === String(val)}">${esc(l)}${sm ? `<small>${esc(sm)}</small>` : ""}</button>`).join("")}</div>`;
}
function bindChoices(root, state) {
  $$(".choice", root).forEach(c => $$("button", c).forEach(b => (b.onclick = () => {
    $$("button", c).forEach(x => x.setAttribute("aria-pressed", x === b));
    state[c.dataset.name] = b.dataset.v;
    c.dispatchEvent(new CustomEvent("pick", { bubbles: true }));
  })));
}
async function addSetup() {
  const ch = S.add.chosen;
  const s = await data.species(ch.species_id);
  const balconyOk = s?.placement?.balcony && s.placement.balcony !== "never";
  const st = { location: balconyOk && s.placement.balcony === "ok_sun" && !s.placement.indoor ? "balcony" : "indoor", spot: "room", pot: 15, last: "today" };
  const pic = S.add.photo?.url || data.speciesImg(ch.species_id);
  app.innerHTML = `${head(ch.species_name, { back: S.add.result ? "#add/results" : "#add/search", sub: "עוד כמה פרטים קטנים" })}
    ${pic ? `<img class="shot" src="${esc(pic)}" alt="">` : ""}
    ${s?.placement?.text ? `<div class="note">${icon("home")}<div><b>איפה כדאי לשים:</b> ${esc(s.placement.text)}</div></div>` : ""}
    <form id="sf">
      <label class="field"><span>שם חיבה <small>(לא חובה)</small></span><input name="nickname" placeholder="למשל: מוני"></label>
      <div class="field"><span>איפה הוא גר?</span>${choiceHTML("location", [["indoor", "בבית"], ["balcony", "במרפסת"]], st.location)}</div>
      <div class="field" id="spotF"><span>ובתוך הבית?</span>${choiceHTML("spot", [["window", "ליד חלון"], ["room", "בחדר מואר"], ["dark", "פינה חשוכה"]], st.spot)}</div>
      <label class="field" id="roomF"><span>חדר <small>(לא חובה)</small></span><input name="room" placeholder="סלון, מטבח, חדר שינה..." list="rooms"></label>
      <datalist id="rooms">${[...new Set(["סלון", "מטבח", "חדר שינה", "אמבטיה", "משרד", ...S.plants.map(p => p.room).filter(Boolean)])].map(r => `<option value="${esc(r)}">`).join("")}</datalist>
      <label class="field" id="covF" hidden><span style="display:flex;justify-content:space-between;align-items:center">מרפסת מקורה (הגשם לא מגיע)<input type="checkbox" class="switch" name="covered"></span></label>
      <div class="field"><span>גודל העציץ <small>(קוטר הפתח)</small></span>${choiceHTML("pot", POTS, st.pot)}</div>
      <div class="field"><span>מתי השקית לאחרונה?</span>${choiceHTML("last", [["today", "היום"], ["3", "לפני כמה ימים"], ["7", "לפני שבוע+"], ["unknown", "לא זוכרת"]], st.last)}</div>
      <button class="btn block terra" type="submit">להוסיף לצמחים שלי</button>
    </form>`;
  bindChoices(app, st);
  const sync = () => { const out = st.location === "balcony"; $("#spotF").hidden = out; $("#roomF").hidden = out; $("#covF").hidden = !out; };
  app.addEventListener("pick", sync);
  sync();
  $("#sf").onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true; btn.textContent = "שומרת...";
    try {
      const lastWatered = st.last === "unknown" ? null : new Date(Date.now() - (st.last === "today" ? 0 : Number(st.last)) * DAY).toISOString();
      let plant = await cloud.addPlant({
        species_id: ch.species_id, species_name: ch.species_name, nickname: f.get("nickname")?.trim() || null,
        location: st.location, spot: st.location === "balcony" ? null : st.spot, room: st.location === "balcony" ? null : f.get("room")?.trim() || null,
        covered: !!f.get("covered"), pot_cm: Number(st.pot), last_watered: lastWatered,
      });
      if (S.add.photo) {
        const path = await cloud.uploadPhoto(S.add.photo.blob, plant.id);
        plant = await cloud.updatePlant(plant.id, { photo_path: path });
        await cloud.logEvent(plant, "photo", { photo_path: path, note: "היום הראשון בבית" });
      }
      if (lastWatered) await cloud.logEvent(plant, "water", { at: lastWatered });
      S.plants.push(plant);
      await data.preload([plant]);
      await refreshUrls();
      S.add = null;
      toast(`${f.get("nickname")?.trim() || ch.species_name} נוסף לצמחים שלך`);
      location.hash = `#plant/${plant.id}`;
    } catch (err) { btn.disabled = false; btn.textContent = "לנסות שוב"; toast("לא נשמר: " + err.message); }
  };
}

// ---------- עריכה ----------
async function screenEdit(id) {
  const p = findPlant(id);
  if (!p) { location.hash = "#plants"; return; }
  const s = await data.species(p.species_id);
  const pc = careParams(s, {});
  const st = { location: p.location, spot: p.spot || "room", pot: POTS.some(x => x[0] === p.pot_cm) ? p.pot_cm : "custom" };
  app.innerHTML = `${head("עריכה", { back: `#plant/${p.id}`, sub: plantName(p) })}
    <form id="ef">
      <label class="field"><span>שם חיבה</span><input name="nickname" value="${esc(p.nickname ?? "")}"></label>
      <div class="field"><span>איפה הוא גר?</span>${choiceHTML("location", [["indoor", "בבית"], ["balcony", "במרפסת"]], st.location)}</div>
      <div class="field" id="spotF"><span>ובתוך הבית?</span>${choiceHTML("spot", [["window", "ליד חלון"], ["room", "בחדר מואר"], ["dark", "פינה חשוכה"]], st.spot)}</div>
      <label class="field" id="roomF"><span>חדר</span><input name="room" value="${esc(p.room ?? "")}"></label>
      <label class="field" id="covF"><span style="display:flex;justify-content:space-between;align-items:center">מרפסת מקורה<input type="checkbox" class="switch" name="covered" ${p.covered ? "checked" : ""}></span></label>
      <label class="field"><span>קוטר העציץ (ס״מ)</span><input name="pot_cm" type="number" inputmode="numeric" min="4" max="120" value="${esc(p.pot_cm ?? "")}"></label>
      <div class="card"><h3 style="margin-bottom:4px">תדירות השקיה</h3><p class="small muted">לפי המדריך: קיץ כל ${pc.waterSummer}, חורף כל ${pc.waterWinter} ימים. אם רואים שהוא צריך אחרת, משנים כאן.</p>
        <div style="display:flex;gap:10px"><label class="field" style="flex:1;margin:0"><span>קיץ (ימים)</span><input name="water_summer" type="number" inputmode="numeric" min="1" max="60" value="${esc(p.care?.water_summer ?? "")}" placeholder="${pc.waterSummer}"></label>
        <label class="field" style="flex:1;margin:0"><span>חורף (ימים)</span><input name="water_winter" type="number" inputmode="numeric" min="1" max="90" value="${esc(p.care?.water_winter ?? "")}" placeholder="${pc.waterWinter}"></label></div></div>
      <label class="field"><span>הערות</span><textarea name="notes">${esc(p.notes ?? "")}</textarea></label>
      <div class="btn-row"><button class="btn" type="submit">שמירה</button><button class="btn outline" type="button" id="chPhoto">${icon("camera")} תמונה ראשית</button></div>
      <button class="btn danger block" type="button" id="del" style="margin-top:20px">${icon("trash")} הסרת הצמח</button>
    </form>`;
  bindChoices(app, st);
  const sync = () => { const out = st.location === "balcony"; $("#spotF").hidden = out; $("#roomF").hidden = out; $("#covF").hidden = !out; };
  app.addEventListener("pick", sync);
  sync();
  $("#ef").onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const num = k => (f.get(k) ? Number(f.get(k)) : undefined);
    const care = { ...p.care, water_summer: num("water_summer"), water_winter: num("water_winter") };
    Object.keys(care).forEach(k => care[k] === undefined && delete care[k]);
    try {
      replacePlant(await cloud.updatePlant(p.id, {
        nickname: f.get("nickname").trim() || null, location: st.location, spot: st.location === "balcony" ? null : st.spot,
        room: st.location === "balcony" ? null : f.get("room").trim() || null, covered: !!f.get("covered"),
        pot_cm: num("pot_cm") ?? null, care, notes: f.get("notes").trim() || null,
      }));
      toast("נשמר");
      location.hash = `#plant/${p.id}`;
    } catch (err) { toast("לא נשמר: " + err.message); }
  };
  $("#chPhoto").onclick = () => addProgressPhoto(p);
  $("#del").onclick = async () => {
    if (!(await confirmSheet("להסיר את " + plantName(p) + "?", "הוא ייעלם מהרשימה ומהתזכורות.", "להסיר", true))) return;
    await cloud.archivePlant(p.id);
    S.plants = S.plants.filter(x => x.id !== p.id);
    toast("הוסר");
    location.hash = "#plants";
  };
}

// ---------- ספרייה ----------
async function screenLibrary() {
  await data.index();
  app.innerHTML = `${head("ספריית צמחים", { back: "#plants", sub: "מדריך מלא לכל צמח, גם לפני שקונים" })}
    <div class="search">${icon("search")}<input class="input" id="q" placeholder="חיפוש לפי שם" autocomplete="off"></div>
    <div class="pills scroll" id="cats">
      <button class="pill" data-c="" aria-selected="true">הכל</button>${Object.entries(data.CATEGORY).map(([k, v]) => `<button class="pill" data-c="${k}" aria-selected="false">${v}</button>`).join("")}</div>
    <div id="res"></div>`;
  let cat = "";
  const draw = () => {
    const list = data.search($("#q").value).filter(p => !cat || p.category === cat);
    $("#res").innerHTML = list.length ? `<div class="lib">${list.map(p => `<a class="scard" href="#species/${encodeURIComponent(p.id)}">
      <div class="ph">${imgTag(data.speciesImg(p.id), "")}${p.toxicity?.pets ? `<span class="tox">${ib("danger", "sm", "paw")}</span>` : ""}</div>
      <div class="info"><b>${esc(p.he)}</b><span>${esc(data.DIFFICULTY[p.difficulty] ?? "")}</span></div></a>`).join("")}</div>` : `<p class="muted" style="text-align:center">לא נמצא.</p>`;
  };
  $("#q").oninput = draw;
  $$("#cats button").forEach(b => (b.onclick = () => { cat = b.dataset.c; $$("#cats button").forEach(x => x.setAttribute("aria-selected", x === b)); draw(); }));
  draw();
}
async function screenSpecies(id) {
  const s = await data.species(id);
  if (!s) { location.hash = "#library"; return; }
  const pic = data.speciesImg(id);
  const cr = pic ? (await data.credits())[id] : null;
  app.innerHTML = `
    <div class="hero">${imgTag(pic, "")}
      <div class="top"><a class="hbtn" href="#library" aria-label="חזרה">${icon("back")}</a><span></span></div>
      ${cr ? `<span class="credit">${esc(cr.artist.slice(0, 40))} · ${esc(cr.license)}</span>` : ""}</div>
    <div class="psheet">
      <div class="plant-head">
        <h1>${esc(s.he)}</h1>
        <div class="sub"><span class="sci">${esc(s.scientific)}</span></div>
        <div class="pills">
          <span class="pill">${esc(data.CATEGORY[s.category] ?? "")}</span>
          <span class="pill green">${esc(data.DIFFICULTY[s.difficulty] ?? "")}</span>
          ${s.toxicity?.pets ? `<span class="pill danger">${icon("paw")}רעיל לחיות</span>` : ""}
        </div>
      </div>
      <button class="btn block" id="own" style="margin:16px 0">${icon("plus")} יש לי כזה</button>
      ${guideHTML(s)}
    </div>`;
  $("#own").onclick = () => { S.add = { chosen: { species_id: s.id, species_name: s.he } }; location.hash = "#add/setup"; };
}

// ---------- לימוד ----------
async function screenLearn() {
  app.innerHTML = loading();
  const [{ lessons }, done] = await Promise.all([data.learn(), cloud.lessonsDone().catch(() => [])]);
  const doneSet = new Set(done.map(d => d.lesson_id));
  const nDone = lessons.filter(l => doneSet.has(l.id)).length;
  const pct = lessons.length ? nDone / lessons.length : 0;
  const levels = { 1: "יסודות", 2: "מתקדמות", 3: "למקצועניות" };
  const next = lessons.find(l => !doneSet.has(l.id)) ?? lessons[0];
  const ni = lessons.indexOf(next);
  const C = 2 * Math.PI * 28;
  const tools = [["#diagnose", "diagnose", "stethoscope", "אבחון"], ["#ask", "water", "chat", "שאלה"], ["#library", "fertilize", "book", "ספרייה"], ["#tips", "sun", "bulb", "טיפים"]];
  app.innerHTML = `${head("לומדים לגדל")}
    ${next ? `<a class="continue" href="#lesson/${encodeURIComponent(next.id)}">
      <div class="body"><div class="eyebrow">${nDone ? "ממשיכים" : "מתחילים"} · שיעור ${ni + 1}</div>
        <h2>${esc(next.title)}</h2>
        <span class="go">${pct >= 1 ? "לקרוא שוב" : "לקריאה"} · ${next.minutes ?? 2} דק׳</span></div>
      <div class="pring"><svg viewBox="0 0 62 62"><circle cx="31" cy="31" r="28"/><circle class="v" cx="31" cy="31" r="28" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - Math.max(pct, 0.02))).toFixed(1)}"/></svg>${nDone}/${lessons.length}</div></a>` : ""}
    <nav class="tools">${tools.map(([h, k, ic, l]) => `<a href="${h}">${ib(k, "", ic)}${l}</a>`).join("")}</nav>
    ${[1, 2, 3].map(lv => {
      const ls = lessons.filter(l => (l.level ?? 1) === lv);
      if (!ls.length) return "";
      const d = ls.filter(l => doneSet.has(l.id)).length;
      const open = ls.includes(next) || (lv === 1 && !next);
      return `<details class="level"${open ? " open" : ""}><summary class="sec"><h2>${levels[lv]}<span class="count num">${d}/${ls.length}</span></h2>${icon("down", "chev")}</summary>
        <div class="rows">${ls.map(l => `<a class="row lesson-row ${doneSet.has(l.id) ? "done" : ""}" href="#lesson/${encodeURIComponent(l.id)}">
        <span class="n">${doneSet.has(l.id) ? icon("check") : lessons.indexOf(l) + 1}</span><span class="body"><b>${esc(l.title)}</b><span>${l.minutes ?? 2} דק׳ קריאה</span></span>${icon("chevron", "chev")}</a>`).join("")}</div></details>`;
    }).join("")}`;
}
async function screenLesson(id) {
  const { lessons } = await data.learn();
  const i = lessons.findIndex(l => l.id === id);
  const l = lessons[i];
  if (!l) { location.hash = "#learn"; return; }
  const next = lessons[i + 1];
  app.innerHTML = `${head(l.title, { back: "#learn", sub: `שיעור ${i + 1} מתוך ${lessons.length} · ${l.minutes ?? 2} דק׳` })}
    <div class="lesson-body">${(l.body ?? []).map(p => `<p>${esc(p)}</p>`).join("")}</div>
    ${l.takeaway ? `<div class="takeaway">${ib("fertilize", "", "bulb")}<div><div class="lbl">בשורה התחתונה</div><p>${esc(l.takeaway)}</p></div></div>` : ""}
    ${l.quiz ? `<div class="card quiz"><h3 style="margin-bottom:12px">${esc(l.quiz.q)}</h3>${l.quiz.options.map((o, k) => `<button data-k="${k}">${esc(o)}</button>`).join("")}<div id="why"></div></div>` : ""}
    <div class="btn-row" style="margin-top:16px">${next ? `<a class="btn block" href="#lesson/${encodeURIComponent(next.id)}" id="nx">לשיעור הבא</a>` : `<a class="btn block" href="#learn">סיימתי</a>`}</div>`;
  if (!l.quiz) cloud.markLesson(l.id, null).catch(() => {});
  $$(".quiz button").forEach(b => (b.onclick = () => {
    const k = Number(b.dataset.k), ok = k === l.quiz.answer;
    $$(".quiz button").forEach(x => { x.disabled = true; if (Number(x.dataset.k) === l.quiz.answer) x.classList.add("right"); });
    if (!ok) b.classList.add("wrong");
    $("#why").innerHTML = `<p style="margin:12px 0 0"><b style="color:${ok ? "var(--green)" : "var(--terra)"}">${ok ? "נכון." : "כמעט."}</b> ${esc(l.quiz.why ?? "")}</p>`;
    cloud.markLesson(l.id, ok).catch(() => {});
  }));
}
async function screenTips() {
  const { tips } = await data.learn();
  const m = new Date().getMonth() + 1;
  const now = tips.filter(t => t.months?.includes(m));
  const rest = tips.filter(t => !t.months?.length);
  const list = ts => `<div class="rows">${ts.map(t => `<p style="margin:0;padding:13px 14px;line-height:1.55">${esc(t.text)}</p>`).join("")}</div>`;
  app.innerHTML = `${head("טיפים", { back: "#learn" })}
    ${now.length ? `<div class="sec" style="margin-top:4px"><h2>${ib("sun", "sm", "calendar")}מתאים לעונה</h2></div>${list(now)}` : ""}
    <div class="sec"><h2>${ib("fertilize", "sm", "bulb")}כל השנה</h2></div>${list(rest)}`;
}

// ---------- אבחון ----------
function plantContext(p, s) {
  if (!p) return "";
  const n = p.last_watered ? Math.round((Date.now() - Date.parse(p.last_watered)) / DAY) : null;
  const w = S.wx?.today ? `מזג האוויר עכשיו: ${Math.round(S.wx.today.tmin)}–${Math.round(S.wx.today.tmax)}°.` : "";
  return [`מיקום: ${p.location === "balcony" ? "מרפסת" + (p.covered ? " מקורה" : "") : "בבית, " + ({ window: "ליד חלון", room: "בחדר מואר", dark: "בפינה חשוכה" }[p.spot] ?? "")}.`,
    p.pot_cm ? `עציץ בקוטר ${p.pot_cm} ס״מ.` : "", n != null ? `הושקה לאחרונה לפני ${n} ימים.` : "",
    s?.water ? `לפי המדריך משקים כל ${s.water.summer_days} ימים בקיץ / ${s.water.winter_days} בחורף.` : "",
    p.acquired ? `אצלה מאז ${p.acquired}.` : "", w].filter(Boolean).join(" ");
}
async function screenDiagnose(plantId) {
  const { diagnosis } = await data.learn();
  const p = plantId ? findPlant(plantId) : null;
  const back = p ? `#plant/${p.id}` : "#learn";
  app.innerHTML = `${head("מה קורה לצמח?", { back, sub: p ? plantName(p) : "" })}
    ${!p && S.plants.length ? `<label class="field"><span>איזה צמח?</span><select id="pp"><option value="">לא משנה / צמח אחר</option>${S.plants.map(x => `<option value="${x.id}">${esc(plantName(x))}</option>`).join("")}</select></label>` : ""}
    <button class="btn terra block" id="photoDx">${icon("camera")} אבחון מתמונה</button>
    <div class="or">או לפי מה שרואים</div>
    <div class="rows symptoms">${diagnosis.symptoms.map(x => `<button class="row" data-s="${esc(x.id)}"><span class="body"><b>${esc(x.label)}</b></span>${icon("chevron", "chev")}</button>`).join("")}</div>
    <div id="dx"></div>`;
  const currentPlant = () => p ?? findPlant($("#pp")?.value);
  $$("[data-s]").forEach(b => (b.onclick = () => runSymptom(diagnosis, diagnosis.symptoms.find(x => x.id === b.dataset.s), currentPlant())));
  $("#photoDx").onclick = () => photoDiagnose(currentPlant());
}
function runSymptom(dx, sym, plant) {
  const qs = Object.fromEntries((sym.questions ?? []).map(q => [q.id, q]));
  const causes = [];
  const answers = [];
  let sheetQ = null;
  const ask = q => {
    sheetQ?.close?.();
    sheetQ = sheet(`<h2>${esc(sym.label)}</h2><p style="font-weight:600;font-size:16px;text-align:center">${esc(q.q)}</p>
      <div class="quiz">${q.options.map((o, i) => `<button data-i="${i}">${esc(o.label)}</button>`).join("")}</div>`);
    $$("[data-i]", sheetQ.el).forEach(b => (b.onclick = () => {
      const o = q.options[Number(b.dataset.i)];
      answers.push(`${q.q} ${o.label}`);
      causes.push(...(o.causes ?? []));
      if (o.next && qs[o.next]) ask(qs[o.next]);
      else { sheetQ.close(); showCauses(dx, sym, [...new Set(causes)], plant, answers); }
    }));
  };
  if (sym.questions?.length) ask(sym.questions[0]);
  else showCauses(dx, sym, [], plant, answers);
}
const URG = { high: ["danger", "דחוף"], medium: ["sun", "השבוע"], low: ["green", "לא דחוף"] };
function showCauses(dx, sym, ids, plant, answers) {
  const list = ids.map(id => ({ id, ...dx.causes[id] })).filter(c => c.title);
  $("#dx").innerHTML = `<div class="sec"><h2>מה זה כנראה</h2></div>
    ${list.map(c => `<div class="card cause"><div class="ch"><h3>${esc(c.title)}</h3><span class="pill ${URG[c.urgency]?.[0] ?? ""}">${esc(URG[c.urgency]?.[1] ?? "")}</span></div>
      <p class="muted" style="margin-top:8px">${esc(c.explain)}</p><b class="small">מה עושים:</b><ol>${(c.fix ?? []).map(f => `<li>${esc(f)}</li>`).join("")}</ol>${c.prevent ? `<p class="small" style="margin:0"><b>להבא:</b> ${esc(c.prevent)}</p>` : ""}</div>`).join("") || `<p class="muted">לא מצאתי סיבה ברורה. כדאי לנסות אבחון מתמונה.</p>`}
    <div class="btn-row"><button class="btn outline" id="dxPhoto">${icon("camera")} לא בטוחה? אבחון מתמונה</button></div>`;
  $("#dxPhoto").onclick = () => photoDiagnose(plant, `${sym.label}. ${answers.join(" ")}`);
  if (plant && list.length) cloud.logEvent(plant, "diagnose", { note: `${sym.label}: ${list.map(c => c.title).join(", ")}` }).catch(() => {});
  $("#dx").scrollIntoView({ behavior: "smooth" });
}
async function photoDiagnose(plant, symptoms = "") {
  const file = await pickImage("camera");
  if (!file) return;
  const img = await shrink(file, 1280);
  const s = plant ? await data.species(plant.species_id) : null;
  $("#dx").innerHTML = `<img class="shot" src="${img.url}" alt="" style="margin-top:18px;max-height:260px">${loading("בודקת את התמונה...")}`;
  $("#dx").scrollIntoView({ behavior: "smooth" });
  try {
    const r = await cloud.ai("diagnose", { image: img.b64, plant: plant ? `${plant.species_name} (${s?.scientific ?? ""})` : "", context: plantContext(plant, s), symptoms });
    $("#dx").innerHTML = `<img class="shot" src="${img.url}" alt="" style="margin-top:18px;max-height:260px">
      <div class="card"><b>${r.healthy ? "נראה בריא" : "מה אני רואה"}</b><p style="margin:6px 0 0">${esc(r.summary)}</p></div>
      ${(r.likely ?? []).map(c => `<div class="card cause"><div class="ch"><h3>${esc(c.title)}</h3><span class="pill ${URG[c.urgency]?.[0] ?? ""}">${Math.round((c.confidence ?? 0) * 100)}% · ${esc(URG[c.urgency]?.[1] ?? "")}</span></div>
        <p class="muted" style="margin-top:8px">${esc(c.explain)}</p><ol>${(c.fix ?? []).map(f => `<li>${esc(f)}</li>`).join("")}</ol></div>`).join("")}
      ${r.prevent ? `<div class="note">${icon("bulb")}<div><b>להבא:</b> ${esc(r.prevent)}</div></div>` : ""}
      ${r.ask ? `<p class="small" style="margin-top:12px"><b>שאלה בשבילך:</b> ${esc(r.ask)} <a href="#ask/${plant?.id ?? ""}">לענות בצ'אט</a></p>` : ""}`;
    if (plant) {
      const path = await cloud.uploadPhoto(img.blob, plant.id).catch(() => null);
      cloud.logEvent(plant, "diagnose", { photo_path: path, note: `${r.summary} ${(r.likely ?? []).map(c => c.title).join(", ")}`.trim(), data: r }).catch(() => {});
    }
  } catch (e) { $("#dx").innerHTML = `<div class="warn" style="margin-top:14px">${icon("warning")}<div>האבחון נכשל: ${esc(e.message)}</div></div>`; }
}

// ---------- שאלות (Gemini) ----------
async function screenAsk(plantId) {
  const p = plantId ? findPlant(plantId) : null;
  const s = p ? await data.species(p.species_id) : null;
  const key = p?.id ?? "general";
  const chat = (S.chat[key] ??= []);
  const draw = () => {
    $("#chat").innerHTML = chat.length ? chat.map(m => `<div class="msg ${m.role}">${esc(m.text)}</div>`).join("")
      : `<div class="msg bot">${p ? `מה תרצי לדעת על ${esc(plantName(p))}?` : "אפשר לשאול כל דבר על צמחים."} למשל: ${p ? "״למה העלים מתקפלים?״ או ״מתי להעביר לעציץ גדול?״" : "״איזה צמח מתאים לחדר בלי חלון?״"}</div>`;
    window.scrollTo(0, document.body.scrollHeight);
  };
  app.innerHTML = `${head(p ? plantName(p) : "שאלה על צמחים", { back: p ? `#plant/${p.id}` : "#learn", sub: p ? "שאלות על הצמח הזה" : "" })}
    <div class="chat" id="chat"></div>
    <form class="composer" id="cf"><button type="button" class="hbtn" id="att" aria-label="צירוף תמונה">${icon("image")}</button><input class="input" name="q" placeholder="כתבי שאלה..." autocomplete="off" required><button class="hbtn send" type="submit" aria-label="שליחה">${icon("send")}</button></form>`;
  draw();
  let photo = null;
  $("#att").onclick = async () => { const f = await pickImage("gallery"); if (f) { photo = await shrink(f, 1024); $("#att").classList.add("on"); toast("התמונה תצורף לשאלה"); } };
  $("#cf").onsubmit = async e => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (!q) return;
    e.target.q.value = "";
    chat.push({ role: "user", text: q });
    draw();
    $("#chat").insertAdjacentHTML("beforeend", `<div class="msg bot typing" id="typing">···</div>`);
    try {
      const r = await cloud.ai("ask", { question: q, history: chat.slice(0, -1), plant: p ? `${p.species_name} (${s?.scientific ?? ""})` : "", context: plantContext(p, s), image: photo?.b64 });
      chat.push({ role: "bot", text: r.answer.replace(/\*\*/g, "").trim() });
    } catch (err) { chat.push({ role: "bot", text: "לא הצלחתי לענות כרגע: " + err.message }); }
    photo = null; $("#att").classList.remove("on");
    draw();
  };
}

// ---------- מזג אוויר: עכשיו, מה לעשות השבוע, תחזית ----------
/** מיקום מהטלפון → שם יישוב → שמירה בפרופיל ורענון מזג האוויר */
function locate() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("הדפדפן לא תומך במיקום"));
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const lat = Math.round(pos.coords.latitude * 100) / 100, lon = Math.round(pos.coords.longitude * 100) / 100;
        const city = (await data.placeName(lat, lon)) || S.profile.city || "המיקום שלי";
        S.profile = await cloud.saveProfile({ lat, lon, city });
        S.wx = await data.weather(lat, lon);
        res(city);
      } catch (e) { rej(e); }
    }, () => rej(new Error("אין גישה למיקום. אפשר לאשר בהגדרות הטלפון, או לכתוב עיר בהגדרות")), { timeout: 15000, maximumAge: 6e5 });
  });
}
const dayName = (iso, i) => i === 0 ? "היום" : i === 1 ? "מחר"
  : new Intl.DateTimeFormat("he-IL", { weekday: "long", timeZone: "Asia/Jerusalem" }).format(new Date(iso + "T12:00:00"));

/** כל ההמלצות לשבוע: לכל יום — קבוצות של {key, text, plants[]} */
function weekPlan(ds) {
  const outed = new Set();
  return ds.map(day => {
    const groups = new Map();
    for (const p of S.plants) {
      for (const a of dayAdvice(sp(p), p, day, { outing: outed.has(p.id) })) {
        if (a.key.startsWith("out")) outed.add(p.id);
        if (!groups.has(a.text)) groups.set(a.text, { key: a.key, text: a.text, plants: [] });
        groups.get(a.text).plants.push(p);
      }
    }
    return [...groups.values()];
  });
}

async function screenWeather() {
  const pr = S.profile;
  if (pr?.lat == null) {
    app.innerHTML = `${head("מזג האוויר", { back: "#today" })}
      <div class="empty">${ib("sun", "lg", "pin")}<h2 style="margin-top:14px">איפה הצמחים גרים?</h2><p>עם המיקום אדע מתי חם מדי, מתי קר בלילה ומתי יורד גשם, ואגיד מה לעשות עם כל צמח.</p>
      <button class="btn" id="loc" style="margin-top:10px">${icon("pin")} להשתמש במיקום שלי</button><p style="margin-top:14px" class="small"><a href="#settings">או לכתוב עיר בהגדרות</a></p></div>`;
    $("#loc").onclick = async e => {
      const b = e.currentTarget;
      b.disabled = true;
      try { await locate(); screenWeather(); } catch (err) { toast(err.message); b.disabled = false; }
    };
    return;
  }
  if (!S.wx?.raw) { app.innerHTML = loading("מביאה תחזית"); S.wx = await data.weather(pr.lat, pr.lon); }
  const raw = S.wx?.raw;
  if (!raw) { app.innerHTML = `${head("מזג האוויר", { back: "#today" })}<p class="muted" style="text-align:center">לא הצלחתי להביא תחזית כרגע. אפשר לנסות שוב עוד מעט.</p>`; return; }
  const now = raw.current ?? {};
  const ds = forecastDays(raw);
  const plan = weekPlan(ds);
  const lo = Math.min(...ds.map(d => d.tmin)), hi = Math.max(...ds.map(d => d.tmax));
  const pos = t => ((t - lo) / Math.max(1, hi - lo)) * 100;
  const names = ps => ps.map(p => esc(plantName(p))).join(", ");
  const anyPlan = plan.some(g => g.length);
  const [nic, ncls] = wxIcon(now.weather_code, now.is_day);

  app.innerHTML = `${head("מזג האוויר", { back: "#today", sub: pr.city || "", right: `<button class="hbtn" id="loc" aria-label="לעדכן לפי המיקום שלי">${icon("pin")}</button>` })}
    <div class="wx-now">
      <div class="big">${icon(nic, ncls)}<div class="temp">${now.temperature_2m != null ? Math.round(now.temperature_2m) + "°" : "–"}</div></div>
      <div class="cond">${esc(wxText(now.weather_code))}${now.is_day === 0 ? ", לילה" : ""}</div>
      <div class="trio">
        <div><span>מרגיש כמו</span><b>${now.apparent_temperature != null ? Math.round(now.apparent_temperature) + "°" : "–"}</b></div>
        <div><span>לחות</span><b>${now.relative_humidity_2m != null ? Math.round(now.relative_humidity_2m) + "%" : "–"}</b></div>
        <div><span>רוח</span><b>${now.wind_speed_10m != null ? Math.round(now.wind_speed_10m) + " קמ״ש" : "–"}</b></div>
      </div>
    </div>
    <div class="sec"><h2>מה לעשות השבוע</h2></div>
    ${!S.plants.length ? `<div class="card"><p class="muted" style="margin:0;text-align:center">כשיהיו צמחים, כאן יופיעו המלצות לפי התחזית.</p></div>`
      : anyPlan ? plan.map((g, i) => g.length ? `<div class="day-h">${esc(dayName(ds[i].date, i))}</div>
          <div class="rows">${g.map(x => `<div class="row advice" style="align-items:flex-start">${ib(x.key)}<div class="body"><b>${esc(x.text)}</b>
            <div class="who">${avatars(x.plants, "sm")}<span>${names(x.plants)}</span></div></div></div>`).join("")}</div>` : "").join("")
      : allDoneHTML("שבוע רגוע", "אין מה להזיז השבוע. ממשיכים כרגיל.")}
    <div class="sec"><h2>תחזית ל-7 ימים</h2></div>
    <div class="rows">${ds.map((d, i) => { const [ic, cls] = wxIcon(d.code); return `<div class="fday">
      <span class="dn">${esc(dayName(d.date, i).replace("יום ", ""))}</span>${icon(ic, cls)}
      <span class="dc">${d.rainProb >= 30 ? `<span class="rp num">${Math.round(d.rainProb)}%</span> ` : ""}${esc(wxText(d.code))}</span>
      <span class="tr"><span class="lo">${Math.round(d.tmin)}°</span><span class="bar"><i style="inset-inline-start:${pos(d.tmin)}%;inset-inline-end:${100 - pos(d.tmax)}%"></i></span><span class="hi">${Math.round(d.tmax)}°</span></span>
    </div>`; }).join("")}</div>`;
  $("#loc").onclick = async e => {
    const b = e.currentTarget;
    b.disabled = true;
    try { const c = await locate(); toast("המיקום עודכן: " + c); screenWeather(); } catch (err) { toast(err.message); b.disabled = false; }
  };
}

// ---------- הגדרות ----------
async function screenSettings() {
  const pr = S.profile;
  const sub = await cloud.currentSub().catch(() => null);
  const pushOn = !!sub && Notification.permission === "granted";
  const hours = [...Array(16)].map((_, i) => i + 6);
  const look = currentLook();
  app.innerHTML = `${head("הגדרות")}
    <div class="card">
      <label class="field"><span>איך לקרוא לך?</span><input id="nm" value="${esc(pr.name ?? "")}" placeholder="השם שלך"></label>
      <div class="field" style="margin:0"><span>איפה את גרה? <small>(בשביל מזג האוויר)</small></span>
        <div style="display:flex;gap:8px"><input class="input" id="city" value="${esc(pr.city ?? "")}" placeholder="עיר"><button class="hbtn" id="gps" aria-label="המיקום שלי" style="width:50px;height:50px">${icon("pin")}</button></div>
        <div id="cityRes"></div></div>
    </div>
    <div class="sec"><h2>תזכורות</h2></div>
    <div class="rows">
      ${cloud.pushSupported() ? `<div class="switch-row">${ib("fertilize", "", "bell")}<div class="body"><b>התראות לנייד</b><span>${pushOn ? "פעילות במכשיר הזה" : "כבויות במכשיר הזה"}</span></div><input type="checkbox" class="switch" id="push" ${pushOn ? "checked" : ""}></div>`
        : `<div class="install-hint">${ib("fertilize", "", "bell")}<div class="small">${isIOS() ? "באייפון: Safari ← שיתוף ← \"הוספה למסך הבית\", ואז לפתוח את עציץ מהמסך הראשי ולהפעיל כאן התראות." : "הדפדפן הזה לא תומך בהתראות. אפשר לנסות ב-Chrome."}</div></div>`}
      <div class="switch-row">${ib("water", "", "clock")}<div class="body"><b>תזכורת יומית</b><span>מתי לשלוח מה צריך היום</span></div>
        <select id="rh">${hours.map(h => `<option value="${h}" ${h === pr.remind_hour ? "selected" : ""}>${h}:00</option>`).join("")}</select></div>
      <div class="switch-row">${ib("sun", "", "bulb")}<div class="body"><b>טיפ יומי</b><span>טיפ קצר ללמוד משהו חדש</span></div>
        <select id="th"><option value="">כבוי</option>${hours.map(h => `<option value="${h}" ${h === pr.tip_hour ? "selected" : ""}>${h}:00</option>`).join("")}</select></div>
      <div class="switch-row">${ib("inside", "", "cloud-sun")}<div class="body"><b>התראות מזג אוויר</b><span>שרב, קור ורוח, לצמחי מרפסת</span></div><input type="checkbox" class="switch" id="wa" ${pr.weather_alerts ? "checked" : ""}></div>
    </div>
    ${pushOn ? `<button class="btn outline small" id="testN">${icon("bell")} התראת בדיקה</button>` : ""}
    <div class="sec"><h2>מראה</h2></div>
    <div class="seg" id="look" style="margin-top:0">
      ${Object.entries(LOOKS).map(([k, [label]]) => `<button data-look="${k}" aria-selected="${look === k}">${label}</button>`).join("")}
    </div>
    <div class="sec"><h2>חשבון</h2></div>
    <div class="rows">
      <div class="row">${ib("rotate", "", "user")}<span class="body"><b>מחוברת בתור</b><span class="ltr">${esc(cloud.user?.email ?? "")}</span></span><button class="btn small outline" id="out">יציאה</button></div>
      <a class="row" href="#credits">${ib("rotate", "", "image")}<span class="body"><b>קרדיטים לתמונות</b><span>צילומי הצמחים מוויקימדיה קומונס</span></span>${icon("chevron", "chev")}</a>
    </div>
    <p class="foot">עציץ · נבנה בשביל טל</p>`;

  const save = async patch => { try { S.profile = await cloud.saveProfile(patch); toast("נשמר", { ms: 1200 }); } catch (e) { toast(e.message); } };
  $("#nm").onchange = e => save({ name: e.target.value.trim() || null });
  $("#rh").onchange = e => save({ remind_hour: Number(e.target.value) });
  $("#th").onchange = e => save({ tip_hour: e.target.value ? Number(e.target.value) : null });
  $("#wa").onchange = e => save({ weather_alerts: e.target.checked });
  $$("#look button").forEach(b => (b.onclick = () => {
    try { localStorage.setItem("atzitz-look", b.dataset.look); } catch {}
    applyLook(b.dataset.look);
    $$("#look button").forEach(x => x.setAttribute("aria-selected", x === b));
  }));
  let t;
  $("#city").oninput = e => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const q = e.target.value.trim();
      if (q.length < 2) { $("#cityRes").innerHTML = ""; return; }
      const rs = await data.geocode(q).catch(() => []);
      $("#cityRes").innerHTML = rs.map((r, i) => `<button class="row" data-i="${i}" style="padding-inline:4px"><span class="body"><b>${esc(r.name)}</b><span>${esc(r.admin ?? "")}</span></span></button>`).join("");
      $$("#cityRes [data-i]").forEach(b => (b.onclick = async () => {
        const r = rs[Number(b.dataset.i)];
        $("#city").value = r.name; $("#cityRes").innerHTML = "";
        await save({ city: r.name, lat: r.lat, lon: r.lon });
        S.wx = await data.weather(r.lat, r.lon);
      }));
    }, 350);
  };
  $("#gps").onclick = async () => {
    try { const c = await locate(); toast("המיקום עודכן: " + c); screenSettings(); } catch (e) { toast(e.message); }
  };
  $("#push")?.addEventListener("change", async e => {
    try {
      if (e.target.checked) { await cloud.enablePush(); toast("ההתראות הופעלו"); }
      else { await cloud.disablePush(); toast("התראות כובו במכשיר הזה"); }
      screenSettings();
    } catch (err) { e.target.checked = !e.target.checked; toast(err.message); }
  });
  $("#testN")?.addEventListener("click", async () => {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification("עציץ", { body: "ככה תיראה תזכורת: המונסטרה צמאה, בערך 400 מ״ל.", icon: "icons/192.png", badge: "icons/badge.png", tag: "test" });
  });
  $("#out").onclick = async () => { await cloud.signOut(); location.hash = ""; screenLogin(); };
}
// קרדיטים לתמונות המאגר (נדרש ברישיונות Creative Commons)
async function screenCredits() {
  await data.index();
  const cr = await data.credits();
  const rows = Object.entries(cr).map(([id, c]) => ({ he: data.speciesLite(id)?.he ?? id, ...c })).sort((a, b) => a.he.localeCompare(b.he, "he"));
  app.innerHTML = `${head("קרדיטים לתמונות", { back: "#settings" })}
    <p class="small muted" style="margin:0 4px 12px">תמונות הצמחים בספרייה מגיעות מוויקימדיה קומונס, ברישיונות חופשיים. תודה לצלמים.</p>
    <div class="rows credits">${rows.map(c => `<a class="row" href="${esc(c.url)}" target="_blank" rel="noopener"><span class="body"><b>${esc(c.he)}</b><span class="ltr" style="text-align:start">${esc(c.artist)} · ${esc(c.license)}</span></span></a>`).join("")}</div>`;
}

// ---------- אתחול ----------
async function boot() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  const u = await cloud.getUser();
  if (!u) return screenLogin();
  const cached = cloud.cachedPlants();
  if (cached) { S.plants = cached; await data.index().catch(() => {}); }
  app.innerHTML = loading("רגע, מעירה את הצמחים");
  await loadAll();
  window.addEventListener("hashchange", render);
  render();
  // חזרה לאפליקציה אחרי זמן — רענון (אולי השקו ממכשיר אחר / עבר יום)
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !cloud.user) return;
    if (Date.now() - (S.lastLoad ?? 0) < 5 * 60e3) return;
    S.lastLoad = Date.now();
    await loadAll().catch(() => {});
    const name = location.hash.slice(1).split("/")[0] || "today";
    if (["today", "plants"].includes(name)) render();
  });
  S.lastLoad = Date.now();
}
boot();
