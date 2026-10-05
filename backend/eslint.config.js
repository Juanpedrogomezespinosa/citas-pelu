// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Variables "descartadas" en desestructuraciones: _nombre
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      // Las promesas sin await son un bug salvo que se marquen con `void`
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // Express acepta handlers async; los nuestros ya reenvían errores a next()
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { arguments: false } }],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Scripts de CLI: imprimen por consola a propósito
    files: ['src/db/**/*.ts', 'src/tools/**/*.ts', 'src/config/env.ts', 'src/utils/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Tests: describe/it de node:test devuelven promesas que gestiona el runner,
    // y los cuerpos de respuesta de supertest son `any` por naturaleza.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        { allowForKnownSafeCalls: [{ from: 'package', name: ['describe', 'it'], package: 'node:test' }] },
      ],
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
