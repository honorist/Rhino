'use strict';
/**
 * @file Sino de notificações in-app (flutuante, isolado).
 * Consome GET /api/notificacoes e POST /api/notificacoes/:id/marcar-lida.
 * Auto-montado no canto superior direito quando há usuário logado — NÃO depende
 * do re-render da sidebar (menos acoplamento). CSP-safe: script externo + apenas
 * addEventListener (sem handlers inline).
 */
(function () {
  var POLL_MS = 60000;
  var notifs = [];
  var open = false;

  function logged() {
    return !!(window.auth && typeof window.auth.user === 'function' && window.auth.user());
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }
  // Normaliza o link p/ o roteamento por hash do app. Recrutamento grava
  // '/recrutamento?...' (path) e sugestões grava '#/sugestoes' (hash) — unifica.
  function hrefFor(link) {
    if (!link) return null;
    if (link.charAt(0) === '#') return link;
    return '#' + (link.charAt(0) === '/' ? link : '/' + link);
  }
  function timeAgo(iso) {
    if (!iso) return '';
    var t = new Date(iso).getTime(); if (isNaN(t)) return '';
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return Math.floor(s / 60) + ' min';
    if (s < 86400) return Math.floor(s / 3600) + ' h';
    return Math.floor(s / 86400) + ' d';
  }

  function injectStyle() {
    if (document.getElementById('rhino-notif-style')) return;
    var st = document.createElement('style');
    st.id = 'rhino-notif-style';
    st.textContent =
      '#rhino-notif{position:fixed;top:12px;right:16px;z-index:1200;}' +
      '#rhino-notif-bell{position:relative;width:40px;height:40px;border-radius:50%;border:1px solid var(--color-border,#ddd);background:var(--color-surface,#fff);cursor:pointer;font-size:18px;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,.12);}' +
      '#rhino-notif-bell:hover{background:var(--color-bg,#f5f5f5);}' +
      '#rhino-notif-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#E53E3E;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;}' +
      '#rhino-notif-panel{position:absolute;top:46px;right:0;width:340px;max-width:90vw;max-height:70vh;overflow-y:auto;background:var(--color-surface,#fff);border:1px solid var(--color-border,#ddd);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.22);}' +
      '#rhino-notif-panel .rn-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 14px;font-weight:700;border-bottom:1px solid var(--color-border,#eee);font-size:14px;}' +
      '#rhino-notif-panel .rn-mark{font-size:12px;font-weight:600;color:#55588B;cursor:pointer;white-space:nowrap;}' +
      '#rhino-notif-panel .rn-empty{padding:24px 14px;text-align:center;color:var(--color-text-muted,#888);font-size:14px;}' +
      '#rhino-notif-panel .rn-item{display:block;padding:10px 14px;border-bottom:1px solid var(--color-border,#f0f0f0);text-decoration:none;color:inherit;}' +
      '#rhino-notif-panel .rn-item:hover{background:var(--color-bg,#f7f7f7);}' +
      '#rhino-notif-panel .rn-item.rn-unread{background:rgba(85,88,139,.08);}' +
      '#rhino-notif-panel .rn-title{font-weight:600;font-size:13.5px;}' +
      '#rhino-notif-panel .rn-msg{font-size:12.5px;color:var(--color-text-muted,#666);margin-top:2px;}' +
      '#rhino-notif-panel .rn-time{font-size:11px;color:var(--color-text-muted,#999);margin-top:3px;}';
    document.head.appendChild(st);
  }

  function mount() {
    var el = document.getElementById('rhino-notif');
    if (el) return el;
    injectStyle();
    el = document.createElement('div');
    el.id = 'rhino-notif';
    // 🔔 = 🔔
    el.innerHTML = '<button id="rhino-notif-bell" aria-label="Notificações" title="Notificações">🔔<span id="rhino-notif-badge" hidden></span></button>' +
                   '<div id="rhino-notif-panel" hidden role="region" aria-label="Notificações"></div>';
    document.body.appendChild(el);
    el.querySelector('#rhino-notif-bell').addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
    document.addEventListener('click', function (e) { if (open && !el.contains(e.target)) close(); });
    return el;
  }

  function unread() { return notifs.filter(function (n) { return !n.lida; }).length; }

  function render() {
    var el = mount();
    if (!logged()) { el.style.display = 'none'; return; }
    el.style.display = '';
    var u = unread();
    var badge = el.querySelector('#rhino-notif-badge');
    if (u > 0) { badge.textContent = u > 9 ? '9+' : String(u); badge.hidden = false; } else { badge.hidden = true; }
    var panel = el.querySelector('#rhino-notif-panel');
    if (!notifs.length) {
      panel.innerHTML = '<div class="rn-head"><span>Notificações</span></div><div class="rn-empty">Nada por aqui ainda.</div>';
      return;
    }
    var html = '<div class="rn-head"><span>Notificações</span>' + (u > 0 ? '<span class="rn-mark" id="rn-mark-all">marcar todas lidas</span>' : '') + '</div>';
    html += notifs.slice(0, 30).map(function (n) {
      return '<a class="rn-item ' + (n.lida ? '' : 'rn-unread') + '" href="' + (hrefFor(n.link) || '#') + '" data-id="' + esc(n.id) + '">' +
        '<div class="rn-title">' + esc(n.titulo) + '</div>' +
        (n.mensagem ? '<div class="rn-msg">' + esc(n.mensagem) + '</div>' : '') +
        '<div class="rn-time">' + timeAgo(n.createdAt) + '</div></a>';
    }).join('');
    panel.innerHTML = html;
    panel.querySelectorAll('.rn-item').forEach(function (a) {
      a.addEventListener('click', function () {
        var id = a.getAttribute('data-id');
        var n = notifs.find(function (x) { return x.id === id; });
        if (n && !n.lida) markRead(id);
        close();
      });
    });
    var ma = panel.querySelector('#rn-mark-all');
    if (ma) ma.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); markAll(); });
  }

  function load() {
    if (!logged()) { render(); return; }
    fetch('/api/notificacoes', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j) { notifs = Array.isArray(j.notificacoes) ? j.notificacoes : []; render(); } })
      .catch(function () { /* silencioso */ });
  }
  function markRead(id) {
    var n = notifs.find(function (x) { return x.id === id; });
    if (n) { n.lida = true; render(); }
    fetch('/api/notificacoes/' + encodeURIComponent(id) + '/marcar-lida', { method: 'POST', credentials: 'same-origin' }).catch(function () {});
  }
  function markAll() { notifs.filter(function (n) { return !n.lida; }).forEach(function (n) { markRead(n.id); }); }
  function toggle() { open ? close() : openPanel(); }
  function openPanel() { var el = mount(); load(); el.querySelector('#rhino-notif-panel').hidden = false; open = true; }
  function close() { var el = document.getElementById('rhino-notif'); if (el) el.querySelector('#rhino-notif-panel').hidden = true; open = false; }

  function start() {
    mount(); load();
    setInterval(load, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
