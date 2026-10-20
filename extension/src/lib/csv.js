// CSV para abrir direto no Excel em português: BOM, ponto e vírgula, vírgula decimal, CRLF.
(function (raiz, fabrica) {
  const m = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else raiz.RadarCsv = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SEP = ';';
  const p2 = (n) => String(n).padStart(2, '0');

  function data(ms) {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
    const d = new Date(ms);
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  }

  function numero(v, casas) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '';
    const t = casas === undefined ? String(Math.round(v * 100) / 100) : v.toFixed(casas);
    return t.replace('.', ',');
  }

  function campo(v) {
    const t = v === null || v === undefined ? '' : String(v);
    return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  }

  // colunas: [{ titulo, valor: (linha) => any, tipo?: 'data'|'numero'|'pct'|'sim' }]
  function paraCsv(linhas, colunas) {
    const formatar = (c, l) => {
      const v = c.valor(l);
      if (c.tipo === 'data') return data(v);
      if (c.tipo === 'numero') return numero(v);
      if (c.tipo === 'numero3') return typeof v === 'number' ? String(Math.round(v * 1000) / 1000).replace('.', ',') : '';
      if (c.tipo === 'pct') return numero(typeof v === 'number' ? v * 100 : v, 1);
      if (c.tipo === 'sim') return v ? 'sim' : 'não';
      return v;
    };
    const cab = colunas.map((c) => campo(c.titulo)).join(SEP);
    const corpo = linhas.map((l) => colunas.map((c) => campo(formatar(c, l))).join(SEP));
    return `﻿${[cab, ...corpo].join('\r\n')}\r\n`;
  }

  return { SEP, data, numero, campo, paraCsv };
});
