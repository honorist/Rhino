-- Rhino — Schema inicial Postgres
-- Estratégia: tabelas relacionais para entidades principais,
-- JSONB para coleções aninhadas (budget, alocações, abas) que
-- podem ser normalizadas depois conforme a necessidade real.

-- ============ Extensões ============
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ Sócios ============
CREATE TABLE IF NOT EXISTS socios (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  document      TEXT,
  email         TEXT,
  phone         TEXT,
  participacao  NUMERIC(5,2) DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Níveis de Acesso ============
CREATE TABLE IF NOT EXISTS niveis_acesso (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  icon          TEXT,
  cor           TEXT,
  abas          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Clientes ============
CREATE TABLE IF NOT EXISTS clientes (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  empresa       TEXT,
  cargo         TEXT,
  setor         TEXT,
  telefone      TEXT,
  email         TEXT,
  endereco      TEXT,
  lat           TEXT,
  lng           TEXT,
  notas         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes (nome);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes (empresa);

-- Portal de acesso do cliente
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS portal_email TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS portal_password_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_portal_email ON clientes (portal_email) WHERE portal_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS portal_sessions (
  id          TEXT PRIMARY KEY,
  cliente_id  TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_expires ON portal_sessions (expires_at);

-- ============ Fornecedores ============
CREATE TABLE IF NOT EXISTS fornecedores (
  id              TEXT PRIMARY KEY,
  nome            TEXT NOT NULL,
  cnpj            TEXT,
  email           TEXT,
  telefone        TEXT,
  endereco        TEXT,
  pessoa_contato  TEXT,
  materiais       JSONB DEFAULT '[]'::jsonb,
  banco           TEXT,
  agencia         TEXT,
  conta           TEXT,
  chave_pix       TEXT,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Tipos Base ============
CREATE TABLE IF NOT EXISTS tipos_base (
  id            TEXT PRIMARY KEY,
  key           TEXT UNIQUE NOT NULL,
  label         TEXT NOT NULL,
  icon          TEXT,
  cor           TEXT,
  sistema       BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Base (catálogo de itens administrativos) ============
CREATE TABLE IF NOT EXISTS base_items (
  id            TEXT PRIMARY KEY,
  description   TEXT NOT NULL,
  type          TEXT,
  value         NUMERIC(15,2) DEFAULT 0,
  date          DATE,
  notes         TEXT,
  allocations   JSONB DEFAULT '[]'::jsonb,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_base_items_type ON base_items (type);

-- ============ Recursos (funcionários/colaboradores) ============
CREATE TABLE IF NOT EXISTS recursos (
  id                  TEXT PRIMARY KEY,
  nome                TEXT NOT NULL,
  cpf                 TEXT,
  data_nascimento     DATE,
  genero              TEXT,
  telefone            TEXT,
  email               TEXT,
  endereco            TEXT,
  lat                 TEXT,
  lng                 TEXT,
  status              TEXT DEFAULT 'funcionario',
  profissao           TEXT,
  data_admissao       DATE,
  salario             NUMERIC(15,2) DEFAULT 0,
  elegivel_vale       BOOLEAN NOT NULL DEFAULT FALSE,
  cnh                 TEXT,
  pis                 TEXT,
  data_desligamento   DATE,
  motivo_desligamento TEXT,
  obs_desligamento    TEXT,
  notas               TEXT,
  alocacao_atual      JSONB,
  historico_alocacoes JSONB DEFAULT '[]'::jsonb,
  rdo_categoria       TEXT,
  folgas              JSONB DEFAULT '[]'::jsonb,
  documentos          JSONB DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recursos_status ON recursos (status);
CREATE INDEX IF NOT EXISTS idx_recursos_nome ON recursos (nome);

-- ============ Contratos ============
CREATE TABLE IF NOT EXISTS contracts (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  contract_number TEXT,
  client          TEXT NOT NULL,
  client_id       TEXT REFERENCES clientes(id) ON DELETE SET NULL,
  client_document TEXT,
  client_email    TEXT,
  client_phone    TEXT,
  value           NUMERIC(15,2) DEFAULT 0,
  currency        TEXT DEFAULT 'BRL',
  start_date      DATE,
  end_date        DATE,
  tendency_date   DATE,
  status          TEXT DEFAULT 'ativo',
  endereco        TEXT,
  lat             TEXT,
  lng             TEXT,
  notes           TEXT,
  budget          JSONB DEFAULT '[]'::jsonb,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts (client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts (status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts (end_date);

-- ============ Notas Fiscais ============
CREATE TABLE IF NOT EXISTS notas_fiscais (
  id                 TEXT PRIMARY KEY,
  numero             TEXT NOT NULL,
  contract_id        TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  data_limite        DATE,
  valor              NUMERIC(15,2) DEFAULT 0,
  prazo_recebimento  INTEGER,
  observacoes        TEXT,
  emitida            BOOLEAN DEFAULT FALSE,
  data_emissao_real  DATE,
  caixa_entry_id     TEXT,
  -- BM estruturado: aprovação do cliente + % de retenção contratual (snapshot).
  -- O VALOR retido é sempre calculado (valor × retencao_pct) — nunca armazenado.
  aprovacao_status   TEXT,
  aprovacao_por      TEXT,
  aprovacao_em       TIMESTAMPTZ,
  aprovacao_obs      TEXT,
  retencao_pct       NUMERIC(5,2),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nf_contract ON notas_fiscais (contract_id);
CREATE INDEX IF NOT EXISTS idx_nf_emitida ON notas_fiscais (emitida);
CREATE INDEX IF NOT EXISTS idx_nf_data_limite ON notas_fiscais (data_limite);

-- ============ Contas a Pagar ============
CREATE TABLE IF NOT EXISTS contas_pagar (
  id                TEXT PRIMARY KEY,
  descricao         TEXT NOT NULL,
  fornecedor_id     TEXT REFERENCES fornecedores(id) ON DELETE SET NULL,
  numero_n_f        TEXT,
  valor             NUMERIC(15,2) DEFAULT 0,
  data_emissao      DATE,
  data_vencimento   DATE,
  status            TEXT DEFAULT 'aberto',
  data_pagamento    DATE,
  caixa_entry_id    TEXT,
  contract_id       TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  category          TEXT,
  observacoes       TEXT,
  valor_pago        NUMERIC(15,2),
  forma_pagamento   TEXT,
  folha_pagamento_id TEXT,
  folha_parcela     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp_status ON contas_pagar (status);
CREATE INDEX IF NOT EXISTS idx_cp_vencimento ON contas_pagar (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_cp_fornecedor ON contas_pagar (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_cp_contract ON contas_pagar (contract_id);

-- ============ Caixa ============
CREATE TABLE IF NOT EXISTS caixa (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL CHECK (type IN ('entrada', 'saida')),
  description       TEXT NOT NULL,
  value             NUMERIC(15,2) NOT NULL,
  date              DATE NOT NULL,
  contract_id       TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  base_item_id      TEXT,
  category          TEXT,
  notes             TEXT,
  forma_pagamento   TEXT,
  conta_pagar_id    TEXT REFERENCES contas_pagar(id) ON DELETE SET NULL,
  nf_id             TEXT REFERENCES notas_fiscais(id) ON DELETE SET NULL,
  folha_pagamento_id TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caixa_date ON caixa (date);
CREATE INDEX IF NOT EXISTS idx_caixa_type ON caixa (type);
CREATE INDEX IF NOT EXISTS idx_caixa_contract ON caixa (contract_id);
CREATE INDEX IF NOT EXISTS idx_caixa_category ON caixa (category);
CREATE INDEX IF NOT EXISTS idx_caixa_folha ON caixa (folha_pagamento_id);

-- ============ Folha de Pagamento ============
CREATE TABLE IF NOT EXISTS folha_pagamento (
  id                   TEXT PRIMARY KEY,
  recurso_id           TEXT NOT NULL REFERENCES recursos(id) ON DELETE RESTRICT,
  recurso_nome         TEXT NOT NULL DEFAULT '',
  competencia          TEXT NOT NULL,
  salario_base         NUMERIC(15,2) NOT NULL DEFAULT 0,
  elegivel_vale        BOOLEAN NOT NULL DEFAULT FALSE,
  contract_id          TEXT REFERENCES contracts(id)  ON DELETE SET NULL,
  base_item_id         TEXT REFERENCES base_items(id) ON DELETE SET NULL,
  valor_vale           NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_saldo          NUMERIC(15,2) NOT NULL DEFAULT 0,
  vale_pago            BOOLEAN NOT NULL DEFAULT FALSE,
  vale_data_pagamento  DATE,
  vale_caixa_entry_id  TEXT,
  saldo_pago           BOOLEAN NOT NULL DEFAULT FALSE,
  saldo_data_pagamento DATE,
  saldo_caixa_entry_id TEXT,
  vale_conta_pagar_id  TEXT,
  saldo_conta_pagar_id TEXT,
  observacoes          TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_folha_recurso_comp ON folha_pagamento (recurso_id, competencia);
CREATE INDEX IF NOT EXISTS idx_folha_competencia ON folha_pagamento (competencia);

-- Lançamentos da folha: descontos (impostos, faltas...) e proventos (hora extra,
-- vale-alimentação...). O Saldo é recalculado como 60% + Σproventos − Σdescontos.
CREATE TABLE IF NOT EXISTS folha_pagamento_itens (
  id                 TEXT PRIMARY KEY,
  folha_pagamento_id TEXT NOT NULL REFERENCES folha_pagamento(id) ON DELETE CASCADE,
  tipo               TEXT NOT NULL CHECK (tipo IN ('desconto','provento')),
  descricao          TEXT NOT NULL DEFAULT '',
  valor              NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fpi_folha ON folha_pagamento_itens (folha_pagamento_id);

-- ============ Idempotência ============
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id            TEXT PRIMARY KEY,
  request_hash  TEXT,
  status_code   INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys (created_at);

-- ============ Investimentos / Aportes ============
CREATE TABLE IF NOT EXISTS investimentos (
  id             TEXT PRIMARY KEY,
  socio_id       TEXT,
  value          NUMERIC(15,2) DEFAULT 0,
  date           DATE,
  description    TEXT,
  origem         TEXT,
  destino        TEXT,
  base_type      TEXT,
  contract_id    TEXT,
  base_item_id   TEXT,
  caixa_entry_id TEXT,
  metadata       JSONB DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
-- ============ Templates de Documentos ============
CREATE TABLE IF NOT EXISTS doc_templates (
  id                   TEXT PRIMARY KEY,
  nome                 TEXT NOT NULL,
  tipo_documento       TEXT,
  empresa_id           TEXT,
  checklist            JSONB DEFAULT '[]'::jsonb,
  periodicidade_meses  INTEGER DEFAULT 12,
  metadata             JSONB DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Saídas (despesas/medições por contrato) ============
CREATE TABLE IF NOT EXISTS saidas (
  id            TEXT PRIMARY KEY,
  contract_id   TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  type          TEXT,
  description   TEXT,
  value         NUMERIC(15,2) DEFAULT 0,
  date          DATE,
  nf_id         TEXT,
  numero_bm     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saidas_contract ON saidas(contract_id);
CREATE INDEX IF NOT EXISTS idx_saidas_nf ON saidas(nf_id);
CREATE INDEX IF NOT EXISTS idx_saidas_date_created ON saidas(date DESC, created_at DESC);

-- ============ BM estruturado: planilha de serviços do contrato ============
-- Bill of quantities: cada serviço com unidade, qtd contratada e preço unitário.
CREATE TABLE IF NOT EXISTS contract_servicos (
  id              TEXT PRIMARY KEY,
  contract_id     TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  codigo          TEXT DEFAULT '',
  descricao       TEXT NOT NULL,
  unidade         TEXT NOT NULL DEFAULT 'un',
  qtd_contratada  NUMERIC(15,3) NOT NULL DEFAULT 0,
  preco_unit      NUMERIC(15,2) NOT NULL DEFAULT 0,
  ordem           INTEGER DEFAULT 0,
  ativo           BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contract_servicos_contract ON contract_servicos(contract_id);

-- ============ BM estruturado: itens de medição ============
-- Itens de uma medição estruturada, pendurados na `saida` (que agrega na NF/BM
-- por data). preco_unit é SNAPSHOT do serviço no momento da medição.
CREATE TABLE IF NOT EXISTS medicao_itens (
  id           TEXT PRIMARY KEY,
  saida_id     TEXT NOT NULL REFERENCES saidas(id) ON DELETE CASCADE,
  servico_id   TEXT NOT NULL REFERENCES contract_servicos(id) ON DELETE RESTRICT,
  contract_id  TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  qtd          NUMERIC(15,3) NOT NULL,
  preco_unit   NUMERIC(15,2) NOT NULL,
  valor        NUMERIC(15,2) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_medicao_itens_saida ON medicao_itens(saida_id);
CREATE INDEX IF NOT EXISTS idx_medicao_itens_servico ON medicao_itens(servico_id);
CREATE INDEX IF NOT EXISTS idx_medicao_itens_contract ON medicao_itens(contract_id);

-- ============ Organograma (membros por contrato) ============
CREATE TABLE IF NOT EXISTS organograma_membros (
  id            TEXT PRIMARY KEY,
  contract_id   TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  recurso_id    TEXT REFERENCES recursos(id) ON DELETE SET NULL,
  nivel         TEXT,
  cargo         TEXT,
  supervisor_id TEXT,
  area          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organograma_contract ON organograma_membros(contract_id);

-- ============ RDOs (Relatório Diário de Obra) ============
CREATE TABLE IF NOT EXISTS rdos (
  id                       TEXT PRIMARY KEY,
  contract_id              TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  numero                   TEXT,
  data                     DATE,
  dia_semana               TEXT,
  os_numero                TEXT,
  ordem_compra             TEXT,
  projeto                  TEXT,
  prazo                    TEXT,
  tempo                    TEXT,
  periodo_trabalho         TEXT,
  hora_extra               TEXT,
  moi                      JSONB DEFAULT '[]'::jsonb,
  mod                      JSONB DEFAULT '[]'::jsonb,
  terc                     JSONB DEFAULT '[]'::jsonb,
  equipamentos             JSONB DEFAULT '[]'::jsonb,
  atividades               JSONB DEFAULT '[]'::jsonb,
  seguranca                JSONB DEFAULT '{}'::jsonb,
  fiscalizacao_comentarios TEXT,
  totais                   JSONB DEFAULT '{}'::jsonb,
  fotos                    JSONB DEFAULT '[]'::jsonb,
  passarelli               JSONB DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rdos_contract ON rdos(contract_id);
CREATE INDEX IF NOT EXISTS idx_rdos_data ON rdos(data);

-- ============ Users (autenticação) ============
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  name            TEXT,
  nivel_acesso_id TEXT REFERENCES niveis_acesso(id) ON DELETE SET NULL,
  socio_id        TEXT REFERENCES socios(id) ON DELETE SET NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));

-- ============ Sessions ============
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- "Ver portal como cliente" (depois de users existir — portal_sessions é
-- criada lá em cima, antes de users): NULL = sessão real do cliente;
-- preenchido = id do super admin visualizando (TTL 30 min).
-- Ver migration 20260609160000.
ALTER TABLE portal_sessions
  ADD COLUMN IF NOT EXISTS impersonated_by TEXT REFERENCES users(id) ON DELETE CASCADE;

-- ============ Password reset tokens ============
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens (expires_at);

-- ============ LGPD: aceite de termos ============
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_terms_version TEXT;

-- ============ Auditoria ============
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id     TEXT,
  user_email  TEXT,
  ip          TEXT,
  method      TEXT NOT NULL,
  path        TEXT NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  action      TEXT,
  status      INTEGER,
  duration_ms INTEGER,
  body        JSONB,
  request_id  TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity, entity_id);

-- Detalhamento (adicionado depois): nome amigável + estado antes da operação
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS before_state JSONB,
  ADD COLUMN IF NOT EXISTS entity_label TEXT;

-- ============ Dashboards customizaveis (preferencias por usuario) ============
CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  widgets     JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{type, ordem, config}]
  is_default  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dash_user ON dashboard_layouts (user_id);

-- ============ Almoxarifado / Estoque ============
CREATE TABLE IF NOT EXISTS itens_estoque (
  id              TEXT PRIMARY KEY,
  codigo          TEXT,
  descricao       TEXT NOT NULL,
  unidade         TEXT,                              -- pç, kg, m, l, cx
  categoria       TEXT,
  estoque_minimo  NUMERIC(15,3) DEFAULT 0,
  custo_medio     NUMERIC(15,4) DEFAULT 0,           -- atualiza a cada entrada (média ponderada)
  notas           TEXT,
  ativo           BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_itens_codigo  ON itens_estoque (codigo);
CREATE INDEX IF NOT EXISTS idx_itens_categoria ON itens_estoque (categoria);

CREATE TABLE IF NOT EXISTS almoxarifados (
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  endereco    TEXT,
  ativo       BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_almox_contract ON almoxarifados (contract_id);

CREATE TABLE IF NOT EXISTS estoque_saldo (
  id              TEXT PRIMARY KEY,
  item_id         TEXT NOT NULL REFERENCES itens_estoque(id) ON DELETE CASCADE,
  almoxarifado_id TEXT NOT NULL REFERENCES almoxarifados(id) ON DELETE CASCADE,
  quantidade      NUMERIC(15,3) DEFAULT 0,
  UNIQUE (item_id, almoxarifado_id)
);

CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
  id                       TEXT PRIMARY KEY,
  item_id                  TEXT NOT NULL REFERENCES itens_estoque(id) ON DELETE RESTRICT,
  almoxarifado_origem_id   TEXT REFERENCES almoxarifados(id),
  almoxarifado_destino_id  TEXT REFERENCES almoxarifados(id),
  tipo                     TEXT NOT NULL CHECK (tipo IN ('entrada','saida','transferencia','ajuste')),
  quantidade               NUMERIC(15,3) NOT NULL,
  custo_unit               NUMERIC(15,4),
  contract_id              TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  data                     DATE NOT NULL,
  documento                TEXT,
  user_id                  TEXT,
  notas                    TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mov_item ON estoque_movimentacoes (item_id, data);
CREATE INDEX IF NOT EXISTS idx_mov_contract ON estoque_movimentacoes (contract_id);
CREATE INDEX IF NOT EXISTS idx_mov_data ON estoque_movimentacoes (data DESC);

-- ============ Cronograma fisico-financeiro (atividades por contrato) ============
CREATE TABLE IF NOT EXISTS atividades (
  id                TEXT PRIMARY KEY,
  contract_id       TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  parent_id         TEXT REFERENCES atividades(id) ON DELETE CASCADE,
  ordem             INTEGER DEFAULT 0,
  nome              TEXT NOT NULL,
  data_inicio_plan  DATE,
  data_fim_plan     DATE,
  data_inicio_real  DATE,
  data_fim_real     DATE,
  peso_pct          NUMERIC(5,2) DEFAULT 0,        -- % no total da obra (filhos somam 100 dentro do pai)
  exec_pct          NUMERIC(5,2) DEFAULT 0,        -- 0-100, o quanto foi feito
  custo_plan        NUMERIC(15,2) DEFAULT 0,
  predecessoras     TEXT[] DEFAULT '{}',
  notas             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ativ_contract ON atividades (contract_id);
CREATE INDEX IF NOT EXISTS idx_ativ_parent   ON atividades (parent_id);

-- ============ Assinaturas digitais nos RDOs ============
-- Encarregado, cliente, fiscal assinam o RDO no celular (canvas com dedo).
-- PNG armazenado como BYTEA — backup junto do PG, sem dependência de disco.
CREATE TABLE IF NOT EXISTS rdo_assinaturas (
  id          TEXT PRIMARY KEY,
  rdo_id      TEXT NOT NULL REFERENCES rdos(id) ON DELETE CASCADE,
  papel       TEXT NOT NULL,                    -- encarregado | cliente | fiscal | outro
  nome        TEXT NOT NULL,
  imagem      BYTEA NOT NULL,                    -- PNG da assinatura
  mime_type   TEXT DEFAULT 'image/png',
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rdo_ass_rdo ON rdo_assinaturas (rdo_id);

-- ============ Arquivos anexados a documentos de recursos ============
-- Armazena PDFs/imagens dos documentos de RH (ASO, NR-35, CNH...) como BYTEA.
-- Backup do PG cobre os arquivos automaticamente. Sem dependência de volume/disco.
CREATE TABLE IF NOT EXISTS recurso_doc_arquivos (
  id                TEXT PRIMARY KEY,
  recurso_id        TEXT NOT NULL REFERENCES recursos(id) ON DELETE CASCADE,
  doc_id            TEXT NOT NULL,
  filename          TEXT NOT NULL,
  filename_original TEXT,
  mime_type         TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  data              BYTEA NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rda_recurso ON recurso_doc_arquivos (recurso_id);
CREATE INDEX IF NOT EXISTS idx_rda_doc     ON recurso_doc_arquivos (recurso_id, doc_id);

-- ============ Contract templates body (F3) ============
ALTER TABLE doc_templates ADD COLUMN IF NOT EXISTS body TEXT;

-- ============ Feature Flags (F18) ============
CREATE TABLE IF NOT EXISTS feature_flags (
  key         TEXT PRIMARY KEY,
  enabled     BOOLEAN DEFAULT FALSE,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('anomaly_detection', true,  'Alertas de anomalia em despesas (>2σ da média da categoria)'),
  ('ai_classify',       false, 'Classificação automática de despesas por IA'),
  ('ai_chat',           false, 'Chat em linguagem natural com os dados do sistema'),
  ('ofx_import',        true,  'Importação de extrato bancário OFX'),
  ('onboarding_tour',   true,  'Tour guiado para novos usuários'),
  ('recurring_payments',true,  'Contas a pagar recorrentes (lançamento automático)')
ON CONFLICT (key) DO NOTHING;

-- ============ Push Subscriptions ============
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Retenção no Contrato ============
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS retencao_percent NUMERIC(5,2) DEFAULT 0;

-- ============ Aditivos de Contrato ============
CREATE TABLE IF NOT EXISTS contract_aditivos (
  id            TEXT PRIMARY KEY,
  contract_id   TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  numero        TEXT,
  tipo          TEXT DEFAULT 'valor',     -- valor | prazo | escopo
  descricao     TEXT NOT NULL,
  valor_delta   NUMERIC(15,2) DEFAULT 0, -- positivo = aumento, negativo = redução
  dias_delta    INTEGER DEFAULT 0,
  data          DATE,
  aprovado      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aditivos_contract ON contract_aditivos (contract_id);

-- ============ Marcos / Checklist de Obra ============
CREATE TABLE IF NOT EXISTS contract_marcos (
  id            TEXT PRIMARY KEY,
  contract_id   TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL,
  descricao     TEXT,
  prazo         DATE,
  concluido     BOOLEAN DEFAULT FALSE,
  concluido_em  DATE,
  ordem         INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marcos_contract ON contract_marcos (contract_id);

-- ============ Ocorrências de Obra ============
CREATE TABLE IF NOT EXISTS contract_ocorrencias (
  id            TEXT PRIMARY KEY,
  contract_id   TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  tipo          TEXT DEFAULT 'geral',    -- geral | seguranca | qualidade | prazo | financeiro
  severidade    TEXT DEFAULT 'media',   -- baixa | media | alta | critica
  descricao     TEXT NOT NULL,
  data          DATE,
  encerrada     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_contract ON contract_ocorrencias (contract_id);

-- ============ Recorrência em Contas a Pagar (F7) ============
ALTER TABLE contas_pagar
  ADD COLUMN IF NOT EXISTS recorrente          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS periodicidade       TEXT,
  ADD COLUMN IF NOT EXISTS recorrencia_origem_id TEXT;

CREATE INDEX IF NOT EXISTS idx_cp_recorrente ON contas_pagar (recorrente) WHERE recorrente = TRUE;

-- ============ Solicitações de Compra ============
CREATE TABLE IF NOT EXISTS solicitacoes_compra (
  id                       TEXT PRIMARY KEY,
  numero                   SERIAL,
  solicitante_user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  solicitante_nome         TEXT,                            -- snapshot p/ exibição
  contract_id              TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  almoxarifado_destino_id  TEXT REFERENCES almoxarifados(id) ON DELETE SET NULL,
  fornecedor_id            TEXT REFERENCES fornecedores(id) ON DELETE SET NULL,
  itens                    JSONB NOT NULL DEFAULT '[]'::jsonb,
                            -- [{ itemEstoqueId, descricao, qtd, precoUnit, observacoes }]
  valor_total              NUMERIC(15,2) DEFAULT 0,
  justificativa            TEXT,
  status                   TEXT DEFAULT 'pendente_avaliacao',
  -- Avaliação (financeiro): precifica e define destino, ou cancela
  avaliador_user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  avaliador_nome           TEXT,
  avaliado_em              TIMESTAMPTZ,
  cancelado_em             TIMESTAMPTZ,
  motivo_cancelamento      TEXT,
  -- Aprovação (gerente): aprova ou rejeita
  aprovador_user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  aprovador_nome           TEXT,
  aprovado_em              TIMESTAMPTZ,
  motivo_rejeicao          TEXT,
  conta_pagar_id           TEXT REFERENCES contas_pagar(id) ON DELETE SET NULL,
  movimentacao_ids         JSONB DEFAULT '[]'::jsonb,       -- ids das mov. de entrada geradas
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_solcompra_status   ON solicitacoes_compra (status);
CREATE INDEX IF NOT EXISTS idx_solcompra_contract ON solicitacoes_compra (contract_id);
CREATE INDEX IF NOT EXISTS idx_solcompra_user     ON solicitacoes_compra (solicitante_user_id);

-- Migração v1.0.25: novas colunas + status com 5 valores. Idempotente.
ALTER TABLE solicitacoes_compra
  ADD COLUMN IF NOT EXISTS avaliador_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS avaliador_nome      TEXT,
  ADD COLUMN IF NOT EXISTS avaliado_em         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelado_em        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;

-- Migração v1.0.26: etapas de compra e recebimento (separadas da aprovação).
ALTER TABLE solicitacoes_compra
  ADD COLUMN IF NOT EXISTS comprador_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comprador_nome        TEXT,
  ADD COLUMN IF NOT EXISTS comprado_em           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS numero_pedido         TEXT,
  ADD COLUMN IF NOT EXISTS data_prevista_entrega DATE,
  ADD COLUMN IF NOT EXISTS recebedor_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recebedor_nome        TEXT,
  ADD COLUMN IF NOT EXISTS recebido_em           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_recebimento      DATE,
  ADD COLUMN IF NOT EXISTS nf_recebimento        TEXT,
  ADD COLUMN IF NOT EXISTS obs_recebimento       TEXT;

-- Solicitações antigas com status 'pendente' viram pendente_aprovacao se já tinham preço,
-- ou pendente_avaliacao se não tinham. (Banco virgem: nada acontece — segura.)
UPDATE solicitacoes_compra SET status = 'pendente_aprovacao'
  WHERE status = 'pendente' AND COALESCE(valor_total, 0) > 0;
UPDATE solicitacoes_compra SET status = 'pendente_avaliacao'
  WHERE status = 'pendente';

-- Atualiza CHECK constraint pra aceitar os 7 status (drop+create idempotente)
ALTER TABLE solicitacoes_compra DROP CONSTRAINT IF EXISTS solicitacoes_compra_status_check;
ALTER TABLE solicitacoes_compra ADD CONSTRAINT solicitacoes_compra_status_check
  CHECK (status IN ('pendente_avaliacao','pendente_aprovacao','aprovada','comprada','recebida','rejeitada','cancelada'));

-- Migração v1.0.25/26: permissões — financeiro/admin avaliam, financeiro+operador+admin recebem.
-- Idempotente: só adiciona se ainda não tiver.
DO $$
DECLARE r RECORD; abas_atual JSONB;
BEGIN
  -- Avaliar: financeiro + admin
  FOR r IN SELECT id, abas FROM niveis_acesso WHERE id IN ('financeiro', 'admin') LOOP
    abas_atual := r.abas;
    IF NOT abas_atual ? 'solicitacoes-compra:avaliar' THEN
      abas_atual := abas_atual || '"solicitacoes-compra:avaliar"'::jsonb;
    END IF;
    IF NOT abas_atual ? '#/solicitacoes-compra' THEN
      abas_atual := abas_atual || '"#/solicitacoes-compra"'::jsonb;
    END IF;
    UPDATE niveis_acesso SET abas = abas_atual WHERE id = r.id;
  END LOOP;
  -- Receber chegada: financeiro + operador + admin
  FOR r IN SELECT id, abas FROM niveis_acesso WHERE id IN ('financeiro', 'operador', 'admin') LOOP
    abas_atual := r.abas;
    IF NOT abas_atual ? 'solicitacoes-compra:receber' THEN
      abas_atual := abas_atual || '"solicitacoes-compra:receber"'::jsonb;
    END IF;
    UPDATE niveis_acesso SET abas = abas_atual WHERE id = r.id;
  END LOOP;
END $$;

-- ============ Frota / Veículos ============
CREATE TABLE IF NOT EXISTS veiculos (
  id                  TEXT PRIMARY KEY,
  placa               TEXT NOT NULL UNIQUE,
  modelo              TEXT,
  marca               TEXT,
  ano                 INTEGER,
  tipo                TEXT,                            -- carro, caminhao, van, moto, equipamento, outro
  km_atual            INTEGER DEFAULT 0,
  km_atualizado_em    TIMESTAMPTZ,
  lat                 NUMERIC(10,6),
  lng                 NUMERIC(10,6),
  endereco            TEXT,
  localizado_em       TIMESTAMPTZ,
  contract_id         TEXT REFERENCES contracts(id) ON DELETE SET NULL, -- alocação atual
  status              TEXT DEFAULT 'ativo' CHECK (status IN ('ativo','manutencao','inativo')),
  observacoes         TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_veiculos_contract ON veiculos (contract_id);
CREATE INDEX IF NOT EXISTS idx_veiculos_status   ON veiculos (status);

CREATE TABLE IF NOT EXISTS veiculo_planos (
  id                  TEXT PRIMARY KEY,
  veiculo_id          TEXT NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  descricao           TEXT NOT NULL,                   -- "Troca de óleo", "Revisão dos freios"
  intervalo_km        INTEGER,                         -- nullable
  intervalo_meses     INTEGER,                         -- nullable; pelo menos 1 dos 2 deve existir
  ultimo_km           INTEGER,                         -- km da última execução
  ultima_data         DATE,                            -- data da última execução
  ativo               BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_planos_veiculo ON veiculo_planos (veiculo_id);

CREATE TABLE IF NOT EXISTS veiculo_manutencoes (
  id                  TEXT PRIMARY KEY,
  veiculo_id          TEXT NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  plano_id            TEXT REFERENCES veiculo_planos(id) ON DELETE SET NULL,
  tipo                TEXT,                            -- preventiva, corretiva, revisao
  descricao           TEXT,
  data                DATE NOT NULL,
  km                  INTEGER,
  custo               NUMERIC(15,2),
  fornecedor_id       TEXT REFERENCES fornecedores(id) ON DELETE SET NULL,
  observacoes         TEXT,
  arquivo             JSONB,                           -- { filename, mimeType, sizeBytes, sha, path }
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_manut_veiculo ON veiculo_manutencoes (veiculo_id);
CREATE INDEX IF NOT EXISTS idx_manut_data    ON veiculo_manutencoes (data DESC);

CREATE TABLE IF NOT EXISTS veiculo_abastecimentos (
  id               TEXT PRIMARY KEY,
  veiculo_id       TEXT NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  data             DATE NOT NULL,
  km               INTEGER,
  litros           NUMERIC(10,2) NOT NULL,
  valor_total      NUMERIC(15,2),
  tipo_combustivel TEXT,
  fornecedor_id    TEXT REFERENCES fornecedores(id) ON DELETE SET NULL,
  contract_id      TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  observacoes      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_abastec_veiculo  ON veiculo_abastecimentos (veiculo_id);
CREATE INDEX IF NOT EXISTS idx_abastec_data     ON veiculo_abastecimentos (data DESC);
CREATE INDEX IF NOT EXISTS idx_abastec_contract ON veiculo_abastecimentos (contract_id);

-- ============ Histórico de status de contratos (cobrança mensal) ============
-- Cada mudança de status em `contracts` insere uma linha aqui.
-- Permite calcular dias ativos por contrato em qualquer mês.
CREATE TABLE IF NOT EXISTS contract_status_history (
  id          BIGSERIAL PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  valid_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_csh_contract_from ON contract_status_history (contract_id, valid_from);

-- Backfill: contrato existente sem registro ganha uma linha com status atual desde sua criação
INSERT INTO contract_status_history (contract_id, status, valid_from)
SELECT c.id, c.status, c.created_at
FROM contracts c
WHERE NOT EXISTS (SELECT 1 FROM contract_status_history h WHERE h.contract_id = c.id);

-- Trigger: registra mudança de status sempre que UPDATE muda o valor
CREATE OR REPLACE FUNCTION log_contract_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO contract_status_history (contract_id, status, valid_from)
    VALUES (NEW.id, NEW.status, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contract_status_history ON contracts;
CREATE TRIGGER trg_contract_status_history
AFTER UPDATE ON contracts
FOR EACH ROW EXECUTE FUNCTION log_contract_status_change();

-- INSERT: ao criar contrato, primeira linha do histórico
CREATE OR REPLACE FUNCTION log_contract_status_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO contract_status_history (contract_id, status, valid_from)
  VALUES (NEW.id, COALESCE(NEW.status, 'ativo'), COALESCE(NEW.created_at, NOW()));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contract_status_insert ON contracts;
CREATE TRIGGER trg_contract_status_insert
AFTER INSERT ON contracts
FOR EACH ROW EXECUTE FUNCTION log_contract_status_insert();

-- Migração: perfis administrativos ganham rota '#/cobranca' nas abas (idempotente).
-- Dá pra qualquer perfil cujo id ou label contenha 'admin' ou 'gerente' (case-insensitive).
DO $$
DECLARE r RECORD; abas_atual JSONB;
BEGIN
  FOR r IN
    SELECT id, abas FROM niveis_acesso
    WHERE LOWER(id) ~ '(admin|gerente)' OR LOWER(COALESCE(label, '')) ~ '(admin|gerente)'
  LOOP
    abas_atual := r.abas;
    IF NOT abas_atual ? '#/cobranca' THEN
      abas_atual := abas_atual || '"#/cobranca"'::jsonb;
      UPDATE niveis_acesso SET abas = abas_atual WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- ============ Trigger genérico de updated_at ============
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============ Uso de IA (Claude) ============
CREATE TABLE IF NOT EXISTS ai_usage (
  id            BIGSERIAL PRIMARY KEY,
  ts            TIMESTAMPTZ DEFAULT NOW(),
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(10,6) NOT NULL DEFAULT 0,
  recurso_id    TEXT,
  doc_id        TEXT,
  status        TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_ts ON ai_usage (ts);

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'socios','niveis_acesso','clientes','fornecedores',
      'base_items','recursos','contracts','notas_fiscais',
      'contas_pagar','investimentos','doc_templates','rdos','users',
      'solicitacoes_compra','veiculos','veiculo_planos','veiculo_manutencoes',
      'propostas','clausulas'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
       CREATE TRIGGER trg_%I_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ============ Propostas (Módulo de Propostas de Serviço) ============
CREATE TABLE IF NOT EXISTS propostas (
  id                     TEXT PRIMARY KEY,
  numero                 TEXT NOT NULL,
  ano                    INTEGER NOT NULL,
  revisao                INTEGER NOT NULL DEFAULT 0,
  proposta_pai_id        TEXT REFERENCES propostas(id) ON DELETE SET NULL,
  tipo                   TEXT NOT NULL DEFAULT 'ambos' CHECK (tipo IN ('hh','material','ambos')),
  cliente_id             TEXT REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nome           TEXT,
  cliente_empresa        TEXT,
  cliente_contato        TEXT,
  cliente_cargo          TEXT,
  cliente_email          TEXT,
  cliente_telefone       TEXT,
  cliente_documento      TEXT,
  cliente_endereco       TEXT,
  referencia             TEXT,
  titulo                 TEXT NOT NULL,
  objetivo               TEXT,
  saudacao               TEXT,
  escopo                 JSONB DEFAULT '[]'::jsonb,
  obrigacoes_contratada  JSONB DEFAULT '[]'::jsonb,
  obrigacoes_contratante JSONB DEFAULT '[]'::jsonb,
  cronograma             JSONB DEFAULT '[]'::jsonb,
  investimento_hh        JSONB DEFAULT '[]'::jsonb,
  investimento_mat       JSONB DEFAULT '[]'::jsonb,
  valor_total            NUMERIC(15,2) DEFAULT 0,
  condicoes_pagamento    TEXT,
  prazo_execucao         TEXT,
  validade_dias          INTEGER DEFAULT 15,
  garantia_meses         INTEGER,
  observacoes            TEXT,
  signatario             TEXT DEFAULT 'Deyvison Veloso',
  signatario_cargo       TEXT DEFAULT 'Diretor',
  data_emissao           DATE DEFAULT CURRENT_DATE,
  data_envio             TIMESTAMPTZ,
  data_aceite            TIMESTAMPTZ,
  data_rejeicao          TIMESTAMPTZ,
  status                 TEXT NOT NULL DEFAULT 'rascunho'
                          CHECK (status IN ('rascunho','enviada','aceita','rejeitada','expirada')),
  contrato_id            TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  metadata               JSONB DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (numero, ano, revisao)
);
CREATE INDEX IF NOT EXISTS idx_propostas_cliente  ON propostas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_propostas_status   ON propostas (status);
CREATE INDEX IF NOT EXISTS idx_propostas_contrato ON propostas (contrato_id);
CREATE INDEX IF NOT EXISTS idx_propostas_ano_num  ON propostas (ano DESC, numero DESC);

CREATE TABLE IF NOT EXISTS proposta_custos (
  id            TEXT PRIMARY KEY,
  proposta_id   TEXT NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
  categoria     TEXT NOT NULL,
  descricao     TEXT,
  valor         NUMERIC(15,2) DEFAULT 0,
  percentual    NUMERIC(7,4),
  ordem         INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proposta_custos_proposta ON proposta_custos (proposta_id);

CREATE TABLE IF NOT EXISTS clausulas (
  id            TEXT PRIMARY KEY,
  titulo        TEXT NOT NULL,
  texto         TEXT NOT NULL,
  categoria     TEXT NOT NULL,
  tags          TEXT[] DEFAULT '{}',
  ativa         BOOLEAN DEFAULT TRUE,
  uso_count     INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clausulas_categoria ON clausulas (categoria);
CREATE INDEX IF NOT EXISTS idx_clausulas_tags      ON clausulas USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_clausulas_ativa     ON clausulas (ativa);

CREATE TABLE IF NOT EXISTS proposta_anexos (
  id            TEXT PRIMARY KEY,
  proposta_id   TEXT NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('pdf','imagem')),
  nome          TEXT NOT NULL,
  data          BYTEA NOT NULL,
  mime_type     TEXT,
  size_bytes    INTEGER,
  legenda       TEXT,
  secao         TEXT DEFAULT 'anexo_final',
  ordem         INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proposta_anexos_proposta ON proposta_anexos (proposta_id);
CREATE INDEX IF NOT EXISTS idx_proposta_anexos_secao    ON proposta_anexos (proposta_id, secao);

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO app_settings (key, value)
VALUES ('proposta_apresentacao', '{"apresentacao":"","casesSucesso":"","segurancaSaude":""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS case_logos (
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  cliente_id  TEXT REFERENCES clientes(id) ON DELETE SET NULL,
  data        BYTEA NOT NULL,
  mime_type   TEXT,
  size_bytes  INTEGER,
  ordem       INTEGER DEFAULT 0,
  ativo       BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_case_logos_ativo ON case_logos (ativo);
CREATE INDEX IF NOT EXISTS idx_case_logos_ordem ON case_logos (ordem);
