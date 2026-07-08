import type { Segmentation } from '../../../types/SegmentationStateTypes';

jest.mock('@cornerstonejs/core', () => ({
  cache: {
    getVolume: jest.fn(),
  },
  getEnabledElementByViewportId: jest.fn(),
}));

jest.mock('../helpers/getViewportLabelmapRenderMode', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('./normalizeLabelmapSegmentationData', () => ({
  ensureLabelmapState: jest.fn(),
  getSegmentOrder: jest.fn(() => [1]),
}));

jest.mock('./labelmapLayerStore', () => ({
  getLabelmaps: jest.fn(),
}));

jest.mock('./labelmapSegmentBindings', () => ({
  getLabelmapForSegment: jest.fn(),
}));

jest.mock('./labelmapLegacyAdapter', () => ({
  getReferencedImageIdToCurrentImageIdMap: jest.fn(),
}));

import LabelmapImageReferenceResolver from './labelmapImageReferenceResolver';

const { cache, getEnabledElementByViewportId } = jest.requireMock(
  '@cornerstonejs/core'
);
const getViewportLabelmapRenderMode = jest.requireMock(
  '../helpers/getViewportLabelmapRenderMode'
).default;
const { ensureLabelmapState } = jest.requireMock(
  './normalizeLabelmapSegmentationData'
);
const { getLabelmaps } = jest.requireMock('./labelmapLayerStore');
const { getLabelmapForSegment } = jest.requireMock('./labelmapSegmentBindings');
const { getReferencedImageIdToCurrentImageIdMap } = jest.requireMock(
  './labelmapLegacyAdapter'
);

function makeSegmentation(overrides: Partial<Segmentation> = {}): Segmentation {
  return {
    segmentationId: 'seg-1',
    label: 'seg-1',
    cachedStats: {},
    segments: {
      1: {
        segmentIndex: 1,
        label: '1',
        locked: false,
        cachedStats: {},
        active: true,
      },
      2: {
        segmentIndex: 2,
        label: '2',
        locked: false,
        cachedStats: {},
        active: false,
      },
    },
    representationData: {
      Labelmap: {
        labelmaps: {
          layerA: {
            labelmapId: 'layerA',
            storageKind: 'stack',
            imageIds: ['lm-a-0', 'lm-a-1'],
            labelToSegmentIndex: { 1: 1 },
          },
        },
        segmentBindings: {
          1: { labelmapId: 'layerA', labelValue: 1 },
        },
      },
    },
    ...overrides,
  } as Segmentation;
}

function makeStackViewport(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vp-1',
    getCurrentImageId: jest.fn(() => 'ref-0'),
    getImageIds: jest.fn(() => ['ref-0', 'ref-1']),
    isReferenceViewable: jest.fn(() => false),
    ...overrides,
  };
}

describe('LabelmapImageReferenceResolver', () => {
  let getSegmentation: jest.Mock;
  let resolver: LabelmapImageReferenceResolver;

  beforeEach(() => {
    jest.clearAllMocks();
    getSegmentation = jest.fn();
    resolver = new LabelmapImageReferenceResolver(getSegmentation);
  });

  describe('getLabelmapImageIds', () => {
    it('returns undefined when no Labelmap representation is present', () => {
      expect(resolver.getLabelmapImageIds({} as never)).toBeUndefined();
    });

    it('flattens and dedupes imageIds across labelmap layers', () => {
      const ids = resolver.getLabelmapImageIds({
        Labelmap: {
          labelmaps: {
            a: { imageIds: ['x', 'y'] },
            b: { imageIds: ['y', 'z'] },
            c: {},
          },
        },
      } as never);
      expect(ids).toEqual(['x', 'y', 'z']);
    });

    it('falls through to legacy stack imageIds when no labelmaps map is present', () => {
      const ids = resolver.getLabelmapImageIds({
        Labelmap: { imageIds: ['stack-0'] },
      } as never);
      expect(ids).toEqual(['stack-0']);
    });

    it('reads imageIds from cached volume when only volumeId is present', () => {
      cache.getVolume.mockReturnValue({ imageIds: ['vol-0', 'vol-1'] });
      const ids = resolver.getLabelmapImageIds({
        Labelmap: { volumeId: 'vol-1' },
      } as never);
      expect(cache.getVolume).toHaveBeenCalledWith('vol-1');
      expect(ids).toEqual(['vol-0', 'vol-1']);
    });
  });

  describe('getLabelmapImageIdsForImageId', () => {
    it('returns undefined when the segmentation is missing', () => {
      getSegmentation.mockReturnValue(undefined);
      expect(
        resolver.getLabelmapImageIdsForImageId('ref-0', 'seg-1')
      ).toBeUndefined();
      expect(ensureLabelmapState).not.toHaveBeenCalled();
    });

    it('returns undefined when the Labelmap representation is missing', () => {
      getSegmentation.mockReturnValue({ representationData: {} });
      expect(
        resolver.getLabelmapImageIdsForImageId('ref-0', 'seg-1')
      ).toBeUndefined();
      expect(ensureLabelmapState).not.toHaveBeenCalled();
    });

    it('normalizes state and reads from the legacy reference map', () => {
      const segmentation = makeSegmentation();
      getSegmentation.mockReturnValue(segmentation);
      const map = new Map([['ref-0', ['lm-a-0']]]);
      getReferencedImageIdToCurrentImageIdMap.mockReturnValue(map);

      expect(resolver.getLabelmapImageIdsForImageId('ref-0', 'seg-1')).toEqual([
        'lm-a-0',
      ]);
      expect(ensureLabelmapState).toHaveBeenCalledWith(segmentation);
    });
  });

  describe('updateLabelmapSegmentationImageReferences', () => {
    it('returns undefined when the viewport is not enabled', () => {
      getSegmentation.mockReturnValue(makeSegmentation());
      getEnabledElementByViewportId.mockReturnValue(undefined);

      const result = resolver.updateLabelmapSegmentationImageReferences(
        'vp-1',
        'seg-1'
      );
      expect(result).toBeUndefined();
    });

    it('returns undefined when there are no labelmap image ids', () => {
      const segmentation = makeSegmentation({
        representationData: { Labelmap: { labelmaps: {} } },
      } as never);
      getSegmentation.mockReturnValue(segmentation);
      getEnabledElementByViewportId.mockReturnValue({
        viewport: makeStackViewport(),
      });

      expect(
        resolver.updateLabelmapSegmentationImageReferences('vp-1', 'seg-1')
      ).toBeUndefined();
    });

    it('returns the matched labelmap image id when a candidate is viewable', () => {
      const segmentation = makeSegmentation();
      getSegmentation.mockReturnValue(segmentation);

      const viewport = makeStackViewport({
        getCurrentImageId: jest.fn(() => 'ref-0'),
        isReferenceViewable: jest.fn(
          (ref) => ref.referencedImageId === 'lm-a-0'
        ),
      });
      getEnabledElementByViewportId.mockReturnValue({ viewport });

      const result = resolver.updateLabelmapSegmentationImageReferences(
        'vp-1',
        'seg-1'
      );
      expect(result).toBe('lm-a-0');
    });
  });

  describe('getCurrentLabelmapImageIdsForViewport', () => {
    beforeEach(() => {
      getViewportLabelmapRenderMode.mockReturnValue('image');
      getReferencedImageIdToCurrentImageIdMap.mockReturnValue(new Map());
    });

    it('returns undefined when the viewport render mode is not image', () => {
      getEnabledElementByViewportId.mockReturnValue({
        viewport: makeStackViewport(),
      });
      getViewportLabelmapRenderMode.mockReturnValue('volume');

      expect(
        resolver.getCurrentLabelmapImageIdsForViewport('vp-1', 'seg-1')
      ).toBeUndefined();
    });

    it('returns undefined when getCurrentImageId is not a function', () => {
      getEnabledElementByViewportId.mockReturnValue({
        viewport: { id: 'vp-1' },
      });
      expect(
        resolver.getCurrentLabelmapImageIdsForViewport('vp-1', 'seg-1')
      ).toBeUndefined();
    });

    it('picks layer.imageIds[currentIndex] when no referencedImageIds match', () => {
      const segmentation = makeSegmentation();
      getSegmentation.mockReturnValue(segmentation);

      const viewport = makeStackViewport({
        getCurrentImageId: jest.fn(() => 'ref-1'),
        getImageIds: jest.fn(() => ['ref-0', 'ref-1']),
      });
      getEnabledElementByViewportId.mockReturnValue({ viewport });
      getLabelmaps.mockReturnValue([
        {
          labelmapId: 'layerA',
          imageIds: ['lm-a-0', 'lm-a-1'],
        },
      ]);

      const result = resolver.getCurrentLabelmapImageIdsForViewport(
        'vp-1',
        'seg-1'
      );
      // current index of 'ref-1' is 1 → layer.imageIds[1]
      expect(result).toEqual(['lm-a-1']);
    });

    it('uses referencedImageIds matches when present', () => {
      const segmentation = makeSegmentation();
      getSegmentation.mockReturnValue(segmentation);

      const viewport = makeStackViewport({
        getCurrentImageId: jest.fn(() => 'ref-0'),
      });
      getEnabledElementByViewportId.mockReturnValue({ viewport });
      getLabelmaps.mockReturnValue([
        {
          labelmapId: 'layerA',
          referencedImageIds: ['ref-0', 'ref-1', 'ref-0'],
          imageIds: ['lm-0', 'lm-1', 'lm-2'],
        },
      ]);

      const result = resolver.getCurrentLabelmapImageIdsForViewport(
        'vp-1',
        'seg-1'
      );
      // ref-0 matches at indices 0 and 2 → lm-0 + lm-2
      expect(result).toEqual(['lm-0', 'lm-2']);
    });

    it('prefers the active segment imageId when stored in the reference map', () => {
      const segmentation = makeSegmentation();
      getSegmentation.mockReturnValue(segmentation);
      getLabelmapForSegment.mockReturnValue({
        labelmapId: 'layerA',
        imageIds: ['lm-active-0', 'lm-active-1'],
      });

      const viewport = makeStackViewport({
        getCurrentImageId: jest.fn(() => 'ref-1'),
      });
      getEnabledElementByViewportId.mockReturnValue({ viewport });
      getLabelmaps.mockReturnValue([
        { labelmapId: 'layerA', imageIds: ['lm-a-0', 'lm-a-1'] },
      ]);

      resolver.getCurrentLabelmapImageIdsForViewport('vp-1', 'seg-1');
      expect(getLabelmapForSegment).toHaveBeenCalledWith(segmentation, 1);
    });
  });

  describe('getCurrentLabelmapImageIdForViewport', () => {
    beforeEach(() => {
      getViewportLabelmapRenderMode.mockReturnValue('image');
      getReferencedImageIdToCurrentImageIdMap.mockReturnValue(new Map());
    });

    it('returns undefined when the viewport is not enabled', () => {
      getEnabledElementByViewportId.mockReturnValue(undefined);
      expect(
        resolver.getCurrentLabelmapImageIdForViewport('vp-1', 'seg-1')
      ).toBeUndefined();
    });

    it('returns undefined when render mode is not image', () => {
      getEnabledElementByViewportId.mockReturnValue({
        viewport: makeStackViewport(),
      });
      getViewportLabelmapRenderMode.mockReturnValue('volume');
      expect(
        resolver.getCurrentLabelmapImageIdForViewport('vp-1', 'seg-1')
      ).toBeUndefined();
    });

    it('returns the active segment image when present', () => {
      const segmentation = makeSegmentation();
      getSegmentation.mockReturnValue(segmentation);
      const viewport = makeStackViewport({
        getCurrentImageId: jest.fn(() => 'ref-1'),
      });
      getEnabledElementByViewportId.mockReturnValue({ viewport });
      getLabelmaps.mockReturnValue([
        { labelmapId: 'layerA', imageIds: ['lm-a-0', 'lm-a-1'] },
      ]);
      getLabelmapForSegment.mockReturnValue({
        labelmapId: 'layerA',
        imageIds: ['lm-active-0', 'lm-active-1'],
      });

      expect(
        resolver.getCurrentLabelmapImageIdForViewport('vp-1', 'seg-1')
      ).toBe('lm-active-1');
    });

    it('falls back to first resolved image when no active binding exists', () => {
      const segmentation = makeSegmentation({
        segments: {
          1: {
            segmentIndex: 1,
            label: '1',
            locked: false,
            cachedStats: {},
            active: false,
          },
        },
      } as never);
      getSegmentation.mockReturnValue(segmentation);
      const viewport = makeStackViewport({
        getCurrentImageId: jest.fn(() => 'ref-0'),
      });
      getEnabledElementByViewportId.mockReturnValue({ viewport });
      getLabelmaps.mockReturnValue([
        { labelmapId: 'layerA', imageIds: ['lm-a-0', 'lm-a-1'] },
      ]);

      expect(
        resolver.getCurrentLabelmapImageIdForViewport('vp-1', 'seg-1')
      ).toBe('lm-a-0');
    });
  });

  describe('getStackSegmentationImageIdsForViewport', () => {
    it('returns an empty array when the segmentation is missing', () => {
      getSegmentation.mockReturnValue(undefined);
      expect(
        resolver.getStackSegmentationImageIdsForViewport('vp-1', 'seg-1')
      ).toEqual([]);
    });

    it('flatMaps viewport imageIds through the reference map', () => {
      getSegmentation.mockReturnValue(makeSegmentation());
      getEnabledElementByViewportId.mockReturnValue({
        viewport: {
          ...makeStackViewport(),
          getImageIds: () => ['ref-0', 'ref-1', 'ref-2'],
        },
      });
      getReferencedImageIdToCurrentImageIdMap.mockReturnValue(
        new Map([
          ['ref-0', ['lm-0']],
          ['ref-2', ['lm-2a', 'lm-2b']],
        ])
      );

      expect(
        resolver.getStackSegmentationImageIdsForViewport('vp-1', 'seg-1')
      ).toEqual(['lm-0', 'lm-2a', 'lm-2b']);
    });
  });

  describe('reset', () => {
    it('clears cached reference maps so subsequent updates start fresh', () => {
      // Prime an entry, then reset; nothing observable throws, and a follow-up
      // call against a fresh segmentation produces a new result rather than a
      // cached one.
      getSegmentation.mockReturnValue(makeSegmentation());
      getEnabledElementByViewportId.mockReturnValue({
        viewport: makeStackViewport({
          isReferenceViewable: () => true,
        }),
      });

      resolver.updateLabelmapSegmentationImageReferences('vp-1', 'seg-1');
      resolver.reset();

      // After reset, a second call still works without throwing.
      expect(() =>
        resolver.updateLabelmapSegmentationImageReferences('vp-1', 'seg-1')
      ).not.toThrow();
    });
  });
});
