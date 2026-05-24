# Fase 5 — Auditoria dos testes Playwright (F5-1)

## TL;DR

- **`test/e2e/api.spec.js`** (391 linhas) — só fala HTTP com `/api/*`. **OK como está**, independe do frontend.
- **`test/e2e/bm_rules.spec.js`** (297 linhas) — idem, API-level. **OK como está**.
- **`test/e2e/smoke.spec.js`** (461 linhas) — UI-heavy. **Quebra**.
- **`test/e2e/ui-features.spec.js`** (223 linhas) — UI-heavy. **Quebra**.

## Quebras identificadas

### 1. Routing — hash → path

Linha típica nos specs:
```js
await page.evaluate(h => { location.hash = h; }, hash);
await page.waitForFunction(() => location.hash === '#/dashboard');
```

React usa `BrowserRouter` (path-based). **Migrar para `page.goto(BASE_URL + path)`** ou `page.evaluate(p => history.pushState({}, '', p))` + dispatch popstate.

### 2. UI de auth não migrada (BLOQUEADOR DE CUTOVER)

Os specs dependem destes elementos que **só existem em `js/app.js` (vanilla)**:

| Selector | Onde no vanilla | Status no React |
|---|---|---|
| `#loginForm` | js/app.js:214 (form imperativo) | **Ausente** |
| `#btnAceitarTermos` (LGPD) | js/app.js (#btnAceitar) | **Ausente** |
| `.perfil-card` (picker) | js/app.js:597 | **Ausente** |

Implicação: até a UI de auth/LGPD/perfil ser portada (ou um fallback ser estabelecido), o React não consegue substituir 100% o vanilla. **Criar F5-1b** para portar.

### 3. Modal — `#modalOverlay` → `.modal-overlay`

Vanilla usa `#modalOverlay` (id único, modal global). React usa `<Modal>` com `className="modal-overlay"` por instância.

| Antes | Depois |
|---|---|
| `page.locator('#modalOverlay [name="x"]')` | `page.locator('.modal-overlay [name="x"]')` |
| `page.locator('#modalOverlay #btnSalvar')` | `page.locator('.modal-overlay button[type="submit"]')` ou texto do botão |

### 4. Botões com ID fixo — `#btnSalvar`, `#btnNovo*`

Em React não há IDs únicos para botões reutilizados. Usar texto/role:

```js
// Antes
page.locator('#btnSalvar').click()
// Depois
page.getByRole('button', { name: /salvar/i }).click()
```

### 5. `#app` e `#sidebar` — **OK**

Ambos preservados (Shell.tsx:`<main id="app">`, Sidebar.tsx:`<nav id="sidebar">`).

## Plano de ataque (F5-2)

1. Criar helper `freshApp(page, { path = '/dashboard' })` que:
   - Faz `page.goto(BASE_URL)` 
   - Se UI de auth (React ou legacy) detectada, executa login
   - Para `path-based`, navega via `page.goto(BASE_URL + path)`
2. Substituir todos `location.hash = '#/x'` por `await page.goto(BASE_URL + '/x')`
3. Trocar `#modalOverlay` por `.modal-overlay`
4. Trocar `#btnSalvar` por `getByRole('button', { name: /salvar/i })`
5. Sufixar testes que dependem de auth UI como `test.skip()` até F5-1b.

## Estimativa

- F5-1b (port auth UI): **~3 dias** (Login.tsx, LgpdModal.tsx, PerfilPicker.tsx + integração com /api/auth + roteamento condicional na raiz)
- F5-2 (atualizar smoke + ui-features): **~1 dia** depois de F5-1b
