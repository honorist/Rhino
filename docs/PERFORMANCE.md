# Performance — diagnóstico e playbooks

> Investigação de 2026-05-20. Motivo: app percebido como "lento de usar".

## TL;DR

A lentidão **não é o código** — é **latência de rede**. O servidor está nos
EUA (Railway, região padrão) e o usuário no Brasil. Cada requisição custa
~200 ms só de distância. Não há CDN ativo: o README desenha Cloudflare, mas a
produção responde `Server: railway-edge`. O Cloudflare nunca foi ligado
provavelmente porque exige **domínio próprio** — não é possível proxiar um
subdomínio `*.up.railway.app`.

**Decisão (2026-05-20): manter no Railway, em US-West (Califórnia) — sem mudar
de provedor nem de região.** O ganho de latência vem do Playbook A (reduzir
requisições), que não depende de infraestrutura.

## Evidência

Medição em produção, conexão TCP reaproveitada (TLS já pago):

| Requisição | Tempo | Observação |
|---|---|---|
| `css/main.css` (memória, **sem** banco) | ~0,21 s | pura viagem de rede |
| `/api/health` (**com** ping no banco) | ~0,25 s | banco custa só ~40 ms |
| Conexão nova (1ª vez) | +0,5–0,8 s | handshake TLS |

Um arquivo servido da memória do servidor demora quase o mesmo que um endpoint
que consulta o banco → o gargalo é o trajeto Brasil ↔ EUA, não o processamento.

**Dividir o `server.js` (6.775 linhas) não tem efeito nenhum na velocidade** —
o Node carrega o arquivo uma vez no boot, não a cada requisição.

## O que já foi corrigido

- **Dashboard — waterfall de requisições** (`js/views/Dashboard.js`, `render()`):
  o carregamento era 6 etapas sequenciais (`loadAll` → `loadDashboard` →
  `/api/rdos` → `/api/anomalias` → batch nf/cp/socios/inv → `loadFor(propostas)`),
  cada `await` esperando o anterior ≈ 6 × latência. Agora é **um único
  `Promise.all`**. O batch de notas-fiscais/contas-pagar/sócios/investimentos
  era **redundante** — `loadAll()` já trazia esses 4 endpoints; passou a ler de
  `Store.state`. Resultado: ~6× menos espera nessa tela.

> Padrão a replicar nas outras views pesadas (`ContratoDetail`, `Contratos`,
> `Recursos`): toda requisição independente deve entrar num `Promise.all`;
> nunca refazer um fetch que `Store.loadAll()`/`loadFor()` já trouxe.

## Playbook A — Reduzir requisições em cascata (frontend) ★ prioridade

O de **maior impacto sob controle total** — não depende de infra. Mesmo com o
servidor nos EUA, uma tela que faz **1** ida de rede carrega em ~200 ms; uma que
faz **6 em cascata** leva ~1,5 s. O trabalho é varrer as views e garantir que
toda requisição independente entre num `Promise.all`, e nunca refazer um fetch
que `Store.loadAll()`/`loadFor()` já trouxe.

- ✅ Feito: `Dashboard.render()` (6 etapas → 1).
- Pendente: auditar `ContratoDetail`, `Contratos`, `Recursos`, `Estoque`.

## Playbook B — Trocar a região do Railway para US-East

> ❌ **Avaliado e descartado (2026-05-20).** Servidor confirmado em US-West
> (Califórnia). O ganho (~60–70 ms) não compensa a migração do Postgres entre
> regiões. Mantido abaixo apenas como referência.

A latência medida (~200 ms do Brasil) é compatível com **US-West**.
Mudar para **US-East (Virginia)** — mais perto do Brasil — cortaria ~60–70 ms de
**toda** requisição.

1. No Railway, abrir o **serviço do app → Settings → Region**. Conferir a região
   atual; se já for US-East, nada a fazer.
2. Se for US-West, mudar para **US-East**. O Railway recria o serviço (pequeno
   downtime).
3. **O Postgres tem que ir junto.** Se o app for para US-East e o banco ficar em
   US-West, o trajeto app↔banco vira cross-region e **anula o ganho**. Mudar a
   região de um Postgres no Railway não é um simples toggle — o volume está preso
   à região; normalmente exige criar um novo Postgres em US-East e migrar os
   dados (`pg_dump` → `pg_restore`). Rodar `npm run backup:prod` antes.
4. Validar `/api/health` e medir de novo.

> Se mover o banco for trabalhoso demais, a alternativa segura é **não mexer na
> região**: o ganho do Playbook A (menos requisições) já resolve a maior parte
> da percepção de lentidão.

Limite: Railway não tem região na América do Sul. Mesmo em US-East a latência
mínima do Brasil fica em ~110–130 ms por requisição.

## Playbook C — Cloudflare na frente (opcional — segurança + 1º load)

Ficando no Railway, o CDN **não acelera os cliques** (a API `/api/*` é dinâmica,
não cacheável). Vale por dois motivos: **DDoS/WAF** e cache dos estáticos no
edge de São Paulo (ajuda só o primeiro carregamento). Opcional.

Pré-requisito: **domínio próprio** (ex.: `rhino.suaempresa.com.br`) — é por isso
que o Cloudflare nunca foi ativado: `*.up.railway.app` não pode ser proxiado.

1. Adicionar o domínio no Cloudflare e apontar os nameservers no registrador.
2. No Railway: **Settings → Networking → Custom Domain**, adicionar o domínio.
3. No Cloudflare: criar o registro DNS apontando para o destino que o Railway
   indicar, em modo **Proxied** (nuvem laranja — não cinza).
4. **SSL/TLS → modo Full (strict)**.
5. **Rules → Cache Rules**: cachear no edge `/(css|js|assets)/*`; deixar HTML e
   `/api/*` como *bypass*.
6. Verificar: `curl -sI https://rhino.seudominio/css/main.css` deve trazer
   `cf-cache-status: HIT` e um header `cf-ray`.

## Recomendação

1. **Playbook A** — maior impacto na percepção, 100% sob seu controle, sem infra.
2. **Playbook B** — ganho fixo em toda requisição, grátis, só um setting.
3. **Playbook C** — opcional; faça quando tiver um domínio próprio, mais pela
   segurança do que pela velocidade.
