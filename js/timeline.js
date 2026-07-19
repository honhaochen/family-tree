/**
 * Family Timeline – load family.json, render vertical timeline, drag/wheel scroll,
 * parent/spouse connector lines, birthday banner
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
const connectorsEl = document.getElementById("connectors");
const statusEl = document.getElementById("status");
const scaleInput = document.getElementById("scale");
const scaleVal = document.getElementById("scaleVal");
const centerBtn = document.getElementById("centerBtn");
const topPanel = document.getElementById("topPanel");

const TOP_OFFSET = 80;

// One color per sub-family branch; cycles if there are ever more branches than colors.
const BRANCH_PALETTE = ["#7db8ff", "#ff9f7d", "#7dffb0", "#d68dff", "#ffe37d", "#ff7d9f", "#7de0ff", "#ffb37d"];
const NEUTRAL_COLOR = "rgba(255,255,255,0.45)";

let highlightedId = null;

// -------- Auto-hiding top panel: hide as soon as scrolling down starts, only show again at the top --------
const TOP_EDGE_THRESHOLD = 24; // always show once back within this many px of the top
const SCROLL_DIRECTION_THRESHOLD = 6; // ignore tiny/jittery deltas

function syncHeaderClearance() {
  const h = Math.ceil(topPanel.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--header-clearance", `${h}px`);
}

let lastScrollTop = viewport.scrollTop;

viewport.addEventListener("scroll", () => {
  const current = viewport.scrollTop;
  const delta = current - lastScrollTop;

  if (current <= TOP_EDGE_THRESHOLD) {
    topPanel.classList.remove("hidden"); // only reappears once scrolled back to the top
  } else if (delta > SCROLL_DIRECTION_THRESHOLD) {
    topPanel.classList.add("hidden"); // scrolling down, even partway through
  }

  lastScrollTop = current;
}, { passive: true });

// -------- Interaction: drag/swipe to scroll (vertical) --------
let isDown = false;
let startY = 0;
let startScrollTop = 0;

viewport.addEventListener("pointerdown", (e) => {
  isDown = true;
  viewport.setPointerCapture(e.pointerId);
  startY = e.clientY;
  startScrollTop = viewport.scrollTop;
});

viewport.addEventListener("pointermove", (e) => {
  if (!isDown) return;
  const dy = e.clientY - startY;
  viewport.scrollTop = startScrollTop - dy;
});

viewport.addEventListener("pointerup", () => isDown = false);
viewport.addEventListener("pointercancel", () => isDown = false);

// Wheel: pinch (ctrl/meta) changes gap scale; plain wheel scrolls natively (no handling needed)
const SCALE_STEP = 4;
const SCALE_PINCH_FACTOR = 0.02;
let scaleWheelDebounce = null;

function applyScaleDelta(delta, debounceRender) {
  const min = Number(scaleInput.min) || 6;
  const max = Number(scaleInput.max) || 60;
  let v = Number(scaleInput.value) || 20;
  v = Math.round(v + delta);
  v = Math.min(max, Math.max(min, v));
  scaleInput.value = v;
  setScale(v);
  if (debounceRender) {
    clearTimeout(scaleWheelDebounce);
    scaleWheelDebounce = setTimeout(() => {
      scaleWheelDebounce = null;
      loadAndRender();
    }, 150);
  } else {
    loadAndRender();
  }
}

viewport.addEventListener("wheel", (e) => {
  const pinch = e.ctrlKey || e.metaKey; // pinch on trackpad often sets ctrlKey
  if (!pinch) return; // let native vertical scroll happen
  e.preventDefault();
  const delta = (e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP) * (Math.abs(e.deltaY) * SCALE_PINCH_FACTOR || 1);
  applyScaleDelta(Math.round(delta) || (e.deltaY > 0 ? -1 : 1), true);
}, { passive: false });

// Pinch (two fingers) on touch devices: change gap scale
let pinchStartDistance = 0;
let pinchStartScale = 0;
let pinchRenderScheduled = false;

function touchDistance(touches) {
  const a = touches[0], b = touches[1];
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

viewport.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    pinchStartDistance = touchDistance(e.touches);
    pinchStartScale = Number(scaleInput.value) || 20;
  }
}, { passive: true });

viewport.addEventListener("touchmove", (e) => {
  if (e.touches.length !== 2) return;
  e.preventDefault();
  const dist = touchDistance(e.touches);
  const min = Number(scaleInput.min) || 6;
  const max = Number(scaleInput.max) || 60;
  const ratio = dist / pinchStartDistance;
  let v = Math.round(pinchStartScale * ratio);
  v = Math.min(max, Math.max(min, v));
  if (v !== Number(scaleInput.value)) {
    scaleInput.value = v;
    setScale(v);
    if (!pinchRenderScheduled) {
      pinchRenderScheduled = true;
      requestAnimationFrame(() => {
        loadAndRender();
        pinchRenderScheduled = false;
      });
    }
  }
}, { passive: false });

viewport.addEventListener("touchend", (e) => {
  if (e.touches.length < 2) pinchStartDistance = 0;
}, { passive: true });

// -------- Helpers --------
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
  const midY = (canvas.scrollHeight - viewport.clientHeight) / 2;
  viewport.scrollTop = Math.max(0, midY);
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
  canvas.style.width = "100%";
  const h = contentSize + TOP_OFFSET;
  canvas.style.height = `${Math.max(h, viewport.clientHeight)}px`;
}

function renderTicks(minYear, maxYear, pxPerYear) {
  ticksEl.innerHTML = "";
  const start = Math.floor(minYear);
  const end = Math.ceil(maxYear);

  const step = pxPerYear >= 28 ? 1 : (pxPerYear >= 16 ? 2 : 5);

  for (let y = start; y <= end; y += step) {
    const top = (y - minYear) * pxPerYear;
    const t = document.createElement("div");
    t.className = "tick";
    t.style.top = `${top}px`;
    const label = document.createElement("span");
    label.textContent = String(y);
    t.appendChild(label);
    ticksEl.appendChild(t);
  }
}

function renderPeople(people, positions) {
  canvas.querySelectorAll(".person").forEach(n => n.remove());

  people.forEach((p, idx) => {
    const node = document.createElement("div");
    node.className = `person ${idx % 2 === 0 ? "left" : "right"}`;
    node.dataset.id = p.id;
    node.style.left = "50%";
    node.style.setProperty("--y", `${TOP_OFFSET + positions[idx]}px`);

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

    card.addEventListener("click", (e) => {
      e.stopPropagation();
      canvas.querySelectorAll(".person").forEach((el) => { el.style.zIndex = ""; });
      node.style.zIndex = "100";
      canvas.appendChild(node);

      if (highlightedId === p.id) {
        clearHighlight();
        highlightedId = null;
      } else {
        highlightedId = p.id;
        highlightPerson(highlightedId);
      }
    });

    canvas.appendChild(node);
  });
}

// -------- Relationship connector lines --------
function cardAnchor(personNode, canvasRect) {
  const card = personNode.querySelector(".card");
  const r = card.getBoundingClientRect();
  const isLeft = personNode.classList.contains("left");
  /* Outer edge (away from the center line) so connectors sweep in from
     the screen's sides rather than bunching near the timeline. */
  return {
    x: (isLeft ? r.left : r.right) - canvasRect.left,
    y: (r.top + r.height / 2) - canvasRect.top,
  };
}

/* A stub curve from a card's outer edge in to a shared meeting point on the
   timeline's center line, rather than all the way across to the other card -
   so it's always clear where a relationship "ends". */
function connectorStubPath(from, centerX, meetY) {
  const midX = (from.x + centerX) / 2;
  return `M ${from.x},${from.y} Q ${midX},${from.y} ${centerX},${meetY}`;
}

function appendConnectorPair(parentEl, aId, bId, className, a, b, color, centerX) {
  const meetY = (a.y + b.y) / 2;
  [a, b].forEach((point) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", `connector ${className}`);
    path.setAttribute("d", connectorStubPath(point, centerX, meetY));
    path.style.stroke = color;
    path.dataset.a = aId;
    path.dataset.b = bId;
    parentEl.appendChild(path);
  });
}

/* The father among a person's recorded parents (falls back to the first
   parent if gender data is missing/incomplete). */
function fatherIdOf(person, byId) {
  for (const parentId of person.parents) {
    const parent = byId.get(parentId);
    if (parent && parent.gender === "m") return parentId;
  }
  return person.parents[0] || null;
}

/* One color per father: every child of the same father shares that father's
   color, so a father's whole brood reads as a single-color unit rather than
   one color per branch/lineage. */
function computeFatherColors(people, byId) {
  const colorByFather = new Map();

  people.forEach((p) => {
    if (!p.parents.length) return;
    const fatherId = fatherIdOf(p, byId);
    if (fatherId && !colorByFather.has(fatherId)) {
      colorByFather.set(fatherId, BRANCH_PALETTE[colorByFather.size % BRANCH_PALETTE.length]);
    }
  });

  return {
    fatherIdOf: (p) => fatherIdOf(p, byId),
    colorForFather: (fatherId) => colorByFather.get(fatherId) || NEUTRAL_COLOR,
  };
}

/* Pairs of full siblings (same recorded parents), chained in birth order
   (A-B, B-C, ...) rather than every pair, to avoid an O(n^2) tangle. */
function computeSiblingPairs(people) {
  const groups = new Map();
  people.forEach((p) => {
    if (!p.parents.length) return;
    const key = [...p.parents].sort().join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p.id);
  });

  const pairs = [];
  groups.forEach((ids) => {
    for (let i = 1; i < ids.length; i++) {
      pairs.push([ids[i - 1], ids[i]]);
    }
  });
  return pairs;
}

function drawConnectors(people) {
  connectorsEl.innerHTML = "";

  const byId = new Map(people.map(p => [p.id, p]));
  const nodeById = new Map(
    Array.from(canvas.querySelectorAll(".person")).map(n => [n.dataset.id, n])
  );
  const canvasRect = canvas.getBoundingClientRect();
  const centerX = canvasRect.width / 2;
  const { fatherIdOf: getFatherId, colorForFather } = computeFatherColors(people, byId);

  people.forEach((p) => {
    const childNode = nodeById.get(p.id);
    if (!childNode || !p.parents.length) return;
    const fatherId = getFatherId(p);
    if (!fatherId) return;
    const fatherNode = nodeById.get(fatherId);
    if (!byId.has(fatherId) || !fatherNode) {
      console.warn(`Unresolved father id "${fatherId}" for "${p.id}"`);
      return;
    }
    const a = cardAnchor(childNode, canvasRect);
    const b = cardAnchor(fatherNode, canvasRect);
    appendConnectorPair(connectorsEl, p.id, fatherId, "connector-parent", a, b, colorForFather(fatherId), centerX);
  });

  const drawnSpousePairs = new Set();
  people.forEach((p) => {
    if (!p.spouse) return;
    const spouse = byId.get(p.spouse);
    const spouseNode = nodeById.get(p.spouse);
    if (!spouse || !spouseNode) {
      console.warn(`Unresolved spouse id "${p.spouse}" for "${p.id}"`);
      return;
    }
    const key = [p.id, p.spouse].sort().join("|");
    if (drawnSpousePairs.has(key)) return;
    drawnSpousePairs.add(key);

    const selfNode = nodeById.get(p.id);
    const a = cardAnchor(selfNode, canvasRect);
    const b = cardAnchor(spouseNode, canvasRect);
    const husbandId = p.gender === "m" ? p.id : (spouse.gender === "m" ? spouse.id : null);
    const color = husbandId ? colorForFather(husbandId) : NEUTRAL_COLOR;
    appendConnectorPair(connectorsEl, p.id, p.spouse, "connector-spouse", a, b, color, centerX);
  });

  computeSiblingPairs(people).forEach(([aId, bId]) => {
    const aNode = nodeById.get(aId);
    const bNode = nodeById.get(bId);
    if (!aNode || !bNode) return;
    const a = cardAnchor(aNode, canvasRect);
    const b = cardAnchor(bNode, canvasRect);
    appendConnectorPair(connectorsEl, aId, bId, "connector-sibling", a, b, NEUTRAL_COLOR, centerX);
  });

  if (highlightedId) highlightPerson(highlightedId);
}

function highlightPerson(id) {
  connectorsEl.querySelectorAll(".connector").forEach((el) => {
    const related = el.dataset.a === id || el.dataset.b === id;
    el.classList.toggle("highlighted", related);
    el.classList.toggle("dimmed", !related);
  });
}

function clearHighlight() {
  connectorsEl.querySelectorAll(".connector").forEach((el) => {
    el.classList.remove("highlighted", "dimmed");
  });
}

canvas.addEventListener("click", () => {
  clearHighlight();
  highlightedId = null;
});

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
        parents: Array.isArray(p.parents) ? p.parents.filter(Boolean) : [],
        spouse: p.spouse || null,
        gender: p.gender || null,
        _date: d,
        _yearPos: yearFraction(d),
      };
    }).sort((a, b) => a._date - b._date);

    updateNextBirthdayBanner(people);

    const pxPerYear = Number(getComputedStyle(document.documentElement).getPropertyValue("--px-per-year")) || 20;
    const minGap = Number(getComputedStyle(document.documentElement).getPropertyValue("--min-gap")) || 120;

    const { pos, minYear, maxYear, contentSize } = computePositions(people, pxPerYear, minGap);

    applyCanvasSize(contentSize);
    renderTicks(minYear, maxYear, pxPerYear);
    renderPeople(people, pos);
    drawConnectors(people);
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
  syncHeaderClearance();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(loadAndRender, 150);
});

setInterval(loadAndRender, 60 * 1000);

syncHeaderClearance();
loadAndRender();
