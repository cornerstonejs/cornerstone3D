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

import { cache, Enums, utilities } from '@cornerstonejs/core';
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
    type: 'planar',
    element: document.createElement('div'),
    setDisplaySets: jest.fn(),
    setDisplaySetAppearance: jest.fn(),
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
    ).toThrow('Viewport does not show a volume');
  });
});

describe('AnnotationMultiSlice.setViewportFrameRange', () => {
  it('sets the frame range key of the view state on a direct next video viewport, which has no setFrameRange', () => {
    const viewport = {
      type: Enums.ViewportType.VIDEO,
      getCurrentMode: () => 'video',
      setViewState: jest.fn(),
    };

    AnnotationMultiSlice.setViewportFrameRange(viewport, {
      sliceIndex: 4,
      multiSliceReference: { sliceIndex: 9 },
    });

    expect(viewport.setViewState).toHaveBeenCalledWith({
      frameRange: [5, 10],
    });
  });

  it('asks the content mode of the viewport for a video, not its type', () => {
    const video = { getCurrentMode: () => 'video', setViewState: jest.fn() };
    const emptyVideo = {
      type: Enums.ViewportType.VIDEO,
      getCurrentMode: () => 'empty',
      setViewState: jest.fn(),
    };
    const range = { sliceIndex: 4, multiSliceReference: { sliceIndex: 9 } };

    AnnotationMultiSlice.setViewportFrameRange(video, range);
    AnnotationMultiSlice.setViewportFrameRange(emptyVideo, range);

    expect(video.setViewState).toHaveBeenCalledWith({ frameRange: [5, 10] });
    expect(emptyVideo.setViewState).not.toHaveBeenCalled();
  });

  it('sets no frame range on a direct next planar viewport, and none without a range', () => {
    const planar = {
      type: Enums.ViewportType.PLANAR,
      getCurrentMode: () => 'stack',
      setViewState: jest.fn(),
    };
    const video = {
      type: Enums.ViewportType.VIDEO,
      getCurrentMode: () => 'video',
      setViewState: jest.fn(),
    };

    AnnotationMultiSlice.setViewportFrameRange(planar, {
      sliceIndex: 4,
      multiSliceReference: { sliceIndex: 9 },
    });
    AnnotationMultiSlice.setViewportFrameRange(video, { sliceIndex: 4 });

    expect(planar.setViewState).not.toHaveBeenCalled();
    expect(video.setViewState).not.toHaveBeenCalled();
  });
});

describe('The image slice checks of core that the tools use', () => {
  /** The image slice members of a next video viewport: no `hasImageURI`. */
  function makeImageSliceViewport(extra = {}) {
    return {
      getCurrentImageId: () => 'image:1',
      getCurrentImageIdIndex: () => 0,
      getImageIds: () => ['image:1'],
      ...extra,
    };
  }

  it('take a viewport without hasImageURI', () => {
    const slices = makeImageSliceViewport();
    const calibrated = makeImageSliceViewport({ calibrateSpacing: jest.fn() });

    expect(utilities.viewportSupportsImageSlices(slices)).toBe(true);
    expect(utilities.viewportSupportsStackCalibration(calibrated)).toBe(true);
    expect(utilities.viewportSupportsStackCalibration(slices)).toBe(false);

    for (const viewport of [{}, null]) {
      expect(utilities.viewportSupportsImageSlices(viewport)).toBe(false);
      expect(utilities.viewportSupportsStackCalibration(viewport)).toBe(false);
    }
  });

  it('still ask for the three image slice members', () => {
    const { getImageIds: _getImageIds, ...noImageIds } =
      makeImageSliceViewport();

    expect(utilities.viewportSupportsImageSlices(noImageIds)).toBe(false);
  });
});
