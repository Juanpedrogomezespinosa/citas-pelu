// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', '.astro/', 'node_modules/', '**/*.astro'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Los efectos que actualizan estado aquí sincronizan con datos asíncronos de
      // la API o reinician un formulario al cambiar de entidad: es su uso previsto.
      'react-hooks/set-state-in-effect': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['*.{js,mjs}'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
  },
  prettier,
);
