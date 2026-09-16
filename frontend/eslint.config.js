// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * QUALITY-GATES.md "Frontend": typescript-eslint strictTypeChecked +
 * stylisticTypeChecked (type-aware, not the basic set), angular-eslint
 * recommended, and the template accessibility rules. Run with --max-warnings=0.
 */
export default tseslint.config(
  {
    ignores: [
      // openapi-generator 7.16 emits code that compiles under this project's
      // strict TypeScript settings but violates numerous type-aware stylistic
      // and safety lint rules. It is generated, never hand-edited, and remains
      // gated by strict tsc compilation. Closing this generator-template gap is
      // tracked as an accepted deviation; do not broaden this ignore.
      'src/app/api/generated/**',
      'dist/**',
      'out-tsc/**',
      'coverage/**',
      'reports/**',
      'pacts/**',
      '.angular/**',
      'node_modules/**',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      // Vitest otherwise reports skipped/todo tests as a successful run. CI
      // must fail when a test is focused or disabled, not merely print it.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(only|skip|skipIf|runIf|todo)$/]",
          message: 'Focused, skipped, conditional, and todo tests are forbidden.',
        },
        {
          selector: 'CallExpression[callee.name=/^(fdescribe|fit|xdescribe|xit|xtest)$/]',
          message: 'Focused and skipped test aliases are forbidden.',
        },
      ],
    },
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      ...angular.configs.tsRecommended,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      // Unused code is fatal here because tsconfig's noUnusedLocals /
      // noUnusedParameters had to be relaxed for the generated client; this
      // rule is the strict replacement for hand-written code.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: false,
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // An Angular component/directive/pipe class is meaningful because of its
      // decorator, not its members, so a member-less one is not "extraneous".
      // This is the rule's own designed option for framework classes, not a
      // suppression of a finding.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      'no-console': 'error',
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
  {
    // Executable configuration is code too. These files carry // @ts-check;
    // ESLint's recommended rules provide the runtime-JavaScript gate while
    // TypeScript sources above retain the full type-aware presets.
    files: ['**/*.js', '**/*.mjs'],
    extends: [eslint.configs.recommended],
  },
  prettierConfig,
);
