jest.mock('@cornerstonejs/core', () => ({
  cache: {
    getImage: jest.fn(),
    getVolume: jest.fn(),
  },
  metaData: {
    get: jest.fn(),
  },
}));

jest.mock('../getSegmentation', () => ({
  getSegmentation: jest.fn(),
}));

jest.mock('../labelmapModel', () => ({
  getLabelmaps: jest.fn(),
}));

import { SegmentationRepresentations } from '../../../enums';
import { isSegmentationOverlayCompatible } from './isSegmentationOverlayCompatible';

const { cache, metaData } = jest.requireMock('@cornerstonejs/core');
const { getSegmentation } = jest.requireMock('../getSegmentation');
const { getLabelmaps } = jest.requireMock('../labelmapModel');

const SEGMENTATION_ID = 'seg-1';
const { Labelmap, Contour, Surface } = SegmentationRepresentations;

const FOR_1 = '1.2.3.4.1';
const FOR_2 = '1.2.3.4.2';

const CT_IMAGE_IDS = ['wadors:ct/frames/1', 'wadors:ct/frames/2'];
const PT_IMAGE_IDS = ['wadors:pt/frames/1', 'wadors:pt/frames/2'];
const OTHER_IMAGE_IDS = ['wadors:other/frames/1'];

// CT and PT share FOR_1 (e.g. a PET/CT acquisition); OTHER lives in FOR_2.
const IMAGE_FRAME_OF_REFERENCE = {
  [CT_IMAGE_IDS[0]]: FOR_1,
  [CT_IMAGE_IDS[1]]: FOR_1,
  [PT_IMAGE_IDS[0]]: FOR_1,
  [PT_IMAGE_IDS[1]]: FOR_1,
  [OTHER_IMAGE_IDS[0]]: FOR_2,
};

function makeStackViewport(imageIds: string[]) {
  return { getImageIds: jest.fn(() => imageIds) };
}

/**
 * Volume viewports expose getAllVolumeIds (the discriminator) and a
 * getFrameOfReferenceUID that is undefined before `setVolumes`. The real
 * BaseVolumeViewport.getImageIds throws before any volume actor exists, so the
 * gate must never rely on it.
 */
function makeVolumeViewport(frameOfReferenceUID: string | undefined) {
  return {
    getAllVolumeIds: jest.fn(() => []),
    getFrameOfReferenceUID: jest.fn(() => frameOfReferenceUID),
    getImageIds: jest.fn(() => {
      throw new Error('getImageIds must not be called on volume viewports');
    }),
  };
}

function setLabelmapReferencedImageIds(referencedImageIds: string[]) {
  getSegmentation.mockReturnValue({ segmentationId: SEGMENTATION_ID });
  getLabelmaps.mockReturnValue([{ referencedImageIds }]);
}

describe('isSegmentationOverlayCompatible', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cache.getImage.mockReturnValue(undefined);
    cache.getVolume.mockReturnValue(undefined);
    metaData.get.mockImplementation((type: string, imageId: string) =>
      type === 'imagePlaneModule' && IMAGE_FRAME_OF_REFERENCE[imageId]
        ? { frameOfReferenceUID: IMAGE_FRAME_OF_REFERENCE[imageId] }
        : undefined
    );
    getSegmentation.mockReturnValue(undefined);
    getLabelmaps.mockReturnValue([]);
  });

  describe('representation types', () => {
    it.each([
      ['contour', Contour],
      ['surface', Surface],
      ['omitted (treated as non-labelmap, like the state manager)', undefined],
    ])(
      'is always compatible for %s representations',
      (_name, representationType) => {
        // A labelmap of an unrelated series would be suppressed on this stack…
        setLabelmapReferencedImageIds(CT_IMAGE_IDS);
        const viewport = makeStackViewport(OTHER_IMAGE_IDS);

        // …but non-labelmap types have no viewport constraints.
        expect(
          isSegmentationOverlayCompatible(
            viewport as never,
            SEGMENTATION_ID,
            representationType
          )
        ).toBe(true);
      }
    );
  });

  describe('permissive fallbacks', () => {
    it('returns true when the viewport is undefined', () => {
      expect(
        isSegmentationOverlayCompatible(undefined, SEGMENTATION_ID, Labelmap)
      ).toBe(true);
    });

    it('returns true when the segmentation is unknown', () => {
      expect(
        isSegmentationOverlayCompatible(
          makeStackViewport(CT_IMAGE_IDS) as never,
          SEGMENTATION_ID,
          Labelmap
        )
      ).toBe(true);
    });

    it('returns true when no referenced imageIds can be determined yet', () => {
      getSegmentation.mockReturnValue({ segmentationId: SEGMENTATION_ID });
      // Layer without an explicit list, whose labelmap images are not cached
      // yet, so no referencedImageId can be derived.
      getLabelmaps.mockReturnValue([{ imageIds: ['labelmap:1'] }]);

      expect(
        isSegmentationOverlayCompatible(
          makeStackViewport(CT_IMAGE_IDS) as never,
          SEGMENTATION_ID,
          Labelmap
        )
      ).toBe(true);
    });
  });

  describe('stack viewports (imageId intersection)', () => {
    it('matches when the stack displays a referenced image', () => {
      setLabelmapReferencedImageIds([CT_IMAGE_IDS[1]]);

      expect(
        isSegmentationOverlayCompatible(
          makeStackViewport(CT_IMAGE_IDS) as never,
          SEGMENTATION_ID,
          Labelmap
        )
      ).toBe(true);
    });

    it('suppresses when the stack displays none of the referenced images, even in the same frame of reference', () => {
      setLabelmapReferencedImageIds(CT_IMAGE_IDS);

      // PT shares CT's frame of reference, but a stack cannot resample - it
      // needs the actual source images.
      expect(
        isSegmentationOverlayCompatible(
          makeStackViewport(PT_IMAGE_IDS) as never,
          SEGMENTATION_ID,
          Labelmap
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
        isSegmentationOverlayCompatible(
          makeStackViewport(CT_IMAGE_IDS) as never,
          SEGMENTATION_ID,
          Labelmap
        )
      ).toBe(true);
      expect(
        isSegmentationOverlayCompatible(
          makeStackViewport(OTHER_IMAGE_IDS) as never,
          SEGMENTATION_ID,
          Labelmap
        )
      ).toBe(false);
    });
  });

  describe('volume viewports (frame of reference match)', () => {
    it('stays permissive (and does not throw) before any volume is set', () => {
      setLabelmapReferencedImageIds(CT_IMAGE_IDS);
      const viewport = makeVolumeViewport(undefined);

      expect(
        isSegmentationOverlayCompatible(
          viewport as never,
          SEGMENTATION_ID,
          Labelmap
        )
      ).toBe(true);
      expect(viewport.getImageIds).not.toHaveBeenCalled();
    });

    it('stays permissive when the labelmap frame of reference cannot be determined', () => {
      getSegmentation.mockReturnValue({ segmentationId: SEGMENTATION_ID });
      getLabelmaps.mockReturnValue([
        { referencedImageIds: ['wadors:no-metadata/frames/1'] },
      ]);

      expect(
        isSegmentationOverlayCompatible(
          makeVolumeViewport(FOR_1) as never,
          SEGMENTATION_ID,
          Labelmap
        )
      ).toBe(true);
    });

    it('matches a labelmap derived from a series the viewport does not display but sharing its frame of reference', () => {
      // e.g. a PT-derived labelmap on a CT-only viewport (TMTV), or a SEG
      // overlaid on a display set it does not reference (data overlay).
      setLabelmapReferencedImageIds(PT_IMAGE_IDS);

      expect(
        isSegmentationOverlayCompatible(
          makeVolumeViewport(FOR_1) as never,
          SEGMENTATION_ID,
          Labelmap
        )
      ).toBe(true);
    });

    it('suppresses when the labelmap belongs to a different frame of reference', () => {
      setLabelmapReferencedImageIds(OTHER_IMAGE_IDS);

      expect(
        isSegmentationOverlayCompatible(
          makeVolumeViewport(FOR_1) as never,
          SEGMENTATION_ID,
          Labelmap
        )
      ).toBe(false);
    });

    it('reads the frame of reference from the labelmap volume metadata when the layer is volume-backed', () => {
      getSegmentation.mockReturnValue({ segmentationId: SEGMENTATION_ID });
      getLabelmaps.mockReturnValue([{ volumeId: 'labelmap-volume' }]);
      cache.getVolume.mockImplementation((volumeId: string) =>
        volumeId === 'labelmap-volume'
          ? { metadata: { FrameOfReferenceUID: FOR_2 } }
          : undefined
      );

      expect(
        isSegmentationOverlayCompatible(
          makeVolumeViewport(FOR_2) as never,
          SEGMENTATION_ID,
          Labelmap
        )
      ).toBe(true);
      expect(
        isSegmentationOverlayCompatible(
          makeVolumeViewport(FOR_1) as never,
          SEGMENTATION_ID,
          Labelmap
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
        isSegmentationOverlayCompatible(
          viewport as never,
          SEGMENTATION_ID,
          Labelmap
        )
      ).toBe(true);
    });

    it('treats a throwing getFrameOfReferenceUID as "unknown" and stays permissive', () => {
      setLabelmapReferencedImageIds(OTHER_IMAGE_IDS);
      const viewport = {
        getAllVolumeIds: jest.fn(() => []),
        getFrameOfReferenceUID: jest.fn(() => {
          throw new Error('viewport destroyed');
        }),
      };

      expect(
        isSegmentationOverlayCompatible(
          viewport as never,
          SEGMENTATION_ID,
          Labelmap
        )
      ).toBe(true);
    });
  });
});
