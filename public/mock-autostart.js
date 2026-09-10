(() => {
  'use strict';

  // Новый вариант пробника открываем без системного confirm-окна.
  // Остальные подтверждения на сайте (например, завершение пробника) сохраняются.
  const nativeConfirm = window.confirm.bind(window);
  window.confirm = message => {
    const text = String(message ?? '');
    if (/^Завершить текущий пробник .* и открыть новый\?$/.test(text)) return true;
    return nativeConfirm(text);
  };
})();
