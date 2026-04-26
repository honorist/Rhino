// Rhino Hi-fi — Catálogo de modais de criação
// Cada modal segue o padrão: <ModalNomeXxx onClose onSaved/>

// =================== CONTRATO ===================
const ModalContrato = ({ onClose, onSaved, clientes = [], initial = null }) => (
  <Modal title={initial?.id ? 'Editar contrato' : '+ Novo Contrato'} onClose={onClose} width={640}>
    <Form
      submitLabel={initial?.id ? 'Salvar' : 'Criar contrato'}
      onCancel={onClose}
      layout="grid-2"
      initial={initial || {}}
      fields={[
        { name: 'name', label: 'Nome / Escopo', required: true, full: true, placeholder: 'Ex: Manutenção parada planta 2' },
        { name: 'contractNumber', label: 'Código', placeholder: 'CT-014' },
        { name: 'client', label: 'Cliente', required: true, placeholder: 'Razão social do cliente' },
        { name: 'value', label: 'Valor (R$)', type: 'number', required: true, step: '0.01' },
        { name: 'status', label: 'Status', type: 'select', default: 'ativo',
          options: [
            { value: 'ativo', label: 'Ativo' },
            { value: 'prospeccao', label: 'Prospecção' },
            { value: 'pausado', label: 'Pausado' },
            { value: 'concluido', label: 'Concluído' },
            { value: 'cancelado', label: 'Cancelado' },
          ]},
        { name: 'startDate', label: 'Início', type: 'date' },
        { name: 'endDate', label: 'Término', type: 'date' },
        { name: 'endereco', label: 'Endereço da obra', full: true },
        { name: 'notes', label: 'Observações', type: 'textarea', full: true },
      ]}
      onSubmit={async (v) => {
        await apiSave('/api/contracts', v, initial);
        showToast(initial?.id ? 'Contrato atualizado!' : 'Contrato criado!');
        onSaved?.();
        onClose();
      }}
    />
  </Modal>
);

// =================== LANÇAMENTO DE CAIXA ===================
const ModalCaixa = ({ onClose, onSaved, contracts = [], initial = null }) => (
  <Modal title={initial?.id ? 'Editar lançamento' : '+ Novo lançamento de caixa'} onClose={onClose} width={560}>
    <Form
      submitLabel="Lançar"
      onCancel={onClose}
      layout="grid-2"
      initial={initial || {}}
      fields={[
        { name: 'type', label: 'Tipo', type: 'select', required: true, default: 'entrada',
          options: [
            { value: 'entrada', label: '↑ Entrada' },
            { value: 'saida',   label: '↓ Saída' },
          ]},
        { name: 'date', label: 'Data', type: 'date', required: true, default: new Date().toISOString().split('T')[0] },
        { name: 'value', label: 'Valor (R$)', type: 'number', required: true, step: '0.01' },
        { name: 'category', label: 'Categoria', type: 'select', default: 'geral',
          options: [
            { value: 'geral', label: 'Geral' },
            { value: 'mao_de_obra', label: 'Mão de obra' },
            { value: 'material', label: 'Material' },
            { value: 'hospedagem', label: 'Hospedagem' },
            { value: 'transporte', label: 'Transporte' },
          ]},
        { name: 'description', label: 'Descrição', required: true, full: true },
        { name: 'contractId', label: 'Contrato (opcional)', type: 'select', full: true,
          options: contracts.map(c => ({ value: c.id, label: (c.codigo || '') + ' · ' + (c.client || c.name) })) },
        { name: 'notes', label: 'Notas', type: 'textarea', full: true },
      ]}
      onSubmit={async (v) => {
        await apiSave('/api/caixa', v, initial);
        showToast(initial?.id ? 'Lançamento atualizado!' : 'Lançamento criado!');
        onSaved?.();
        onClose();
      }}
    />
  </Modal>
);

// =================== CONTA A PAGAR ===================
const ModalContaPagar = ({ onClose, onSaved, fornecedores = [], contracts = [], initial = null }) => (
  <Modal title={initial?.id ? 'Editar conta a pagar' : '+ Nova conta a pagar'} onClose={onClose} width={620}>
    <Form
      submitLabel="Criar conta"
      onCancel={onClose}
      layout="grid-2"
      initial={initial || {}}
      fields={[
        { name: 'descricao', label: 'Descrição', required: true, full: true, placeholder: 'Ex: Folha quinzenal' },
        { name: 'valor', label: 'Valor (R$)', type: 'number', required: true, step: '0.01' },
        { name: 'category', label: 'Categoria', type: 'select', default: 'fornecedor',
          options: [
            { value: 'fornecedor', label: 'Fornecedor' },
            { value: 'mao_de_obra', label: 'Mão de obra' },
            { value: 'tributo', label: 'Tributo' },
            { value: 'aluguel', label: 'Aluguel' },
            { value: 'outros', label: 'Outros' },
          ]},
        { name: 'dataEmissao', label: 'Data emissão', type: 'date', default: new Date().toISOString().split('T')[0] },
        { name: 'dataVencimento', label: 'Vencimento', type: 'date', required: true },
        { name: 'fornecedorId', label: 'Fornecedor', type: 'select', full: true,
          options: fornecedores.map(f => ({ value: f.id, label: f.nome })) },
        { name: 'contractId', label: 'Contrato (opcional)', type: 'select', full: true,
          options: contracts.map(c => ({ value: c.id, label: (c.codigo || '') + ' · ' + (c.client || c.name) })) },
        { name: 'numeroNF', label: 'Número da NF (entrada)', placeholder: 'NF #845' },
        { name: 'observacoes', label: 'Observações', type: 'textarea', full: true },
      ]}
      onSubmit={async (v) => {
        await apiSave('/api/contas-pagar', v, initial);
        showToast(initial?.id ? 'Conta atualizada!' : 'Conta a pagar criada!');
        onSaved?.();
        onClose();
      }}
    />
  </Modal>
);

// =================== NOTA FISCAL ===================
const ModalNF = ({ onClose, onSaved, contracts = [], initial = null }) => (
  <Modal title={initial?.id ? 'Editar NF' : '+ Nova nota fiscal'} onClose={onClose} width={560}>
    <Form
      submitLabel="Emitir NF"
      onCancel={onClose}
      layout="grid-2"
      initial={initial || {}}
      fields={[
        { name: 'numero', label: 'Número', required: true, placeholder: 'NF-846' },
        { name: 'contractId', label: 'Contrato', type: 'select', required: true,
          options: contracts.filter(c => c.status === 'ativo').map(c => ({ value: c.id, label: (c.codigo || '') + ' · ' + (c.client || c.name) })) },
        { name: 'valor', label: 'Valor (R$)', type: 'number', required: true, step: '0.01' },
        { name: 'dataLimite', label: 'Data limite', type: 'date', required: true, default: new Date().toISOString().split('T')[0] },
        { name: 'prazoRecebimento', label: 'Prazo recebimento (dias)', type: 'number', default: 30, min: 0, max: 360 },
        { name: 'observacoes', label: 'Observações', type: 'textarea', full: true },
      ]}
      onSubmit={async (v) => {
        await apiSave('/api/notas-fiscais', v, initial);
        showToast(initial?.id ? 'NF atualizada!' : 'NF criada!');
        onSaved?.();
        onClose();
      }}
    />
  </Modal>
);

// =================== SAÍDA / BM ===================
const ModalSaida = ({ onClose, onSaved, contracts = [] }) => (
  <Modal title="+ Nova saída / BM" onClose={onClose} width={580}>
    <Form
      submitLabel="Criar saída"
      onCancel={onClose}
      layout="grid-2"
      initial={initial || {}}
      fields={[
        { name: 'contractId', label: 'Contrato', type: 'select', required: true, full: true,
          options: contracts.filter(c => c.status === 'ativo').map(c => ({ value: c.id, label: (c.codigo || '') + ' · ' + (c.client || c.name) })) },
        { name: 'value', label: 'Valor (R$)', type: 'number', required: true, step: '0.01' },
        { name: 'date', label: 'Data', type: 'date', required: true, default: new Date().toISOString().split('T')[0] },
        { name: 'description', label: 'Descrição', full: true, placeholder: 'O que foi medido / executado' },
        { name: 'observacoes', label: 'Observações', type: 'textarea', full: true },
      ]}
      onSubmit={async ({ contractId, ...rest }) => {
        await apiSubmit('POST', '/api/contracts/' + contractId + '/saidas', rest);
        showToast('Saída criada!');
        onSaved?.();
        onClose();
      }}
    />
  </Modal>
);

// =================== CLIENTE ===================
const ModalCliente = ({ onClose, onSaved, initial = null }) => (
  <Modal title={initial?.id ? 'Editar cliente' : '+ Novo cliente'} onClose={onClose} width={620}>
    <Form
      submitLabel="Criar cliente"
      onCancel={onClose}
      layout="grid-2"
      initial={initial || {}}
      fields={[
        { name: 'empresa', label: 'Empresa', required: true, full: true, placeholder: 'Ex: Veracel Celulose' },
        { name: 'nome', label: 'Contato', placeholder: 'Pessoa de contato' },
        { name: 'cargo', label: 'Cargo' },
        { name: 'setor', label: 'Setor', full: true },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'telefone', label: 'Telefone' },
        { name: 'endereco', label: 'Endereço', full: true },
        { name: 'notas', label: 'Notas', type: 'textarea', full: true },
      ]}
      onSubmit={async (v) => {
        await apiSave('/api/clientes', v, initial);
        showToast(initial?.id ? 'Cliente atualizado!' : 'Cliente criado!');
        onSaved?.();
        onClose();
      }}
    />
  </Modal>
);

// =================== FORNECEDOR ===================
const ModalFornecedor = ({ onClose, onSaved, initial = null }) => (
  <Modal title={initial?.id ? 'Editar fornecedor' : '+ Novo fornecedor'} onClose={onClose} width={640}>
    <Form
      submitLabel="Criar fornecedor"
      onCancel={onClose}
      layout="grid-2"
      initial={initial || {}}
      fields={[
        { name: 'nome', label: 'Razão social', required: true, full: true },
        { name: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0000-00' },
        { name: 'pessoaContato', label: 'Pessoa de contato' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'telefone', label: 'Telefone' },
        { name: 'endereco', label: 'Endereço', full: true },
        { name: 'banco', label: 'Banco' },
        { name: 'agencia', label: 'Agência' },
        { name: 'conta', label: 'Conta' },
        { name: 'chavePix', label: 'Chave PIX' },
        { name: 'notas', label: 'Notas / materiais fornecidos', type: 'textarea', full: true,
          help: 'Use vírgulas para separar materiais (cabos, painéis, etc)' },
      ]}
      onSubmit={async (v) => {
        if (v.notas && !v.materiais) {
          v.materiais = v.notas.split(',').map(s => s.trim()).filter(Boolean);
        }
        await apiSave('/api/fornecedores', v, initial);
        showToast(initial?.id ? 'Fornecedor atualizado!' : 'Fornecedor criado!');
        onSaved?.();
        onClose();
      }}
    />
  </Modal>
);

// =================== RECURSO ===================
const ModalRecurso = ({ onClose, onSaved, initial = null }) => (
  <Modal title={initial?.id ? 'Editar recurso' : '+ Novo recurso'} onClose={onClose} width={640}>
    <Form
      submitLabel="Criar pessoa"
      onCancel={onClose}
      layout="grid-2"
      initial={initial || {}}
      fields={[
        { name: 'nome', label: 'Nome completo', required: true, full: true },
        { name: 'cpf', label: 'CPF', placeholder: '000.000.000-00' },
        { name: 'profissao', label: 'Profissão / função' },
        { name: 'status', label: 'Status', type: 'select', default: 'candidato',
          options: [
            { value: 'candidato', label: 'Candidato' },
            { value: 'funcionario', label: 'Funcionário' },
            { value: 'ex_funcionario', label: 'Ex-funcionário' },
          ]},
        { name: 'dataNascimento', label: 'Nascimento', type: 'date' },
        { name: 'genero', label: 'Gênero', type: 'select',
          options: [
            { value: 'M', label: 'Masculino' },
            { value: 'F', label: 'Feminino' },
            { value: 'O', label: 'Outro' },
          ]},
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'telefone', label: 'Telefone' },
        { name: 'endereco', label: 'Endereço', full: true },
        { name: 'salario', label: 'Salário (R$)', type: 'number', step: '0.01' },
        { name: 'dataAdmissao', label: 'Admissão', type: 'date' },
        { name: 'pis', label: 'PIS' },
        { name: 'cnh', label: 'CNH' },
      ]}
      onSubmit={async (v) => {
        await apiSave('/api/recursos', v, initial);
        showToast(initial?.id ? 'Recurso atualizado!' : 'Recurso criado!');
        onSaved?.();
        onClose();
      }}
    />
  </Modal>
);

// =================== APORTE ===================
const ModalAporte = ({ onClose, onSaved, socios = [], contracts = [], initial = null }) => (
  <Modal title={initial?.id ? 'Editar aporte' : '+ Novo aporte'} onClose={onClose} width={580}>
    <Form
      submitLabel="Lançar aporte"
      onCancel={onClose}
      layout="grid-2"
      initial={initial || {}}
      fields={[
        { name: 'socioId', label: 'Sócio', type: 'select', required: true, full: true,
          options: socios.map(s => ({ value: s.id, label: s.name })) },
        { name: 'value', label: 'Valor (R$)', type: 'number', required: true, step: '0.01' },
        { name: 'date', label: 'Data', type: 'date', required: true, default: new Date().toISOString().split('T')[0] },
        { name: 'origem', label: 'Origem', type: 'select', default: 'socio',
          options: [
            { value: 'socio', label: 'Sócio' },
            { value: 'empresa', label: 'Empresa' },
          ]},
        { name: 'destino', label: 'Destino', type: 'select', required: true, default: 'base',
          options: [
            { value: 'base', label: 'BASE (capital geral)' },
            { value: 'contrato', label: 'Contrato específico' },
          ]},
        { name: 'contractId', label: 'Contrato', type: 'select', full: true,
          showIf: (v) => v.destino === 'contrato',
          options: contracts.filter(c => c.status === 'ativo').map(c => ({ value: c.id, label: (c.codigo || '') + ' · ' + (c.client || c.name) })) },
        { name: 'description', label: 'Descrição', full: true, placeholder: 'Ex: capital de giro out/26' },
      ]}
      onSubmit={async (v) => {
        await apiSave('/api/investimentos', v, initial);
        showToast(initial?.id ? 'Aporte atualizado!' : 'Aporte lançado!');
        onSaved?.();
        onClose();
      }}
    />
  </Modal>
);

// =================== ITEM BASE ===================
const ModalBase = ({ onClose, onSaved, tipos = [], initial = null }) => (
  <Modal title={initial?.id ? 'Editar item BASE' : '+ Novo item da BASE'} onClose={onClose} width={560}>
    <Form
      submitLabel="Criar item"
      onCancel={onClose}
      layout="grid-2"
      initial={initial || {}}
      fields={[
        { name: 'description', label: 'Descrição', required: true, full: true },
        { name: 'value', label: 'Valor (R$)', type: 'number', required: true, step: '0.01' },
        { name: 'date', label: 'Data', type: 'date', required: true, default: new Date().toISOString().split('T')[0] },
        { name: 'type', label: 'Tipo', type: 'select', default: 'outros', full: true,
          options: tipos.length > 0
            ? tipos.map(t => ({ value: t.key, label: (t.icon || '') + ' ' + t.label }))
            : [{ value: 'outros', label: '🔹 Outros' }] },
        { name: 'notes', label: 'Notas', type: 'textarea', full: true },
      ]}
      onSubmit={async (v) => {
        await apiSave('/api/base', v, initial);
        showToast(initial?.id ? 'Item BASE atualizado!' : 'Item BASE criado!');
        onSaved?.();
        onClose();
      }}
    />
  </Modal>
);

// =================== SÓCIO ===================
const ModalSocio = ({ onClose, onSaved, initial = null }) => (
  <Modal title={initial?.id ? 'Editar sócio' : '+ Novo sócio'} onClose={onClose} width={560}>
    <Form
      submitLabel="Criar sócio"
      onCancel={onClose}
      layout="grid-2"
      initial={initial || {}}
      fields={[
        { name: 'name', label: 'Nome', required: true, full: true },
        { name: 'document', label: 'CPF/CNPJ' },
        { name: 'participacao', label: 'Participação (%)', type: 'number', step: '0.01', min: 0, max: 100 },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'phone', label: 'Telefone' },
        { name: 'notes', label: 'Notas', type: 'textarea', full: true },
      ]}
      onSubmit={async (v) => {
        await apiSave('/api/socios', v, initial);
        showToast(initial?.id ? 'Sócio atualizado!' : 'Sócio criado!');
        onSaved?.();
        onClose();
      }}
    />
  </Modal>
);

// Exporta todos
Object.assign(window, {
  ModalContrato,
  ModalCaixa,
  ModalContaPagar,
  ModalNF,
  ModalSaida,
  ModalCliente,
  ModalFornecedor,
  ModalRecurso,
  ModalAporte,
  ModalBase,
  ModalSocio,
});
