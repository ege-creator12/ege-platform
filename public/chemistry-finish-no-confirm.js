(() => {
  'use strict';

  const nativeConfirm = window.confirm.bind(window);
  window.confirm = message => {
    const text = String(message ?? '');
    if (/^Завершить вариант\s+\d+\?\s*Незаполненных заданий:\s*\d+\.?$/i.test(text)) return true;
    return nativeConfirm(text);
  };
})();
