import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import reactCompiler from 'eslint-plugin-react-compiler';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'react-compiler': reactCompiler,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // React Compiler aponta padrões que impedem memoização automática
      // (mutações de props, refs lidas no render, etc.). Warn em vez de error
      // para não bloquear migrações incrementais.
      'react-compiler/react-compiler': 'warn',
    },
  },
  {
    // Arquivos .ts puros (hooks, utils, stores, config) não são fronteiras de
    // fast-refresh — exportar funções/hooks ali é legítimo.
    files: ['**/*.ts'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
);
