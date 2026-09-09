import {
  metaData,
  registerDefaultProviders,
  registerDisplaySetMetadata,
} from '@cornerstonejs/metadata';
import { cache, utilities } from '@cornerstonejs/core';
import CircleROITool from '../src/tools/annotation/CircleROITool';
import RectangleROITool from '../src/tools/annotation/RectangleROITool';
import CircleROIStartEndThresholdTool from '../src/tools/segmentation/CircleROIStartEndThresholdTool';
import RectangleROIStartEndThresholdTool from '../src/tools/segmentation/RectangleROIStartEndThresholdTool';
import AnnotationTool from '../src/tools/base/AnnotationTool';
import BaseTool from '../src/tools/base/BaseTool';
import measurementTargetFilters from '../src/tools/base/measurementTargetFilters';

class TestBaseTool extends BaseTool {
  static getViewportDisplaySetsForTest(viewport) {
    return super.getViewportDisplaySets(viewport);
  }

  static findCachedStatsTargetIdForTest(data, referencedId) {
    return super.findCachedStatsTargetId(data, referencedId);
  }
}

class TestAnnotationTool extends AnnotationTool {
  static toolName = 'TestAnnotation';
}

function createImage(dimensions) {
  return {
    dimensions,
    imageData: {
      worldToIndex: (point) => [...point],
    },
    metadata: {
      Modality: 'CT',
    },
    spacing: [1, 1, 1],
  };
}

function createViewport() {
  return {
    canvasToWorld: ([x, y]) => [x, y, 0],
    element: document.createElement('div'),
    worldToCanvas: ([x, y]) => [x, y],
  };
}

/**
 * A fusion viewport displaying a CT volume first and a PT volume second, as
 * the StartEndThreshold tools see it: the CT is the viewport default, so
 * measuring the PT requires a configured target filter.
 */
function createFusionViewport() {
  return {
    element: document.createElement('div'),
    getActors: () => [
      { referencedId: 'ct-volume' },
      { referencedId: 'pt-volume' },
    ],
    getViewReferenceId: ({ volumeId } = {}) =>
      `volumeId:${volumeId ?? 'ct-volume'}?sliceIndex=0&viewPlaneNormal=0,0,1`,
  };
}

function mockFusionVolumes() {
  const volumes = {
    'ct-volume': { metadata: { Modality: 'CT' } },
    'pt-volume': { metadata: { Modality: 'PT' } },
  };
  jest.spyOn(cache, 'getVolume').mockImplementation((id) => volumes[id]);
  return volumes;
}

function createStatsCalculator() {
  return {
    getStatistics: jest.fn(() => ({
      array: [],
    })),
    statsCallback: jest.fn(),
  };
}

describe('measurement target regressions', () => {
  beforeAll(() => {
    registerDefaultProviders();
  });

  afterEach(() => {
    metaData.clear('displaySetModule');
    utilities.genericViewportDisplaySetMetadataProvider.clear();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('resolves typed display-set metadata through registered image ids', () => {
    const instance = {
      imageId: 'frame:ct',
      Modality: 'CT',
    };
    const displaySet = {
      displaySetId: 'typed-display-set',
      imageIds: ['frame:ct'],
      instances: [instance],
      isClip: true,
      preferredViewportType: 'volume',
      splitNumber: 2,
      underlyingImageIds: ['series:ct'],
      viewportTypes: ['volume'],
    };

    registerDisplaySetMetadata(['series:ct'], displaySet);
    utilities.genericViewportDisplaySetMetadataProvider.add(
      'generic-display-set',
      {
        imageIds: ['series:ct'],
        kind: 'planar',
        volumeId: 'volume:ct',
      }
    );

    const resolved = TestBaseTool.getViewportDisplaySetsForTest({
      getDisplaySets: () => [{ displaySetId: 'generic-display-set' }],
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toEqual(
      expect.objectContaining({
        displaySet,
        displaySetUID: 'typed-display-set',
        imageIds: ['frame:ct'],
        instance,
        modality: 'CT',
        volumeId: 'volume:ct',
      })
    );
  });

  it('matches cached-stat volume ids exactly when ids have query variants', () => {
    const variantTarget =
      'volumeId:foo?variant=1&sliceIndex=3&viewPlaneNormal=0,0,1';
    const baseTarget = 'volumeId:foo?sliceIndex=3&viewPlaneNormal=0,0,1';
    const data = {
      cachedStats: {
        [variantTarget]: {},
        [baseTarget]: {},
      },
    };

    expect(TestBaseTool.findCachedStatsTargetIdForTest(data, 'foo')).toBe(
      baseTarget
    );
    expect(
      TestBaseTool.findCachedStatsTargetIdForTest(data, 'foo?variant=1')
    ).toBe(variantTarget);
  });

  it('initializes cached stats before seeding measurement targets', () => {
    const tool = new TestBaseTool();
    const data = {};

    expect(tool.ensureCachedStatsTargets(data, ['volumeId:ct'])).toBe(true);
    expect(data.cachedStats).toEqual({ 'volumeId:ct': {} });
  });

  it('keeps referenced images while making created annotations FOR-wide', () => {
    const viewport = {
      getViewReference: jest.fn((specifier) =>
        specifier?.forFrameOfReference
          ? { FrameOfReferenceUID: 'for-1' }
          : {
              FrameOfReferenceUID: 'for-1',
              referencedImageId: 'image:closest',
              volumeId: 'volume:ct',
            }
      ),
    };

    const annotation = TestAnnotationTool.createAnnotationForViewport(viewport);

    expect(annotation.metadata).toEqual(
      expect.objectContaining({
        FrameOfReferenceUID: 'for-1',
        referencedImageId: 'image:closest',
      })
    );
    expect(annotation.metadata.volumeId).toBeUndefined();
  });

  it('uses cached volume SUV scaling for Planar viewport targets', () => {
    jest.spyOn(cache, 'getVolume').mockReturnValue({
      scaling: { PT: { suvbw: 1 } },
    });

    expect(
      TestAnnotationTool.isSuvScaled(
        {},
        'volumeId:pt-volume?sliceIndex=3&viewPlaneNormal=0,0,1',
        'image:ct'
      )
    ).toBe(true);
    expect(cache.getVolume).toHaveBeenCalledWith('pt-volume');
  });

  it('aggregates Circle ROI outside-image state across every target', () => {
    const tool = new CircleROITool();
    const images = {
      outside: createImage([3, 3, 1]),
      inside: createImage([10, 10, 1]),
    };
    const annotation = {
      data: {
        cachedStats: {
          outside: {},
          inside: {},
        },
        handles: {
          points: [
            [5, 5, 0],
            [6, 5, 0],
          ],
        },
      },
      invalidated: false,
      metadata: {},
    };

    tool.configuration.statsCalculator = createStatsCalculator();
    tool.getTargetImageData = (targetId) => images[targetId];
    tool._calculateCachedStats(annotation, createViewport());

    expect(tool.isHandleOutsideImage).toBe(true);
  });

  it('aggregates Rectangle ROI outside-image state across every target', () => {
    const tool = new RectangleROITool();
    const images = {
      outside: createImage([3, 3, 1]),
      inside: createImage([10, 10, 1]),
    };
    const annotation = {
      data: {
        cachedStats: {
          outside: {},
          inside: {},
        },
        handles: {
          points: [
            [4, 4, 0],
            [6, 4, 0],
            [4, 6, 0],
            [6, 6, 0],
          ],
        },
      },
      invalidated: false,
      metadata: {},
    };

    tool.configuration.statsCalculator = createStatsCalculator();
    tool.getTargetImageData = (targetId) => images[targetId];
    tool._calculateCachedStats(annotation, [0, 0, 1], [0, 1, 0], {
      viewport: createViewport(),
    });

    expect(tool.isHandleOutsideImage).toBe(true);
  });

  describe.each([
    ['Rectangle', RectangleROIStartEndThresholdTool],
    ['Circle', CircleROIStartEndThresholdTool],
  ])('%s ROI start/end threshold target selection', (_name, ToolClass) => {
    it('measures the viewport default volume when no filter is configured', () => {
      const volumes = mockFusionVolumes();
      const tool = new ToolClass();

      expect(tool.getTargetVolume(createFusionViewport())).toEqual({
        targetId: 'volumeId:ct-volume?sliceIndex=0&viewPlaneNormal=0,0,1',
        imageVolume: volumes['ct-volume'],
      });
    });

    it('measures the PT volume of a fusion viewport when filtered by modality', () => {
      const volumes = mockFusionVolumes();
      const tool = new ToolClass();
      tool.configuration.targetsFilter =
        measurementTargetFilters.firstPixelData;
      tool.configuration.targetPredicate =
        measurementTargetFilters.forModality('PT');

      expect(tool.getTargetVolume(createFusionViewport())).toEqual({
        targetId: 'volumeId:pt-volume?sliceIndex=0&viewPlaneNormal=0,0,1',
        imageVolume: volumes['pt-volume'],
      });
    });

    it('reuses an existing cachedStats key for the filtered volume', () => {
      mockFusionVolumes();
      const tool = new ToolClass();
      tool.configuration.targetsFilter =
        measurementTargetFilters.firstPixelData;
      tool.configuration.targetPredicate =
        measurementTargetFilters.forModality('PT');
      const existing = 'volumeId:pt-volume?sliceIndex=7&viewPlaneNormal=0,1,0';

      expect(
        tool.getTargetVolume(createFusionViewport(), {
          cachedStats: { [existing]: {} },
        }).targetId
      ).toBe(existing);
    });

    it('resolves no target when the filter selects nothing on the viewport', () => {
      mockFusionVolumes();
      const tool = new ToolClass();
      tool.configuration.targetsFilter =
        measurementTargetFilters.firstPixelData;
      tool.configuration.targetPredicate =
        measurementTargetFilters.forModality('MG');

      expect(tool.getTargetVolume(createFusionViewport())).toBeUndefined();
    });
  });
});
