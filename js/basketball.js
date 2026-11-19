const get = id => document.getElementById(id);
const ball = get("basketball");
const canvas = get("ball-canvas");
const stage = canvas.parentElement;
const card = get("orbit-card");
const dismiss = get("orbit-dismiss");
const pen = canvas.getContext("2d");
const select = get("ball-year");
const spin = get("ball-spin");
const ballView = get("ball-view");
const linearView = get("linear-view");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const fullTurn = Math.PI * 2;
const formatDate = new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", timeZone:"UTC" });
let yearIndex = new Map();
let points = [];
let visiblePoints = [];
let selectedYear;
let pinned = false;
let hideTimer;
let active = false;
let visible = false;
let spinning = !reducedMotion.matches;
let rotation = 0;
let pitch = -0.23;
let frame = 0;
let previousTime = 0;
let zoom = 1;
let previousFrame = 0;
let drag;

const seams = [
  t => [Math.sin(t), 0, Math.cos(t)],
  t => [0, Math.sin(t), Math.cos(t)],
  ...[-1, 1].map(side => t => {
    const x = side * (.46 + .22 * Math.cos(t) ** 2);
    const radius = Math.sqrt(1 - x * x);
    return [x, radius * Math.sin(t), radius * Math.cos(t)];
  })
].map(curve => Array.from({ length: 145 }, (_, i) => curve(i * fullTurn / 144)));

function updateSpinButton() {
  const rotating = spinning && card.hidden;
  spin.setAttribute("aria-pressed", String(rotating));
  spin.textContent = rotating ? "Pause rotation" : "Play rotation";
}

function setSpin(state) {
  spinning = state;
  updateSpinButton();
  queueFrame();
}

function closeCard() {
  clearTimeout(hideTimer);
  if (card.contains(document.activeElement)) select.focus({preventScroll:true});
  card.hidden = true;
  updateSpinButton();
  selectedYear = undefined;
  select.value = "";
  pinned = false;
  previousTime = 0;
  queueFrame();
}

function scheduleClose() {
  clearTimeout(hideTimer);
  if (!pinned && !card.contains(document.activeElement)) {
    hideTimer = setTimeout(closeCard, 300);
  }
}

function pointAt(event) {
  const bounds = canvas.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  return visiblePoints.reduce((best, point) => {
    const distance = Math.hypot(x - point.x, y - point.y) + (point.z < 0 ? 3 : 0);
    return distance < best.distance ? {point,distance} : best;
  }, {distance:event.pointerType === "touch" ? 20 : 13}).point;
}

function placeCard(point) {
  const gap = 12;
  const space = canvas.clientWidth;
  const left = point.x + gap + card.offsetWidth <= space - gap
    ? point.x + gap : point.x - card.offsetWidth - gap;
  card.style.left = Math.max(gap, Math.min(left, space - card.offsetWidth - gap)) + "px";
  const top = Math.min(point.y - 14, canvas.clientHeight - card.offsetHeight - gap);
  card.style.top = Math.max(gap, top) + "px";
}

function showYear(year, center = false) {
  clearTimeout(hideTimer);
  card.hidden = false;
  updateSpinButton();
  selectedYear = year;
  select.value = year;
  get("ball-heading").textContent = year;
  const links = yearIndex.get(year).map(quote => {
    const link = document.createElement("a");
    link.href = "#quote/" + quote.id;
    const date = document.createElement("time");
    date.dateTime = quote.date;
    date.textContent = formatDate.format(new Date(quote.date));
    const text = document.createElement("span");
    text.textContent = "“" + quote.text + "”";
    const speaker = document.createElement("small");
    speaker.textContent = quote.speaker;
    link.append(date, text, speaker);
    return link;
  });
  get("ball-quotes").replaceChildren(...links);
  if (center) rotation = -points.find(point => point.year === year).angle;
  queueFrame();
}

function queueFrame() {
  if (pen && active && visible && !frame) frame = requestAnimationFrame(draw);
}

function draw(now) {
  frame = 0;
  if (!active || !visible) {
    previousTime = 0;
    previousFrame = 0;
    return;
  }
  const rotate = spinning && !drag && card.hidden;
  if (rotate && previousTime) rotation += Math.min(now - previousTime, 35) * .00025;
  previousTime = rotate ? now : 0;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const scale = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
  }
  const zoomTarget = card.hidden || reducedMotion.matches ? 1 : 1.06;
  const elapsed = previousFrame ? Math.min(now - previousFrame, 35) : 16;
  zoom += (zoomTarget - zoom) * (1 - Math.exp(-elapsed / 110));
  const zooming = Math.abs(zoom - zoomTarget) > .0003;
  if (!zooming) zoom = zoomTarget;
  previousFrame = rotate || zooming ? now : 0;
  const radius = Math.min(width, height) * .43 * zoom;
  if (radius <= 0) return;
  const cx = width / 2;
  const cy = height / 2;
  const sin = Math.sin(rotation), cos = Math.cos(rotation);
  const tiltSin = Math.sin(pitch), tiltCos = Math.cos(pitch);
  const project = ([x,y,z]) => {
    const depth = z * cos - x * sin;
    return [cx + radius * (x * cos + z * sin), cy - radius * (y * tiltCos - depth * tiltSin), y * tiltSin + depth * tiltCos];
  };

  pen.setTransform(scale, 0, 0, scale, 0, 0);
  pen.clearRect(0, 0, width, height);
  pen.beginPath();
  pen.arc(cx, cy, radius, 0, fullTurn);
  pen.strokeStyle = "#666";
  pen.lineWidth = 1;
  pen.stroke();

  for (const side of [-1, 1]) {
    pen.beginPath();
    for (const seam of seams) {
      let onFace = false;
      for (const point of seam) {
        const [x,y,z] = project(point);
        const visible = z * side >= 0;
        if (visible) {
          if (onFace) pen.lineTo(x,y);
          else pen.moveTo(x,y);
        }
        onFace = visible;
      }
    }
    pen.strokeStyle = side < 0 ? "#383838" : "#aaa";
    pen.lineWidth = side < 0 ? 1 : Math.max(1.5, radius * .006);
    pen.stroke();
  }

  visiblePoints = points.map(point => {
    const [x,y,z] = project(point.vector);
    return { ...point,x,y,z };
  }).sort((a,b) => a.z - b.z);
  for (const point of visiblePoints) {
    const selected = point.year === selectedYear;
    const size = selected ? 6 : point.z < 0 ? 2.3 : 2.5 + point.z * 2;
    pen.beginPath();
    pen.arc(point.x, point.y, size, 0, fullTurn);
    pen.fillStyle = selected ? "#fff" : "rgba(255,255,255," + (point.z < 0 ? .32 : .60 + point.z * .35) + ")";
    pen.fill();
    if (selected || (Number(point.year) % 10 === 0 && point.z > .55)) {
      pen.font = "13px SemiMono, monospace";
      pen.lineWidth = 3;
      pen.strokeStyle = "#161616";
      pen.strokeText(point.year, point.x + 8, point.y - 6);
      pen.fillStyle = "#fff";
      pen.fillText(point.year, point.x + 8, point.y - 6);
    }
  }
  if (!card.hidden) {
    const point = visiblePoints.find(entry => entry.year === selectedYear);
    if (point) placeCard(point);
  }
  if (rotate || zooming) queueFrame();
}

function switchView(value) {
  if (!value) closeCard();
  active = value;
  ballView.setAttribute("aria-pressed", String(value));
  linearView.setAttribute("aria-pressed", String(!value));
  ball.hidden = !value || !yearIndex.size;
  get("timeline").hidden = value || !yearIndex.size;
  get("entries").hidden = value && yearIndex.size > 0;
  queueFrame();
}

export const isBasketballView = () => active;
ballView.addEventListener("click", () => switchView(true));
linearView.addEventListener("click", () => switchView(false));
select.addEventListener("change", () => {
  if (!select.value) {
    closeCard();
    return;
  }
  pinned = true;
  pitch = -.23;
  showYear(select.value, true);
});
spin.addEventListener("click", () => {
  if (!card.hidden) {
    closeCard();
    setSpin(true);
  } else setSpin(!spinning);
});
dismiss.addEventListener("click", closeCard);
stage.addEventListener("keydown", event => {
  if (event.key === "Escape" && !card.hidden) closeCard();
});
card.addEventListener("pointerenter", () => clearTimeout(hideTimer));
card.addEventListener("pointerleave", scheduleClose);
card.addEventListener("focusin", () => clearTimeout(hideTimer));
canvas.addEventListener("pointerleave", scheduleClose);
reducedMotion.addEventListener("change", event => setSpin(!event.matches));
setSpin(spinning);

new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting;
  if (!visible) previousTime = 0;
  queueFrame();
}).observe(canvas);
new ResizeObserver(queueFrame).observe(canvas);

canvas.addEventListener("pointerdown", event => {
  if (event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  drag = {id:event.pointerId, x:event.clientX, y:event.clientY, rotation, pitch, moved:false};
});
canvas.addEventListener("pointermove", event => {
  if (!drag) {
    if (event.pointerType === "touch") return;
    const point = pointAt(event);
    canvas.classList.toggle("over-point", Boolean(point));
    if (pinned) return;
    if (!point) scheduleClose();
    else if (point.year !== selectedYear) showYear(point.year);
    else clearTimeout(hideTimer);
    return;
  }
  if (drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (Math.hypot(dx, dy) < 5 && !drag.moved) return;
  if (!drag.moved) closeCard();
  drag.moved = true;
  setSpin(false);
  rotation = drag.rotation + dx * .01;
  pitch = Math.max(-1.3, Math.min(1.3, drag.pitch + dy * .008));
  queueFrame();
});
canvas.addEventListener("pointerup", event => {
  if (drag?.id !== event.pointerId) return;
  if (!drag.moved) {
    const point = pointAt(event);
    if (point) {
      pinned = true;
      showYear(point.year);
    } else closeCard();
  }
  drag = null;
  queueFrame();
});
canvas.addEventListener("lostpointercapture", () => {
  drag = null;
  queueFrame();
});

function pointNoise(seed) {
  const hashed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  return ((hashed ^ (hashed >>> 16)) >>> 0) / 0x100000000;
}

export function renderBasketball(index) {
  yearIndex = index;
  points = [];
  closeCard();
  select.replaceChildren(new Option("Choose year", ""));
  for (const year of index.keys()) {
    const position = Number(year) - 1970;
    // Each year gets a longitude interval so dispersion never changes the sequence.
    const angleOffset = .15 + .7 * pointNoise(position * 173 + 491);
    const angle = (position + angleOffset) * fullTurn / 57;
    const latitude = Math.asin((pointNoise(position * 521 + 137) * 2 - 1) * .86);
    const radius = Math.cos(latitude);
    points.push({year,angle,vector:[radius * Math.sin(angle), Math.sin(latitude), radius * Math.cos(angle)]});
    select.add(new Option(year, year));
  }
  switchView(active);
}
