jest.mock('../src/metaData', () => ({
  addProvider: jest.fn(),
  get: jest.fn(),
}));

import * as metaData from '../src/metaData';
import { MetadataModules } from '../src/enums';
import getClosestImageId from '../src/utilities/getClosestImageId';
import { areInDifferentDimensionGroups } from '../src/utilities/getDimensionGroupIndexMap';

// A 3 slice / 2 dimension group volume. Every dimension group repeats the same
// three image positions, which is exactly why distance alone cannot pick one.
const SLICE_SPACING = 2;
const GROUP_ONE_IMAGE_IDS = ['t1-s0', 't1-s1', 't1-s2'];
const GROUP_TWO_IMAGE_IDS = ['t2-s0', 't2-s1', 't2-s2'];
const IDENTITY_DIRECTION = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function sliceIndexOf(imageId) {
  return Number(imageId.slice(-1));
}

function createDynamicVolume({ isDynamic = true, activeGroup = 2 } = {}) {
  return {
    direction: IDENTITY_DIRECTION,
    spacing: [1, 1, SLICE_SPACING],
    // The flat imageIds always list dimension group 1 first, so a time-blind
    // search resolves there no matter which group is on screen.
    imageIds: [...GROUP_ONE_IMAGE_IDS, ...GROUP_TWO_IMAGE_IDS],
    isDynamicVolume: () => isDynamic,
    getCurrentDimensionGroupImageIds: () =>
      activeGroup === 1 ? GROUP_ONE_IMAGE_IDS : GROUP_TWO_IMAGE_IDS,
  };
}

describe('resolving imageIds on dynamic (4D) volumes', () => {
  beforeEach(() => {
    metaData.get.mockImplementation((type, imageId) => {
      if (type !== MetadataModules.IMAGE_PLANE) {
        return;
      }

      return {
        imagePositionPatient: [0, 0, sliceIndexOf(imageId) * SLICE_SPACING],
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        rows: 8,
        columns: 8,
      };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getClosestImageId', () => {
    it('resolves within the active dimension group rather than the first one', () => {
      const volume = createDynamicVolume({ activeGroup: 2 });

      expect(getClosestImageId(volume, [0, 0, 2], [0, 0, 1])).toBe('t2-s1');
    });

    it('follows the active dimension group as it changes', () => {
      expect(
        getClosestImageId(
          createDynamicVolume({ activeGroup: 1 }),
          [0, 0, 4],
          [0, 0, 1]
        )
      ).toBe('t1-s2');

      expect(
        getClosestImageId(
          createDynamicVolume({ activeGroup: 2 }),
          [0, 0, 4],
          [0, 0, 1]
        )
      ).toBe('t2-s2');
    });

    it('searches every imageId when the volume is not dynamic', () => {
      const volume = createDynamicVolume({ isDynamic: false });

      expect(getClosestImageId(volume, [0, 0, 2], [0, 0, 1])).toBe('t1-s1');
    });

    it('falls back to the full imageId list when the volume cannot report a group', () => {
      const volume = createDynamicVolume();
      delete volume.getCurrentDimensionGroupImageIds;

      expect(getClosestImageId(volume, [0, 0, 2], [0, 0, 1])).toBe('t1-s1');
    });

    it('still returns nothing when the view is oblique to the volume', () => {
      const volume = createDynamicVolume();

      expect(getClosestImageId(volume, [0, 0, 2], [0, 1, 0])).toBeUndefined();
    });
  });

  describe('areInDifferentDimensionGroups', () => {
    const dimensionGroupIndexMap = new Map([
      ...GROUP_ONE_IMAGE_IDS.map((imageId) => [imageId, 0]),
      ...GROUP_TWO_IMAGE_IDS.map((imageId) => [imageId, 1]),
    ]);

    it('separates the same slice in different dimension groups', () => {
      expect(
        areInDifferentDimensionGroups(dimensionGroupIndexMap, 't1-s1', 't2-s1')
      ).toBe(true);
    });

    it('does not separate images inside one dimension group', () => {
      expect(
        areInDifferentDimensionGroups(dimensionGroupIndexMap, 't1-s0', 't1-s2')
      ).toBe(false);
    });

    it('treats an unknown imageId as not comparable', () => {
      expect(
        areInDifferentDimensionGroups(
          dimensionGroupIndexMap,
          't1-s1',
          'other-series-s1'
        )
      ).toBe(false);
    });

    it('treats a non-4D stack as not comparable', () => {
      expect(areInDifferentDimensionGroups(undefined, 't1-s1', 't2-s1')).toBe(
        false
      );
    });
  });
});
