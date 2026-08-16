import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.output/**',
      '.wxt/**',
      'coverage/**',
      'node_modules/**',
      'eslint.config.js',
      'scripts/*.mjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'scripts/*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.webextensions, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-deprecated': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
