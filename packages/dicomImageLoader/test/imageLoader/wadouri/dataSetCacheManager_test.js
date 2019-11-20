/* eslint import/extensions: 0 */
import { expect } from 'chai';
import dataSetCacheManager from '../../../src/imageLoader/wadouri/dataSetCacheManager.js';

describe('#getInfo', function() {
  it('should return cache infos for an empty cache', function() {
    const cacheInfo = dataSetCacheManager.getInfo();

    expect(cacheInfo.cacheSizeInBytes).to.equal(0);
    expect(cacheInfo.numberOfDataSetsCached).to.equal(0);
  });
});
