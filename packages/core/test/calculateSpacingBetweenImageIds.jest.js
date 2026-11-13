import * as metaData from '../src/metaData';
import { getConfiguration, setConfiguration } from '../src/init';
import calculateSpacingBetweenImageIds from '../src/utilities/calculateSpacingBetweenImageIds';

describe('calculateSpacingBetweenImageIds', () => {
  let imagePlane;

  const provider = (type) =>
    type === 'imagePlaneModule' ? imagePlane : undefined;

  beforeEach(() => {
    metaData.addProvider(provider, 10000);
  });

  afterEach(() => {
    metaData.removeProvider(provider);
  });

  describe('when spacing cannot be calculated from positions', () => {
    // Multiframe wadouri: every frame reports the same position, so the
    // computed spacing is 0 and the metadata fallbacks are used (only when
    // strictZSpacingForVolumeViewport is disabled).
    const original = getConfiguration();

    beforeEach(() => {
      setConfiguration({
        ...original,
        rendering: {
          ...original.rendering,
          strictZSpacingForVolumeViewport: false,
        },
      });
    });

    afterEach(() => {
      setConfiguration(original);
    });

    const imageIds = ['wadouri:a?frame=1', 'wadouri:a?frame=2'];
    const basePlane = {
      imagePositionPatient: [0, 0, 0],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      sliceThickness: 3,
    };

    it('uses a positive spacingBetweenSlices', () => {
      imagePlane = { ...basePlane, spacingBetweenSlices: 2 };

      expect(calculateSpacingBetweenImageIds(imageIds)).toBe(2);
    });

    it('ignores a negative spacingBetweenSlices and falls back to sliceThickness', () => {
      imagePlane = { ...basePlane, spacingBetweenSlices: -2 };

      expect(calculateSpacingBetweenImageIds(imageIds)).toBe(3);
    });
  });

  describe('with a single image', () => {
    it('ignores a negative spacingBetweenSlices and falls back to pixel spacing', () => {
      imagePlane = {
        imagePositionPatient: [0, 0, 0],
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        spacingBetweenSlices: -2,
        columnPixelSpacing: 0.5,
      };

      expect(calculateSpacingBetweenImageIds(['wadouri:a'])).toBe(0.5);
    });
  });
});
