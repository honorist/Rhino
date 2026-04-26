// Rhino — Recorrência virtual
// Expande items com metadata.recurrence em ocorrências entre [from, to] sem
// materializar no DB. As ocorrências viram lançamentos "virtuais" exibidos
// no caixa/dashboard; o usuário pode "marcar como realizado" para criar
// um lançamento real no caixa.
(function () {
  'use strict';

  // Adiciona N unidades a uma data (em UTC midday para evitar DST). Retorna nova Date.
  function addUnits(date, n, freq) {
    const d = new Date(date);
    if (freq === 'weekly')      d.setDate(d.getDate() + 7 * n);
    else if (freq === 'quarterly') d.setMonth(d.getMonth() + 3 * n);
    else if (freq === 'yearly')    d.setFullYear(d.getFullYear() + n);
    else /* monthly default */     d.setMonth(d.getMonth() + n);
    return d;
  }

  function toISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  // Expande uma item.metadata.recurrence em ocorrências dentro [fromISO, toISO]
  // Retorna [{ date, value, sourceId, sourceType, frequency, virtual:true }]
  function expandRecurrence(item, fromISO, toISO) {
    const rec = item?.metadata?.recurrence;
    if (!rec || !rec.active) return [];
    const start = rec.startDate;
    const end   = rec.endDate;
    if (!start) return [];

    const fromD = fromISO ? new Date(fromISO + 'T12:00:00') : null;
    const toD   = toISO   ? new Date(toISO   + 'T12:00:00') : null;
    const startD = new Date(start + 'T12:00:00');
    const endD   = end ? new Date(end + 'T12:00:00') : null;

    const out = [];
    let i = 0;
    // Hard cap (1000 occorrências) — proteção contra loop infinito
    while (i < 1000) {
      const d = addUnits(startD, i, rec.frequency || 'monthly');
      if (endD && d > endD) break;
      if (toD && d > toD)   break;
      if (!fromD || d >= fromD) {
        out.push({
          date: toISO_local(d),
          value: parseFloat(item.value) || 0,
          sourceId: item.id,
          sourceType: 'base_item',
          sourceDescription: item.description || '',
          sourceTypeKey: item.type || null,
          frequency: rec.frequency || 'monthly',
          virtual: true,
        });
      }
      i++;
    }
    return out;
  }

  function toISO_local(d) {
    return toISO(d);
  }

  // Expande TODOS os items recorrentes do Store para um intervalo
  function expandAll(items, fromISO, toISO) {
    const all = [];
    (items || []).forEach((item) => {
      if (item?.metadata?.recurrence?.active) {
        all.push(...expandRecurrence(item, fromISO, toISO));
      }
    });
    return all;
  }

  // Verifica se uma ocorrência virtual já foi materializada
  // (caixa entry com base_item_id == sourceId + mesma date)
  function isMaterialized(virtualOcc, caixaEntries) {
    return (caixaEntries || []).some((e) =>
      (e.baseItemId === virtualOcc.sourceId || e.base_item_id === virtualOcc.sourceId) &&
      (e.date === virtualOcc.date)
    );
  }

  function frequencyLabel(freq) {
    return ({ weekly: 'semanal', monthly: 'mensal', quarterly: 'trimestral', yearly: 'anual' })[freq] || freq;
  }

  window.RhinoRecurrence = {
    expandRecurrence,
    expandAll,
    isMaterialized,
    frequencyLabel,
  };
})();
