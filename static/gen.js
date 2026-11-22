/* Блок «Было — стало»: несколько кейсов (вкладки). Рендер мягко «распускается»
   поверх исходника акварельными пятнами и одновременно наводится на резкость.
   Потом можно сравнить слайдером. */

(() => {
  const frame = document.getElementById('genFrame');
  const canvas = document.getElementById('genCanvas');
  const ctx = canvas.getContext('2d');
  const promptEl = document.getElementById('genPrompt');
  const bar = document.getElementById('genBar');
  const stepEl = document.getElementById('genStep');
  const handle = document.getElementById('genHandle');
  const replay = document.getElementById('genReplay');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const labelEl = document.getElementById('genLabel');
  const tabs = [...document.querySelectorAll('.gen-tabs .chip')];
  let PROMPT = '';
  const STEPS = 30;
  const GEN_MS = 4600;

  const load = src => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });

  let collage, render;
  let W = 0, H = 0;
  const state = { p: 0, split: 1, compare: false };
  const layer = document.createElement('canvas');   // рендер с размытием и маской
  const layerCtx = layer.getContext('2d');
  const mask = document.createElement('canvas');    // маска проявления, в 1/4 разрешения
  const maskCtx = mask.getContext('2d');
  const small = document.createElement('canvas');   // запасной путь размытия
  const smallCtx = small.getContext('2d');
  const hasFilter = typeof layerCtx.filter === 'string';

  // точки, из которых «распускается» рендер: [x, y, задержка]
  const SEEDS = [
    [.5, .5, 0], [.24, .58, .1], [.77, .56, .06], [.36, .22, .18],
    [.66, .2, .14], [.5, .9, .22], [.1, .2, .28], [.92, .86, .3],
  ];
  const clamp01 = x => Math.min(1, Math.max(0, x));
  const smoothstep = t => t * t * (3 - 2 * t);

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.round(frame.clientWidth * dpr);
    H = Math.round(frame.clientHeight * dpr);
    canvas.width = layer.width = W;
    canvas.height = layer.height = H;
    mask.width = Math.ceil(W / 4);
    mask.height = Math.ceil(H / 4);
    draw();
  }

  // вписываем картинку с обрезкой (как object-fit: cover)
  function cover(img, c, w, h) {
    const s = Math.max(w / img.width, h / img.height);
    const iw = img.width * s, ih = img.height * s;
    c.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
  }

  function draw() {
    if (!collage || !render || !W) return;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    cover(collage, ctx, W, H);

    if (state.compare) {
      const x = Math.round(state.split * W);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, x, H);
      ctx.clip();
      cover(render, ctx, W, H);
      ctx.restore();
      // разделитель
      const dpr = W / frame.clientWidth;
      ctx.fillStyle = '#ffedd7';
      ctx.fillRect(x - dpr, 0, 2 * dpr, H);
      ctx.beginPath();
      ctx.arc(x, H / 2, 19 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#100904';
      ctx.fill();
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = '#ffedd7';
      ctx.stroke();
      ctx.beginPath();
      const a = 6 * dpr, b = 13 * dpr, c = 8 * dpr;
      ctx.moveTo(x - a, H / 2 - c); ctx.lineTo(x - b, H / 2); ctx.lineTo(x - a, H / 2 + c);
      ctx.moveTo(x + a, H / 2 - c); ctx.lineTo(x + b, H / 2); ctx.lineTo(x + a, H / 2 + c);
      ctx.lineWidth = 1.8 * dpr;
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.stroke();
      return;
    }

    const p = state.p;
    if (p <= 0) return;

    // 1. рендер с размытием, которое уходит к концу (наводка на резкость)
    const blur = 18 * Math.pow(1 - p, 1.6) * (W / 1000);
    layerCtx.globalCompositeOperation = 'source-over';
    layerCtx.clearRect(0, 0, W, H);
    if (blur < .3) {
      cover(render, layerCtx, W, H);
    } else if (hasFilter) {
      layerCtx.filter = `blur(${blur.toFixed(1)}px)`;
      cover(render, layerCtx, W, H);
      layerCtx.filter = 'none';
    } else {
      // без ctx.filter: уменьшаем и плавно растягиваем обратно
      const f = 1 + blur / 2;
      small.width = Math.ceil(W / f); small.height = Math.ceil(H / f);
      smallCtx.imageSmoothingEnabled = true;
      cover(render, smallCtx, small.width, small.height);
      layerCtx.imageSmoothingEnabled = true;
      layerCtx.drawImage(small, 0, 0, W, H);
    }

    // 2. маска: мягкие пятна растут из нескольких точек
    if (p < 1) {
      const mw = mask.width, mh = mask.height, diag = Math.hypot(mw, mh);
      maskCtx.clearRect(0, 0, mw, mh);
      for (const [sx, sy, delay] of SEEDS) {
        const t = smoothstep(clamp01((p - delay) / (1 - delay)));
        if (t <= 0) continue;
        const r = t * diag * .9;
        const gr = maskCtx.createRadialGradient(sx * mw, sy * mh, 0, sx * mw, sy * mh, r);
        gr.addColorStop(0, 'rgba(0,0,0,1)');
        gr.addColorStop(.5, 'rgba(0,0,0,.9)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        maskCtx.fillStyle = gr;
        maskCtx.fillRect(0, 0, mw, mh);
      }
      layerCtx.globalCompositeOperation = 'destination-in';
      layerCtx.imageSmoothingEnabled = true;
      layerCtx.drawImage(mask, 0, 0, W, H);
      layerCtx.globalCompositeOperation = 'source-over';
    }

    // 3. проявленный рендер поверх коллажа
    ctx.drawImage(layer, 0, 0);
  }

  /* ---------- анимация ---------- */
  let runId = 0;
  const ease = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  function setCompare(on) {
    state.compare = on;
    frame.classList.toggle('compare', on);
  }

  function typePrompt(id) {
    return tween(PROMPT.length * 14, t => {
      promptEl.textContent = PROMPT.slice(0, Math.round(t * PROMPT.length));
    }, id);
  }

  function tween(ms, fn, id) {
    return new Promise(res => {
      const t0 = performance.now();
      const tick = now => {
        if (id !== runId) return res();
        const t = Math.min(1, (now - t0) / ms);
        fn(t);
        t < 1 ? requestAnimationFrame(tick) : res();
      };
      requestAnimationFrame(tick);
    });
  }

  function showFinal() {
    runId++;
    promptEl.textContent = PROMPT;
    bar.style.width = '100%';
    stepEl.textContent = `Готово · шаг ${STEPS} / ${STEPS}`;
    state.p = 1;
    state.split = .5;
    setCompare(true);
    draw();
  }

  async function run() {
    if (!collage || !render) return;
    if (reduced) return showFinal();
    const id = ++runId;
    setCompare(false);
    state.p = 0; state.split = 1;
    bar.style.width = '0%';
    stepEl.textContent = 'Читаю исходник…';
    draw();
    await typePrompt(id);
    if (id !== runId) return;

    await tween(GEN_MS, t => {
      const step = Math.min(STEPS, Math.floor(t * STEPS) + 1);
      stepEl.textContent = `Генерация · шаг ${step} / ${STEPS}`;
      bar.style.width = `${Math.round(t * 100)}%`;
      state.p = t;
      draw();
    }, id);
    if (id !== runId) return;
    state.p = 1;
    stepEl.textContent = `Готово · шаг ${STEPS} / ${STEPS}`;
    draw();

    await new Promise(r => setTimeout(r, 700));
    if (id !== runId) return;
    setCompare(true);
    await tween(900, t => { state.split = 1 - .5 * ease(t); draw(); }, id);
  }

  /* ---------- сравнение ---------- */
  function setSplit(clientX) {
    const r = frame.getBoundingClientRect();
    state.split = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    handle.setAttribute('aria-valuenow', Math.round(state.split * 100));
    draw();
  }
  let dragging = false;
  handle.addEventListener('pointerdown', e => {
    runId++;  // остановить анимацию разъезда
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    setSplit(e.clientX);
  });
  handle.addEventListener('pointermove', e => dragging && setSplit(e.clientX));
  handle.addEventListener('pointerup', () => { dragging = false; });
  handle.addEventListener('keydown', e => {
    const d = e.key === 'ArrowLeft' ? -.05 : e.key === 'ArrowRight' ? .05 : 0;
    if (!d) return;
    e.preventDefault();
    runId++;
    state.split = Math.min(1, Math.max(0, state.split + d));
    handle.setAttribute('aria-valuenow', Math.round(state.split * 100));
    draw();
  });
  replay.addEventListener('click', run);

  /* ---------- старт ---------- */
  addEventListener('resize', resize);
  const cache = new Map();
  const loadCase = tab => {
    if (!cache.has(tab)) cache.set(tab, Promise.all([load(tab.dataset.before), load(tab.dataset.after)]));
    return cache.get(tab);
  };

  let seen = false;     // блок уже попадал в экран
  async function selectCase(tab, play) {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.setAttribute('aria-checked', String(on));
    });
    runId++;
    try {
      const [a, b] = await loadCase(tab);
      if (tab.getAttribute('aria-selected') !== 'true') return;   // уже выбрали другой кейс
      collage = a; render = b;
      PROMPT = tab.dataset.prompt;
      labelEl.textContent = tab.dataset.label;
      frame.classList.remove('missing');
      replay.hidden = false;
      frame.style.aspectRatio = `${b.width} / ${b.height}`;
      state.p = 0; setCompare(false);
      promptEl.textContent = '';
      resize();
      if (play) run();
    } catch {
      frame.classList.add('missing');
      replay.hidden = true;
      stepEl.textContent = 'Нет изображений';
    }
  }
  tabs.forEach(tab => tab.addEventListener('click', () => selectCase(tab, seen)));
  // соседние кейсы подгружаем заранее, когда браузер свободен
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1500));

  selectCase(tabs[0], false).then(() => {
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        io.disconnect();
        seen = true;
        run();
        idle(() => tabs.slice(1).forEach(loadCase));
      }
    }, { threshold: .45 });
    io.observe(frame);
  });
})();
