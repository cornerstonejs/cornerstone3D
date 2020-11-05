const cache = new Map();

let cacheSize = 0;
let maxCacheSize = 1073741824; // Default 1GB

function getCacheSize() {
  return cacheSize;
}

function incrementCacheSize(increment) {
  cacheSize += increment;

  console.log(cacheSize);
}

function setMaxCacheSize(newMaxCacheSize) {
  maxCacheSize = newMaxCacheSize;
}

function getMaxCacheSize() {
  return maxCacheSize;
}

function clearCacheSize() {
  cacheSize = 0;

  console.log(cacheSize);
}

export default cache;

export {
  cache,
  getCacheSize,
  incrementCacheSize,
  clearCacheSize,
  getMaxCacheSize,
  setMaxCacheSize,
};
