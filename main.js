/* Hero: эскиз комнаты прорисовывается карандашом, затем «ИИ» превращает его в рендер.
   Геометрия описана один раз и используется для обоих слоёв. */

const NS = 'http://www.w3.org/2000/svg';
const W = 800;

const ell = (cx, cy, rx, ry) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

// перспективные линии пола сходятся в точку схода (400, 260)
const planks = [240, 280, 320, 360, 400, 440, 480, 520, 560]
  .map(x => `M${x} 400L${(400 + (x - 400) * 2.4286).toFixed(1)} 600`).join('');

/* sk: 'line' — рисуется штрихом, 'faint' — вспомогательная линия, false — только в рендере
   r: атрибуты для слоя рендера, false — только в эскизе */
const SHAPES = [
  // построение
  { d: 'M0 260H800', sk: 'faint', r: false },
  { d: 'M400 260L0 0M400 260L800 0M400 260L0 600M400 260L800 600', sk: 'faint', r: false },
  { d: 'M200 108H600M200 102V114M600 102V114', sk: 'faint', r: false },

  // комната
  { d: 'M0 0H800L600 120H200Z', r: { fill: 'url(#gCeil)' } },
  { d: 'M0 0L200 120V400L0 600Z', r: { fill: 'url(#gLeft)' } },
  { d: 'M800 0L600 120V400L800 600Z', r: { fill: 'url(#gRight)' } },
  { d: 'M200 120H600V400H200Z', r: { fill: 'url(#gBack)' } },
  { d: 'M200 400H600L800 600H0Z', r: { fill: 'url(#gFloor)' } },
  { d: planks, sk: 'faint', r: { fill: 'none', stroke: '#3d2616', 'stroke-opacity': .22, 'stroke-width': 1 } },
  { d: 'M200 393H600', sk: false, r: { stroke: '#F7F1E8', 'stroke-width': 6, fill: 'none' } },

  // окно-арка
  { d: 'M340 340V215A60 60 0 0 1 460 215V340Z', r: { fill: 'url(#gSky)' } },
  { d: 'M340 312Q372 290 404 304T460 298V340H340Z', sk: false, r: { fill: '#C79F7E', opacity: .55, 'clip-path': 'url(#windowClip)' } },
  { d: 'M340 326Q380 312 420 322T460 318V340H340Z', sk: false, r: { fill: '#A87E61', opacity: .55, 'clip-path': 'url(#windowClip)' } },
  { d: 'M400 155V340M340 262H460', r: { stroke: '#F8F3EC', 'stroke-width': 4, fill: 'none' } },
  { d: 'M340 340V215A60 60 0 0 1 460 215V340Z', sk: false, r: { fill: 'none', stroke: '#F8F3EC', 'stroke-width': 7 } },
  { d: 'M332 340H468V348H332Z', r: { fill: '#F8F3EC' } },

  // картина на левой стене
  { d: 'M58 168L152 213V302L58 322Z', r: { fill: '#6B4A33' } },
  { d: 'M68 184L142 220V294L68 310Z', r: { fill: 'url(#gArt)' } },
  { d: 'M78 268Q100 230 132 250', r: { fill: 'none', stroke: '#F4E6D4', 'stroke-width': 3, 'stroke-linecap': 'round' } },

  // полка и вазы на правой стене
  { d: 'M648 214L740 168V177L648 223Z', r: { fill: 'url(#gWood)' } },
  { d: 'M664 207Q658 194 666 180H676Q684 194 678 205Z', r: { fill: '#F2ECE3' } },
  { d: 'M692 194V172Q699 166 706 172V188Z', r: { fill: '#C2613F' } },

  // свет из окна на полу
  { d: 'M342 400H458L590 590H220Z', sk: false, r: { fill: 'url(#gBeam)' } },

  // ковёр
  { d: 'M190 440H610L700 560H100Z', r: { fill: '#ECE2D2' } },
  { d: 'M214 451H586L664 549H136Z', r: { fill: 'none', stroke: '#C2613F', 'stroke-width': 1.5, opacity: .7 } },

  // тени
  { d: ell(400, 424, 175, 12), sk: false, r: { fill: '#2b1a0e', opacity: .35, filter: 'url(#soft)' } },
  { d: ell(400, 534, 95, 10), sk: false, r: { fill: '#2b1a0e', opacity: .3, filter: 'url(#soft)' } },
  { d: ell(146, 542, 40, 7), sk: false, r: { fill: '#2b1a0e', opacity: .35, filter: 'url(#soft)' } },

  // диван
  { d: 'M250 416V428M550 416V428', r: { stroke: '#4a3322', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' } },
  { d: 'M250 330Q250 318 262 318H538Q550 318 550 330V372H250Z', r: { fill: 'url(#gLinen)' } },
  { d: 'M240 372H560V408Q560 416 552 416H248Q240 416 240 408Z', r: { fill: 'url(#gSeat)' } },
  { d: 'M228 350Q228 338 240 338H258V416H236Q228 416 228 408Z', r: { fill: 'url(#gLinen)' } },
  { d: 'M572 350Q572 338 560 338H542V416H564Q572 416 572 408Z', r: { fill: 'url(#gLinen)' } },
  { d: 'M400 374V412', r: { stroke: '#a8967e', 'stroke-width': 1.2, fill: 'none' } },
  { d: 'M280 370Q274 342 290 334L332 330Q342 350 337 370Z', r: { fill: '#C2613F' } },
  { d: 'M468 368Q464 342 478 332L518 336Q526 352 520 370Z', r: { fill: '#8A9A7B' } },
  { d: 'M330 370Q328 350 340 344L372 342Q378 356 374 372Z', r: { fill: '#EFE7DA' } },

  // растение
  { d: 'M146 470Q108 420 94 378Q140 410 146 470Z', r: { fill: '#5E7A55' } },
  { d: 'M146 470Q152 400 140 346Q178 400 146 470Z', r: { fill: '#7C9A6E' } },
  { d: 'M146 470Q186 420 208 394Q192 452 146 470Z', r: { fill: '#55704C' } },
  { d: 'M146 470Q118 442 78 440Q118 474 146 470Z', r: { fill: '#86A378' } },
  { d: 'M146 470Q168 430 186 360Q196 420 146 470Z', r: { fill: '#6A8A5F' } },
  { d: 'M120 470H172L164 540H128Z', r: { fill: 'url(#gClay)' } },

  // журнальный столик
  { d: 'M345 494L338 532M455 494L462 532M400 500V540', r: { stroke: '#4d3322', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' } },
  { d: 'M310 478V487A90 18 0 0 0 490 487V478Z', r: { fill: '#4d3322' } },
  { d: ell(400, 478, 90, 18), r: { fill: 'url(#gWood)' } },
  { d: 'M362 474H412V466H362Z', r: { fill: '#EFE7DA' } },
  { d: 'M366 466H408V460H366Z', r: { fill: '#C2613F' } },
  { d: 'M426 474Q418 460 428 446H438Q448 460 440 474Z', r: { fill: '#F2ECE3' } },
  { d: 'M433 446Q428 420 442 402M434 432Q446 426 452 414', r: { fill: 'none', stroke: '#6A5040', 'stroke-width': 1.5, 'stroke-linecap': 'round' } },

  // торшер
  { d: ell(610, 300, 70, 70), sk: false, r: { fill: 'url(#gGlow)' } },
  { d: ell(666, 546, 26, 6), r: { fill: '#2f2a24' } },
  { d: 'M666 546V300Q666 246 610 244', r: { fill: 'none', stroke: '#B8935A', 'stroke-width': 3.5, 'stroke-linecap': 'round' } },
  { d: 'M586 252H634L624 226H596Z', r: { fill: '#F4E9D6' } },

  // тёплый общий свет
  { d: 'M0 0H800V600H0Z', sk: false, r: { fill: 'url(#gWarm)' } },
  { d: 'M0 0H800V600H0Z', sk: false, r: { filter: 'url(#grain)', fill: '#000' } },
];

const PROMPT = '/imagine japandi living room, linen sofa, oak floor, warm sunset light, terracotta accents';

/* ---------- построение ---------- */
const svg = document.querySelector('#stage svg');
const gSketch = svg.querySelector('#sketch');
const gRender = svg.querySelector('#render');
const revealRect = svg.querySelector('#revealRect');
const scan = svg.querySelector('#scan');
const divider = svg.querySelector('#divider');
const notes = svg.querySelector('#notes');
const stage = document.getElementById('stage');
const status = document.getElementById('status');
const statusText = document.getElementById('statusText');
const promptEl = document.getElementById('prompt');
const handleZone = document.getElementById('handleZone');

const strokes = [];
for (const s of SHAPES) {
  if (s.sk !== false) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', s.d);
    if (s.sk === 'faint') p.classList.add('faint');
    gSketch.appendChild(p);
    strokes.push(p);
  }
  if (s.r) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', s.d);
    for (const [k, v] of Object.entries(s.r)) p.setAttribute(k, v);
    gRender.appendChild(p);
  }
}

/* ---------- утилиты анимации ---------- */
let runId = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function tween(from, to, ms, onUpdate, id) {
  return new Promise(resolve => {
    const t0 = performance.now();
    const step = now => {
      if (id !== runId) return resolve();
      const t = Math.min(1, (now - t0) / ms);
      onUpdate(from + (to - from) * ease(t));
      t < 1 ? requestAnimationFrame(step) : resolve();
    };
    requestAnimationFrame(step);
  });
}

function setSplit(x) {
  x = Math.max(0, Math.min(W, x));
  revealRect.setAttribute('width', x);
  divider.setAttribute('transform', `translate(${x} 0)`);
  scan.setAttribute('x', x - 90);
  handleZone.setAttribute('aria-valuenow', Math.round((x / W) * 100));
  current = x;
}
let current = 0;

function setStatus(text, mode) {
  statusText.textContent = text;
  status.classList.remove('ai', 'done');
  if (mode) status.classList.add(mode);
}

/* ---------- сценарий ---------- */
function resetSketch() {
  for (const p of strokes) {
    p.getAnimations().forEach(a => a.cancel());
    if (p.classList.contains('faint')) {
      p.style.opacity = 0;
    } else {
      const len = p.getTotalLength();
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
    }
  }
}

async function play() {
  const id = ++runId;
  stage.classList.remove('interactive');
  notes.classList.remove('show');
  divider.setAttribute('opacity', 0);
  scan.setAttribute('opacity', 0);
  promptEl.textContent = '';
  setSplit(0);
  resetSketch();
  setStatus('Рисуем эскиз…');

  // 1. карандашный эскиз
  let delay = 0;
  const anims = strokes.map(p => {
    let a;
    if (p.classList.contains('faint')) {
      a = p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay, fill: 'forwards' });
      delay += 40;
    } else {
      const len = parseFloat(p.style.strokeDasharray);
      const dur = Math.min(1100, 380 + len * 0.7);
      a = p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
        { duration: dur, delay, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' });
      delay += 75;
    }
    return a.finished.catch(() => {});
  });
  setTimeout(() => id === runId && notes.classList.add('show'), delay * 0.55);
  await Promise.all(anims);
  if (id !== runId) return;

  // 2. промпт
  setStatus('ИИ читает эскиз', 'ai');
  for (let i = 1; i <= PROMPT.length; i++) {
    if (id !== runId) return;
    promptEl.textContent = PROMPT.slice(0, i);
    await sleep(16);
  }
  await sleep(250);

  // 3. генерация — сканер проходит по эскизу
  setStatus('Генерирую рендер…', 'ai');
  scan.setAttribute('opacity', 1);
  divider.setAttribute('opacity', 1);
  await tween(0, W, 2600, setSplit, id);
  if (id !== runId) return;
  scan.setAttribute('opacity', 0);
  setStatus('Готово · 4,2 сек', 'done');
  await sleep(900);

  // 4. сравнение
  await tween(W, W * 0.6, 900, setSplit, id);
  if (id !== runId) return;
  stage.classList.add('interactive');
}

function showFinal() {
  runId++;
  for (const p of strokes) { p.style.strokeDasharray = 'none'; p.style.opacity = ''; }
  notes.classList.add('show');
  divider.setAttribute('opacity', 1);
  setSplit(W * 0.6);
  stage.classList.add('interactive');
}

/* ---------- перетаскивание ---------- */
function toSvgX(clientX) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = 0;
  return pt.matrixTransform(svg.getScreenCTM().inverse()).x;
}
let dragging = false;
handleZone.addEventListener('pointerdown', e => {
  dragging = true;
  handleZone.setPointerCapture(e.pointerId);
  setSplit(toSvgX(e.clientX));
});
handleZone.addEventListener('pointermove', e => dragging && setSplit(toSvgX(e.clientX)));
handleZone.addEventListener('pointerup', () => { dragging = false; });
handleZone.addEventListener('keydown', e => {
  const step = e.shiftKey ? 80 : 20;
  if (e.key === 'ArrowLeft') { setSplit(current - step); e.preventDefault(); }
  if (e.key === 'ArrowRight') { setSplit(current + step); e.preventDefault(); }
});

document.getElementById('replay').addEventListener('click', play);

/* ---------- старт ---------- */
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const start = () => (reduced ? showFinal() : play());
document.fonts ? document.fonts.ready.then(start) : start();
