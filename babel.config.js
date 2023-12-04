module.exports = (api) => {
  api.cache(true);

  return {
    presets: [
      '@babel/preset-react',
      '@babel/preset-env',
      '@babel/preset-typescript',
    ],
    plugins: [
      '@babel/plugin-proposal-class-properties',
      '@babel/plugin-transform-runtime',
      '@babel/plugin-transform-typescript',
      '@babel/plugin-transform-class-static-block',
    ],
  };
};
