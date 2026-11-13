import {
  cleanupTestEnvironment,
  setupTestEnvironment,
} from '../../../utils/test/testUtils';
import * as cornerstone from '../../src/index';

const { cache, volumeLoader } = cornerstone;

const VOLUME_ID = 'test-local-volume-recreation';
const OPTIONS = {
  metadata: {},
  dimensions: [2, 2, 2],
  spacing: [1, 1, 1],
  origin: [0, 0, 0],
  direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  scalarData: new Uint8Array(8).fill(1),
};

describe('createLocalVolume', () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it('can be recreated with the same volumeId after the previous volume was removed', () => {
    volumeLoader.createLocalVolume(VOLUME_ID, { ...OPTIONS });
    expect(cache.getVolume(VOLUME_ID)).toBeDefined();

    // Mirror _decacheVolume: the volume leaves the volume cache, but its
    // per-slice images stay in the image cache (sharedCacheKey only unlinked).
    cache.removeVolumeLoadObject(VOLUME_ID);
    expect(cache.getVolume(VOLUME_ID)).toBeUndefined();

    // Used to throw: "putImageSync: imageId already in cache"
    volumeLoader.createLocalVolume(VOLUME_ID, { ...OPTIONS });
    expect(cache.getVolume(VOLUME_ID)).toBeDefined();
    expect(cache.getImage(`${VOLUME_ID}_slice_0`)).toBeDefined();
  });
});
