import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  {
    // Código de la aplicación y pruebas: reglas estrictas con información de tipos.
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { project: ['./tsconfig.json'], tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      'no-restricted-globals': ['error', { name: 'eval', message: 'La CSP no permite eval.' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='fetch']",
          message: 'Usa fetchJson (src/data/http.ts): sin credenciales ni referrer.',
        },
        {
          selector: "MemberExpression[object.name='document'][property.name='cookie']",
          message: 'La aplicación no usa cookies.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] },
  },
  {
    files: ['src/data/http.ts', 'tests/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off', '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // Scripts de Node y configuración: sin información de tipos.
    files: ['scripts/**/*.mjs', 'local/**/*.mjs', 'tests/fixtures/*.mjs', 'eslint.config.js', 'vite.config.ts', 'playwright.config.ts', 'e2e/**/*.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', fetch: 'readonly', AbortController: 'readonly', URL: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly' } },
  },
);
