import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import n from 'eslint-plugin-n';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';

export default [
  js.configs.recommended,
  n.configs['flat/recommended-script'],
  sonarjs.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.webworker,
      },
    },
    rules: {
      'max-depth': ['warn', 3],
      'max-lines-per-function': ['warn', { max: 40, skipBlankLines: true, skipComments: true }],
      'complexity': ['warn', 10],
      'no-console': 'off',
      'n/no-unsupported-features/es-syntax': ['error', {
        'ignores': ['modules']
      }],
      'n/no-unsupported-features/node-builtins': 'off',
      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/todo-tag': 'off',
      'sonarjs/no-ignored-exceptions': 'warn',
      'indent': ['error', 2],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
      'no-useless-assignment': 'warn',
      'no-empty': 'warn'
    },
  },
  {
    files: ['tests/**/*.js', '*.config.js'],
    rules: {
      'n/no-unpublished-import': 'off',
      'max-lines-per-function': 'off',
      'n/no-process-exit': 'off'
    }
  },
  {
    ignores: [
      '**/KVS.js',
      'src/adapt/kvs.js',
      'node_modules/',
      'dist/',
      '.wrangler/',
      'package-lock.json'
    ],
  },
];
