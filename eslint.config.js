'use strict';
/**
 * ESLint flat config (v9). Foco no BACKEND (regra de negócio em lib/ e handlers/) — é onde o gate
 * importa mais (steering/engineering.md §9). O SPA do browser (js/) entra leniente por enquanto.
 * Regras de bug real = error (quebram o build); estilo/ruído = warn.
 */
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'java/**',
      'data/**',
      'db/**',
      'css/**',
      'assets/**',
      'docs/**',
      'scripts/shadow/**',
      'js/lib/**',
      '**/*.min.js',
    ],
  },

  // Backend Node (CommonJS) — onde o gate é forte
  {
    files: ['server.js', 'handlers/**/*.js', 'lib/**/*.js', 'routes/**/*.js', 'scripts/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },

  // Testes unitários (node:test)
  {
    files: ['test/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'warn',
      'no-empty': 'warn',
    },
  },

  // Testes E2E (Playwright) — misturam Node e contexto de browser (page.evaluate)
  {
    files: ['test/e2e/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'warn',
      'no-empty': 'warn',
    },
  },

  // SPA do browser (js/) — leniente por ora; tem globals próprios e nunca passou por lint
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser } },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-empty': 'off',
    },
  },
];
