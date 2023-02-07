import { expect } from 'chai';
import dataSetCacheManager from './dataSetCacheManager.js';

describe('#getInfo', () => {
  it('should return cache info for an empty cache', function () {
    dataSetCacheManager.purge();

    const cacheInfo = dataSetCacheManager.getInfo();

    expect(cacheInfo.cacheSizeInBytes).to.be.equal(0);
    expect(cacheInfo.numberOfDataSetsCached).to.be.equal(0);
  });
});
