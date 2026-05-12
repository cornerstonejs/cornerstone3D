const path = require('path');

const transforms = {
  'rendering-engine-viewport-accessors': path.join(
    __dirname,
    'transforms/rendering-engine-viewport-accessors.js'
  ),
};

function listTransforms() {
  return Object.keys(transforms);
}

function getTransform(name) {
  return transforms[name];
}

module.exports = {
  getTransform,
  listTransforms,
  transforms,
};
