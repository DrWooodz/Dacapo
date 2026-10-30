import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['docs/', 'dist/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  {
    files: ['src/js/**/*.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', globals: globals.browser },
    rules: {
      'no-unused-vars': ['error', { caughtErrors: 'none', argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  { files: ['src/sw.js'], languageOptions: { sourceType: 'script', globals: globals.serviceworker } },
  {
    files: ['tests/**/*.js', 'tools/**/*.mjs', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
