(()=>{
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);

  async function api(path, opts = {}) {
    if (window.OsnovaData) return window.OsnovaData.request(path, opts);
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      ...opts
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Ошибка');
    return data;
  }

  function examDefault() {
    const now = new Date();
    const year = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
    return `${year}-06-01`;
  }

  function showEditor(data = {}) {
    document.querySelector('.product-settings-overlay')?.remove();
    const profile = data || {};
    const overlay = document.createElement('div');
    overlay.className = 'product-onboarding product-settings-overlay';
    overlay.innerHTML = `
      <div class="product-onboarding-card" style="min-height:auto;max-width:650px">
        <div class="product-onboarding-top">
          <div class="product-onboarding-brand">ОСНОВА <b>PLAN</b></div>
          <button class="product-analytics-close" data-product-settings-close>✕</button>
        </div>
        <div class="product-onboarding-body" style="padding-top:28px">
          <div class="product-kicker">Настройки подготовки</div>
          <h1 style="font-size:38px">Цель и режим</h1>
          <p class="product-onboarding-lead">Изменения сразу перестроят твой PRO-план. Уже решённые задания и статистика останутся на месте.</p>
          <form data-product-settings-form>
            <div class="product-form-grid">
              <div class="product-field full">
                <label>Предмет</label>
                <select name="subjectSlug">
                  <option value="biology" ${profile.subjectSlug !== 'chemistry' ? 'selected' : ''}>Биология</option>
                  <option value="chemistry" ${profile.subjectSlug === 'chemistry' ? 'selected' : ''}>Химия</option>
                </select>
              </div>
              <div class="product-field">
                <label>Текущий примерный балл</label>
                <input name="currentScore" type="number" min="0" max="100" value="${Number(profile.currentScore || 40)}">
              </div>
              <div class="product-field">
                <label>Цель</label>
                <input name="targetScore" type="number" min="40" max="100" value="${Number(profile.targetScore || 80)}">
              </div>
              <div class="product-field full">
                <label>Дата экзамена</label>
                <input name="examDate" type="date" value="${esc(String(profile.examDate || examDefault()).slice(0,10))}">
              </div>
              <div class="product-field">
                <label>Дней в неделю</label>
                <input name="daysPerWeek" type="number" min="1" max="7" value="${Number(profile.daysPerWeek || 5)}">
              </div>
              <div class="product-field">
                <label>Минут в день</label>
                <input name="minutesPerDay" type="number" min="20" max="300" value="${Number(profile.minutesPerDay || 60)}">
              </div>
            </div>
            <div class="product-onboarding-actions">
              <button type="button" class="btn ghost" data-product-settings-cancel>Отмена</button>
              <button class="btn" type="submit">Сохранить и перестроить</button>
            </div>
          </form>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('[data-product-settings-close]').onclick = close;
    overlay.querySelector('[data-product-settings-cancel]').onclick = close;
    overlay.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const body = {
        subjectSlug: form.get('subjectSlug'),
        currentScore: Number(form.get('currentScore')),
        targetScore: Number(form.get('targetScore')),
        examDate: form.get('examDate'),
        daysPerWeek: Number(form.get('daysPerWeek')),
        minutesPerDay: Number(form.get('minutesPerDay'))
      };
      const button = event.currentTarget.querySelector('button[type=submit]');
      button.disabled = true;
      button.textContent = 'Перестраиваю…';
      try {
        await api('/api/product/onboarding', { method: 'POST', body: JSON.stringify(body) });
        await api('/api/product/onboarding/complete', { method: 'POST', body: JSON.stringify({ skippedDiagnostic: true }) });
        close();
        if (typeof notify === 'function') notify('Цель и режим обновлены');
        else location.reload();
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Сохранить и перестроить';
        if (typeof notify === 'function') notify(error.message);
        else alert(error.message);
      }
    };
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-analytics-settings]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      button.disabled = true;
      const status = await api('/api/product/onboarding');
      showEditor(status.onboarding || {});
    } catch (error) {
      if (typeof notify === 'function') notify(error.message);
    } finally {
      button.disabled = false;
    }
  }, true);
})();
