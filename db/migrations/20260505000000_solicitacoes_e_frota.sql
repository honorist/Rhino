-- Migração: Solicitações de Compra + Frota (v1.0.22)
-- Pode rodar várias vezes (idempotente — IF NOT EXISTS em tudo).
-- Aplicar via: painel Railway → Postgres → Query, OU
--             psql "$DATABASE_URL" < db/migrations/2026_05_05_solicitacoes_e_frota.sql

-- ============ Solicitações de Compra ============
CREATE TABLE IF NOT EXISTS solicitacoes_compra (
  id                       TEXT PRIMARY KEY,
  numero                   SERIAL,
  solicitante_user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  solicitante_nome         TEXT,
  contract_id              TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  almoxarifado_destino_id  TEXT REFERENCES almoxarifados(id) ON DELETE SET NULL,
  fornecedor_id            TEXT REFERENCES fornecedores(id) ON DELETE SET NULL,
  itens                    JSONB NOT NULL DEFAULT '[]'::jsonb,
  valor_total              NUMERIC(15,2) DEFAULT 0,
  justificativa            TEXT,
  status                   TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','rejeitada','cancelada')),
  aprovador_user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  aprovador_nome           TEXT,
  aprovado_em              TIMESTAMPTZ,
  motivo_rejeicao          TEXT,
  conta_pagar_id           TEXT REFERENCES contas_pagar(id) ON DELETE SET NULL,
  movimentacao_ids         JSONB DEFAULT '[]'::jsonb,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_solcompra_status   ON solicitacoes_compra (status);
CREATE INDEX IF NOT EXISTS idx_solcompra_contract ON solicitacoes_compra (contract_id);
CREATE INDEX IF NOT EXISTS idx_solcompra_user     ON solicitacoes_compra (solicitante_user_id);

-- ============ Frota / Veículos ============
CREATE TABLE IF NOT EXISTS veiculos (
  id                  TEXT PRIMARY KEY,
  placa               TEXT NOT NULL UNIQUE,
  modelo              TEXT,
  marca               TEXT,
  ano                 INTEGER,
  tipo                TEXT,
  km_atual            INTEGER DEFAULT 0,
  km_atualizado_em    TIMESTAMPTZ,
  lat                 NUMERIC(10,6),
  lng                 NUMERIC(10,6),
  endereco            TEXT,
  localizado_em       TIMESTAMPTZ,
  contract_id         TEXT REFERENCES contracts(id) ON DELETE SET NULL,
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
  descricao           TEXT NOT NULL,
  intervalo_km        INTEGER,
  intervalo_meses     INTEGER,
  ultimo_km           INTEGER,
  ultima_data         DATE,
  ativo               BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_planos_veiculo ON veiculo_planos (veiculo_id);

CREATE TABLE IF NOT EXISTS veiculo_manutencoes (
  id                  TEXT PRIMARY KEY,
  veiculo_id          TEXT NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  plano_id            TEXT REFERENCES veiculo_planos(id) ON DELETE SET NULL,
  tipo                TEXT,
  descricao           TEXT,
  data                DATE NOT NULL,
  km                  INTEGER,
  custo               NUMERIC(15,2),
  fornecedor_id       TEXT REFERENCES fornecedores(id) ON DELETE SET NULL,
  observacoes         TEXT,
  arquivo             JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_manut_veiculo ON veiculo_manutencoes (veiculo_id);
CREATE INDEX IF NOT EXISTS idx_manut_data    ON veiculo_manutencoes (data DESC);

-- ============ Triggers de updated_at para as tabelas novas ============
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['solicitacoes_compra','veiculos','veiculo_planos','veiculo_manutencoes'])
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

-- ============ Atualiza permissões dos perfis (idempotente) ============
-- Adiciona perfil "Gerente" (com permissão de aprovação) se não existir.
INSERT INTO niveis_acesso (id, label, icon, cor, abas) VALUES
  ('gerente', 'Gerente', 'briefcase', '#7C3AED',
   '["#/dashboard","#/contratos","#/caixa","#/notas-fiscais","#/contas-pagar","#/clientes","#/fornecedores","#/recursos","#/obras","#/frota","#/solicitacoes-compra","#/estoque","solicitacoes-compra:aprovar","edit:#/frota","contrato-tab:visao","contrato-tab:financeiro","contrato-tab:equipe","contrato-tab:rdo","contrato-tab:pendencias"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Adiciona '#/frota' e '#/solicitacoes-compra' aos perfis existentes que ainda não têm.
-- Usa jsonb_set + concatenação garantindo que duplicatas não são criadas.
DO $$
DECLARE
  novos_admin TEXT[] := ARRAY['#/frota','#/solicitacoes-compra','solicitacoes-compra:aprovar'];
  novos_outros TEXT[] := ARRAY['#/frota','#/solicitacoes-compra'];
  r RECORD;
  novo TEXT;
  abas_atual JSONB;
BEGIN
  -- admin → tudo (incluindo permissão de aprovação)
  FOR r IN SELECT id, abas FROM niveis_acesso WHERE id = 'admin' LOOP
    abas_atual := r.abas;
    FOREACH novo IN ARRAY novos_admin LOOP
      IF NOT abas_atual ? novo THEN
        abas_atual := abas_atual || to_jsonb(novo);
      END IF;
    END LOOP;
    UPDATE niveis_acesso SET abas = abas_atual WHERE id = r.id;
  END LOOP;

  -- gestor / operador → só visualização (sem permissão de aprovação)
  FOR r IN SELECT id, abas FROM niveis_acesso WHERE id IN ('gestor', 'operador') LOOP
    abas_atual := r.abas;
    FOREACH novo IN ARRAY novos_outros LOOP
      IF NOT abas_atual ? novo THEN
        abas_atual := abas_atual || to_jsonb(novo);
      END IF;
    END LOOP;
    UPDATE niveis_acesso SET abas = abas_atual WHERE id = r.id;
  END LOOP;
END $$;
