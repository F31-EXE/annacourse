/* Формы лендинга: заявка на бесплатный урок и заказ тарифа. Данные уходят в Django
   (см. courses/views.py) и появляются в админке. */

(() => {
  async function post(form) {
    const res = await fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { 'X-Requested-With': 'fetch' },
      credentials: 'same-origin',
    });
    let data = {};
    try { data = await res.json(); } catch { /* не JSON — ошибка сервера */ }
    return { ok: res.ok && data.ok, data };
  }

  function firstError(data) {
    const errs = data && data.errors;
    if (!errs) return 'Не получилось отправить. Попробуйте ещё раз.';
    const first = Object.values(errs)[0];
    return (first && first[0] && first[0].message) || 'Проверьте поля формы.';
  }

  /* ---------- бесплатный урок ---------- */
  const lead = document.getElementById('leadForm');
  if (lead) {
    const err = lead.querySelector('.form-error');
    lead.addEventListener('submit', async e => {
      e.preventDefault();
      err.hidden = true;
      const { ok } = await post(lead).catch(() => ({ ok: false }));
      if (ok) lead.classList.add('done');
      else err.hidden = false;
    });
  }

  /* ---------- заказ тарифа ---------- */
  const dialog = document.getElementById('orderDialog');
  if (!dialog) return;
  const form = document.getElementById('orderForm');
  const title = document.getElementById('orderTitle');
  const tariffInput = document.getElementById('orderTariff');
  const promoInput = document.getElementById('orderPromo');
  const totalEl = document.getElementById('orderTotal');
  const errorEl = document.getElementById('orderError');
  const doneEl = document.getElementById('orderDone');
  const rub = v => Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
  let basePrice = '';

  function reset() {
    form.reset();
    form.classList.remove('done');
    errorEl.hidden = true;
    doneEl.hidden = true;
  }

  document.querySelectorAll('.buy').forEach(btn => btn.addEventListener('click', () => {
    reset();
    tariffInput.value = btn.dataset.tariff;
    title.textContent = btn.dataset.name;
    basePrice = btn.dataset.price;
    totalEl.textContent = `К оплате: ${basePrice} ₽`;
    dialog.showModal();
  }));
  document.getElementById('orderClose').addEventListener('click', () => dialog.close());

  // пересчёт цены с промокодом
  let promoTimer;
  promoInput.addEventListener('input', () => {
    clearTimeout(promoTimer);
    promoTimer = setTimeout(async () => {
      const code = promoInput.value.trim();
      if (!code) { totalEl.textContent = `К оплате: ${basePrice} ₽`; return; }
      const url = `${form.dataset.promoUrl || '/api/promo/'}?tariff=${encodeURIComponent(tariffInput.value)}&code=${encodeURIComponent(code)}`;
      try {
        const data = await (await fetch(url)).json();
        totalEl.textContent = data.ok
          ? `К оплате: ${rub(data.total)} (скидка ${data.percent}%)`
          : `Промокод не найден · к оплате: ${basePrice} ₽`;
      } catch { /* сеть — оставляем как есть */ }
    }, 350);
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errorEl.hidden = true;
    const { ok, data } = await post(form).catch(() => ({ ok: false }));
    if (ok) {
      form.classList.add('done');
      doneEl.hidden = false;
      totalEl.textContent = `Заказ №${data.order} · к оплате: ${rub(data.total)}`;
    } else {
      errorEl.textContent = firstError(data);
      errorEl.hidden = false;
    }
  });
})();
