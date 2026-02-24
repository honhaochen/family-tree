/**
 * Family Timeline – load family.json, render timeline, drag/wheel scroll, birthday banner
 */

// -------- Responsive root font size (all rem values scale with viewport) --------
const ROOT_FONT = { minPx: 14, maxPx: 18, minWidth: 320, maxWidth: 1200 };
const MOBILE_BREAK = 520;
const ROOT_FONT_MOBILE = { minPx: 12, maxPx: 13, minWidth: 320, maxWidth: MOBILE_BREAK };

function setRootFontSize() {
  const w = window.innerWidth;
  const isMobile = w <= MOBILE_BREAK;
  const cfg = isMobile ? ROOT_FONT_MOBILE : ROOT_FONT;
  const t = (w - cfg.minWidth) / (cfg.maxWidth - cfg.minWidth);
  const px = Math.min(cfg.maxPx, Math.max(cfg.minPx,
    cfg.minPx + (cfg.maxPx - cfg.minPx) * t
  ));
  document.documentElement.style.fontSize = px + "px";
}

setRootFontSize();
window.addEventListener("resize", setRootFontSize);
window.addEventListener("orientationchange", () => { setTimeout(setRootFontSize, 100); });

// -------- Config --------
const DATA_URL = "./family.json";  // must be in same repo for GitHub Pages
const viewport = document.getElementById("viewport");
const canvas = document.getElementById("canvas");
const ticksEl = document.getElementById("ticks");
const statusEl = document.getElementById("status");
const scaleInput = document.getElementById("scale");
const scaleVal = document.getElementById("scaleVal");
const centerBtn = document.getElementById("centerBtn");

// -------- Interaction: drag/swipe to scroll --------
let isDown = false;
let startX = 0, startY = 0;
let startScrollLeft = 0, startScrollTop = 0;

viewport.addEventListener("pointerdown", (e) => {
  isDown = true;
  viewport.setPointerCapture(e.pointerId);
  startX = e.clientX;
  startY = e.clientY;
  startScrollLeft = viewport.scrollLeft;
  startScrollTop = viewport.scrollTop;
});

viewport.addEventListener("pointermove", (e) => {
  if (!isDown) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  if (isMobileView()) {
    viewport.scrollTop = startScrollTop - dy;
  } else {
    viewport.scrollLeft = startScrollLeft - dx;
  }
});

viewport.addEventListener("pointerup", () => isDown = false);
viewport.addEventListener("pointercancel", () => isDown = false);

// Wheel: translate vertical wheel into horizontal scroll on desktop only
viewport.addEventListener("wheel", (e) => {
  if (isMobileView()) return;
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  viewport.scrollLeft += delta;
}, { passive: true });

// -------- Helpers --------
function isMobileView() {
  return window.matchMedia("(max-width: 520px)").matches;
}

function parseDate(dateStr) {
  const s = String(dateStr).replaceAll("/", "-");
  const d = new Date(s + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatDate(d) {
  const opts = { year: "numeric", month: "short", day: "2-digit" };
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

function yearFraction(d) {
  const y = d.getFullYear();
  const start = new Date(y, 0, 1);
  const end = new Date(y + 1, 0, 1);
  const frac = (d - start) / (end - start);
  return y + frac;
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

function setScale(pxPerYear) {
  document.documentElement.style.setProperty("--px-per-year", String(pxPerYear));
  scaleVal.textContent = `${pxPerYear}px/yr`;
}

function centerTimeline() {
  if (isMobileView()) {
    const midY = (canvas.scrollHeight - viewport.clientHeight) / 2;
    viewport.scrollTop = Math.max(0, midY);
  } else {
    const midX = (canvas.scrollWidth - viewport.clientWidth) / 2;
    viewport.scrollLeft = Math.max(0, midX);
  }
}

function computePositions(people, pxPerYear, minGap) {
  const years = people.map(p => p._yearPos);
  const minY = Math.min(...years);
  const maxY = Math.max(...years);

  const base = years.map(y => (y - minY) * pxPerYear);

  const pos = [...base];
  for (let i = 1; i < pos.length; i++) {
    if (pos[i] - pos[i - 1] < minGap) {
      pos[i] = pos[i - 1] + minGap;
    }
  }

  const contentSize = pos[pos.length - 1] + 320;
  return { pos, minYear: minY, maxYear: maxY, contentSize };
}

function applyCanvasSize(contentSize) {
  if (isMobileView()) {
    canvas.style.width = "100%";
    canvas.style.height = `${Math.max(contentSize, viewport.clientHeight)}px`;
  } else {
    canvas.style.width = `${Math.max(contentSize, viewport.clientWidth + 80)}px`;
    canvas.style.height = "";
  }
}

function renderTicks(minYear, maxYear, pxPerYear) {
  ticksEl.innerHTML = "";
  const start = Math.floor(minYear);
  const end = Math.ceil(maxYear);

  const step = pxPerYear >= 28 ? 1 : (pxPerYear >= 16 ? 2 : 5);

  for (let y = start; y <= end; y += step) {
    const left = (y - minYear) * pxPerYear;
    const t = document.createElement("div");
    t.className = "tick";
    t.style.left = `${left}px`;
    const label = document.createElement("span");
    label.textContent = String(y);
    t.appendChild(label);
    ticksEl.appendChild(t);
  }
}

function renderPeople(people, positions) {
  canvas.querySelectorAll(".person").forEach(n => n.remove());

  const mobile = isMobileView();

  people.forEach((p, idx) => {
    const node = document.createElement("div");

    if (!mobile) {
      node.className = `person ${idx % 2 === 0 ? "above" : "below"}`;
      node.style.left = `${positions[idx]}px`;
      node.style.removeProperty("--y");
    } else {
      node.className = `person ${idx % 2 === 0 ? "left" : "right"}`;
      node.style.left = "50%";
      node.style.setProperty("--y", `${positions[idx]}px`);
    }

    const stem = document.createElement("div");
    stem.className = "stem";

    const dot = document.createElement("div");
    dot.className = "dot";

    const card = document.createElement("div");
    card.className = "card";

    const inner = document.createElement("div");
    inner.className = "card-inner";

    const avatar = document.createElement("div");
    avatar.className = "avatar";

    if (p.photo) {
      const img = document.createElement("img");
      img.alt = `${p.name} photo`;
      img.loading = "lazy";
      img.src = p.photo;
      img.onerror = () => {
        avatar.innerHTML = "";
        avatar.textContent = initials(p.name);
      };
      avatar.appendChild(img);
    } else {
      avatar.textContent = initials(p.name);
    }

    const meta = document.createElement("div");
    meta.className = "meta";

    const name = document.createElement("p");
    name.className = "name";
    name.textContent = p.name;

    const date = document.createElement("p");
    date.className = "date";
    date.textContent = `${formatDate(p._date)} · ${p._date.getFullYear()}`;

    meta.appendChild(name);
    meta.appendChild(date);

    inner.appendChild(avatar);
    inner.appendChild(meta);

    card.appendChild(inner);

    node.appendChild(stem);
    node.appendChild(dot);
    node.appendChild(card);

    canvas.appendChild(node);
  });
}

// -------- Birthday countdown --------
function daysUntilNextBirthday(birthDate, nowMidnight) {
  const month = birthDate.getMonth();
  const day = birthDate.getDate();

  const year = nowMidnight.getFullYear();
  let next = new Date(year, month, day);

  if (next < nowMidnight) next = new Date(year + 1, month, day);

  const ms = next - nowMidnight;
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  return { days, nextDate: next, isToday: days === 0 };
}

function updateNextBirthdayBanner(people) {
  const bdayText = document.getElementById("bdayText");
  if (!bdayText || people.length === 0) return;

  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let best = null;
  for (const p of people) {
    const r = daysUntilNextBirthday(p._date, todayMid);
    if (!best || r.days < best.days) {
      best = { person: p, ...r };
    }
  }
  if (!best) return;

  const y = best.nextDate.getFullYear();
  const m = String(best.nextDate.getMonth() + 1).padStart(2, "0");
  const d = String(best.nextDate.getDate()).padStart(2, "0");
  const iso = `${y}-${m}-${d}`;

  if (best.isToday) {
    bdayText.textContent = `🎂 Today is ${best.person.name}'s birthday!`;
  } else if (best.days === 1) {
    bdayText.textContent = `🎉 ${best.person.name} in 1 day (${iso})`;
  } else {
    bdayText.textContent = `🎉 ${best.person.name} in ${best.days} days (${iso})`;
  }
}

// -------- Main --------
async function loadAndRender() {
  statusEl.textContent = "";
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${DATA_URL} (HTTP ${res.status})`);
    const data = await res.json();

    if (!Array.isArray(data)) throw new Error("family.json must be an array of people objects");

    const people = data.map((p, i) => {
      const d = parseDate(p.birthdate);
      if (!d) throw new Error(`Invalid birthdate at index ${i}: "${p.birthdate}" (use YYYY-MM-DD)`);
      return {
        id: p.id ?? String(i),
        name: String(p.name ?? "Unnamed"),
        birthdate: String(p.birthdate),
        photo: p.photo ? String(p.photo) : "",
        _date: d,
        _yearPos: yearFraction(d),
      };
    }).sort((a, b) => a._date - b._date);

    updateNextBirthdayBanner(people);

    const pxPerYear = Number(getComputedStyle(document.documentElement).getPropertyValue("--px-per-year")) || 20;
    const minGap = Number(getComputedStyle(document.documentElement).getPropertyValue("--min-gap")) || 120;

    const { pos, minYear, maxYear, contentSize } = computePositions(people, pxPerYear, minGap);

    applyCanvasSize(contentSize);

    if (!isMobileView()) {
      renderTicks(minYear, maxYear, pxPerYear);
    } else {
      ticksEl.innerHTML = "";
    }

    renderPeople(people, pos);
    centerTimeline();

  } catch (err) {
    console.error(err);
    statusEl.innerHTML = ` <span class="error">(${String(err.message || err)})</span>`;
  }
}

// -------- Controls --------
setScale(Number(scaleInput.value));
scaleInput.addEventListener("input", () => {
  setScale(Number(scaleInput.value));
  loadAndRender();
});

centerBtn.addEventListener("click", centerTimeline);

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(loadAndRender, 150);
});

setInterval(loadAndRender, 60 * 1000);

loadAndRender();
