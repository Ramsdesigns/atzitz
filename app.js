// app.js — עציץ. נתב לפי hash, מסכים כפונקציות שמחזירות HTML ומחברות אירועים.
import * as cloud from "./lib/cloud.js";
import * as data from "./lib/data.js";
import { plantTasks, todayTasks, waterInterval, weatherFactor, careParams, KIND, waterStatus, formatMl, ymd, isSummer, DAY } from "./lib/care.js";
import { esc, icon, $, $$, paras, toast, sheet, confirmSheet, shrink, pickImage, fallbackImg, ago, fmtDate, isIOS, isStandalone } from "./lib/ui.js";
import { CONFIG } from "./lib/config.js";

const app = $("#app");
const S = { profile: null, plants: [], wx: null, urls: {}, ready: false, add: null, chat: {} };

// ---------- עזרים ----------
const plantName = p => p.nickname || p.species_name || "צמח";
const sp = p => data.speciesLite(p.species_id);
const findPlant = id => S.plants.find(p => p.id === id);
const imgOf = p => (p.photo_path && S.urls[p.photo_path] ? `<img src="${esc(S.urls[p.photo_path])}" alt="" loading="lazy" class="ph-img">` : fallbackImg(plantName(p)));
const kindIcon = k => ({ water: "water", fertilize: "fertilize", mist: "mist", rotate: "rotate", repot: "repot", shade: "shade", inside: "inside", wind: "wind", rain: "rain", photo: "image", note: "edit", prune: "scissors", diagnose: "stethoscope", move: "home" }[k] ?? "sprout");
const head = (title, { back, sub, right = "" } = {}) => `
  <header class="screen-head">
    <span class="sh-side">${back ? `<a class="back" href="${back}">${icon("back")} חזרה</a>` : ""}</span>
    <h1>${esc(title)}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</h1>
    <span class="sh-side end">${right}</span>
  </header>`;
const loading = (text = "רגע...") => `<div class="loader"><div class="spin"></div><div>${esc(text)}</div></div>`;

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
  library: screenLibrary, species: screenSpecies, settings: screenSettings,
};
const NO_TABS = new Set(["plant", "lesson", "ask", "species", "edit"]);

async function render() {
  const [name, ...args] = (location.hash.slice(1) || "today").split("/").map(decodeURIComponent);
  const fn = ROUTES[name] ?? screenToday;
  const tabbar = $("#tabbar");
  tabbar.hidden = NO_TABS.has(name);
  app.classList.toggle("no-tabs", NO_TABS.has(name));
  $$("a", tabbar).forEach(a => a.toggleAttribute("aria-current", a.dataset.tab === name || (name === "plant" && a.dataset.tab === "plants")));
  if (a11yCurrent(tabbar, name)) {}
  window.scrollTo(0, 0);
  try { await fn(...args); }
  catch (e) { console.error(e); app.innerHTML = `${head("אופס")}<div class="card"><p>משהו השתבש: ${esc(e.message)}</p><button class="btn" onclick="location.reload()">לנסות שוב</button></div>`; }
}
function a11yCurrent(tabbar, name) { $$("a", tabbar).forEach(a => { if (a.hasAttribute("aria-current")) a.setAttribute("aria-current", "page"); }); return false; }

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
function weatherCard() {
  const w = S.wx;
  if (!w?.today) {
    return S.profile?.lat == null
      ? `<a class="wx-line" href="#settings"><span class="desc"><b>איפה את גרה?</b>עם המיקום, ההשקיה מתאימה את עצמה לחום ולגשם</span></a>`
      : "";
  }
  let note = "מזג אוויר רגיל, הכל לפי התוכנית";
  if (w.sharav) note = "שרב. הצמחים ישתו מהר יותר היום";
  else if (w.tmaxRecent >= 31) note = "חם, אז ההשקיות הוקדמו קצת";
  else if (w.rainRecentMm >= 6) note = "ירד גשם, וצמחי מרפסת חשופים קיבלו מים";
  else if (w.tmaxRecent <= 16) note = "קריר. הצמחים שותים פחות, המרווחים ארוכים יותר";
  const ic = w.today.rain > 1 ? "rain" : "sun";
  return `<div class="wx-line ${w.sharav || w.tmaxRecent >= 31 ? "hot" : ""}"><span class="temp">${Math.round(w.today.tmax)}°</span>
    <span class="desc"><b>${esc(S.profile.city || "")}${ic === "rain" ? ", גשם" : ""} · <span class="num">${Math.round(w.today.tmin)}°–${Math.round(w.today.tmax)}°</span></b>${esc(note)}</span></div>`;
}
function pushPrompt() {
  if (localStorage.getItem("atzitz-push-dismissed")) return "";
  if (!cloud.pushSupported()) {
    if (isIOS() && !isStandalone()) return `<div class="push-card" id="pushCard">${icon("share")}<div class="body"><b>כדי לקבל תזכורות לנייד</b>ב-Safari: כפתור השיתוף ← "הוספה למסך הבית", ואז לפתוח את עציץ משם.</div><button class="x" id="pushLater" aria-label="סגירה">${icon("x")}</button></div>`;
    return "";
  }
  if (Notification.permission === "granted") return "";
  return `<div class="push-card" id="pushCard">${icon("bell")}<div class="body"><b>תזכורת כשצריך להשקות?</b>הודעה אחת ביום, רק כשיש מה לעשות.</div>
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
    .sort((a, b) => (b.t.alert ? 1 : 0) - (a.t.alert ? 1 : 0) || a.t.dueIn - b.t.dueIn);
}
// קבוצה אחת לכל צמח (גם אם יש לו כמה משימות), לפי סדר הדחיפות של המשימה הראשונה שלו
function taskGroups(items) {
  const m = new Map();
  for (const it of items) { if (!m.has(it.p.id)) m.set(it.p.id, { p: it.p, ts: [] }); m.get(it.p.id).ts.push(it.t); }
  return [...m.values()];
}
const whereOf = p => (p.location === "balcony" ? "מרפסת" : p.room || "בבית");
function taskLine(p, t) {
  const late = t.dueIn < 0 ? ` <span class="late">· באיחור של ${-t.dueIn === 1 ? "יום" : -t.dueIn + " ימים"}</span>` : "";
  const text = t.kind === "water" && t.unknown ? `${t.text}, אחרי שבודקים שהאדמה יבשה` : t.text;
  const label = KIND[t.kind]?.done || "טיפלתי";
  return `<div class="task k-${t.kind} ${t.alert ? "alert" : ""}" data-plant="${p.id}" data-kind="${t.kind}">
    <span class="body">${icon(kindIcon(t.kind))}<span>${esc(text)}${late}</span></span>
    <button class="done-btn" data-done>${esc(label)}</button></div>`;
}
function taskGroup({ p, ts }) {
  return `<div class="tgroup ${ts.some(t => t.alert) ? "has-alert" : ""}">
    <a href="#plant/${p.id}" class="thumb" aria-hidden="true" tabindex="-1">${imgOf(p)}</a>
    <a href="#plant/${p.id}" class="pname">${esc(plantName(p))}</a><div class="where">${esc(whereOf(p))}</div>
    ${ts.map(t => taskLine(p, t)).join("")}</div>`;
}
function weekStrip() {
  const days = [...Array(7)].map((_, i) => new Date(Date.now() + i * DAY));
  const counts = days.map(() => ({ w: 0, f: 0 }));
  for (const p of S.plants) {
    for (const t of plantTasks(sp(p), p, S.wx)) {
      if (t.snoozed || t.alert) continue;
      let d = Math.max(0, t.dueIn);
      if (t.kind === "water") {
        // השקיות חוזרות בתוך השבוע
        for (let x = d; x < 7; x += Math.max(1, t.interval)) counts[x].w++;
      } else if (t.kind === "fertilize" && d < 7) counts[d].f++;
    }
  }
  const dn = new Intl.DateTimeFormat("he-IL", { weekday: "narrow", timeZone: "Asia/Jerusalem" });
  const dd = new Intl.DateTimeFormat("he-IL", { day: "numeric", timeZone: "Asia/Jerusalem" });
  return `<div class="week">${days.map((d, i) => `<div class="d ${i === 0 ? "today" : ""}">${i === 0 ? "היום" : esc(dn.format(d))}<b>${esc(dd.format(d))}</b>
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

async function screenToday() {
  if (!S.ready) app.innerHTML = loading();
  const name = S.profile?.name ? `, ${S.profile.name}` : "";
  const hello = sub => `<div class="hello"><div class="eyebrow">${esc(todayLabel())}</div><h1>${greeting()}${esc(name)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</div>`;
  if (!S.plants.length) {
    app.innerHTML = `${hello("")}
      <div class="empty"><h2>נתחיל מהצמח הראשון</h2>
      <p>מצלמים אותו, ואני אגיד מה הוא, איפה הוא אוהב לעמוד וכמה להשקות. ואזכיר מתי.</p>
      <a class="btn terra" href="#add" style="margin-top:8px">${icon("camera")} לצלם צמח</a>
      <p style="margin-top:16px"><a href="#library">או לחפש בספרייה לפי שם</a></p></div>${pushPrompt()}`;
    bindPushPrompt();
    return;
  }
  const items = allTodayTasks();
  const groups = taskGroups(items);
  const n = items.filter(x => !x.t.alert).length;
  const sub = n ? `${n === 1 ? "משימה אחת" : n + " משימות"} להיום.` : groups.length ? "אין השקיות היום, רק לשים לב למזג האוויר." : "אין משימות היום. הצמחים מרוצים.";
  const tip = await tipOfDay();
  app.innerHTML = `
    ${hello(sub)}
    ${weatherCard()}
    <div id="tasks">${groups.length ? `<div class="group">${groups.map(taskGroup).join("")}</div>` :
      `<div class="all-done"><b>הכל בסדר היום</b><div class="small muted">אפשר פשוט ליהנות מהם.</div></div>`}</div>
    ${pushPrompt()}
    <div class="section-title"><h2>השבוע</h2><span class="legend"><i></i>השקיה<i class="f"></i>דישון</span></div>
    ${weekStrip()}
    ${tip ? `<div class="section-title"><h2>טיפ של היום</h2><a href="#tips">עוד טיפים</a></div><div class="tip-card"><p>${esc(tip.text)}</p></div>` : ""}`;
  bindPushPrompt();
  $$(".task [data-done]").forEach(b => (b.onclick = () => completeTask(b.closest(".task"))));
}
// הסרת שורת משימה, ואם הצמח נשאר בלי משימות, גם הקבוצה שלו
function dropTaskRow(row) {
  setTimeout(() => {
    const g = row.closest(".tgroup");
    row.remove();
    if (g && !g.querySelector(".task")) g.remove();
    const list = $("#tasks .group");
    if (list && !list.children.length) $("#tasks").innerHTML = `<div class="all-done"><b>סיימת להיום</b><div class="small muted">הצמחים מודים לך.</div></div>`;
  }, 300);
}

async function completeTask(row) {
  const p = findPlant(row.dataset.plant);
  const kind = row.dataset.kind;
  row.classList.add("done");
  if (!KIND[kind]?.field) {
    // התראת מזג אוויר — "טיפלתי" = דחייה להיום
    await cloud.updatePlant(p.id, { snooze: { ...p.snooze, [kind]: ymd() } }).then(replacePlant);
    dropTaskRow(row);
    return;
  }
  const before = { ...p };
  const t = todayTasks(sp(p), p, S.wx).find(x => x.kind === kind);
  try {
    const { ev, plant } = await cloud.logEvent(p, kind, kind === "water" && t?.ml ? { amount_ml: t.ml } : {});
    replacePlant(plant);
    dropTaskRow(row);
    toast(`${KIND[kind].done}: ${plantName(p)}`, {
      undo: async () => {
        await cloud.deleteEvent(ev.id);
        const f = KIND[kind].field;
        const patch = { [f]: before[f] };
        if (kind === "fertilize") patch.last_watered = before.last_watered;
        replacePlant(await cloud.updatePlant(p.id, patch));
        render();
      },
    });
  } catch (e) { row.classList.remove("done"); toast("לא נשמר: " + e.message); }
}

// ---------- הצמחים שלי ----------
function waterBar(p) {
  const t = plantTasks(sp(p), p, S.wx).find(x => x.kind === "water" || x.kind === "rain");
  if (!t) return "";
  if (t.kind === "rain") return `<div class="wstat">${icon("rain")}הגשם השקה</div>`;
  const cls = t.unknown ? "" : t.dueIn < 0 ? "late" : t.dueIn === 0 ? "due" : "";
  const txt = t.unknown ? "לבדוק את האדמה" : t.dueIn === 0 ? "להשקות היום" : t.dueIn === 1 ? "השקיה מחר" : waterStatus(t);
  return `<div class="wstat ${cls}">${icon("water")}<span>${esc(txt)}</span></div>`;
}
async function screenPlants() {
  const where = whereOf;
  // ממוינים לפי מקום, ובתוך כל מקום — מי שצריך מים קודם
  const due = p => plantTasks(sp(p), p, S.wx).find(x => x.kind === "water")?.dueIn ?? 99;
  const list = [...S.plants].sort((a, b) => where(a).localeCompare(where(b), "he") || due(a) - due(b));
  app.innerHTML = `${head("הצמחים שלי", { sub: S.plants.length ? `${S.plants.length} צמחים` : "", right: `<a class="back" href="#library">ספרייה</a>` })}
    ${S.plants.length ? `<div class="grid">${list.map(p => `
        <a class="pcard" href="#plant/${p.id}"><div class="ph">${imgOf(p)}</div>
          <div class="info"><b>${esc(plantName(p))}</b><span>${p.nickname ? esc(p.species_name) + " · " : ""}${esc(where(p))}</span>${waterBar(p)}</div></a>`).join("")}</div>`
      : `<div class="empty"><h2>עוד אין צמחים</h2><p>מצלמים את הראשון, זה לוקח חצי דקה.</p><a class="btn terra" href="#add">${icon("camera")} לצלם צמח</a></div>`}
    ${S.plants.length ? `<a class="btn outline block" href="#add" style="margin-top:28px">${icon("plus")} הוספת צמח</a>` : ""}`;
}

// ---------- מדריך טיפול (משותף לעמוד צמח ולספרייה) ----------
function guideHTML(s, plant) {
  if (!s) return `<div class="card"><p>אין עדיין מידע מלא על הצמח הזה.</p></div>`;
  const L = data.LIGHT[s.light?.level]?.label ?? "";
  // אקורדיון: אור והשקיה פתוחים (הכי חשובים), השאר נפתחים לפי הצורך
  const item = (ic, title, val, body, extra = "", open = false) => `<details class="g-item"${open ? " open" : ""}><summary><span class="ic">${icon(ic)}</span><h3>${esc(title)}</h3>${val ? `<span class="val">${esc(val)}</span>` : ""}${icon("chevron", "chev")}</summary><div class="gb">${body}${extra}</div></details>`;
  const dl = pairs => `<dl>${pairs.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
  const pc = plant ? careParams(s, plant) : careParams(s);
  const tox = s.toxicity?.pets || s.toxicity?.kids;
  return `<div class="guide">
    ${s.summary ? `<div class="note">${esc(s.summary)}</div>` : ""}
    ${tox ? `<div class="warn">${icon("paw")}<div><b>רעיל ${s.toxicity.pets && s.toxicity.kids ? "לחיות מחמד ולילדים" : s.toxicity.pets ? "לחיות מחמד" : "לילדים"}.</b> ${esc(s.toxicity.text || "")}</div></div>` : ""}
    <div class="group">
    ${item("sun", "אור", L, paras(s.light?.text), dl([["סימנים שחסר אור", s.light?.signs_too_little], ["סימנים שיותר מדי שמש", s.light?.signs_too_much]]), true)}
    ${item("water", "השקיה", `קיץ כל ${pc.waterSummer}, חורף כל ${pc.waterWinter} ימים`, paras(s.water?.check), dl([["כמה", s.water?.amount], ["איך", s.water?.method], ["סימנים של יותר מדי מים", s.water?.signs_over], ["סימנים של מעט מדי מים", s.water?.signs_under]]), true)}
    ${item("home", "איפה לשים בבית", s.placement?.balcony === "ok_sun" ? "גם מרפסת שמשית" : s.placement?.balcony === "ok_shade" ? "גם מרפסת מוצלת" : "רק בפנים", paras(s.placement?.text))}
    ${item("soil", "אדמה", "", paras(s.soil?.text))}
    ${item("repot", "עציץ והעברה", s.pot?.repot_years ? `כל ${s.pot.repot_years} שנים` : "", paras(s.pot?.text))}
    ${item("humid", "לחות", { low: "נמוכה", medium: "בינונית", high: "גבוהה" }[s.humidity?.level] ?? "", paras(s.humidity?.text))}
    ${item("temp", "טמפרטורה", s.temperature?.ideal ? `${s.temperature.ideal}°` : "", paras(s.temperature?.text))}
    ${item("fertilize", "דישון", s.fertilizer?.days ? `כל ${s.fertilizer.days} ימים בעונה` : "", paras(s.fertilizer?.text))}
    ${s.pruning ? item("scissors", "גיזום", "", paras(s.pruning)) : ""}
    ${s.propagation ? item("sprout", "ריבוי", "", paras(s.propagation)) : ""}
    ${s.problems?.length ? item("bug", "בעיות נפוצות", "", s.problems.map(x => `<div class="problem"><b>${esc(x.symptom)}</b><p><strong>למה:</strong> ${esc(x.cause)}</p><p><strong>מה עושים:</strong> ${esc(x.fix)}</p></div>`).join("")) : ""}
    ${s.seasonal ? item("calendar", "לאורך השנה", "", dl([["אביב", s.seasonal.spring], ["קיץ", s.seasonal.summer], ["סתיו", s.seasonal.autumn], ["חורף", s.seasonal.winter]])) : ""}
    ${s.tips?.length ? item("sprout", "טיפים של מקצוענים", "", `<ul class="tips">${s.tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`) : ""}
    ${s.buying ? item("search", "כשקונים במשתלה", "", paras(s.buying)) : ""}
    </div>
    ${s.ai ? `<p class="tiny muted">המידע על הצמח הזה נכתב בעזרת Gemini, כדאי לבדוק גם מקור נוסף.</p>` : ""}
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
  const f = weatherFactor(p, S.wx);
  const why = f < 0.95 ? `בגלל החום ההשקיה מוקדמת: כל ${w?.interval} ימים במקום ${isSummer() ? careParams(s, p).waterSummer : careParams(s, p).waterWinter}`
    : f > 1.05 ? `קריר, אז המרווח ארוך יותר: ${w?.interval} ימים` : `${isSummer() ? "בקיץ" : "בחורף"}: כל ${w?.interval} ימים בערך`;
  const L = data.LIGHT[s?.light?.level]?.short;
  app.innerHTML = `
    <div class="hero">${p.photo_path && S.urls[p.photo_path] ? `<img src="${esc(S.urls[p.photo_path])}" alt="">` : fallbackImg(plantName(p))}
      <div class="top"><a class="hero-btn" href="#plants">${icon("back")} חזרה</a><a class="hero-btn" href="#edit/${p.id}">עריכה</a></div></div>
    <div class="plant-head">
      <h1>${esc(plantName(p))}</h1>
      <div class="muted">${esc(p.nickname ? p.species_name : "")} <span class="sci">${esc(s?.scientific || "")}</span></div>
      <div class="meta">
        <span class="chip">${esc(p.location === "balcony" ? "מרפסת" : p.room || "בבית")}</span>
        ${L ? `<span class="chip sun">${icon("sun")}${esc(L)}</span>` : ""}
        ${s?.difficulty ? `<span class="chip green">${esc(data.DIFFICULTY[s.difficulty])}</span>` : ""}
        ${s?.toxicity?.pets ? `<span class="chip danger">${icon("paw")}רעיל לחיות</span>` : ""}
      </div>
    </div>
    <div class="actions">
      ${["water", "fertilize", "mist"].map(k => `<button data-log="${k}">${icon(kindIcon(k))}${KIND[k].done}</button>`).join("")}
      <button data-more>עוד</button>
    </div>
    <div class="tabs" role="tablist">
      ${[["status", "מצב"], ["guide", "מדריך טיפול"], ["log", "יומן"], ["photos", "תמונות"]].map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join("")}
    </div>
    <div id="tabc"></div>`;

  const tabc = $("#tabc");
  const showTab = async k => {
    $$(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === k));
    history.replaceState(null, "", `#plant/${p.id}/${k}`);
    if (k === "status") {
      const upcoming = tasks.filter(t => !t.alert && t.kind !== "water" && t.kind !== "rain").sort((a, b) => a.dueIn - b.dueIn);
      const alerts = tasks.filter(t => t.alert);
      tabc.innerHTML = `
        ${alerts.map(t => `<div class="note" style="margin-bottom:14px"><div><b>${esc(KIND[t.kind].label)}.</b> ${esc(t.text)}</div></div>`).join("")}
        <div class="card status-card ${w && w.dueIn <= 0 ? "late" : ""}">
          <div style="flex:1">${rain ? `<b>${esc(rain.text)}</b>` : `<div class="big">${esc(waterStatus(w))}</div>
            <div class="small" style="margin-top:8px;color:var(--ink-2)">${esc(w.text)}. ${esc(why)}.</div>
            ${p.last_watered ? `<div class="tiny muted" style="margin-top:4px">השקיה אחרונה ${esc(ago(p.last_watered))}</div>` : ""}`}</div>
        </div>
        ${s?.water?.check ? `<div class="note" style="margin-bottom:14px"><b>לפני שמשקים:</b> ${esc(s.water.check)}</div>` : ""}
        ${upcoming.length ? `<div class="section-title" style="margin-top:24px"><h2>בהמשך</h2></div><div class="group">${upcoming.map(t => `<div class="list-row"><div class="body"><b>${esc(KIND[t.kind].label)}</b></div><span class="small muted">${esc(t.dueIn <= 0 ? "היום" : t.dueIn === 1 ? "מחר" : `בעוד ${t.dueIn} ימים`)}</span></div>`).join("")}</div>` : ""}
        <div class="menu-list" style="margin-top:14px">
          <a class="menu-item" href="#diagnose/${p.id}"><span class="ic" style="color:var(--terra)">${icon("stethoscope")}</span><span class="body"><b>משהו לא נראה טוב?</b><span>אבחון לפי סימנים או לפי תמונה</span></span>${icon("chevron")}</a>
          <a class="menu-item" href="#ask/${p.id}"><span class="ic" style="color:var(--water)">${icon("chat")}</span><span class="body"><b>לשאול על ${esc(plantName(p))}</b><span>תשובה שמכירה את הצמח ואת המצב שלו</span></span>${icon("chevron")}</a>
        </div>
        ${p.notes ? `<div class="card flat" style="margin-top:14px"><b>הערות</b>${paras(p.notes)}</div>` : ""}`;
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
          <p class="tiny muted" style="margin-top:10px">כדאי לצלם מאותה זווית כל כמה שבועות, ככה רואים איך הוא גדל.</p>` : `<p class="muted">עוד אין תמונות.</p>`}`;
        $("#addPhoto").onclick = () => addProgressPhoto(p);
        $$(".photos img").forEach(i => (i.onclick = () => viewer(i.dataset.full)));
      } else {
        tabc.innerHTML = evs.length ? `<div class="timeline">${evs.map(e => `<div class="ev"><span class="dot">${icon(kindIcon(e.kind))}</span>
          <b>${esc(KIND[e.kind]?.done || { photo: "תמונה", note: "הערה", prune: "גיזום", diagnose: "אבחון", move: "הזזה" }[e.kind] || e.kind)}</b>${e.amount_ml ? ` <span class="small muted">${esc(formatMl(e.amount_ml))}</span>` : ""}
          <div class="when">${esc(fmtDate(e.at))} · ${esc(ago(e.at))}</div>${e.note ? `<div class="small">${esc(e.note)}</div>` : ""}
          ${e.photo_path && urls[e.photo_path] ? `<img src="${esc(urls[e.photo_path])}" alt="">` : ""}</div>`).join("")}</div>`
          : `<p class="muted">היומן ריק. כל השקיה, דישון ותמונה יופיעו כאן.</p>`;
      }
    }
  };
  $$(".tabs button").forEach(b => (b.onclick = () => showTab(b.dataset.tab)));
  $$("[data-log]").forEach(b => (b.onclick = () => quickLog(p, b.dataset.log)));
  $("[data-more]").onclick = () => moreActions(p);
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
  const s = sheet(`<h2>מה עשית?</h2><div class="menu-list">
    ${[["rotate", "סובבתי את העציץ", "rotate"], ["repot", "העברתי לעציץ חדש", "repot"], ["prune", "גזמתי", "scissors"], ["photo", "תמונת התקדמות", "camera"], ["note", "הערה ביומן", "edit"]]
      .map(([k, l, ic]) => `<button class="menu-item" data-k="${k}"><span class="ic">${icon(ic)}</span><span class="body"><b>${l}</b></span></button>`).join("")}
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
  v.innerHTML = `<img src="${esc(url)}" alt=""><button class="icon-btn" aria-label="סגירה">${icon("x")}</button>`;
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
    <div class="capture"><div class="frame" id="frame"><div class="corners"><i></i><i></i><i></i><i></i></div><div class="hint"><b>איך מצלמים כדי שיזהה</b>
      <ol><li>מקרוב, שרואים טוב את העלים (או פרח, אם יש)</li><li>באור יום ובלי פלאש</li><li>רקע פשוט, בלי עוד צמחים מסביב</li></ol></div></div>
      <div class="btn-row"><button class="btn terra" id="cam">${icon("camera")} צילום</button><button class="btn outline" id="gal">${icon("image")} מהגלריה</button></div>
      <p style="margin-top:20px" class="small">יודעת מה הצמח? <a href="#add/search">חיפוש לפי שם</a></p></div>`;
  const go = async from => {
    const file = await pickImage(from);
    if (!file) return;
    S.add.photo = await shrink(file, 1280);
    $("#frame").innerHTML = `<img src="${S.add.photo.url}" alt="">`;
    $(".capture .hint")?.remove();
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
  app.innerHTML = `${head("זה הצמח?", { back: "#add", sub: c.length ? "בחרי את מה שנראה הכי דומה" : "" })}
    ${S.add.photo ? `<img src="${S.add.photo.url}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:16px;margin-bottom:16px">` : ""}
    ${r.notPlant ? `<div class="warn" style="margin-bottom:14px">נראה שאין צמח בתמונה. נסי לצלם שוב מקרוב.</div>` : ""}
    ${c.length ? c.map((x, i) => `<button class="result" data-i="${i}">
      ${x.images?.length ? `<span class="thumbs">${x.images.slice(0, 2).map(u => `<img src="${esc(u)}" alt="" loading="lazy">`).join("")}</span>` : ""}
      <span class="body"><b>${esc(x.he || x.scientific)}</b> <span class="sci small">${esc(x.scientific)}</span>
        <div class="score" style="color:${x.score >= .5 ? "var(--green)" : "var(--ink-3)"}">${Math.round((x.score ?? 0) * 100)}% התאמה · ${esc(x.src)}${x.lite ? "" : " · יוכן מדריך חדש"}</div>
        ${x.why ? `<div class="tiny muted">${esc(x.why)}</div>` : ""}
        <div class="meter"><i style="width:${Math.round((x.score ?? 0) * 100)}%"></i></div></span></button>`).join("")
      : `<div class="card"><p style="margin:0">לא הצלחתי לזהות בוודאות. אפשר לצלם שוב (עלה אחד מקרוב, באור יום) או לחפש לפי שם.</p></div>`}
    <div class="btn-row" style="margin-top:14px"><a class="btn outline" href="#add">צילום חוזר</a><a class="btn outline" href="#add/search">חיפוש לפי שם</a></div>
    ${r.remaining != null && r.remaining < 50 ? `<p class="tiny muted">נשארו ${r.remaining} זיהויים היום</p>` : ""}`;
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
    <div id="res" class="group"></div>
    <p class="small muted" style="margin-top:4px">לא ברשימה? <button class="link-btn" id="aiq">לבקש מדריך לצמח הזה</button></p>`;
  const draw = () => {
    const list = data.search($("#q").value).slice(0, 40);
    $("#res").innerHTML = list.map(p => `<button class="list-row" data-id="${p.id}" style="width:100%;background:none;border:0;border-bottom:1px solid var(--line);text-align:start;cursor:pointer">
      <span class="body"><b>${esc(p.he)}</b><span>${esc(data.CATEGORY[p.category] ?? "")} · <span class="sci">${esc(p.scientific)}</span></span></span>${icon("chevron")}</button>`).join("") || `<p class="muted" style="padding:10px 0">לא נמצא במאגר.</p>`;
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
  app.innerHTML = `${head(ch.species_name, { back: S.add.result ? "#add/results" : "#add/search", sub: "עוד כמה פרטים קטנים" })}
    ${s?.placement?.text ? `<div class="note" style="margin-bottom:16px"><b>איפה כדאי לשים:</b> ${esc(s.placement.text)}</div>` : ""}
    <form id="sf">
      <label class="field"><span>שם חיבה <small>(לא חובה)</small></span><input name="nickname" placeholder="למשל: מוני"></label>
      <div class="field"><span>איפה הוא גר?</span>${choiceHTML("location", [["indoor", "בבית"], ["balcony", "במרפסת"]], st.location)}</div>
      <div class="field" id="spotF"><span>ובתוך הבית?</span>${choiceHTML("spot", [["window", "ליד חלון"], ["room", "בחדר מואר"], ["dark", "פינה חשוכה"]], st.spot)}</div>
      <label class="field" id="roomF"><span>חדר <small>(לא חובה)</small></span><input name="room" placeholder="סלון, מטבח, חדר שינה..." list="rooms"></label>
      <datalist id="rooms">${[...new Set(["סלון", "מטבח", "חדר שינה", "אמבטיה", "משרד", ...S.plants.map(p => p.room).filter(Boolean)])].map(r => `<option value="${esc(r)}">`).join("")}</datalist>
      <label class="field" id="covF" hidden><span style="display:flex;justify-content:space-between;align-items:center">מרפסת מקורה (הגשם לא מגיע)<input type="checkbox" class="switch" name="covered"></span></label>
      <div class="field"><span>גודל העציץ <small>(קוטר הפתח)</small></span>${choiceHTML("pot", POTS, st.pot)}</div>
      <div class="field"><span>מתי השקית לאחרונה?</span>${choiceHTML("last", [["today", "היום"], ["3", "לפני כמה ימים"], ["7", "לפני שבוע+"], ["unknown", "לא זוכרת"]], st.last)}</div>
      ${s?.light?.level ? `<p class="small muted">הוא אוהב ${esc(data.LIGHT[s.light.level]?.label ?? "")}.</p>` : ""}
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
      <div class="card flat"><h3 style="margin-bottom:4px">תדירות השקיה</h3><p class="small muted">לפי המדריך: קיץ כל ${pc.waterSummer}, חורף כל ${pc.waterWinter} ימים. אם רואים שהוא צריך אחרת, משנים כאן.</p>
        <div style="display:flex;gap:10px"><label class="field" style="flex:1"><span>קיץ (ימים)</span><input name="water_summer" type="number" inputmode="numeric" min="1" max="60" value="${esc(p.care?.water_summer ?? "")}" placeholder="${pc.waterSummer}"></label>
        <label class="field" style="flex:1"><span>חורף (ימים)</span><input name="water_winter" type="number" inputmode="numeric" min="1" max="90" value="${esc(p.care?.water_winter ?? "")}" placeholder="${pc.waterWinter}"></label></div></div>
      <label class="field"><span>הערות</span><textarea name="notes">${esc(p.notes ?? "")}</textarea></label>
      <div class="btn-row"><button class="btn" type="submit">שמירה</button><button class="btn outline" type="button" id="chPhoto">${icon("camera")} תמונה ראשית</button></div>
      <button class="btn danger block" type="button" id="del" style="margin-top:26px">${icon("trash")} הסרת הצמח</button>
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
    <div class="search">${icon("search")}<input class="input" id="q" placeholder="חיפוש..." autocomplete="off"></div>
    <div class="tabs" id="cats" role="tablist" style="margin-top:0">
      <button data-c="" aria-selected="true">הכל</button>${Object.entries(data.CATEGORY).map(([k, v]) => `<button data-c="${k}" aria-selected="false">${v}</button>`).join("")}</div>
    <div id="res"></div>`;
  let cat = "";
  const draw = () => {
    const list = data.search($("#q").value).filter(p => !cat || p.category === cat);
    $("#res").innerHTML = `<div class="group">${list.map(p => `<a class="list-row" href="#species/${encodeURIComponent(p.id)}">
      <span class="body"><b>${esc(p.he)}</b><span>${esc(data.CATEGORY[p.category] ?? "")} · ${esc(data.DIFFICULTY[p.difficulty] ?? "")}</span></span>
      ${p.toxicity?.pets ? `<span class="small" style="color:var(--danger)">רעיל לחיות</span>` : ""}${icon("chevron")}</a>`).join("") || `<p class="muted">לא נמצא.</p>`}</div>`;
  };
  $("#q").oninput = draw;
  $$("#cats button").forEach(b => (b.onclick = () => { cat = b.dataset.c; $$("#cats button").forEach(x => x.setAttribute("aria-selected", x === b)); draw(); }));
  draw();
}
async function screenSpecies(id) {
  const s = await data.species(id);
  if (!s) { location.hash = "#library"; return; }
  app.innerHTML = `${head(s.he, { back: "#library", sub: `${data.CATEGORY[s.category] ?? ""} · ${data.DIFFICULTY[s.difficulty] ?? ""}` })}
    <p class="sci" style="margin:-12px 0 16px">${esc(s.scientific)}</p>
    <button class="btn secondary block" id="own" style="margin-bottom:18px">${icon("plus")} יש לי כזה, להוסיף לצמחים שלי</button>
    ${guideHTML(s)}`;
  $("#own").onclick = () => { S.add = { chosen: { species_id: s.id, species_name: s.he } }; location.hash = "#add/setup"; };
}

// ---------- לימוד ----------
async function screenLearn() {
  app.innerHTML = loading();
  const [{ lessons }, done] = await Promise.all([data.learn(), cloud.lessonsDone().catch(() => [])]);
  const doneSet = new Set(done.map(d => d.lesson_id));
  const pct = lessons.length ? doneSet.size / lessons.length : 0;
  const levels = { 1: "יסודות", 2: "מתקדמות", 3: "למקצועניות" };
  const next = lessons.find(l => !doneSet.has(l.id)) ?? lessons[0];
  const ni = lessons.indexOf(next);
  const tools = [["#diagnose", "stethoscope", "אבחון", "var(--terra)"], ["#ask", "chat", "שאלה", "var(--water)"], ["#library", "book", "ספרייה", "var(--green-2)"], ["#tips", "sprout", "טיפים", "var(--sun)"]];
  app.innerHTML = `${head("לומדים לגדל")}
    ${next ? `<a class="continue" href="#lesson/${encodeURIComponent(next.id)}">
      <div class="eyebrow"><span>${doneSet.size ? "ממשיכים" : "מתחילים"} · שיעור ${ni + 1}</span><span class="num">${doneSet.size}/${lessons.length}</span></div>
      <h2>${esc(next.title)}</h2>
      <div class="bar"><i style="width:${Math.round(pct * 100)}%"></i></div>
      <span class="btn small">${pct >= 1 ? "לקרוא שוב" : "לקריאה"} · ${next.minutes ?? 2} דק׳</span></a>` : ""}
    <nav class="tools">${tools.map(([h, , l]) => `<a href="${h}">${l}</a>`).join("")}</nav>
    ${[1, 2, 3].map(lv => {
      const ls = lessons.filter(l => (l.level ?? 1) === lv);
      if (!ls.length) return "";
      const d = ls.filter(l => doneSet.has(l.id)).length;
      const open = ls.includes(next) || (lv === 1 && !next);
      return `<details class="level"${open ? " open" : ""}><summary><h2>${icon("chevron")}${levels[lv]}</h2><span class="aside">${d}/${ls.length}</span></summary>
        <div class="group">${ls.map(l => `<a class="lesson-row ${doneSet.has(l.id) ? "done" : ""}" href="#lesson/${encodeURIComponent(l.id)}">
        <span class="n">${doneSet.has(l.id) ? "✓" : lessons.indexOf(l) + 1}</span><span class="body"><b>${esc(l.title)}</b><span>${l.minutes ?? 2} דק׳ קריאה</span></span>${icon("chevron")}</a>`).join("")}</div></details>`;
    }).join("")}`;
}
async function screenLesson(id) {
  const { lessons } = await data.learn();
  const i = lessons.findIndex(l => l.id === id);
  const l = lessons[i];
  if (!l) { location.hash = "#learn"; return; }
  const next = lessons[i + 1];
  app.innerHTML = `${head(l.title, { back: "#learn", sub: `שיעור ${i + 1} מתוך ${lessons.length}` })}
    <div class="lesson-body">${(l.body ?? []).map(p => `<p>${esc(p)}</p>`).join("")}</div>
    ${l.takeaway ? `<div class="takeaway"><div class="eyebrow">בשורה התחתונה</div><p>${esc(l.takeaway)}</p></div>` : ""}
    ${l.quiz ? `<div class="card quiz"><h3 style="margin-bottom:12px">${esc(l.quiz.q)}</h3>${l.quiz.options.map((o, k) => `<button data-k="${k}">${esc(o)}</button>`).join("")}<div id="why"></div></div>` : ""}
    <div class="btn-row" style="margin-top:16px">${next ? `<a class="btn block" href="#lesson/${encodeURIComponent(next.id)}" id="nx">לשיעור הבא</a>` : `<a class="btn block" href="#learn">סיימתי</a>`}</div>`;
  if (!l.quiz) cloud.markLesson(l.id, null).catch(() => {});
  $$(".quiz button").forEach(b => (b.onclick = () => {
    const k = Number(b.dataset.k), ok = k === l.quiz.answer;
    $$(".quiz button").forEach(x => { x.disabled = true; if (Number(x.dataset.k) === l.quiz.answer) x.classList.add("right"); });
    if (!ok) b.classList.add("wrong");
    $("#why").innerHTML = `<p style="margin-top:12px"><b style="color:${ok ? "var(--green)" : "var(--terra)"}">${ok ? "נכון." : "כמעט."}</b> ${esc(l.quiz.why ?? "")}</p>`;
    cloud.markLesson(l.id, ok).catch(() => {});
  }));
}
async function screenTips() {
  const { tips } = await data.learn();
  const m = new Date().getMonth() + 1;
  const now = tips.filter(t => t.months?.includes(m));
  const rest = tips.filter(t => !t.months?.length);
  app.innerHTML = `${head("טיפים", { back: "#learn" })}
    ${now.length ? `<div class="section-title" style="margin-top:6px"><h2>מתאים לעונה</h2></div><div class="group">${now.map(t => `<p style="margin:0;padding:14px 16px">${esc(t.text)}</p>`).join("")}</div>` : ""}
    <div class="section-title"><h2>כל השנה</h2></div><div class="group">${rest.map(t => `<p style="margin:0;padding:14px 16px">${esc(t.text)}</p>`).join("")}</div>`;
}

// ---------- אבחון ----------
function plantContext(p, s) {
  if (!p) return "";
  const days = p.last_watered ? Math.round((Date.now() - Date.parse(p.last_watered)) / DAY) : null;
  const w = S.wx?.today ? `מזג האוויר עכשיו: ${Math.round(S.wx.today.tmin)}–${Math.round(S.wx.today.tmax)}°.` : "";
  return [`מיקום: ${p.location === "balcony" ? "מרפסת" + (p.covered ? " מקורה" : "") : "בבית, " + ({ window: "ליד חלון", room: "בחדר מואר", dark: "בפינה חשוכה" }[p.spot] ?? "")}.`,
    p.pot_cm ? `עציץ בקוטר ${p.pot_cm} ס״מ.` : "", days != null ? `הושקה לאחרונה לפני ${days} ימים.` : "",
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
    <div class="symptoms">${diagnosis.symptoms.map(x => `<button data-s="${esc(x.id)}">${esc(x.label)}${icon("chevron")}</button>`).join("")}</div>
    <div id="dx"></div>`;
  const currentPlant = () => p ?? findPlant($("#pp")?.value);
  $$("[data-s]").forEach(b => (b.onclick = () => runSymptom(diagnosis, diagnosis.symptoms.find(x => x.id === b.dataset.s), currentPlant())));
  $("#photoDx").onclick = () => photoDiagnose(currentPlant());
}
function runSymptom(dx, sym, plant) {
  const qs = Object.fromEntries((sym.questions ?? []).map(q => [q.id, q]));
  let causes = [];
  const answers = [];
  const ask = q => {
    sheetQ?.close?.();
    sheetQ = sheet(`<h2>${esc(sym.label)}</h2><p style="font-weight:600;font-size:17px">${esc(q.q)}</p>
      <div class="quiz">${q.options.map((o, i) => `<button data-i="${i}">${esc(o.label)}</button>`).join("")}</div>`);
    $$("[data-i]", sheetQ.el).forEach(b => (b.onclick = () => {
      const o = q.options[Number(b.dataset.i)];
      answers.push(`${q.q} ${o.label}`);
      causes.push(...(o.causes ?? []));
      if (o.next && qs[o.next]) ask(qs[o.next]);
      else { sheetQ.close(); showCauses(dx, sym, [...new Set(causes)], plant, answers); }
    }));
  };
  let sheetQ = null;
  if (sym.questions?.length) ask(sym.questions[0]);
  else showCauses(dx, sym, [], plant, answers);
}
function showCauses(dx, sym, ids, plant, answers) {
  const urg = { high: "דחוף", medium: "כדאי לטפל השבוע", low: "לא דחוף" };
  const list = ids.map(id => ({ id, ...dx.causes[id] })).filter(c => c.title);
  $("#dx").innerHTML = `<div class="section-title"><h2>מה זה כנראה</h2></div>
    ${list.map(c => `<div class="card cause"><div class="ch"><h3>${esc(c.title)}</h3><span class="chip ${c.urgency === "high" ? "danger" : c.urgency === "medium" ? "sun" : "green"}">${esc(urg[c.urgency] ?? "")}</span></div>
      <p class="muted" style="margin-top:8px">${esc(c.explain)}</p><b class="small">מה עושים:</b><ol>${(c.fix ?? []).map(f => `<li>${esc(f)}</li>`).join("")}</ol>${c.prevent ? `<p class="small"><b>להבא:</b> ${esc(c.prevent)}</p>` : ""}</div>`).join("") || `<p class="muted">לא מצאתי סיבה ברורה. כדאי לנסות אבחון מתמונה.</p>`}
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
  $("#dx").innerHTML = `<img src="${img.url}" alt="" style="width:100%;border-radius:16px;margin-top:18px;max-height:260px;object-fit:cover">${loading("בודקת את התמונה...")}`;
  $("#dx").scrollIntoView({ behavior: "smooth" });
  try {
    const r = await cloud.ai("diagnose", { image: img.b64, plant: plant ? `${plant.species_name} (${s?.scientific ?? ""})` : "", context: plantContext(plant, s), symptoms });
    const urg = { high: "דחוף", medium: "השבוע", low: "לא דחוף" };
    $("#dx").innerHTML = `<img src="${img.url}" alt="" style="width:100%;border-radius:16px;margin:18px 0 14px;max-height:260px;object-fit:cover">
      <div class="card ${r.healthy ? "" : "flat"}"><b>${r.healthy ? "נראה בריא" : "מה אני רואה"}</b><p style="margin:6px 0 0">${esc(r.summary)}</p></div>
      ${(r.likely ?? []).map(c => `<div class="card cause"><div class="ch"><h3>${esc(c.title)}</h3><span class="chip ${c.urgency === "high" ? "danger" : c.urgency === "medium" ? "sun" : ""}">${Math.round((c.confidence ?? 0) * 100)}% · ${esc(urg[c.urgency] ?? "")}</span></div>
        <p class="muted" style="margin-top:8px">${esc(c.explain)}</p><ol>${(c.fix ?? []).map(f => `<li>${esc(f)}</li>`).join("")}</ol></div>`).join("")}
      ${r.prevent ? `<div class="note"><b>להבא:</b> ${esc(r.prevent)}</div>` : ""}
      ${r.ask ? `<p class="small" style="margin-top:12px"><b>שאלה בשבילך:</b> ${esc(r.ask)} <a href="#ask/${plant?.id ?? ""}">לענות בצ'אט</a></p>` : ""}`;
    if (plant) {
      const path = await cloud.uploadPhoto(img.blob, plant.id).catch(() => null);
      cloud.logEvent(plant, "diagnose", { photo_path: path, note: `${r.summary} ${(r.likely ?? []).map(c => c.title).join(", ")}`.trim(), data: r }).catch(() => {});
    }
  } catch (e) { $("#dx").innerHTML = `<div class="warn" style="margin-top:14px">האבחון נכשל: ${esc(e.message)}</div>`; }
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
  app.innerHTML = `${head(p ? plantName(p) : "שאלה על צמחים", { back: p ? `#plant/${p.id}` : "#learn", sub: p ? "שאלות על הצמח הזה" : "שאלות על צמחים" })}
    <div class="chat" id="chat"></div>
    <form class="composer" id="cf"><button type="button" class="btn outline" id="att" style="padding:0 14px">תמונה</button><input class="input" name="q" placeholder="כתבי שאלה..." autocomplete="off" required><button class="btn" type="submit" style="min-height:50px">שליחה</button></form>`;
  draw();
  let photo = null;
  $("#att").onclick = async () => { const f = await pickImage("gallery"); if (f) { photo = await shrink(f, 1024); $("#att").style.background = "var(--green-soft)"; toast("התמונה תצורף לשאלה"); } };
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
    photo = null; $("#att").style.background = "";
    draw();
  };
}

// ---------- הגדרות ----------
async function screenSettings() {
  const pr = S.profile;
  const sub = await cloud.currentSub().catch(() => null);
  const pushOn = !!sub && Notification.permission === "granted";
  const hours = [...Array(16)].map((_, i) => i + 6);
  app.innerHTML = `${head("הגדרות")}
    <div class="card">
      <label class="field"><span>איך לקרוא לך?</span><input id="nm" value="${esc(pr.name ?? "")}" placeholder="השם שלך"></label>
      <div class="field"><span>איפה את גרה? <small>(בשביל מזג האוויר)</small></span>
        <div style="display:flex;gap:8px"><input class="input" id="city" value="${esc(pr.city ?? "")}" placeholder="עיר"><button class="btn outline" id="gps" style="padding:0 14px;white-space:nowrap">המיקום שלי</button></div>
        <div id="cityRes"></div></div>
    </div>
    <div class="card">
      <h2>תזכורות</h2>
      ${cloud.pushSupported() ? `<div class="switch-row"><div><b>התראות לנייד</b><div class="small muted">${pushOn ? "פעילות במכשיר הזה" : "כבויות במכשיר הזה"}</div></div><input type="checkbox" class="switch" id="push" ${pushOn ? "checked" : ""}></div>`
        : `<div class="install-hint" style="padding:8px 0">${icon("share")}<div class="small">${isIOS() ? "באייפון: Safari ← שיתוף ← \"הוספה למסך הבית\", ואז לפתוח את עציץ מהמסך הראשי ולהפעיל כאן התראות." : "הדפדפן הזה לא תומך בהתראות. אפשר לנסות ב-Chrome."}</div></div>`}
      <div class="switch-row"><div><b>שעת התזכורת היומית</b><div class="small muted">מתי לשלוח מה צריך היום</div></div>
        <select class="input" id="rh" style="width:auto;min-height:42px">${hours.map(h => `<option value="${h}" ${h === pr.remind_hour ? "selected" : ""}>${h}:00</option>`).join("")}</select></div>
      <div class="switch-row"><div><b>טיפ יומי</b><div class="small muted">טיפ קצר ללמוד משהו חדש</div></div>
        <select class="input" id="th" style="width:auto;min-height:42px"><option value="">כבוי</option>${hours.map(h => `<option value="${h}" ${h === pr.tip_hour ? "selected" : ""}>${h}:00</option>`).join("")}</select></div>
      <div class="switch-row"><div><b>התראות מזג אוויר</b><div class="small muted">שרב, קור ורוח, לצמחי מרפסת</div></div><input type="checkbox" class="switch" id="wa" ${pr.weather_alerts ? "checked" : ""}></div>
      ${pushOn ? `<button class="btn outline small" id="testN" style="margin-top:10px">${icon("bell")} התראת בדיקה</button>` : ""}
    </div>
    <div class="card flat">
      <div class="list-row"><span class="body"><b>מחוברת בתור</b><span class="ltr">${esc(cloud.user?.email ?? "")}</span></span><button class="btn small outline" id="out">יציאה</button></div>
    </div>
    <p class="foot">עציץ · נבנה בשביל טל</p>`;

  const save = async patch => { try { S.profile = await cloud.saveProfile(patch); toast("נשמר", { ms: 1200 }); } catch (e) { toast(e.message); } };
  $("#nm").onchange = e => save({ name: e.target.value.trim() || null });
  $("#rh").onchange = e => save({ remind_hour: Number(e.target.value) });
  $("#th").onchange = e => save({ tip_hour: e.target.value ? Number(e.target.value) : null });
  $("#wa").onchange = e => save({ weather_alerts: e.target.checked });
  let t;
  $("#city").oninput = e => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const q = e.target.value.trim();
      if (q.length < 2) { $("#cityRes").innerHTML = ""; return; }
      const rs = await data.geocode(q).catch(() => []);
      $("#cityRes").innerHTML = rs.map((r, i) => `<button class="list-row" data-i="${i}" style="width:100%;background:none;border:0;border-bottom:1px solid var(--line);text-align:start;cursor:pointer"><span class="body"><b>${esc(r.name)}</b><span>${esc(r.admin ?? "")}</span></span></button>`).join("");
      $$("#cityRes [data-i]").forEach(b => (b.onclick = async () => {
        const r = rs[Number(b.dataset.i)];
        $("#city").value = r.name; $("#cityRes").innerHTML = "";
        await save({ city: r.name, lat: r.lat, lon: r.lon });
        S.wx = await data.weather(r.lat, r.lon);
      }));
    }, 350);
  };
  $("#gps").onclick = () => navigator.geolocation?.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    await save({ lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, city: S.profile.city || "המיקום שלי" });
    S.wx = await data.weather(S.profile.lat, S.profile.lon);
    screenSettings();
  }, () => toast("אין גישה למיקום. אפשר לכתוב עיר"));
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
