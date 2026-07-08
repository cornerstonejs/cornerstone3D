jest.mock('@cornerstonejs/core', () => ({
  cache: {
    getImage: jest.fn(),
    getVolume: jest.fn(),
  },
}));

jest.mock('../getSegmentation', () => ({
  getSegmentation: jest.fn(),
}));

jest.mock('../labelmapModel', () => ({
  getLabelmaps: jest.fn(),
}));

import { viewportReferencesSegmentationImages } from './viewportReferencesSegmentationImages';

const { cache } = jest.requireMock('@cornerstonejs/core');
const { getSegmentation } = jest.requireMock('../getSegmentation');
const { getLabelmaps } = jest.requireMock('../labelmapModel');

const SEGMENTATION_ID = 'seg-1';

const CT_IMAGE_IDS = ['wadors:ct/frames/1', 'wadors:ct/frames/2'];
const PT_IMAGE_IDS = ['wadors:pt/frames/1', 'wadors:pt/frames/2'];
const OTHER_IMAGE_IDS = ['wadors:other/frames/1'];

function makeStackViewport(imageIds: string[]) {
  return { getImageIds: jest.fn(() => imageIds) };
}

/**
 * Volume viewports expose both getAllVolumeIds and getImageIds; the real
 * BaseVolumeViewport.getImageIds throws before any volume actor exists and
 * reports only the first (default) volume afterwards, so the gate must never
 * rely on it.
 */
function makeVolumeViewport(volumeIds: string[]) {
  return {
    getAllVolumeIds: jest.fn(() => volumeIds),
    getImageIds: jest.fn(() => {
      throw new Error('getImageIds must not be called on volume viewports');
    }),
  };
}

function setLabelmapReferencedImageIds(referencedImageIds: string[]) {
  getSegmentation.mockReturnValue({ segmentationId: SEGMENTATION_ID });
  getLabelmaps.mockReturnValue([{ referencedImageIds }]);
}

describe('viewportReferencesSegmentationImages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cache.getImage.mockReturnValue(undefined);
    cache.getVolume.mockReturnValue(undefined);
    getSegmentation.mockReturnValue(undefined);
    getLabelmaps.mockReturnValue([]);
  });

  describe('permissive fallbacks', () => {
    it('returns true when the viewport is undefined', () => {
      expect(
        viewportReferencesSegmentationImages(undefined, SEGMENTATION_ID)
      ).toBe(true);
    });

    it('returns true when the segmentation is unknown', () => {
      expect(
        viewportReferencesSegmentationImages(
          makeStackViewport(CT_IMAGE_IDS) as never,
          SEGMENTATION_ID
        )
      ).toBe(true);
    });

    it('returns true when no referenced imageIds can be determined yet', () => {
      getSegmentation.mockReturnValue({ segmentationId: SEGMENTATION_ID });
      // Layer without an explicit list, whose labelmap images are not cached
      // yet, so no referencedImageId can be derived.
      getLabelmaps.mockReturnValue([{ imageIds: ['labelmap:1'] }]);

      expect(
        viewportReferencesSegmentationImages(
          makeStackViewport(CT_IMAGE_IDS) as never,
          SEGMENTATION_ID
        )
      ).toBe(true);
    });
  });

  describe('stack viewports', () => {
    it('matches when the stack displays a referenced image', () => {
      setLabelmapReferencedImageIds([CT_IMAGE_IDS[1]]);

      expect(
        viewportReferencesSegmentationImages(
          makeStackViewport(CT_IMAGE_IDS) as never,
          SEGMENTATION_ID
        )
      ).toBe(true);
    });

    it('suppresses when the stack displays none of the referenced images', () => {
      setLabelmapReferencedImageIds(CT_IMAGE_IDS);

      expect(
        viewportReferencesSegmentationImages(
          makeStackViewport(OTHER_IMAGE_IDS) as never,
          SEGMENTATION_ID
        )
      ).toBe(false);
    });

    it('derives referenced ids from cached labelmap images when the layer has no explicit list', () => {
      getSegmentation.mockReturnValue({ segmentationId: SEGMENTATION_ID });
      getLabelmaps.mockReturnValue([{ imageIds: ['labelmap:1'] }]);
      cache.getImage.mockImplementation((imageId: string) =>
        imageId === 'labelmap:1'
          ? { referencedImageId: CT_IMAGE_IDS[0] }
          : undefined
      );

      expect(
        viewportReferencesSegmentationImages(
          makeStackViewport(CT_IMAGE_IDS) as never,
          SEGMENTATION_ID
        )
      ).toBe(true);
      expect(
        viewportReferencesSegmentationImages(
          makeStackViewport(OTHER_IMAGE_IDS) as never,
          SEGMENTATION_ID
        )
      ).toBe(false);
    });
  });

  describe('volume viewports', () => {
    beforeEach(() => {
      cache.getVolume.mockImplementation((volumeId: string) => {
        if (volumeId === 'ct-volume') {
          return { imageIds: CT_IMAGE_IDS };
        }
        if (volumeId === 'pt-volume') {
          return { imageIds: PT_IMAGE_IDS };
        }
        return undefined;
      });
    });

    it('stays permissive (and does not throw) before any volume is set', () => {
      setLabelmapReferencedImageIds(CT_IMAGE_IDS);
      const viewport = makeVolumeViewport([]);

      expect(
        viewportReferencesSegmentationImages(viewport as never, SEGMENTATION_ID)
      ).toBe(true);
      expect(viewport.getImageIds).not.toHaveBeenCalled();
    });

    it('stays permissive when the volume is not in the cache', () => {
      setLabelmapReferencedImageIds(CT_IMAGE_IDS);

      expect(
        viewportReferencesSegmentationImages(
          makeVolumeViewport(['evicted-volume']) as never,
          SEGMENTATION_ID
        )
      ).toBe(true);
    });

    it('matches a labelmap derived from a non-default volume on a fusion viewport', () => {
      setLabelmapReferencedImageIds(PT_IMAGE_IDS);

      expect(
        viewportReferencesSegmentationImages(
          makeVolumeViewport(['ct-volume', 'pt-volume']) as never,
          SEGMENTATION_ID
        )
      ).toBe(true);
    });

    it('suppresses when no volume of a fusion viewport references the labelmap images', () => {
      setLabelmapReferencedImageIds(OTHER_IMAGE_IDS);

      expect(
        viewportReferencesSegmentationImages(
          makeVolumeViewport(['ct-volume', 'pt-volume']) as never,
          SEGMENTATION_ID
        )
      ).toBe(false);
    });
  });

  describe('throw safety', () => {
    it('treats a throwing getImageIds as "ids unknown" and stays permissive', () => {
      setLabelmapReferencedImageIds(CT_IMAGE_IDS);
      const viewport = {
        getImageIds: jest.fn(() => {
          throw new Error('No actor found for the given volumeId');
        }),
      };

      expect(
        viewportReferencesSegmentationImages(viewport as never, SEGMENTATION_ID)
      ).toBe(true);
    });

    it('treats a throwing getAllVolumeIds as "ids unknown" and stays permissive', () => {
      setLabelmapReferencedImageIds(CT_IMAGE_IDS);
      const viewport = {
        getAllVolumeIds: jest.fn(() => {
          throw new Error('viewport destroyed');
        }),
      };

      expect(
        viewportReferencesSegmentationImages(viewport as never, SEGMENTATION_ID)
      ).toBe(true);
    });
  });
});
