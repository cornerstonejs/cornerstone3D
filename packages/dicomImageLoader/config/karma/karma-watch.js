const extendConfiguration = require('./karma-extend.js');

module.exports = function (config) {
  config.set(extendConfiguration({
    browsers: ['ChromeHeadlessNoSandbox'],
    reporters: ['spec'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox']
      }
    }
  }));
};
