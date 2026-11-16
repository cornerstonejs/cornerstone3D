jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');

  return {
    ...actual,
    cache: {
      ...actual.cache,
      getVolume: jest.fn(),
    },
  };
});

import { cache } from '@cornerstonejs/core';
import { moveAnnotationToViewPlane } from '../src/utilities/moveAnnotationToViewPlane';
import AnnotationMultiSlice from '../src/utilities/AnnotationMultiSlice';
import WholeBodySegmentTool from '../src/tools/annotation/WholeBodySegmentTool';

/**
 * A direct next planar viewport: the next API, a resolved view for the
 * camera, and no legacy `getCamera` or `getAllVolumeIds`.
 */
function makeNextPlanar(mode, extra = {}) {
  const camera = {
    focalPoint: [0, 0, 2],
    position: [0, 0, 12],
    viewPlaneNormal: [0, 0, 1],
    viewUp: [0, -1, 0],
  };

  return {
    type: 'planarNext',
    element: document.createElement('div'),
    setDisplaySets: jest.fn(),
    setDisplaySetPresentation: jest.fn(),
    setViewState: jest.fn(),
    getCurrentMode: () => mode,
    getResolvedView: () => ({ toICamera: () => camera }),
    getViewReference: () => ({
      cameraFocalPoint: camera.focalPoint,
      viewPlaneNormal: camera.viewPlaneNormal,
      viewUp: camera.viewUp,
    }),
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('moveAnnotationToViewPlane on a direct next planar viewport', () => {
  it('moves the points onto the plane of the view', () => {
    const viewport = makeNextPlanar('volume');
    const annotation = {
      metadata: { referencedImageId: 'image-0' },
      data: { handles: { points: [[1, 2, 7]] } },
    };

    moveAnnotationToViewPlane(annotation, viewport);

    expect(Array.from(annotation.data.handles.points[0])).toEqual([1, 2, 2]);
    expect(annotation.metadata.referencedImageId).toBe('image-0');
  });

  it('updates the referenced image in stack mode', () => {
    const viewport = makeNextPlanar('stack', {
      getCurrentImageId: () => 'image-2',
    });
    const annotation = {
      metadata: { referencedImageId: 'image-0' },
      data: { handles: { points: [[0, 0, 0]] } },
    };

    moveAnnotationToViewPlane(annotation, viewport);

    expect(annotation.metadata.referencedImageId).toBe('image-2');
    expect(Array.from(annotation.data.handles.points[0])).toEqual([0, 0, 2]);
  });
});

describe('WholeBodySegmentTool volume of a direct next planar viewport', () => {
  it('reads the volume that the viewport shows in volume mode', () => {
    const tool = new WholeBodySegmentTool();
    const volume = { volumeId: 'ct' };

    cache.getVolume.mockReturnValue(volume);

    expect(
      tool._getViewportVolume(
        makeNextPlanar('volume', { getVolumeId: () => 'ct' })
      )
    ).toBe(volume);
    expect(cache.getVolume).toHaveBeenCalledWith('ct');
  });

  it('still throws in stack mode', () => {
    const tool = new WholeBodySegmentTool();

    expect(() =>
      tool._getViewportVolume(
        makeNextPlanar('stack', { getVolumeId: () => undefined })
      )
    ).toThrow('Viewport is not a BaseVolumeViewport');
  });
});

describe('AnnotationMultiSlice.setViewportFrameRange', () => {
  it('gives the viewport the frame range as one array of 1-based frames', () => {
    const viewport = { setFrameRange: jest.fn() };

    AnnotationMultiSlice.setViewportFrameRange(viewport, {
      sliceIndex: 4,
      multiSliceReference: { sliceIndex: 9 },
    });

    expect(viewport.setFrameRange).toHaveBeenCalledWith([5, 10]);
  });
});
