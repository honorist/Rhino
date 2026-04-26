// Rhino Hi-fi — Modal + Form genérico
// Suporta campos: text, number, date, select, textarea, password, hidden
// Uso: <Modal title onClose><Form fields onSubmit/></Modal>

const Modal = ({ title, onClose, children, width = 560 }) => {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="hifi-modal-overlay" onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(12,13,16,0.5)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '40px 16px', overflowY: 'auto',
    }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width, maxWidth: '100%', padding: 0, animation: 'modalSlide .2s' }}>
        <div className="card-h" style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--line)' }}>
          <div className="card-h-title">
            <h2 className="h2">{title}</h2>
          </div>
          <button className="btn btn-icon" onClick={onClose}><Icon name="more" size={14}/>✕</button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
};

// Campo individual
const Field = ({ field, value, onChange, error }) => {
  const common = {
    className: 'form-control',
    value: value ?? '',
    onChange: e => onChange(e.target.value),
    style: { width: '100%' },
    placeholder: field.placeholder || '',
  };
  let input = null;
  if (field.type === 'textarea') {
    input = <textarea {...common} rows={field.rows || 3}/>;
  } else if (field.type === 'select') {
    input = (
      <select {...common}>
        <option value="">{field.placeholder || '— selecione —'}</option>
        {(field.options || []).map((o, i) => (
          <option key={i} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  } else if (field.type === 'date') {
    input = <input {...common} type="date"/>;
  } else if (field.type === 'number' || field.type === 'currency') {
    input = <input {...common} type="number" step={field.step || 'any'} min={field.min} max={field.max}/>;
  } else {
    input = <input {...common} type={field.type || 'text'} maxLength={field.maxLength} autoComplete={field.autoComplete}/>;
  }
  return (
    <div className="form-group" style={{ marginBottom: 14 }}>
      <label className="form-label" style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 500, color: 'var(--ink-2)' }}>
        {field.label}{field.required && <span style={{ color: 'var(--neg)', marginLeft: 3 }}>*</span>}
      </label>
      {input}
      {field.help && !error && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{field.help}</div>}
      {error && <div style={{ fontSize: 11, color: 'var(--neg)', marginTop: 4 }}>{error}</div>}
    </div>
  );
};

// Form completo
const Form = ({ fields, initial = {}, submitLabel = 'Salvar', onSubmit, onCancel, layout = 'stack' }) => {
  const [values, setValues] = React.useState(() => {
    const v = {};
    for (const f of fields) v[f.name] = initial[f.name] ?? f.default ?? '';
    return v;
  });
  const [errors, setErrors] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [globalErr, setGlobalErr] = React.useState(null);

  const setVal = (name, v) => setValues(s => ({ ...s, [name]: v }));

  const validate = () => {
    const errs = {};
    for (const f of fields) {
      const v = values[f.name];
      if (f.required && (v === '' || v === null || v === undefined)) {
        errs[f.name] = 'Obrigatório';
      } else if (f.validate) {
        const r = f.validate(v, values);
        if (r) errs[f.name] = r;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setGlobalErr(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setGlobalErr(err.message || 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const visibleFields = fields.filter(f => !f.hidden && (typeof f.showIf !== 'function' || f.showIf(values)));

  return (
    <form onSubmit={submit}>
      {layout === 'grid-2' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {visibleFields.map(f => (
            <div key={f.name} style={{ gridColumn: f.full ? '1 / -1' : 'auto' }}>
              <Field field={f} value={values[f.name]} onChange={v => setVal(f.name, v)} error={errors[f.name]}/>
            </div>
          ))}
        </div>
      ) : (
        visibleFields.map(f => (
          <Field key={f.name} field={f} value={values[f.name]} onChange={v => setVal(f.name, v)} error={errors[f.name]}/>
        ))
      )}

      {globalErr && (
        <div style={{ background: 'var(--neg-soft)', color: 'var(--neg)', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          {globalErr}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 4 }}>
        {onCancel && <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancelar</button>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Salvando…' : submitLabel}</button>
      </div>
    </form>
  );
};

// Helper: roteia POST (criar) ou PUT (editar) baseado em initial.id
const apiSave = async (endpointBase, values, initial) => {
  if (initial && initial.id) {
    return apiSubmit('PUT', endpointBase + '/' + initial.id, values);
  }
  return apiSubmit('POST', endpointBase, values);
};

// Helper: POST/PUT pra API e tratar resposta
const apiSubmit = async (method, url, body) => {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    let msg = txt;
    try { const j = JSON.parse(txt); msg = j.error || j.message || txt; } catch {}
    throw new Error(msg || `Erro ${r.status}`);
  }
  return r.json().catch(() => ({}));
};

// Toast simples
const showToast = (msg, type = 'success') => {
  const div = document.createElement('div');
  div.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 2000;
    background: ${type === 'error' ? 'var(--neg)' : 'var(--pos)'};
    color: white; padding: 10px 16px; border-radius: 6px;
    font-family: var(--font-sans); font-size: 13px; font-weight: 500;
    box-shadow: var(--shadow-pop); animation: toastIn .2s;
  `;
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity .2s'; }, 2400);
  setTimeout(() => div.remove(), 2700);
};

window.Modal = Modal;
window.Form = Form;
window.Field = Field;
window.apiSubmit = apiSubmit;
window.apiSave = apiSave;
window.showToast = showToast;
