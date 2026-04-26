// Rhino Hi-fi — Modal de RDO com 5 abas (criar e editar)

const ModalRDO = ({ onClose, onSaved, contracts = [], initialContractId, initial = null }) => {
  const isEdit = !!(initial && initial.id);
  const [tab, setTab] = React.useState('dados');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  // Helpers
  const parseJSON = (v, fallback) => {
    if (Array.isArray(v) || (typeof v === 'object' && v !== null)) return v;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
    return fallback;
  };

  // Estado consolidado
  const [contractId, setContractId] = React.useState(initial?.contractId || initialContractId || '');
  const [data, setData] = React.useState(initial?.data || new Date().toISOString().split('T')[0]);
  const [osNumero, setOsNumero] = React.useState(initial?.osNumero || '');
  const [ordemCompra, setOrdemCompra] = React.useState(initial?.ordemCompra || '');
  const [projeto, setProjeto] = React.useState(initial?.projeto || '');
  const [periodoTrabalho, setPeriodoTrabalho] = React.useState(initial?.periodoTrabalho || '7:00 às 17:00');
  const [horaExtra, setHoraExtra] = React.useState(initial?.horaExtra === 'true' || initial?.horaExtra === true);
  const [tempo, setTempo] = React.useState(parseJSON(initial?.tempo, {
    manha: { tempo: 'bom', condicoes: 'operavel' },
    tarde: { tempo: 'bom', condicoes: 'operavel' },
    noiteAnt: { tempo: 'bom', condicoes: 'operavel' },
    precipitacao: 0,
  }));
  const [moi, setMoi] = React.useState(parseJSON(initial?.moi, []));
  const [mod, setMod] = React.useState(parseJSON(initial?.mod, []));
  const [terc, setTerc] = React.useState(parseJSON(initial?.terc, []));
  const [equipamentos, setEquipamentos] = React.useState(parseJSON(initial?.equipamentos, []));
  const [atividades, setAtividades] = React.useState(parseJSON(initial?.atividades, []));
  const [seguranca, setSeguranca] = React.useState(parseJSON(initial?.seguranca, {
    acidente: 'nao_houve', diagnostico: '', admissoes: 0, demissoes: 0, comentarios: '',
  }));
  const [fiscalizacaoComentarios, setFiscalizacaoComentarios] = React.useState(initial?.fiscalizacaoComentarios || '');

  const updateRow = (list, setter) => (i, key, value) => {
    setter(list.map((row, idx) => idx === i ? { ...row, [key]: value } : row));
  };
  const addRow = (list, setter, blank) => () => setter([...list, blank]);
  const removeRow = (list, setter) => (i) => setter(list.filter((_, idx) => idx !== i));

  // Render tabela genérica para MOI/MOD/TERC
  const renderEquipe = (titulo, list, setter, blank, cols) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 className="h3">{titulo}</h3>
        <button type="button" className="btn btn-sm" onClick={addRow(list, setter, blank)}><Icon name="plus" size={12}/> Adicionar</button>
      </div>
      {list.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12, background: 'var(--paper-2)', borderRadius: 6 }}>
          Nenhuma linha. Clique em "Adicionar".
        </div>
      ) : (
        <table className="tbl" style={{ marginBottom: 8 }}>
          <thead>
            <tr>
              {cols.map(c => <th key={c.key}>{c.label}</th>)}
              <th style={{ width: 36 }}/>
            </tr>
          </thead>
          <tbody>
            {list.map((row, i) => (
              <tr key={i}>
                {cols.map(c => (
                  <td key={c.key} style={{ padding: 4 }}>
                    <input
                      className="form-control"
                      style={{ padding: '4px 8px', fontSize: 12 }}
                      type={c.type || 'text'}
                      value={row[c.key] ?? ''}
                      onChange={e => updateRow(list, setter)(i, c.key, c.type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)}
                    />
                  </td>
                ))}
                <td style={{ padding: 4, textAlign: 'center' }}>
                  <button type="button" className="btn btn-icon" onClick={() => removeRow(list, setter)(i)} title="Remover">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  // Submit
  const submit = async () => {
    if (!contractId) { setErr('Selecione o contrato'); setTab('dados'); return; }
    if (!data) { setErr('Data é obrigatória'); setTab('dados'); return; }
    setBusy(true);
    setErr(null);
    try {
      const body = {
        data, osNumero, ordemCompra, projeto,
        periodoTrabalho, horaExtra,
        tempo, moi, mod, terc, equipamentos, atividades, seguranca,
        fiscalizacaoComentarios,
        diaSemana: ['dom','seg','ter','qua','qui','sex','sáb'][new Date(data + 'T12:00:00').getDay()],
      };
      if (isEdit) {
        await apiSubmit('PUT', `/api/contracts/${contractId}/rdos/${initial.id}`, body);
        showToast('RDO atualizado!');
      } else {
        await apiSubmit('POST', `/api/contracts/${contractId}/rdos`, body);
        showToast('RDO criado!');
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setErr(e.message || 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    { k: 'dados', l: 'Dados gerais' },
    { k: 'mo',    l: `MO (${moi.length + mod.length + terc.length})` },
    { k: 'eqp',   l: `Equipamentos (${equipamentos.length})` },
    { k: 'atv',   l: `Atividades (${atividades.length})` },
    { k: 'seg',   l: 'Segurança' },
  ];

  return (
    <Modal title={isEdit ? `Editar RDO #${initial.numero || ''}` : '+ Novo RDO'} onClose={onClose} width={900}>
      <div className="tabs" style={{ marginBottom: 16, marginTop: -4 }}>
        {tabs.map(t => (
          <span key={t.k} className={`tab ${tab === t.k ? 'on' : ''}`} onClick={() => setTab(t.k)} style={{ cursor: 'pointer' }}>{t.l}</span>
        ))}
      </div>

      {tab === 'dados' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field field={{ name: 'contractId', label: 'Contrato', type: 'select', required: true, options: contracts.filter(c => c.status === 'ativo' || c.id === contractId).map(c => ({ value: c.id, label: (c.codigo || '') + ' · ' + (c.client || c.name) })) }} value={contractId} onChange={setContractId}/>
          <Field field={{ name: 'data', label: 'Data', type: 'date', required: true }} value={data} onChange={setData}/>
          <Field field={{ name: 'os', label: 'OS' }} value={osNumero} onChange={setOsNumero}/>
          <Field field={{ name: 'oc', label: 'Ordem de compra' }} value={ordemCompra} onChange={setOrdemCompra}/>
          <Field field={{ name: 'proj', label: 'Projeto' }} value={projeto} onChange={setProjeto}/>
          <Field field={{ name: 'periodo', label: 'Período de trabalho' }} value={periodoTrabalho} onChange={setPeriodoTrabalho}/>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={horaExtra} onChange={e => setHoraExtra(e.target.checked)}/>
              Houve hora extra
            </label>
          </div>
          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <h3 className="h3" style={{ marginBottom: 10 }}>Clima</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[['manha', 'Manhã'], ['tarde', 'Tarde'], ['noiteAnt', 'Noite anterior']].map(([k, l]) => (
                <div key={k}>
                  <Field
                    field={{ name: k, label: l, type: 'select', options: [
                      { value: 'bom', label: '☀️ Bom' },
                      { value: 'chuva', label: '🌧️ Chuva' },
                      { value: 'nao_houve', label: 'Não houve' },
                    ]}}
                    value={tempo[k]?.tempo || 'bom'}
                    onChange={v => setTempo(t => ({ ...t, [k]: { ...t[k], tempo: v } }))}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'mo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {renderEquipe('MOI — Mão-de-obra indireta', moi, setMoi,
            { funcao: '', qtd: 0, hh: 0 },
            [{ key: 'funcao', label: 'Função' }, { key: 'qtd', label: 'Qtd', type: 'number' }, { key: 'hh', label: 'HH', type: 'number' }])}
          {renderEquipe('MOD — Mão-de-obra direta', mod, setMod,
            { funcao: '', qtd: 0, hh: 0 },
            [{ key: 'funcao', label: 'Função' }, { key: 'qtd', label: 'Qtd', type: 'number' }, { key: 'hh', label: 'HH', type: 'number' }])}
          {renderEquipe('Terceiros', terc, setTerc,
            { empresa: '', funcao: '', qtd: 0, hh: 0 },
            [{ key: 'empresa', label: 'Empresa' }, { key: 'funcao', label: 'Função' }, { key: 'qtd', label: 'Qtd', type: 'number' }, { key: 'hh', label: 'HH', type: 'number' }])}
        </div>
      )}

      {tab === 'eqp' && renderEquipe('Equipamentos', equipamentos, setEquipamentos,
        { equipamento: '', qtd: 0, horas: 0 },
        [{ key: 'equipamento', label: 'Equipamento' }, { key: 'qtd', label: 'Qtd', type: 'number' }, { key: 'horas', label: 'Horas', type: 'number' }])}

      {tab === 'atv' && renderEquipe('Atividades do dia', atividades, setAtividades,
        { descricao: '', percentual: 0 },
        [{ key: 'descricao', label: 'Descrição' }, { key: 'percentual', label: 'Avanço %', type: 'number' }])}

      {tab === 'seg' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field field={{ name: 'acid', label: 'Acidente', type: 'select', options: [
            { value: 'nao_houve', label: '✓ Não houve' },
            { value: 'sem_afastamento', label: 'Sem afastamento' },
            { value: 'com_afastamento', label: '⚠ Com afastamento' },
          ]}} value={seguranca.acidente} onChange={v => setSeguranca(s => ({ ...s, acidente: v }))}/>
          <Field field={{ name: 'diag', label: 'Diagnóstico' }} value={seguranca.diagnostico} onChange={v => setSeguranca(s => ({ ...s, diagnostico: v }))}/>
          <Field field={{ name: 'adm', label: 'Admissões', type: 'number' }} value={seguranca.admissoes} onChange={v => setSeguranca(s => ({ ...s, admissoes: parseInt(v) || 0 }))}/>
          <Field field={{ name: 'dem', label: 'Demissões', type: 'number' }} value={seguranca.demissoes} onChange={v => setSeguranca(s => ({ ...s, demissoes: parseInt(v) || 0 }))}/>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field field={{ name: 'com', label: 'Comentários de segurança', type: 'textarea' }} value={seguranca.comentarios} onChange={v => setSeguranca(s => ({ ...s, comentarios: v }))}/>
            <Field field={{ name: 'fc', label: 'Comentários da fiscalização', type: 'textarea' }} value={fiscalizacaoComentarios} onChange={setFiscalizacaoComentarios}/>
          </div>
        </div>
      )}

      {err && (
        <div style={{ background: 'var(--neg-soft)', color: 'var(--neg)', padding: '8px 12px', borderRadius: 6, marginTop: 12, fontSize: 13 }}>{err}</div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 16 }}>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Salvando…' : (isEdit ? 'Salvar alterações' : 'Criar RDO')}</button>
      </div>
    </Modal>
  );
};

window.ModalRDO = ModalRDO;
