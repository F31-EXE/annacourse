/* Одна арка на весь сайт: поворачивается и переезжает по прокрутке,
   а при смене секции «перегенерируется» в новом материале. См. DESIGN.md. */

(() => {
  const promptEl = document.getElementById('prompt');
  const haloEl = document.getElementById('halo');
  const canvas = document.getElementById('scene');
  const sections = [...document.querySelectorAll('[data-pose]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- материалы ---------- */
  const MATS = {
    plaster:    { base: '#e4d6c2', rough: .95, key: '#ffe2c4', prompt: '/форма: арка · материал: штукатурка · свет: утро' },
    travertine: { base: '#d6c09c', rough: .8,  key: '#ffbf8f', prompt: '/материал: травертин · свет: закат' },
    walnut:     { base: '#6a4428', rough: .5,  key: '#ffd8b0', prompt: '/материал: орех · фактура: масло · свет: вечер' },
    terracotta: { base: '#b4552f', rough: .9,  key: '#ffd0a0', prompt: '/материал: терракота · настроение: средиземноморье' },
  };

  /* ---------- позиции арки по секциям ----------
     x — доля половины ширины экрана, y — мировые единицы, s — масштаб, ry/rx — поворот */
  const POSES = {
    hero:      { x: .42, y: -.05, s: 1,   ry: -.55, rx: .1 },
    idea:      { x: 0,   y: -.05, s: .95, ry: .62,  rx: .04 },
    materials: { x: 0,   y: 0,    s: 1,   ry: -.32, rx: .04 },
    program:   { x: .52, y: -.05, s: .82, ry: .9,   rx: .06 },
    join:      { x: 0,   y: .05,  s: .72, ry: 0,    rx: 0 },
  };
  const MOBILE_Y = { hero: -.62, idea: .78, materials: .78, program: .78, join: .78 };

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

  /* ---------- навигация: активный пункт ---------- */
  const navLinks = [...document.querySelectorAll('.nav-links a')];
  const navFor = { intro: 'intro', idea: 'idea', materials: 'idea', program: 'program', join: 'join' };
  function setActiveNav(sectionId) {
    const target = '#' + navFor[sectionId];
    navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === target));
  }

  /* ---------- форма ---------- */
  document.getElementById('leadForm').addEventListener('submit', e => {
    e.preventDefault();
    e.currentTarget.classList.add('done');
  });

  /* ---------- выбор материала ---------- */
  let chosenMat = 'walnut';
  const chips = [...document.querySelectorAll('.chip')];
  chips.forEach(chip => chip.addEventListener('click', () => {
    chosenMat = chip.dataset.mat;
    chips.forEach(c => c.setAttribute('aria-checked', String(c === chip)));
    if (activeSection && activeSection.dataset.mat === 'choice') regenerate(chosenMat);
  }));

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

  if (!renderer) {
    // без WebGL — только навигация
    const update = () => {
      const mid = scrollY + innerHeight / 2;
      const sec = sections.reduce((a, b) => Math.abs(center(b) - mid) < Math.abs(center(a) - mid) ? b : a);
      setActiveNav(sec.id);
    };
    addEventListener('scroll', update, { passive: true });
    update();
    return;
  }

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
  camera.position.set(0, .7, 9);
  camera.lookAt(0, 0, 0);

  // свет: тёплый ключ сверху справа, контровой сзади, мягкая заливка слева
  scene.add(new THREE.AmbientLight('#ffe6cc', .45));
  const key = new THREE.DirectionalLight('#ffe2c4', 2.6);
  key.position.set(4, 5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#ffa860', 3.2);
  rim.position.set(3.5, 3, -5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight('#ffe9d6', .35);
  fill.position.set(-5, 0, 3);
  scene.add(fill);

  /* процедурные текстуры */
  function rand(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
  function makeTexture(kind, base) {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const r = rand(kind.length * 7919);
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);

    const speckle = (n, alpha, size) => {
      for (let i = 0; i < n; i++) {
        g.fillStyle = r() > .5 ? `rgba(255,255,255,${alpha})` : `rgba(40,20,10,${alpha})`;
        g.fillRect(r() * 512, r() * 512, size, size);
      }
    };
    const blotch = (n, alpha, rmax) => {
      for (let i = 0; i < n; i++) {
        const x = r() * 512, y = r() * 512, rad = 20 + r() * rmax;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        const dark = r() > .5;
        grd.addColorStop(0, dark ? `rgba(60,30,15,${alpha})` : `rgba(255,245,230,${alpha})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    };

    if (kind === 'plaster') {
      blotch(40, .06, 120);
      speckle(16000, .05, 1.5);
    }
    if (kind === 'travertine') {
      for (let y = 0; y < 512; y += 2 + r() * 6) {
        g.fillStyle = r() > .5 ? `rgba(255,248,235,${.08 + r() * .1})` : `rgba(120,90,55,${.05 + r() * .12})`;
        g.fillRect(0, y, 512, 1 + r() * 3);
      }
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(90,65,40,${.15 + r() * .25})`;
        g.beginPath();
        g.ellipse(r() * 512, r() * 512, 1 + r() * 5, .6 + r() * 1.4, 0, 0, Math.PI * 2);
        g.fill();
      }
      speckle(5000, .04, 1);
    }
    if (kind === 'walnut') {
      g.lineWidth = 1.2;
      for (let i = 0; i < 140; i++) {
        const x0 = r() * 512, amp = 3 + r() * 10, f = .008 + r() * .02, ph = r() * 6;
        g.strokeStyle = r() > .35 ? `rgba(30,15,6,${.12 + r() * .25})` : `rgba(210,160,110,${.08 + r() * .12})`;
        g.beginPath();
        for (let y = 0; y <= 512; y += 8) g.lineTo(x0 + Math.sin(y * f + ph) * amp, y);
        g.stroke();
      }
    }
    if (kind === 'terracotta') {
      blotch(60, .1, 90);
      speckle(9000, .07, 1.5);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(.55, .55);
    tex.anisotropy = 4;
    return tex;
  }
  const TEX = Object.fromEntries(Object.entries(MATS).map(([k, m]) => [k, makeTexture(k, m.base)]));

  /* геометрия арки: портал с полукруглым верхом */
  const shape = new THREE.Shape();
  const R = .86, H = 1.5, r = .5, h = 1.36;
  shape.moveTo(-R, 0);
  shape.lineTo(-R, H);
  shape.absarc(0, H, R, Math.PI, 0, true);
  shape.lineTo(R, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, h);
  shape.absarc(0, h, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  shape.closePath();

  const depth = .42;
  const archGeo = new THREE.ExtrudeGeometry(shape, {
    depth, curveSegments: 64, bevelEnabled: true,
    bevelThickness: .025, bevelSize: .025, bevelSegments: 3,
  });
  archGeo.translate(0, -1.12, -depth / 2);

  const archMat = new THREE.MeshStandardMaterial({ map: TEX.plaster, roughness: MATS.plaster.rough, metalness: 0 });
  const arch = new THREE.Mesh(archGeo, archMat);

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, .16, .95),
    new THREE.MeshStandardMaterial({ color: '#2a1a0f', roughness: .75 })
  );
  plinth.position.y = -1.12 - .08 - .025;

  const group = new THREE.Group();
  group.add(arch, plinth);
  scene.add(group);

  /* смена материала: оборот на 360°, текстура меняется на середине */
  let currentMat = null;
  let pendingMat = null;
  let spin = null; // { t0, swapped }
  const SPIN_MS = 900;

  function applyMat(name) {
    archMat.map = TEX[name];
    archMat.roughness = MATS[name].rough;
    archMat.needsUpdate = true;
    key.color.set(MATS[name].key);
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
  function center(sec) { return sec.offsetTop + sec.offsetHeight / 2; }
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
    // держим позу у центра секции, двигаемся в промежутке
    let t = (mid - cs[i]) / (cs[i + 1] - cs[i]);
    t = smooth(Math.min(1, Math.max(0, (t - .2) / .6)));
    const pose = {};
    for (const k in a) pose[k] = lerp(a[k], b[k], t);
    return { pose, near: t < .5 ? sections[i] : sections[i + 1] };
  }

  function onSection(sec) {
    if (sec === activeSection) return;
    activeSection = sec;
    setActiveNav(sec.id);
    const m = sec.dataset.mat === 'choice' ? chosenMat : sec.dataset.mat;
    regenerate(m);
  }

  /* ---------- размеры ---------- */
  let halfW = 1, halfH = 1;
  function resize() {
    const w = innerWidth, h = innerHeight;
    isMobile = w < 900;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    halfH = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    halfW = halfH * camera.aspect;
  }
  addEventListener('resize', resize);
  resize();

  /* ---------- цикл ---------- */
  const cur = { ...POSES.hero };
  let first = true;
  const v = new THREE.Vector3();

  function toScreen(local) {
    v.copy(local);
    group.localToWorld(v);
    v.project(camera);
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
  }

  function frame(now) {
    const { pose, near } = targetPose();
    onSection(near);

    const k = first ? 1 : .09;
    first = false;
    for (const key in cur) cur[key] = lerp(cur[key], pose[key], k);

    let spinAngle = 0;
    if (spin) {
      const t = Math.min(1, (now - spin.t0) / SPIN_MS);
      spinAngle = smooth(t) * Math.PI * 2;
      if (!spin.swapped && t >= .5) { applyMat(currentMat); spin.swapped = true; }
      if (t >= 1) {
        spin = null;
        if (pendingMat && pendingMat !== currentMat) { const m = pendingMat; pendingMat = null; regenerate(m); }
        else pendingMat = null;
      }
    }

    const breath = reduced ? 0 : Math.sin(now / 1600) * .05;
    const sway = reduced ? 0 : Math.sin(now / 2600) * .06;
    group.position.set(cur.x * halfW, cur.y + breath, 0);
    group.scale.setScalar(cur.s);
    group.rotation.set(cur.rx, cur.ry + sway + spinAngle, 0);

    renderer.render(scene, camera);

    // ореол и строка промпта следуют за объектом
    const [hx, hy] = toScreen(new THREE.Vector3(0, .1, 0));
    haloEl.style.transform = `translate(${hx}px, ${hy}px)`;
    const [px, py] = toScreen(new THREE.Vector3(0, -1.3, .5));
    const pw = promptEl.offsetWidth;
    const x = Math.min(Math.max(px - pw / 2, 16), innerWidth - pw - 16);
    promptEl.style.transform = `translate(${x}px, ${py + 16}px)`;

    requestAnimationFrame(frame);
  }

  applyMat('plaster');
  requestAnimationFrame(frame);
})();
