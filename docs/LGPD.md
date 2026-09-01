# LGPD — Proteção de dados pessoais (CPF e documentos)

Como o Rhino protege os dados pessoais sensíveis dos colaboradores.

## O que é protegido

| Dado | Onde | Proteção |
|------|------|----------|
| **CPF** | `recursos.cpf` | Cifrado em repouso (AES-256-GCM) + mascarado na tela para quem não tem permissão |
| **Documentos** (RG, CTPS, etc.) | `recurso_doc_arquivos.data` (BYTEA) | Arquivo cifrado em repouso; download só para usuário autenticado/autorizado |
| Transporte | toda a API | HTTPS (Caddy/Fly) |

Já existiam: exportação de dados (LGPD export), exclusão de conta e log de auditoria.

## Como funciona

- **Em repouso**: CPF e arquivos são cifrados com **AES-256-GCM** (autenticado — detecta adulteração) antes de ir ao banco. Num dump/backup do Postgres eles aparecem ilegíveis (`enc:1:...` / blob com header `PENC`). Ver `lib/crypto-pii.js`.
- **Chave**: vem de `PII_ENCRYPTION_KEY` (32 bytes, base64 ou hex). **Nunca** versionada no git; fica como *secret* do deploy.
- **Leitura**: o repositório `db/repos/recursos.js` decifra o CPF transparentemente ao exibir. Os arquivos são decifrados no download e na validação por IA.
- **Backups e auditoria**: usam `findAllRaw`/`findByIdRaw` — guardam o CPF **cifrado** (um dump não vaza PII em claro).
- **Máscara na tela**: quem não tem permissão de **edição** em Recursos (nem é super admin) vê `•••.•••.789-••`. Editores de RH veem o CPF completo (precisam para editar).
- **Compatibilidade**: `decrypt` deixa passar valores legados em texto puro — a aplicação continua lendo dados antigos **antes** da migração rodar (rollout sem downtime).

## Como fazer o deploy (ordem importa)

1. **Gere a chave** e guarde como secret (1Password/cofre + secret do provedor):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
2. **Configure `PII_ENCRYPTION_KEY`** no ambiente (Fly: `fly secrets set PII_ENCRYPTION_KEY=...`; Docker/compose: `.env`).
3. **Faça backup do banco** antes de mexer em dados.
4. **Suba o código novo.** A partir daqui, todo CPF/arquivo **novo** já entra cifrado. Os dados antigos continuam legíveis (texto puro).
5. **Cifre os dados existentes** (idempotente — pode repetir):
   ```bash
   node scripts/encrypt-existing-pii.js --dry-run   # confere quantos serão cifrados
   node scripts/encrypt-existing-pii.js             # cifra de fato
   ```
6. **Valide**: abra Recursos (CPF aparece para editor), baixe um documento (abre normal), confira no banco que `recursos.cpf` começa com `enc:1:`.

## ⚠️ Gestão da chave (crítico)

- **Perder a chave = perder o acesso aos dados cifrados.** Não há recuperação.
- Faça backup da chave **separado** do backup do banco (quem tem os dois junto tem tudo).
- Para **rotacionar** a chave: `DATABASE_URL=... PII_ENCRYPTION_KEY_OLD=... PII_ENCRYPTION_KEY_NEW=... node scripts/rotate-pii-key.js` (`--dry-run` primeiro). Decifra com a antiga e recifra com a nova, em `recursos.cpf`/`candidatos.cpf` e `recurso_doc_arquivos.data`/`candidato_doc_arquivos.data`; é seguro reexecutar (pula o que já foi rotacionado). Só troque `PII_ENCRYPTION_KEY` no ambiente do app depois de rodar sem falhas.
- O `lib/crypto-pii.js` suporta versionamento de envelope (`enc:1:`) para futura rotação.

## Validação em staging (antes de produção)

Esta entrega foi escrita e checada estaticamente, mas **não foi testada contra um Postgres real** no ambiente de desenvolvimento. Antes de produção, em staging:

- [ ] `PII_ENCRYPTION_KEY` configurada; app sobe sem erro.
- [ ] Criar/editar um colaborador com CPF → conferir no banco que está cifrado (`enc:1:`).
- [ ] Recurso visto por editor mostra CPF; por perfil sem edição mostra mascarado.
- [ ] Upload + download de um documento (PDF/JPG) funciona ponta a ponta.
- [ ] `scripts/encrypt-existing-pii.js --dry-run` e depois real; rodar 2x (idempotência).
- [ ] Backup (`/api/backup`) gera arquivo com CPF cifrado.
