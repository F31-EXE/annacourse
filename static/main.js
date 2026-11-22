/* Одно кресло-«облако» на весь сайт: поворачивается и переезжает по прокрутке,
   а при смене секции «перегенерируется» в новой обивке. См. DESIGN.md. */

(() => {
  const promptEl = document.getElementById('prompt');
  const haloEl = document.getElementById('halo');
  const canvas = document.getElementById('scene');
  const sections = [...document.querySelectorAll('[data-pose]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- обивки ---------- */
  const MATS = {
    boucle:  { color: '#efe5d6', rough: 1,   sheen: .8, sheenRough: .8, sheenColor: '#ffffff', clearcoat: 0,  bump: 4,  repeat: 3,   key: '#ffe2c4',
               prompt: '/кресло: облако · обивка: букле · свет: утро' },
    velvet:  { color: '#8a3320', rough: .75, sheen: 1,  sheenRough: .3, sheenColor: '#ffae85', clearcoat: 0,  bump: .5, repeat: 1,   key: '#ffbf8f',
               prompt: '/обивка: бархат, ржавый · свет: закат' },
    leather: { color: '#8f4f26', rough: .4,  sheen: 0,  sheenRough: 1,  sheenColor: '#000000', clearcoat: .35, bump: .5, repeat: 2, key: '#ffd8b0',
               prompt: '/обивка: кожа, коньяк · свет: вечер' },
    linen:   { color: '#cdbfa6', rough: .95, sheen: .3, sheenRough: .9, sheenColor: '#fff4e0', clearcoat: 0,  bump: 2.5, repeat: 3, key: '#ffe6c8',
               prompt: '/обивка: лён · настроение: средиземноморье' },
  };

  /* ---------- позиции кресла по секциям ----------
     x — доля половины ширины экрана, y — мировые единицы, s — масштаб, ry/rx — поворот */
  const POSES = {
    hero:      { x: .42, y: .05, s: 1,    ry: -.6,  rx: .12 },
    idea:      { x: -.07, y: .05, s: .7,  ry: .65,  rx: .06 },
    materials: { x: 0,   y: .1,  s: .74,  ry: -.3,  rx: .08 },
    program:   { x: .55, y: .05, s: .78,  ry: .95,  rx: .08 },
    join:      { x: -.06, y: .15, s: .56, ry: .1,   rx: .04 },
  };
  const MOBILE_Y = { hero: -.55, idea: .85, materials: .85, program: .85, join: .85 };

  /* ---------- строка промпта ---------- */
  let typingId = 0;
  async function typePrompt(text) {
    const id = ++typingId;
    if (reduced) { promptEl.textContent = text; return; }
    for (let i = 0; i <= text.length; i++) {
      if (id !== typingId) return;
      promptEl.textContent = text.slice(0, i);
      await new Promise(r => setTimeout(r, 16));
    }
  }

  /* ---------- навигация: активный пункт по секции в центре экрана ---------- */
  const navLinks = [...document.querySelectorAll('.nav-links a')];
  const navSections = [...document.querySelectorAll('section[data-nav-for]')];
  function updateNav() {
    const mid = innerHeight / 2;
    const sec = navSections.find(s => { const r = s.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; });
    if (!sec) return;
    navLinks.forEach(a => a.classList.toggle('active', a.dataset.nav === sec.dataset.navFor));
  }
  addEventListener('scroll', updateNav, { passive: true });
  updateNav();

  /* ---------- выбор обивки ---------- */
  let chosenMat = 'leather';
  const chips = [...document.querySelectorAll('#materials .chip')];
  chips.forEach(chip => chip.addEventListener('click', () => {
    chosenMat = chip.dataset.mat;
    chips.forEach(c => c.setAttribute('aria-checked', String(c === chip)));
    if (activeSection && activeSection.dataset.mat === 'choice') regenerate(chosenMat);
  }));

  function center(sec) { return sec.offsetTop + sec.offsetHeight / 2; }

  /* ---------- 3D ---------- */
  let renderer;
  try {
    if (!window.THREE) throw new Error('three.js не загрузился');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    document.documentElement.classList.add('no-3d');
    console.warn('3D недоступно:', err.message);
  }

  let activeSection = null;
  let regenerate = () => {};

  if (!renderer) return;

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
  camera.position.set(0, 1.4, 9);
  camera.lookAt(0, 0, 0);

  // свет: тёплый ключ сверху справа, контровой сзади, мягкая заливка слева
  scene.add(new THREE.AmbientLight('#ffe6cc', .5));
  const key = new THREE.DirectionalLight('#ffe2c4', 2.6);
  key.position.set(4, 5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#ffa860', 3.4);
  rim.position.set(3.5, 3, -5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight('#ffe9d6', .4);
  fill.position.set(-5, 1, 3);
  scene.add(fill);

  /* ---------- процедурные текстуры ---------- */
  function rand(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

  function makeTexture(kind, repeat) {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const r = rand(kind.length * 7919 + 13);
    // светлая база: цвет задаёт материал, текстура даёт рисунок и рельеф
    g.fillStyle = '#d8d8d8';
    g.fillRect(0, 0, 512, 512);

    if (kind === 'boucle') {
      // мелкие петли
      for (let i = 0; i < 5200; i++) {
        const x = r() * 512, y = r() * 512, rad = 1.5 + r() * 3.5;
        g.strokeStyle = r() > .45 ? `rgba(255,255,255,${.5 + r() * .5})` : `rgba(90,90,90,${.35 + r() * .35})`;
        g.lineWidth = 1 + r() * 1.5;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.stroke();
      }
    }
    if (kind === 'velvet') {
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = r() > .5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)';
        g.fillRect(r() * 512, r() * 512, 2, 2);
      }
    }
    if (kind === 'leather') {
      // зерно кожи и мягкие пятна
      for (let i = 0; i < 40; i++) {
        const x = r() * 512, y = r() * 512, rad = 30 + r() * 90;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, r() > .5 ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.18)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < 7000; i++) {
        g.fillStyle = `rgba(60,60,60,${.15 + r() * .25})`;
        g.beginPath();
        g.ellipse(r() * 512, r() * 512, .8 + r() * 2, .6 + r() * 1.5, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (kind === 'linen') {
      // полотняное плетение с утолщениями нитей
      for (let y = 0; y < 512; y += 4) {
        g.fillStyle = `rgba(${r() > .5 ? '255,255,255' : '70,70,70'},${.18 + r() * .2})`;
        g.fillRect(0, y, 512, 2);
      }
      for (let x = 0; x < 512; x += 4) {
        g.fillStyle = `rgba(${r() > .5 ? '255,255,255' : '70,70,70'},${.14 + r() * .18})`;
        g.fillRect(x, 0, 2, 512);
      }
      for (let i = 0; i < 90; i++) {
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.fillRect(r() * 512, Math.floor(r() * 128) * 4, 20 + r() * 60, 2);
      }
    }
    if (kind === 'walnut') {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 512, 512);
      g.lineWidth = 1.2;
      for (let i = 0; i < 150; i++) {
        const y0 = r() * 512, amp = 3 + r() * 9, f = .008 + r() * .02, ph = r() * 6;
        g.strokeStyle = r() > .3 ? `rgba(0,0,0,${.12 + r() * .28})` : `rgba(255,230,200,${.1 + r() * .15})`;
        g.beginPath();
        for (let x = 0; x <= 512; x += 8) g.lineTo(x, y0 + Math.sin(x * f + ph) * amp);
        g.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = 8;
    return tex;
  }
  const TEX = Object.fromEntries(Object.entries(MATS).map(([k, m]) => [k, makeTexture(k, m.repeat)]));

  /* ---------- кресло-«облако» ----------
     круглое деревянное основание, пухлая подушка сиденья,
     мягкий подлокотник-кольцо и более высокая спинка — всё из округлых объёмов */
  const upholstery = new THREE.MeshPhysicalMaterial({ color: MATS.boucle.color, roughness: 1, metalness: 0 });

  const chair = new THREE.Group();

  // подушка сиденья: «таблетка» через LatheGeometry
  function puffProfile(R, h, cr, steps = 10) {
    const pts = [new THREE.Vector2(0, -h / 2)];
    for (let i = 0; i <= steps; i++) {            // нижнее скругление
      const a = -Math.PI / 2 + (i / steps) * Math.PI / 2;
      pts.push(new THREE.Vector2(R - cr + Math.cos(a) * cr, -h / 2 + cr + Math.sin(a) * cr));
    }
    for (let i = 0; i <= steps; i++) {            // верхнее скругление
      const a = (i / steps) * Math.PI / 2;
      pts.push(new THREE.Vector2(R - cr + Math.cos(a) * cr, h / 2 - cr + Math.sin(a) * cr));
    }
    pts.push(new THREE.Vector2(0, h / 2 + .03));  // чуть выпуклый верх
    return pts;
  }
  const seat = new THREE.Mesh(new THREE.LatheGeometry(puffProfile(.98, .44, .2), 96), upholstery);
  seat.position.y = -.47;
  chair.add(seat);

  // мягкие валики: дуга тора + сферы-заглушки на концах
  function roll(R, tube, arc, y) {
    const g = new THREE.Group();
    const geo = new THREE.TorusGeometry(R, tube, 40, 160, arc);
    geo.rotateX(-Math.PI / 2);
    const start = Math.PI / 2 - arc / 2;          // дуга симметрична относительно спинки
    geo.rotateY(start);
    g.add(new THREE.Mesh(geo, upholstery));
    for (const t of [start, start + arc]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(tube, 40, 24), upholstery);
      cap.position.set(Math.cos(t) * R, 0, -Math.sin(t) * R);
      g.add(cap);
    }
    g.position.y = y;
    return g;
  }
  chair.add(roll(.98, .31, Math.PI * 1.32, -.22));   // подлокотники
  chair.add(roll(.9, .29, Math.PI * .78, .26));      // спинка

  // основание из ореха
  const walnutTex = makeTexture('walnut', 1);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(.86, .8, .14, 96),
    new THREE.MeshStandardMaterial({ color: '#5b3a22', map: walnutTex, roughness: .55 })
  );
  base.position.y = -.77;
  chair.add(base);

  const group = new THREE.Group();
  group.add(chair);
  scene.add(group);

  /* ---------- смена обивки: оборот на 360°, ткань меняется на середине ---------- */
  let currentMat = null;
  let pendingMat = null;
  let spin = null;
  const SPIN_MS = 900;

  function applyMat(name) {
    const m = MATS[name];
    upholstery.color.set(m.color);
    upholstery.map = TEX[name];
    upholstery.bumpMap = TEX[name];
    upholstery.bumpScale = m.bump;
    upholstery.roughness = m.rough;
    upholstery.sheen = m.sheen;
    upholstery.sheenRoughness = m.sheenRough;
    upholstery.sheenColor.set(m.sheenColor);
    upholstery.clearcoat = m.clearcoat;
    upholstery.clearcoatRoughness = .5;
    upholstery.needsUpdate = true;
    key.color.set(m.key);
  }
  regenerate = name => {
    if (name === currentMat && !spin) return;
    if (spin) { pendingMat = name; return; }
    currentMat = name;
    typePrompt(MATS[name].prompt);
    if (reduced) { applyMat(name); return; }
    spin = { t0: performance.now(), swapped: false };
  };

  /* ---------- прокрутка → поза ---------- */
  const smooth = t => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;

  let isMobile = false;
  function poseFor(sec) {
    const p = { ...POSES[sec.dataset.pose] };
    if (isMobile) { p.x = 0; p.y = MOBILE_Y[sec.dataset.pose]; p.s *= .62; }
    return p;
  }

  function targetPose() {
    const mid = scrollY + innerHeight / 2;
    const cs = sections.map(center);
    let i = 0;
    while (i < cs.length - 1 && mid > cs[i + 1]) i++;
    const a = poseFor(sections[i]);
    if (i === cs.length - 1 || mid <= cs[0]) return { pose: a, near: sections[i] };
    const b = poseFor(sections[i + 1]);
    let t = (mid - cs[i]) / (cs[i + 1] - cs[i]);
    t = smooth(Math.min(1, Math.max(0, (t - .2) / .6)));
    const pose = {};
    for (const k in a) pose[k] = lerp(a[k], b[k], t);
    return { pose, near: t < .5 ? sections[i] : sections[i + 1] };
  }

  function onSection(sec) {
    if (sec === activeSection) return;
    activeSection = sec;
    regenerate(sec.dataset.mat === 'choice' ? chosenMat : sec.dataset.mat);
  }

  /* ---------- размеры ---------- */
  let halfW = 1;
  function resize() {
    const w = innerWidth, h = innerHeight;
    isMobile = w < 900;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const halfH = camera.position.length() * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    halfW = halfH * camera.aspect;
  }
  addEventListener('resize', resize);
  resize();

  /* ---------- пауза, пока кресло закрыто «сплошными» секциями ---------- */
  const solids = [...document.querySelectorAll('section.solid')];
  let hidden = false;
  function updateHidden() {
    let covered = 0;
    for (const s of solids) {
      const r = s.getBoundingClientRect();
      covered += Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    }
    const h = covered > innerHeight * .92;
    if (h !== hidden) {
      hidden = h;
      canvas.style.visibility = promptEl.style.visibility = haloEl.style.visibility = hidden ? 'hidden' : '';
    }
  }
  addEventListener('scroll', updateHidden, { passive: true });
  addEventListener('resize', updateHidden);
  updateHidden();

  /* ---------- цикл ---------- */
  const cur = { ...POSES.hero };
  let first = true;
  const v = new THREE.Vector3();
  const HALO_AT = new THREE.Vector3(0, -.1, 0);

  function toScreen(local) {
    v.copy(local);
    group.localToWorld(v);
    v.project(camera);
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
  }

  function frame(now) {
    if (hidden) { requestAnimationFrame(frame); return; }
    const { pose, near } = targetPose();
    onSection(near);

    const k = first ? 1 : .09;
    first = false;
    for (const p in cur) cur[p] = lerp(cur[p], pose[p], k);

    let spinAngle = 0;
    if (spin) {
      const t = Math.min(1, (now - spin.t0) / SPIN_MS);
      spinAngle = smooth(t) * Math.PI * 2;
      if (!spin.swapped && t >= .5) { applyMat(currentMat); spin.swapped = true; }
      if (t >= 1) {
        spin = null;
        const m = pendingMat; pendingMat = null;
        if (m && m !== currentMat) regenerate(m);
      }
    }

    const breath = reduced ? 0 : Math.sin(now / 1600) * .05;
    const sway = reduced ? 0 : Math.sin(now / 2600) * .06;
    group.position.set(cur.x * halfW, cur.y + breath, 0);
    group.scale.setScalar(cur.s);
    group.rotation.set(cur.rx, cur.ry + sway + spinAngle, 0);

    renderer.render(scene, camera);

    // ореол и строка промпта следуют за объектом
    const [hx, hy] = toScreen(HALO_AT);
    haloEl.style.transform = `translate(${hx}px, ${hy}px)`;
    // промпт не вращается вместе с креслом: точка под центром основания
    v.set(group.position.x, group.position.y - .95 * cur.s, .9 * cur.s).project(camera);
    const px = (v.x + 1) / 2 * innerWidth, py = (1 - v.y) / 2 * innerHeight;
    const pw = promptEl.offsetWidth;
    const x = Math.min(Math.max(px - pw / 2, 16), innerWidth - pw - 16);
    promptEl.style.transform = `translate(${x}px, ${py + 18}px)`;

    requestAnimationFrame(frame);
  }

  applyMat('boucle');
  requestAnimationFrame(frame);
})();
