module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' }, modules: false }],
    '@babel/preset-typescript',
    ['@babel/preset-react', { runtime: 'automatic', development: process.env.NODE_ENV !== 'production' }]
  ],
  plugins: [
    '@babel/plugin-syntax-import-meta'
  ]
};
