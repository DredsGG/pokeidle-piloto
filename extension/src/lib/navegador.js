// 1.31 (regra 11 do hub): o mesmo código no Chrome, Edge, Brave, Opera e Firefox. No Firefox, o
// namespace browser.* devolve promise em todas as APIs; o código da extensão usa chrome.* com
// promise, então aponta o chrome para ele. Nos Chromium não muda nada.
(function () {
  'use strict';
  try {
    if (typeof browser !== 'undefined' && browser && browser.runtime && globalThis.chrome !== browser) globalThis.chrome = browser;
  } catch { /* fica o chrome.* */ }
})();
