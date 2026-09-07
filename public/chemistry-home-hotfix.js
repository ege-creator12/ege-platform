(() => {
  const previousSubject = subject;

  subject = async function (slug) {
    if (slug !== 'chemistry') return previousSubject(slug);

    state.currentSubject = 'chemistry';
    loading();

    try {
      const d = await api('/subjects/chemistry');
      const sections = Array.isArray(d.sections) ? d.sections : [];
      const title = d.subject?.title || 'Химия';
      const description = d.subject?.description || 'Подготовка к ЕГЭ по химии.';

      app.innerHTML = shell(`
        <div class="course-page">
          <header>
            <div class="eyebrow">Предмет · ЕГЭ-2027</div>
            <h1>${esc(title)}</h1>
            <div class="subtitle">${esc(description)}</div>
            <div class="chem-home-meta">
              <span class="pill">${sections.length} разделов</span>
              <span class="pill">34 линии</span>
              <span class="pill">56 первичных баллов</span>
            </div>
          </header>
          <div class="view-switch" aria-label="Режим навигации">
            <button class="active" aria-pressed="true">По темам</button>
            <button data-nav="chemistry/lines">По заданиям ЕГЭ</button>
          </div>
          <div class="chem-actions">
            <button class="btn ghost" data-nav="chemistry/search">⌕ Поиск по химии</button>
          </div>
          <div class="section-head">
            <h2>Разделы курса</h2>
            <span class="pill">${sections.length}</span>
          </div>
          <div class="topics">
            ${sections.map((x, i) => `
              <article class="card topic" data-section="${x.id}" tabindex="0" role="link">
                <div class="topic-num">${String(i + 1).padStart(2, '0')}</div>
                <h3>${esc(x.title)}</h3>
                <p>${esc(x.description)}</p>
              </article>
            `).join('')}
          </div>
        </div>
      `);

      bindShell();
      document.querySelectorAll('[data-section]').forEach(card => {
        card.onclick = () => go('section/' + card.dataset.section);
        card.onkeydown = event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            card.click();
          }
        };
      });
    } catch (error) {
      console.error('chemistry-home', error);
      notify(error.message || 'Не удалось загрузить химию');
      errorState(() => subject('chemistry'));
    }
  };
})();
