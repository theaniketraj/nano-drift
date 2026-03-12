module.exports = {
  root: true,
  ignorePatterns: [
    '**/out/**',
    '**/node_modules/**',
    'landing/docs-bundle.js',
  ],
  overrides: [
    {
      files: ['packages/*/src/**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      plugins: ['@typescript-eslint'],
      extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
      rules: {
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      files: ['packages/*/test/**/*.js', 'scripts/**/*.js'],
      extends: ['eslint:recommended'],
      env: {
        node: true,
        es2022: true,
      },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'script',
      },
      rules: {
        'no-console': 'off',
      },
    },
  ],
};
