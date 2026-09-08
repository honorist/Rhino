'use strict';
// node --test test/architecture-boundaries.test.js  (sem servidor, sem DB)
//
// Achado 4.4 da varredura 2026-09-08 (achado positivo do Winston, com
// ressalva): a costura "handlers/* pode usar lib/*; lib/* não depende de
// handlers/*" (steering/engineering.md §2) se sustentou bem até 61 handlers,
// mas só por disciplina de PR revisada manualmente — nada no CI barrava um
// ciclo. Este teste transforma essa metade da regra (a que o código respeita
// de fato, sem exceção) num gate real.
//
// Nota: handlers/*.js requerendo outro handlers/*.js DIRETO existe hoje em
// casos legítimos (ex.: portal.js reaproveita contract-rdos.js; compras.js
// usa helpers de estoque.js) — não é a metade da regra que vale gatear.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

function listJsFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js') && !f.includes('Honório_PC'))
    .map((f) => path.join(dir, f));
}

function requiresOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  let m;
  while ((m = REQUIRE_RE.exec(src))) out.push(m[1]);
  return out;
}

test('lib/*.js nunca importa handlers/*.js — dependência aponta pra dentro (steering §2)', () => {
  const libDir = path.join(ROOT, 'lib');
  const violacoes = [];
  for (const file of listJsFiles(libDir)) {
    for (const req of requiresOf(file)) {
      if (/(^|\/)handlers\//.test(req)) {
        violacoes.push(`${path.basename(file)} -> require('${req}')`);
      }
    }
  }
  assert.deepEqual(violacoes, [], `lib/ importando de handlers/ (inverte a dependência): ${violacoes.join('; ')}`);
});
