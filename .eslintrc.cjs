module.exports = {
  root: true,
  env: { browser: true, es2023: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', 'public/mockServiceWorker.js'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: {
    react: { version: '18.3' },
  },
  plugins: ['react-refresh', 'import'],
  rules: {
    'react/prop-types': 'off',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'max-lines': ['warn', { max: 250, skipBlankLines: true, skipComments: true }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'jsx-a11y/label-has-associated-control': 'off',
    // Ant Design renders its own <label> and wires htmlFor itself.
    'jsx-a11y/no-autofocus': 'off',
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'never',
      },
    ],
  },
  overrides: [
    {
      // react-refresh only has anything to say about component modules.
      files: ['src/**/*.jsx'],
      rules: {
        'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      },
    },
    {
      // The route table declares lazy page components but exports only the
      // router itself, which the fast-refresh heuristic cannot tell apart from
      // a component module. Hot-reloading a route table is not meaningful.
      files: ['src/app/router/index.jsx'],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
    {
      // Column and filter definitions are configuration that happens to
      // contain JSX cell renderers, not component modules.
      files: ['src/**/*Columns.jsx'],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
    {
      // A utility function that happens to return JSX (tooltip-wrapped
      // text), not a component module.
      files: ['src/shared/utils/glossify.jsx'],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
    {
      // The mock backend, the permission catalog and the role templates are
      // specification data, not logic: splitting them by line count would
      // scatter one table across several files and make it harder to read.
      files: [
        'src/mocks/**/*.js',
        'src/core/rbac/permissions.data.js',
        'src/core/rbac/roleTemplates.js',
        'src/shared/constants/*.js',
        'src/app/router/index.jsx',
        'src/**/*.test.{js,jsx}',
      ],
      rules: { 'max-lines': 'off' },
    },
  ],
};
