module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 'latest',
  },
  overrides: [
    {
      files: ['cli/**/*.{js,ts,mjs,cjs}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  'app/**',
                  '../app/**',
                  '../../app/**',
                  '../../../app/**',
                  '../../../../app/**',
                  '@/app/**',
                ],
                message: 'Catalog CLI cannot import from /app/ surface.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['app/cli/**/*.{js,ts,mjs,cjs}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  'cli/**',
                  '../cli/**',
                  '../../cli/**',
                  '../../../cli/**',
                  '../../../../cli/**',
                  '@/cli/**',
                ],
                message: 'WSAP CLI cannot import from /cli/ surface.',
              },
            ],
          },
        ],
      },
    },
  ],
};
