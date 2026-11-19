jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');

  return {
    ...actual,
    getEnabledElement: jest.fn(),
    getEnabledElementByIds: jest.fn(),
    cache: {
      ...actual.cache,
      getVolume: jest.fn(),
    },
    volumeLoader: {
      ...actual.volumeLoader,
      createAndCacheDerivedLabelmapVolume: jest.fn(),
    },
    utilities: {
      ...actual.utilities,
      getClosestImageId: jest.fn(() => 'closest-image'),
      getCurrentVolumeViewportSlice: jest.fn(() => {
        throw new Error('volume slice branch');
      }),
    },
  };
});

jest.mock('../src/stateManagement/annotation/annotationState', () => ({
  ...jest.requireActual('../src/stateManagement/annotation/annotationState'),
  addAnnotation: jest.fn(),
}));

jest.mock('../src/utilities/viewportFilters', () => ({
  ...jest.requireActual('../src/utilities/viewportFilters'),
  getViewportIdsWithToolToRender: jest.fn(() => []),
}));

jest.mock('../src/utilities/triggerAnnotationRenderForViewportIds', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../src/utilities/planar', () => ({
  ...jest.requireActual('../src/utilities/planar'),
  getPointInLineOfSightWithCriteria: jest.fn(() => [1, 2, 3]),
}));

jest.mock('../src/store/ToolGroupManager', () => ({
  ...jest.requireActual('../src/store/ToolGroupManager'),
  getToolGroupForViewport: jest.fn(() => undefined),
}));

import {
  cache,
  getEnabledElement,
  getEnabledElementByIds,
  metaData,
  utilities,
  volumeLoader,
} from '@cornerstonejs/core';
import normalizeViewportPlane from '../src/utilities/normalizeViewportPlane';
import { annotationHydration } from '../src/utilities/annotationHydration';
import { moveAnnotationToViewPlane } from '../src/utilities/moveAnnotationToViewPlane';
import createLabelmapVolumeForViewport from '../src/utilities/segmentation/createLabelmapVolumeForViewport';
import WholeBodySegmentTool from '../src/tools/annotation/WholeBodySegmentTool';
import AnnotationDisplayTool from '../src/tools/base/AnnotationDisplayTool';
import LivewireContourTool from '../src/tools/annotation/LivewireContourTool';
import MIPJumpToClickTool from '../src/tools/MIPJumpToClickTool';
import RectangleROIThresholdTool from '../src/tools/segmentation/RectangleROIThresholdTool';
import UltrasoundDirectionalTool from '../src/tools/annotation/UltrasoundDirectionalTool';
import VolumeCroppingControlTool from '../src/tools/VolumeCroppingControlTool';
import { vtkOrientationControllerWidget } from '../src/utilities/vtkjs/OrientationControllerWidget';

const VOLUME_TARGET_ID =
  'volumeId:cornerstoneStreamingImageVolume:ct?sliceIndex=3&viewPlaneNormal=1.000,0.000,0.000';

/** The members of the next API that every stand-in viewport here has. */
function nextApi() {
  return {
    setDisplaySets: jest.fn(),
    setDisplaySetPresentation: jest.fn(),
    setViewState: jest.fn(),
  };
}

/**
 * A stand-in of a next viewport of a type, which shows content of a mode
 * (`stack` or `volume` for a planar viewport).
 */
function makeViewport(type, mode, extra = {}) {
  return {
    ...nextApi(),
    type,
    element: document.createElement('div'),
    getCurrentMode: () => mode,
    ...extra,
  };
}

/** A stand-in of a planar viewport in stack or volume mode. */
function makePlanar(mode, extra = {}) {
  return makeViewport('planarNext', mode, extra);
}

const sagittalCamera = {
  focalPoint: [0, 0, 0],
  position: [-10, 0, 0],
  viewPlaneNormal: [1, 0, 0],
  viewUp: [0, 0, 1],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('normalizeViewportPlane', () => {
  const bounds = [
    [0, 1],
    [0, 2],
    [0, 3],
  ];

  it('keeps the acquisition mapping for a planar viewport in stack mode', () => {
    expect(normalizeViewportPlane(makePlanar('stack'), bounds).type).toBe(
      'acquistion'
    );
  });

  it('maps a sagittal planar viewport in volume mode like the legacy viewport', () => {
    const viewport = makePlanar('volume', {
      getResolvedView: () => ({ toICamera: () => sagittalCamera }),
      getViewReference: () => ({ viewPlaneNormal: [1, 0, 0] }),
    });

    expect(normalizeViewportPlane(viewport, bounds).type).toBe('jk');
  });
});

describe('annotationHydration', () => {
  it('uses the closest volume image on a planar viewport in volume mode', () => {
    cache.getVolume.mockReturnValue({ volumeId: 'ct' });
    const viewport = makePlanar('volume', {
      getViewReference: () => ({
        viewPlaneNormal: [1, 0, 0],
        FrameOfReferenceUID: 'for',
      }),
      getViewReferenceId: () => VOLUME_TARGET_ID,
    });

    const annotation = annotationHydration(viewport, 'Length', [
      [0, 0, 0],
      [1, 0, 0],
    ]);

    expect(cache.getVolume).toHaveBeenCalledWith(
      'cornerstoneStreamingImageVolume:ct'
    );
    expect(annotation.metadata.referencedImageId).toBe('closest-image');
  });

  it('uses the closest stack image on a planar viewport in stack mode', () => {
    const getMetaData = jest
      .spyOn(metaData, 'get')
      .mockImplementation((_type, imageId) => ({
        imagePositionPatient: imageId === 'image-1' ? [0, 0, 5] : [0, 0, 0],
      }));
    const viewport = makePlanar('stack', {
      getViewReference: () => ({
        viewPlaneNormal: [0, 0, 1],
        FrameOfReferenceUID: 'for',
      }),
      getImageIds: () => ['image-0', 'image-1'],
    });

    const annotation = annotationHydration(viewport, 'Length', [[0, 0, 5]]);

    expect(annotation.metadata.referencedImageId).toBe('image-1');
    getMetaData.mockRestore();
  });

  it('still throws for a viewport that is neither stack nor volume', () => {
    const viewport = makeViewport('videoNext', 'video', {
      getViewReference: () => ({ viewPlaneNormal: [0, 0, 1] }),
    });

    expect(() => annotationHydration(viewport, 'Length', [[0, 0, 0]])).toThrow(
      'viewport must be a StackViewport or BaseVolumeViewport'
    );
  });
});

describe('moveAnnotationToViewPlane', () => {
  it('updates the referenced image of a planar viewport in stack mode', () => {
    const viewport = makePlanar('stack', {
      getViewReference: () => ({}),
      getResolvedView: () => ({
        toICamera: () => ({
          focalPoint: [0, 0, 2],
          viewPlaneNormal: [0, 0, 1],
        }),
      }),
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

  it('leaves the referenced image of a volume viewport alone', () => {
    const viewport = makePlanar('volume', {
      getViewReference: () => ({}),
      getResolvedView: () => ({
        toICamera: () => ({
          focalPoint: [0, 0, 2],
          viewPlaneNormal: [0, 0, 1],
        }),
      }),
      getCurrentImageId: () => 'image-2',
    });
    const annotation = {
      metadata: { referencedImageId: 'image-0' },
      data: { handles: { points: [[0, 0, 0]] } },
    };

    moveAnnotationToViewPlane(annotation, viewport);

    expect(annotation.metadata.referencedImageId).toBe('image-0');
  });
});

describe('createLabelmapVolumeForViewport', () => {
  it('creates a labelmap volume for a planar viewport in volume mode', async () => {
    const viewport = makePlanar('volume', {
      getDefaultActor: () => ({ uid: 'actor' }),
      getVolumeId: () => 'ct',
    });
    getEnabledElementByIds.mockReturnValue({ viewport });

    const segmentationId = await createLabelmapVolumeForViewport({
      viewportId: 'vp',
      renderingEngineId: 're',
      segmentationId: 'seg',
    });

    expect(segmentationId).toBe('seg');
    expect(
      volumeLoader.createAndCacheDerivedLabelmapVolume
    ).toHaveBeenCalledWith('ct', { volumeId: 'seg' });
  });

  it('still rejects a planar viewport in stack mode', async () => {
    getEnabledElementByIds.mockReturnValue({ viewport: makePlanar('stack') });

    await expect(
      createLabelmapVolumeForViewport({
        viewportId: 'vp',
        renderingEngineId: 're',
      })
    ).rejects.toThrow('Segmentation only supports VolumeViewport');
  });
});

describe('WholeBodySegmentTool volume of the viewport', () => {
  it('reads the volume of a planar viewport in volume mode', () => {
    const tool = new WholeBodySegmentTool();
    const volume = { volumeId: 'ct' };
    cache.getVolume.mockReturnValue(volume);
    const viewport = makePlanar('volume', {
      getVolumeId: () => 'ct',
    });

    expect(tool._getViewportVolume(viewport)).toBe(volume);
    expect(cache.getVolume).toHaveBeenCalledWith('ct');
  });

  it('still throws for a stack viewport', () => {
    const tool = new WholeBodySegmentTool();

    expect(() => tool._getViewportVolume(makePlanar('stack'))).toThrow(
      'Viewport is not a BaseVolumeViewport'
    );
  });
});

describe('AnnotationDisplayTool.getReferencedImageId', () => {
  class TestDisplayTool extends AnnotationDisplayTool {
    static toolName = 'TestDisplayTool';
    renderAnnotation() {
      return false;
    }
  }

  it('gives the closest image, not the volume id text, on a planar viewport in volume mode', () => {
    const tool = new TestDisplayTool();
    tool.getTargetId = () => VOLUME_TARGET_ID;
    cache.getVolume.mockReturnValue({ volumeId: 'ct' });
    const viewport = makePlanar('volume');

    expect(tool.getReferencedImageId(viewport, [0, 0, 0], [1, 0, 0])).toBe(
      'closest-image'
    );
  });

  it('gives the image of the target id on a planar viewport in stack mode', () => {
    const tool = new TestDisplayTool();
    tool.getTargetId = () => 'imageId:wadors:image-4';

    expect(
      tool.getReferencedImageId(makePlanar('stack'), [0, 0, 0], [0, 0, 1])
    ).toBe('wadors:image-4');
    expect(utilities.getClosestImageId).not.toHaveBeenCalled();
  });
});

describe('LivewireContourTool edit data', () => {
  it('stops with a warning on a viewport in volume mode that cannot give the pixels of its slice', () => {
    const tool = new LivewireContourTool();
    const getImageData = jest.fn();
    const viewport = makePlanar('volume', { getImageData });
    getEnabledElement.mockReturnValue({ viewport });

    expect(tool.setupBaseEditData([0, 0, 0], viewport.element, {})).toBe(false);
    expect(tool.isDrawing).toBeFalsy();
    expect(getImageData).not.toHaveBeenCalled();
    expect(utilities.getCurrentVolumeViewportSlice).not.toHaveBeenCalled();
  });

  it('does not add an annotation when the edit data cannot be set up', () => {
    const tool = new LivewireContourTool();
    const viewport = makePlanar('volume', {
      getImageData: jest.fn(),
    });
    getEnabledElement.mockReturnValue({ viewport });
    tool.createAnnotation = jest.fn(() => ({ data: {} }));
    tool.addAnnotation = jest.fn();

    const annotation = tool.addNewAnnotation({
      detail: {
        element: viewport.element,
        currentPoints: { world: [0, 0, 0] },
        event: {},
      },
    });

    expect(annotation).toBeNull();
    expect(tool.addAnnotation).not.toHaveBeenCalled();
  });
});

describe('MIPJumpToClickTool', () => {
  function clickOn(sourceViewport, targetViewport) {
    const tool = new MIPJumpToClickTool();
    tool.configuration.targetViewportIds = [targetViewport.id];
    getEnabledElement.mockReturnValue({
      viewport: sourceViewport,
      renderingEngine: { id: 're', getViewports: () => [targetViewport] },
    });

    tool.mouseClickCallback({
      detail: {
        element: sourceViewport.element,
        currentPoints: { world: [0, 0, 0] },
      },
    });
  }

  it('stops without an error on a target viewport that cannot move to the point', () => {
    const target = makePlanar('volume', { id: 'target' });

    expect(() =>
      clickOn(makePlanar('volume', { getVolumeId: () => 'ct' }), target)
    ).not.toThrow();
  });
});

describe('RectangleROIThresholdTool new annotation', () => {
  it('uses the image of the target id on a planar viewport in stack mode', () => {
    const tool = new RectangleROIThresholdTool();
    tool.getTargetId = () => 'imageId:wadors:image-7';
    const viewport = makePlanar('stack', {
      getViewReference: () => ({}),
      getResolvedView: () => ({
        toICamera: () => ({ viewPlaneNormal: [0, 0, 1], viewUp: [0, -1, 0] }),
      }),
      getFrameOfReferenceUID: () => 'for',
    });
    getEnabledElement.mockReturnValue({ viewport, renderingEngine: {} });

    const annotation = tool.addNewAnnotation({
      detail: {
        element: viewport.element,
        currentPoints: { world: [0, 0, 0] },
      },
      preventDefault: jest.fn(),
    });

    expect(annotation.metadata.referencedImageId).toBe('wadors:image-7');
    expect(annotation.metadata.volumeId).toBeUndefined();
  });
});

describe('UltrasoundDirectionalTool new annotation', () => {
  function addOn(viewport) {
    const tool = new UltrasoundDirectionalTool();
    tool.createAnnotation = jest.fn(() => ({ data: {} }));
    getEnabledElement.mockReturnValue({ viewport });

    return () =>
      tool.addNewAnnotation({
        detail: {
          element: viewport.element,
          currentPoints: { world: [0, 0, 0] },
        },
        preventDefault: jest.fn(),
      });
  }

  it('accepts a planar viewport in stack mode and an ECG viewport', () => {
    expect(addOn(makePlanar('stack'))).not.toThrow();
    expect(
      addOn(
        makeViewport('ecgNext', 'ecg', {
          getWaveformData: jest.fn(),
          getImageData: jest.fn(),
        })
      )
    ).not.toThrow();
  });

  it('accepts a planar viewport in stack mode and an ECG viewport without data, and rejects a planar viewport in volume mode', () => {
    expect(addOn(makePlanar('stack'))).not.toThrow();
    expect(
      addOn(
        makeViewport('ecgNext', 'empty', {
          getWaveformData: jest.fn(),
          getImageData: jest.fn(),
        })
      )
    ).not.toThrow();
    expect(addOn(makePlanar('volume'))).toThrow(
      'UltrasoundDirectionalTool can only be used on a StackViewport or ECGViewport'
    );
  });
});

describe('VolumeCroppingControlTool drag', () => {
  it('ignores a drag on a 3D viewport', () => {
    const viewport = makeViewport('volume3dNext', 'volume3d');
    const tool = new VolumeCroppingControlTool();
    tool._getAnnotations = jest.fn(() => []);
    getEnabledElement.mockReturnValue({ viewport });

    tool._dragCallback({
      detail: {
        element: viewport.element,
        deltaPoints: { world: [5, 0, 0] },
      },
    });

    expect(tool._getAnnotations).not.toHaveBeenCalled();
  });
});

describe('vtkOrientationControllerWidget margin', () => {
  function markerX(viewport) {
    const widget = Object.create(vtkOrientationControllerWidget.prototype);
    viewport.canvas = { clientWidth: 1000, clientHeight: 1000 };
    viewport.canvasToWorld = ([x, y]) => [x, y, 0];

    return widget.calculateMarkerPosition(viewport, 'top-left', 100)?.[0];
  }

  it('uses the 3D margin on a next 3D viewport, from its type', () => {
    const plain3D = markerX(makeViewport('volume3d', 'volume3d'));
    const next3D = markerX(makeViewport('volume3d', 'empty'));
    const planar = markerX(makePlanar('volume'));

    expect(next3D).toBe(plain3D);
    expect(next3D).not.toBe(planar);
  });
});
