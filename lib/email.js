// Email transacional. Usa Resend (https://resend.com) se RESEND_API_KEY estiver setada.
// Fallback: log no console (modo dev). Sem dependências externas.
const FROM = process.env.EMAIL_FROM || 'Rhino <noreply@rhino.local>';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

async function send({ to, subject, html, text }) {
  if (!to || !subject) return { ok: false, error: 'to + subject obrigatórios' };
  if (!RESEND_API_KEY) {
    // Dev mode — só loga
    console.log(JSON.stringify({
      event: 'email.dev',
      ts: new Date().toISOString(),
      to, subject,
      preview: (text || html || '').slice(0, 200),
    }));
    return { ok: true, dev: true };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM, to: Array.isArray(to) ? to : [to], subject, html, text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[email] erro Resend:', res.status, body);
      return { ok: false, error: body.message || 'falha ao enviar' };
    }
    return { ok: true, id: body.id };
  } catch (e) {
    console.warn('[email] exceção:', e.message);
    return { ok: false, error: e.message };
  }
}

// Templates
function tmplResetPassword({ nome, link, expiraEm }) {
  const html = `
    <div style="font-family:Nunito,Arial,sans-serif;max-width:520px;margin:auto;background:#fff;color:#333;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      <div style="background:#1d4ed8;color:#fff;padding:18px 24px;font-size:18px;font-weight:700;">Rhino — Redefinir senha</div>
      <div style="padding:24px;line-height:1.55;font-size:15px;">
        <p>Olá${nome ? ' <strong>' + escapeHtml(nome) + '</strong>' : ''},</p>
        <p>Recebemos uma solicitação pra redefinir sua senha no Rhino. Se foi você, clique no botão abaixo:</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${link}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;">Redefinir minha senha</a>
        </p>
        <p style="color:#6b7280;font-size:13px;">Este link expira em ${expiraEm}. Se você não solicitou, pode ignorar este email — sua senha não foi alterada.</p>
        <p style="color:#6b7280;font-size:13px;">Caso o botão não funcione, copie e cole este endereço no navegador:<br><span style="word-break:break-all;color:#1d4ed8;">${link}</span></p>
      </div>
      <div style="background:#f9fafb;padding:14px 24px;font-size:12px;color:#6b7280;text-align:center;">Rhino · Sistema de gestão · Email automático, não responda</div>
    </div>`;
  const text = `Para redefinir sua senha no Rhino, abra: ${link}\n\nExpira em ${expiraEm}. Se não foi você, ignore este email.`;
  return { html, text };
}

function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

module.exports = { send, tmplResetPassword };
