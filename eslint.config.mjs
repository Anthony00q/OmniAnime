import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'release/**',
      'node_modules/**',
      'tools/**',
      'MPV/**',
      'data/**',
      'logs/**',
      '.opencode/**',
      '.impeccable/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: [
      'src/main/**/*.{ts,js}',
      'src/services/**/*.ts',
      'src/utils/**/*.ts',
      'src/types/**/*.ts',
      'index.js',
      '*.config.js',
    ],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'writable',
        __dirname: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // allow empty catch for best-effort cleanup (fs, unlink, stat) — intentional per Lote 2
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        AbortSignal: 'readonly',
      },
    },
  },

  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // allow empty catch for best-effort cleanup — intentional
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  prettierConfig,
);
