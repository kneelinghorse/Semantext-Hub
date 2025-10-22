const isTestEnv = process.env.BABEL_ENV === 'test' || process.env.NODE_ENV === 'test';

module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' }, modules: isTestEnv ? 'auto' : false }],
    '@babel/preset-typescript',
    ['@babel/preset-react', { runtime: 'automatic', development: process.env.NODE_ENV !== 'production' }]
  ],
  plugins: [
    '@babel/plugin-syntax-import-meta'
  ]
};
