// ui.js — עזרים קטנים לממשק: בריחת HTML, אייקונים, הודעות, גיליון תחתון, הקטנת תמונות.

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const icon = (name, cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** טקסט עם שורות → פסקאות */
export const paras = text => String(text ?? "").split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("");

let toastTimer;
export function toast(msg, { undo, ms = 3200 } = {}) {
  const t = $("#toast");
  t.innerHTML = esc(msg) + (undo ? ` <button type="button">ביטול</button>` : "");
  t.hidden = false;
  if (undo) t.querySelector("button").onclick = () => { t.hidden = true; undo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), undo ? 5000 : ms);
}

/** גיליון תחתון. מחזיר {el, close}. onClose נקרא בכל סגירה. */
export function sheet(html, { onClose } = {}) {
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  const el = document.createElement("div");
  el.className = "sheet";
  el.setAttribute("role", "dialog");
  el.innerHTML = `<div class="grab"></div>${html}`;
  document.body.append(bg, el);
  document.body.style.overflow = "hidden";
  const close = () => { bg.remove(); el.remove(); document.body.style.overflow = ""; window.removeEventListener("hashchange", close); onClose?.(); };
  bg.onclick = close;
  window.addEventListener("hashchange", close);
  return { el, close };
}

export function confirmSheet(title, text, okLabel = "כן", danger = false) {
  return new Promise(res => {
    let answered = false;
    const s = sheet(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
      <div class="btn-row" style="margin-top:18px"><button class="btn ${danger ? "danger" : ""}" data-ok>${esc(okLabel)}</button><button class="btn outline" data-no>ביטול</button></div>`,
      { onClose: () => { if (!answered) res(false); } });
    s.el.querySelector("[data-ok]").onclick = () => { answered = true; s.close(); res(true); };
    s.el.querySelector("[data-no]").onclick = () => { answered = true; s.close(); res(false); };
  });
}

/** קריאת קובץ תמונה → JPEG מוקטן (Blob) + base64 לשליחה לשרת */
export async function shrink(file, max = 1280, quality = 0.82) {
  const bmp = await createImageBitmap(file).catch(() => null);
  let src = bmp;
  if (!src) {                                      // דפדפנים ישנים: דרך <img>
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  const w = src.width, h = src.height, k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, "image/jpeg", quality));
  const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
  return { blob, b64, url: URL.createObjectURL(blob) };
}

/** בחירת תמונה: מצלמה או גלריה */
export function pickImage(from = "camera") {
  return new Promise(res => {
    const input = document.getElementById(from === "camera" ? "camera" : "gallery");
    input.value = "";
    input.onchange = () => res(input.files?.[0] ?? null);
    input.click();
  });
}

export const fallbackImg = () => `<div class="ph-fallback">${icon("plants")}</div>`;

const rtf = new Intl.RelativeTimeFormat("he", { numeric: "auto" });
export function ago(iso) {
  if (!iso) return "";
  const days = Math.round((Date.now() - Date.parse(iso)) / 864e5);
  if (days < 1) {
    const h = Math.round((Date.now() - Date.parse(iso)) / 36e5);
    return h < 1 ? "עכשיו" : rtf.format(-h, "hour");
  }
  if (days < 30) return rtf.format(-days, "day");
  if (days < 365) return rtf.format(-Math.round(days / 30), "month");
  return rtf.format(-Math.round(days / 365), "year");
}
export const fmtDate = iso => new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
