import js from '@eslint/js';
import html from 'eslint-plugin-html';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'test-results/**', 'playwright-report/**', 'tests/vendor/**'] },
  {
    files: ['index.html'],
    plugins: { html },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: { ...globals.browser, maplibregl: 'readonly', supabase: 'readonly', Mp4Muxer: 'readonly', WebMMuxer: 'readonly' },
    },
    rules: {
      ...js.configs.recommended.rules,
      // try{...}catch(e){} er bevisst der nettleseren kan blokkere lagring o.l.
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
    rules: { ...js.configs.recommended.rules },
  },
];
