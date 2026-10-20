import { defineConfig } from 'vite-plus';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import path from 'path';
import fs from 'fs';
import { formatOptions } from './scripts/format-options.mjs';
import { version as reactVersion } from 'react';

// https://vitejs.dev/config/
// ESM siempre (.mts): rutas con import.meta.dirname (Node 20.11+).
export default defineConfig({
  lint: {
    plugins: ['typescript', 'react'],
    jsPlugins: [{ name: 'react-compat', specifier: 'eslint-plugin-react' }],
    settings: { react: { version: reactVersion } },
    categories: { correctness: 'off' },
    options: { typeAware: false, typeCheck: false },
    ignorePatterns: [
      'dist/**',
      'release/**',
      'node_modules/**',
      'tools/**',
      'MPV/**',
      'data/**',
      'logs/**',
      '.opencode/**',
      '.impeccable/**',
      'src/main/preload.js',
      'src/main/splashPreload.js',
      'src/renderer/routes/routeTree.gen.ts',
    ],
    rules: {
      'constructor-super': 'error',
      'for-direction': 'error',
      'getter-return': 'error',
      'no-async-promise-executor': 'error',
      'no-case-declarations': 'error',
      'no-class-assign': 'error',
      'no-compare-neg-zero': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      'no-const-assign': 'error',
      'no-constant-binary-expression': 'error',
      'no-constant-condition': ['error', { checkLoops: 'allExceptWhileTrue' }],
      'no-control-regex': 'error',
      'no-debugger': 'error',
      'no-delete-var': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-else-if': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty': 'error',
      'no-empty-character-class': 'error',
      'no-empty-pattern': 'error',
      'no-empty-static-block': 'error',
      'no-ex-assign': 'error',
      'no-extra-boolean-cast': 'error',
      'no-fallthrough': 'error',
      'no-func-assign': 'error',
      'no-global-assign': 'error',
      'no-import-assign': 'error',
      'no-invalid-regexp': 'error',
      'no-irregular-whitespace': 'error',
      'no-loss-of-precision': 'error',
      'no-misleading-character-class': 'error',
      'no-new-native-nonconstructor': 'error',
      'no-nonoctal-decimal-escape': 'error',
      'no-obj-calls': 'error',
      'no-prototype-builtins': 'error',
      'no-redeclare': 'error',
      'no-regex-spaces': 'error',
      'no-self-assign': 'error',
      'no-setter-return': 'error',
      'no-shadow-restricted-names': 'error',
      'no-sparse-arrays': 'error',
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-unsafe-negation': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-unused-labels': 'error',
      'no-unused-private-class-members': 'error',
      'no-useless-backreference': 'error',
      'no-useless-catch': 'error',
      'no-useless-escape': 'error',
      'no-with': 'error',
      'require-yield': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'typescript/ban-ts-comment': 'error',
      'no-array-constructor': 'error',
      'typescript/no-duplicate-enum-values': 'error',
      'typescript/no-empty-object-type': 'error',
      'typescript/no-extra-non-null-assertion': 'error',
      'typescript/no-misused-new': 'error',
      'typescript/no-namespace': 'error',
      'typescript/no-non-null-asserted-optional-chain': 'error',
      'typescript/no-require-imports': 'error',
      'typescript/no-this-alias': 'error',
      'typescript/no-unnecessary-type-constraint': 'error',
      'typescript/no-unsafe-declaration-merging': 'error',
      'typescript/no-unsafe-function-type': 'error',
      'no-unused-expressions': 'error',
      'no-unused-vars': 'error',
      'typescript/no-wrapper-object-types': 'error',
      'typescript/prefer-as-const': 'error',
      'typescript/prefer-namespace-keyword': 'error',
      'typescript/triple-slash-reference': 'error',
    },
    overrides: [
      {
        files: ['**/*.ts', '**/*.tsx'],
        rules: {
          'no-undef': 'off',
          'no-redeclare': 'off',
          'no-var': 'error',
          'prefer-const': 'error',
          'prefer-rest-params': 'error',
          'prefer-spread': 'error',
        },
      },
      {
        files: [
          'src/main/**/*.{ts,js}',
          'src/services/**/*.ts',
          'src/utils/**/*.ts',
          'src/types/**/*.ts',
          'index.js',
          '*.config.js',
        ],
        globals: {
          require: 'readonly',
          module: 'readonly',
          exports: 'writable',
          __dirname: 'readonly',
          process: 'readonly',
        },
        rules: {
          'typescript/no-require-imports': 'off',
          'no-empty': ['error', { allowEmptyCatch: true }],
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '^(\\.\\./){4,}',
                  message:
                    'Profundidad máxima de import: 3 niveles (../../..). Si necesitas 4+, reorganiza o usa un punto de entrada intermedio.',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['scripts/**/*.mjs', 'vite.config.mts'],
        globals: {
          console: 'readonly',
          process: 'readonly',
          URL: 'readonly',
          AbortSignal: 'readonly',
        },
      },
      {
        files: ['src/renderer/**/*.{ts,tsx}'],
        rules: {
          'no-empty': ['error', { allowEmptyCatch: true }],
          'react/display-name': 'error',
          'react/jsx-key': 'error',
          'react/jsx-no-comment-textnodes': 'error',
          'react/jsx-no-duplicate-props': 'error',
          'react/jsx-no-target-blank': 'error',
          'react/jsx-no-undef': 'error',
          'react/no-children-prop': 'error',
          'react/no-danger-with-children': 'error',
          'react/no-direct-mutation-state': 'error',
          'react/no-find-dom-node': 'error',
          'react/no-is-mounted': 'error',
          'react/no-render-return-value': 'error',
          'react/no-string-refs': 'error',
          'react/no-unescaped-entities': 'error',
          'react/no-unknown-property': 'error',
          'react/require-render-return': 'error',
          'react/rules-of-hooks': 'error',
          'react/exhaustive-deps': 'warn',
          'react-compat/no-deprecated': 'error',
          'react-compat/prop-types': 'error',
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '\\.\\./',
                  message: 'Usa los alias @/ (src/) o @assets/ (assets/) en lugar de rutas relativas hacia arriba.',
                },
              ],
            },
          ],
        },
      },
    ],
  },
  fmt: {
    ...formatOptions,
    ignorePatterns: [
      'dist/**',
      'release/**',
      'node_modules/**',
      'tools/**',
      'MPV/**',
      'data/**',
      'logs/**',
      '*.log',
      'src/renderer/routes/routeTree.gen.ts',
    ],
  },
  plugins: [
    tanstackRouter({
      target: 'react',
      routesDirectory: path.resolve(import.meta.dirname, 'src/renderer/routes'),
      generatedRouteTree: path.resolve(import.meta.dirname, 'src/renderer/routes/routeTree.gen.ts'),
      routeFileIgnorePattern: 'routeTree\\.gen\\.ts$',
      autoCodeSplitting: false,
    }),
    react(),
    tailwindcss(),
    {
      name: 'copy-splash-html',
      closeBundle() {
        const src = path.resolve(import.meta.dirname, 'src/renderer/splash.html');
        const dest = path.resolve(import.meta.dirname, 'dist/renderer/splash.html');
        try {
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
          }
        } catch (e) {
          void e;
        }
      },
    },
  ],
  root: path.resolve(import.meta.dirname, 'src/renderer'),
  base: './', // Use relative paths for Electron
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: true,
    reportCompressedSize: false,
  },
  resolve: {
    alias: {
      '@assets': path.resolve(import.meta.dirname, 'assets'),
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
