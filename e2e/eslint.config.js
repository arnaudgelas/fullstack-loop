// Flat ESLint config for the e2e suite.
//
// QUALITY-GATES.md requires `typescript-eslint` strictTypeChecked (type-aware,
// not the basic set) plus stylisticTypeChecked, run with --max-warnings=0.
// eslint-plugin-playwright adds the rules type checking cannot see: a missing
// `await` on an assertion, a conditional inside a test, `test.only` left behind.
//
// No rule is disabled globally. Any deviation lives inline, on the line that
// needs it, with a written reason.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import playwright from 'eslint-plugin-playwright';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['node_modules/**', 'playwright-report/**', 'test-results/**', 'fixtures/**']),
  {
    files: ['**/*.ts', '**/*.js'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        // This config file itself is not in tsconfig's `include` (it is not
        // part of the test program), so the project service is told explicitly
        // to type it with the default project rather than silently dropping
        // type-aware linting for it.
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['tests/**/*.spec.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      // Upgraded from the plugin's advisory level: --max-warnings=0 fails on
      // them anyway, and an error names the problem honestly.
      'playwright/expect-expect': 'error',
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-skipped-test': 'error',
    },
  },
  // Must stay last: turns off the formatting rules Prettier owns so the two
  // tools cannot disagree. It disables formatting rules, it weakens no check.
  prettier,
]);
