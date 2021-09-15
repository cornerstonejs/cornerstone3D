const baseConfigFactory = require('./karma-base.js');

module.exports = function(extendedConfig) {
  const config = baseConfigFactory();
  ('use strict');
  // Overrides the base configuration for karma with the given properties
  for (const i in baseConfig) {
    if (typeof extendedConfig[i] === 'undefined') {
      extendedConfig[i] = baseConfig[i];
    }
  }
  return extendedConfig;
};
