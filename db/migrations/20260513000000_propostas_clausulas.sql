-- Migração: Módulo de Propostas de Serviço (v1.1.0)
-- Adiciona tabelas: propostas, proposta_custos, clausulas, proposta_anexos
-- Idempotente: pode rodar várias vezes (IF NOT EXISTS em tudo).
-- Aplicar via: painel Railway → Postgres → Query, OU
--             psql "$DATABASE_URL" < db/migrations/20260513000000_propostas_clausulas.sql

-- ============ Propostas ============
CREATE TABLE IF NOT EXISTS propostas (
  id                     TEXT PRIMARY KEY,
  numero                 TEXT NOT NULL,                       -- "08" (sequencial dentro do ano)
  ano                    INTEGER NOT NULL,                    -- 26 (últimos 2 dígitos do ano)
  revisao                INTEGER NOT NULL DEFAULT 0,          -- 0, 1, 2 (Rev.00, Rev.01)
  proposta_pai_id        TEXT REFERENCES propostas(id) ON DELETE SET NULL,
  tipo                   TEXT NOT NULL DEFAULT 'ambos' CHECK (tipo IN ('hh','material','ambos')),
  cliente_id             TEXT REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nome           TEXT,                                -- snapshot p/ histórico
  cliente_empresa        TEXT,
  cliente_contato        TEXT,                                -- Att.:
  cliente_cargo          TEXT,
  cliente_email          TEXT,
  cliente_telefone       TEXT,
  cliente_documento      TEXT,                                -- CNPJ
  cliente_endereco       TEXT,
  referencia             TEXT,                                -- "Ref.: <obra>"
  titulo                 TEXT NOT NULL,
  objetivo               TEXT,
  saudacao               TEXT,                                -- parágrafo de cortesia (default no app)
  escopo                 JSONB DEFAULT '[]'::jsonb,           -- [{id, texto, incluso, ordem}]
  obrigacoes_contratada  JSONB DEFAULT '[]'::jsonb,           -- [{id, clausulaId?, titulo, texto}]
  obrigacoes_contratante JSONB DEFAULT '[]'::jsonb,
  cronograma             JSONB DEFAULT '[]'::jsonb,           -- [{id, fase, inicio, fim, duracaoDias}]
  investimento_hh        JSONB DEFAULT '[]'::jsonb,           -- [{id, cargo, qtd, horas, valorHora, total}]
  investimento_mat       JSONB DEFAULT '[]'::jsonb,           -- [{id, item, qtd, unid, valorUnit, total}]
  valor_total            NUMERIC(15,2) DEFAULT 0,
  condicoes_pagamento    TEXT,
  prazo_execucao         TEXT,
  validade_dias          INTEGER DEFAULT 15,
  garantia_meses         INTEGER,                             -- NULL = sem garantia
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

-- ============ Custos internos (privados — análise de margem) ============
CREATE TABLE IF NOT EXISTS proposta_custos (
  id            TEXT PRIMARY KEY,
  proposta_id   TEXT NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
  categoria     TEXT NOT NULL,        -- 'mao_obra' | 'material' | 'equipamento' | 'frete' | 'impostos' | 'bdi' | 'lucro' | 'outros'
  descricao     TEXT,
  valor         NUMERIC(15,2) DEFAULT 0,
  percentual    NUMERIC(7,4),         -- p/ BDI/lucro/impostos quando aplicável
  ordem         INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proposta_custos_proposta ON proposta_custos (proposta_id);

-- ============ Biblioteca de Cláusulas Reusáveis ============
CREATE TABLE IF NOT EXISTS clausulas (
  id            TEXT PRIMARY KEY,
  titulo        TEXT NOT NULL,
  texto         TEXT NOT NULL,
  categoria     TEXT NOT NULL,        -- 'obrigacoes_contratada' | 'obrigacoes_contratante' | 'pagamento' | 'garantia' | 'geral'
  tags          TEXT[] DEFAULT '{}',
  ativa         BOOLEAN DEFAULT TRUE,
  uso_count     INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clausulas_categoria ON clausulas (categoria);
CREATE INDEX IF NOT EXISTS idx_clausulas_tags      ON clausulas USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_clausulas_ativa     ON clausulas (ativa);

-- ============ Anexos (PDFs + imagens ilustrativas) ============
CREATE TABLE IF NOT EXISTS proposta_anexos (
  id            TEXT PRIMARY KEY,
  proposta_id   TEXT NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('pdf','imagem')),
  nome          TEXT NOT NULL,
  data          BYTEA NOT NULL,             -- conteúdo binário (igual padrão recurso_doc_arquivos)
  mime_type     TEXT,
  size_bytes    INTEGER,
  legenda       TEXT,                       -- caption p/ imagens
  secao         TEXT DEFAULT 'anexo_final', -- 'escopo' | 'anexo_final'
  ordem         INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proposta_anexos_proposta ON proposta_anexos (proposta_id);
CREATE INDEX IF NOT EXISTS idx_proposta_anexos_secao    ON proposta_anexos (proposta_id, secao);

-- ============ Trigger updated_at em propostas e clausulas ============
DROP TRIGGER IF EXISTS trg_propostas_updated_at ON propostas;
CREATE TRIGGER trg_propostas_updated_at
BEFORE UPDATE ON propostas
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_clausulas_updated_at ON clausulas;
CREATE TRIGGER trg_clausulas_updated_at
BEFORE UPDATE ON clausulas
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ Seed de cláusulas padrão (extraídas dos modelos Rhino) ============
INSERT INTO clausulas (id, titulo, texto, categoria, tags) VALUES
  ('cl_oc_001', 'Mão de obra qualificada',
   'A CONTRATADA fornecerá toda a mão de obra qualificada e necessária para a execução dos serviços descritos no escopo, incluindo profissionais com certificações e treinamentos exigidos para a atividade.',
   'obrigacoes_contratada', ARRAY['mao_obra','padrao']),
  ('cl_oc_002', 'EPIs e EPCs',
   'A CONTRATADA fornecerá todos os EPIs (Equipamentos de Proteção Individual) e EPCs (Equipamentos de Proteção Coletiva) necessários à execução segura dos serviços, em conformidade com as normas regulamentadoras aplicáveis.',
   'obrigacoes_contratada', ARRAY['seguranca','padrao']),
  ('cl_oc_003', 'Ferramentas e equipamentos',
   'A CONTRATADA fornecerá todas as ferramentas manuais, elétricas e pneumáticas necessárias à execução dos serviços, mantendo-as em perfeitas condições de uso e dentro da validade de inspeção quando aplicável.',
   'obrigacoes_contratada', ARRAY['equipamentos','padrao']),
  ('cl_oc_004', 'Encargos sociais e trabalhistas',
   'A CONTRATADA é responsável por todos os encargos sociais, trabalhistas, previdenciários e fiscais decorrentes da execução dos serviços, incluindo salários, FGTS, INSS, vales-transporte, alimentação e seguros.',
   'obrigacoes_contratada', ARRAY['trabalhista','padrao']),
  ('cl_oc_005', 'Documentação técnica e de segurança',
   'A CONTRATADA apresentará, previamente ao início dos serviços, toda a documentação exigida pela CONTRATANTE — APR (Análise Preliminar de Risco), PT (Permissão de Trabalho), ASOs, treinamentos (NR-10, NR-33, NR-35, etc.) e certificações dos profissionais envolvidos.',
   'obrigacoes_contratada', ARRAY['documentacao','seguranca','padrao']),
  ('cl_oc_006', 'Limpeza da área',
   'A CONTRATADA é responsável pela limpeza diária da área de trabalho e pela retirada de resíduos e sobras de material ao final da execução dos serviços.',
   'obrigacoes_contratada', ARRAY['limpeza','padrao']),

  ('cl_ot_001', 'Acesso à área e liberação',
   'A CONTRATANTE providenciará o livre acesso da equipe da CONTRATADA à área dos serviços, bem como as liberações e autorizações internas necessárias para a execução.',
   'obrigacoes_contratante', ARRAY['acesso','padrao']),
  ('cl_ot_002', 'Fornecimento de utilidades',
   'A CONTRATANTE fornecerá energia elétrica, água industrial, ar comprimido e demais utilidades necessárias à execução dos serviços, nos pontos mais próximos da área de trabalho.',
   'obrigacoes_contratante', ARRAY['utilidades','padrao']),
  ('cl_ot_003', 'Vestiário e refeitório',
   'A CONTRATANTE disponibilizará instalações de vestiário e refeitório para uso da equipe da CONTRATADA durante a execução dos serviços.',
   'obrigacoes_contratante', ARRAY['estrutura','padrao']),
  ('cl_ot_004', 'Fiscalização e acompanhamento técnico',
   'A CONTRATANTE designará um responsável técnico para acompanhamento e fiscalização dos serviços, com autoridade para aprovar etapas concluídas e dirimir dúvidas técnicas.',
   'obrigacoes_contratante', ARRAY['fiscalizacao','padrao']),
  ('cl_ot_005', 'Pagamentos nas datas acordadas',
   'A CONTRATANTE realizará os pagamentos conforme cronograma e condições estabelecidas nesta proposta, mediante apresentação de medições aprovadas e nota fiscal.',
   'obrigacoes_contratante', ARRAY['pagamento','padrao']),

  ('cl_pg_001', 'Pagamento padrão 20/65/15',
   '20% (vinte por cento) na mobilização, mediante apresentação de nota fiscal; 65% (sessenta e cinco por cento) conforme cronograma de medições aprovadas; 15% (quinze por cento) na entrega final e aceite técnico dos serviços.',
   'pagamento', ARRAY['padrao','20-65-15']),
  ('cl_pg_002', 'Pagamento integral 30 dias',
   'Pagamento integral em 30 (trinta) dias após a entrega dos serviços, mediante apresentação de nota fiscal e aprovação técnica da CONTRATANTE.',
   'pagamento', ARRAY['simples']),

  ('cl_gr_001', 'Garantia 18 meses fabricação',
   'A CONTRATADA oferece garantia de 18 (dezoito) meses contra defeitos de fabricação e mão de obra, contados a partir da entrega dos serviços. A garantia cobre exclusivamente vícios construtivos, não se aplicando a desgastes naturais, mau uso ou intervenções de terceiros.',
   'garantia', ARRAY['fabricacao','padrao']),
  ('cl_gr_002', 'Garantia 12 meses serviço',
   'A CONTRATADA oferece garantia de 12 (doze) meses sobre os serviços prestados, contados a partir da entrega e aceite técnico, conforme legislação vigente.',
   'garantia', ARRAY['servico']),

  ('cl_gn_001', 'Validade da proposta',
   'Esta proposta tem validade de 15 (quinze) dias corridos a partir da data de emissão.',
   'geral', ARRAY['validade','padrao']),
  ('cl_gn_002', 'Reajustes',
   'Os preços apresentados nesta proposta são fixos para o período de execução conforme cronograma. Eventual prorrogação superior a 12 meses ensejará reajuste pelo IPCA acumulado.',
   'geral', ARRAY['reajuste']),
  ('cl_gn_003', 'Foro',
   'Fica eleito o foro da Comarca de Três Lagoas/MS para dirimir quaisquer questões oriundas desta proposta e do contrato dela decorrente.',
   'geral', ARRAY['foro','padrao'])
ON CONFLICT (id) DO NOTHING;
