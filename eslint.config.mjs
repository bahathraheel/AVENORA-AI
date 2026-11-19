import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: [
      'dist/**/*',
      'frontend/dist/**/*',
      'node_modules/**/*',
      'frontend/node_modules/**/*',
      'backend/node_modules/**/*',
      'frontend/assets/**/*'
    ]
  },
  firebaseRulesPlugin.configs['flat/recommended'],
  {
    files: [
      'frontend/js/**/*.js',
      'frontend/config/**/*.js',
      'frontend/vite.config.mjs',
      'backend/**/*.js'
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Intl: 'readonly',
        crypto: 'readonly',
        AbortController: 'readonly',
        CustomEvent: 'readonly',
        Blob: 'readonly',
        structuredClone: 'readonly',
        process: 'readonly',
        Buffer: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error'
    }
  }
];
