import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/**', 'public/**'] },

  js.configs.recommended,

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      // Underscore-prefixed args/vars/caught-errors are intentional throwaways.
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Size budgets — a tripwire against god-objects accreting by addition.
      // Counts code only (blank lines and comments excluded). Crossing a budget
      // is a signal to decompose, not to bump the number. See CLAUDE.md.
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 120, skipBlankLines: true, skipComments: true }],
    },
  },

  // Tracked size debt: these files exceed the budgets above. GameController has had
  // its view building and history navigation extracted (A1 Tiers 1-2); clearing the
  // budget needs Tier 3 — extracting AnalysisController + MoveExecutor. The override
  // keeps CI green while still holding every *other* file to the limit. Remove an
  // entry once its file is split; do not add new ones without discussion.
  {
    files: ['src/game/GameController.js', 'src/ui/BoardView.js'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },

  // Build/tooling configs run in Node, not the browser.
  {
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },

  // Must be last: turns off stylistic rules that Prettier owns.
  prettier,
];
