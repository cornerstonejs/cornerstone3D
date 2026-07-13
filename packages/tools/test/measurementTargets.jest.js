import {
  metaData,
  registerDefaultProviders,
  registerDisplaySetMetadata,
} from '@cornerstonejs/metadata';
import { cache, utilities } from '@cornerstonejs/core';
import CircleROITool from '../src/tools/annotation/CircleROITool';
import RectangleROITool from '../src/tools/annotation/RectangleROITool';
import AnnotationTool from '../src/tools/base/AnnotationTool';
import BaseTool from '../src/tools/base/BaseTool';

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
});
