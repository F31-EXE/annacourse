/* Блок «Из коллажа — в рендер»: коллаж проявляется в рендер как в диффузионной модели —
   от крупных пикселей и шума к чёткой картинке. Потом можно сравнить слайдером. */

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

  const PROMPT = '/рендер из коллажа · фотореализм · мягкий дневной свет · сохранить геометрию';
  const STEPS = 30;
  const GEN_MS = 3800;

  const load = src => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });

  let collage, render;
  let W = 0, H = 0;
  const state = { p: 0, split: 1, compare: false };
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d');
  const noise = document.createElement('canvas');
  noise.width = 160; noise.height = 120;
  const noiseCtx = noise.getContext('2d');

  function reseedNoise() {
    const img = noiseCtx.createImageData(noise.width, noise.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    noiseCtx.putImageData(img, 0, 0);
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.round(frame.clientWidth * dpr);
    H = Math.round(frame.clientHeight * dpr);
    canvas.width = W;
    canvas.height = H;
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

    // «шаги диффузии»: пиксель крупный в начале и исчезает к концу
    const block = Math.max(1, Math.round(64 * Math.pow(1 - p, 2.2)));
    const ow = Math.ceil(W / block), oh = Math.ceil(H / block);
    off.width = ow; off.height = oh;
    offCtx.imageSmoothingEnabled = true;
    cover(render, offCtx, ow, oh);
    ctx.imageSmoothingEnabled = block <= 1;
    ctx.globalAlpha = Math.min(1, p / .22);
    ctx.drawImage(off, 0, 0, ow, oh, 0, 0, W, H);

    // шум, который «вычищается» к последнему шагу
    const n = .5 * Math.pow(1 - p, 1.4);
    if (n > .01) {
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = n;
      ctx.drawImage(noise, 0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
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
    stepEl.textContent = 'Читаю коллаж…';
    draw();
    await typePrompt(id);
    if (id !== runId) return;

    let lastStep = -1;
    await tween(GEN_MS, t => {
      const step = Math.min(STEPS, Math.floor(t * STEPS) + 1);
      if (step !== lastStep) {           // картинка обновляется по шагам, как у генератора
        lastStep = step;
        reseedNoise();
        state.p = ease(step / STEPS);
        stepEl.textContent = `Генерация · шаг ${step} / ${STEPS}`;
        draw();
      }
      bar.style.width = `${Math.round(t * 100)}%`;
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
  Promise.all([load('img/collage.jpg'), load('img/render.jpg')])
    .then(([a, b]) => {
      collage = a; render = b;
      resize();
      // запуск, когда блок попадает в экран
      const io = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) { io.disconnect(); run(); }
      }, { threshold: .45 });
      io.observe(frame);
    })
    .catch(() => {
      frame.classList.add('missing');
      replay.hidden = true;
      stepEl.textContent = 'Нет изображений';
    });
})();
