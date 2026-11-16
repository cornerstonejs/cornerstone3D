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
import ZoomTool from '../src/tools/ZoomTool';
import RectangleROIThresholdTool from '../src/tools/segmentation/RectangleROIThresholdTool';
import UltrasoundDirectionalTool from '../src/tools/annotation/UltrasoundDirectionalTool';
import VolumeCroppingControlTool from '../src/tools/VolumeCroppingControlTool';
import { vtkOrientationControllerWidget } from '../src/utilities/vtkjs/OrientationControllerWidget';

const VOLUME_TARGET_ID =
  'volumeId:cornerstoneStreamingImageVolume:ct?sliceIndex=3&viewPlaneNormal=1.000,0.000,0.000';

function nextApi() {
  return {
    setDisplaySets: jest.fn(),
    setDisplaySetPresentation: jest.fn(),
    setViewState: jest.fn(),
  };
}

function makeAdapter(mode, requestedType, extra = {}) {
  return {
    ...nextApi(),
    type: 'planarNext',
    requestedType,
    element: document.createElement('div'),
    getCurrentMode: () => mode,
    ...extra,
  };
}

function makeLegacy(type, extra = {}) {
  return {
    type,
    requestedType: type,
    element: document.createElement('div'),
    ...extra,
  };
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

  it('keeps the acquisition mapping for a legacy stack viewport', () => {
    expect(normalizeViewportPlane(makeLegacy('stack'), bounds).type).toBe(
      'acquistion'
    );
  });

  it('maps a sagittal legacy volume viewport through its camera', () => {
    const viewport = makeLegacy('orthographic', {
      getCamera: () => sagittalCamera,
      getViewReference: () => ({ viewPlaneNormal: [1, 0, 0] }),
    });

    expect(normalizeViewportPlane(viewport, bounds).type).toBe('jk');
  });

  it('maps a sagittal legacy adapter in volume mode like the legacy viewport', () => {
    const viewport = makeAdapter('volume', 'orthographic', {
      getResolvedView: () => ({ toICamera: () => sagittalCamera }),
      getViewReference: () => ({ viewPlaneNormal: [1, 0, 0] }),
    });

    expect(normalizeViewportPlane(viewport, bounds).type).toBe('jk');
  });
});

describe('annotationHydration', () => {
  it('uses the closest volume image on a legacy adapter in volume mode', () => {
    cache.getVolume.mockReturnValue({ volumeId: 'ct' });
    const viewport = makeAdapter('volume', 'orthographic', {
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

  it('uses the closest stack image on a legacy adapter in stack mode', () => {
    const getMetaData = jest
      .spyOn(metaData, 'get')
      .mockImplementation((_type, imageId) => ({
        imagePositionPatient: imageId === 'image-1' ? [0, 0, 5] : [0, 0, 0],
      }));
    const viewport = makeAdapter('stack', 'stack', {
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
    const viewport = makeLegacy('video', {
      getViewReference: () => ({ viewPlaneNormal: [0, 0, 1] }),
    });

    expect(() => annotationHydration(viewport, 'Length', [[0, 0, 0]])).toThrow(
      'viewport must be a StackViewport or BaseVolumeViewport'
    );
  });
});

describe('moveAnnotationToViewPlane', () => {
  it('updates the referenced image of a legacy adapter in stack mode', () => {
    const viewport = makeAdapter('stack', 'stack', {
      getCamera: () => ({ focalPoint: [0, 0, 2], viewPlaneNormal: [0, 0, 1] }),
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
    const viewport = makeLegacy('orthographic', {
      getCamera: () => ({ focalPoint: [0, 0, 2], viewPlaneNormal: [0, 0, 1] }),
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
  it('creates a labelmap volume for a legacy adapter in volume mode', async () => {
    const viewport = makeAdapter('volume', 'orthographic', {
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

  it('still rejects a stack viewport, legacy or adapter', async () => {
    for (const viewport of [
      makeLegacy('stack'),
      makeAdapter('stack', 'stack'),
    ]) {
      getEnabledElementByIds.mockReturnValue({ viewport });

      await expect(
        createLabelmapVolumeForViewport({
          viewportId: 'vp',
          renderingEngineId: 're',
        })
      ).rejects.toThrow('Segmentation only supports VolumeViewport');
    }
  });
});

describe('WholeBodySegmentTool volume of the viewport', () => {
  it('reads the volume of a legacy adapter in volume mode', () => {
    const tool = new WholeBodySegmentTool();
    const volume = { volumeId: 'ct' };
    cache.getVolume.mockReturnValue(volume);
    const viewport = makeAdapter('volume', 'orthographic', {
      getAllVolumeIds: () => ['ct'],
    });

    expect(tool._getViewportVolume(viewport)).toBe(volume);
    expect(cache.getVolume).toHaveBeenCalledWith('ct');
  });

  it('reads the volume of a legacy volume viewport', () => {
    const tool = new WholeBodySegmentTool();
    const volume = { volumeId: 'ct' };
    cache.getVolume.mockReturnValue(volume);
    const viewport = makeLegacy('orthographic', {
      getAllVolumeIds: () => ['ct'],
    });

    expect(tool._getViewportVolume(viewport)).toBe(volume);
  });

  it('still throws for a stack viewport', () => {
    const tool = new WholeBodySegmentTool();

    expect(() =>
      tool._getViewportVolume(
        makeAdapter('stack', 'stack', { getAllVolumeIds: () => [] })
      )
    ).toThrow('Viewport is not a BaseVolumeViewport');
  });
});

describe('AnnotationDisplayTool.getReferencedImageId', () => {
  class TestDisplayTool extends AnnotationDisplayTool {
    static toolName = 'TestDisplayTool';
    renderAnnotation() {
      return false;
    }
  }

  it('gives the closest image, not the volume id text, on a legacy adapter in volume mode', () => {
    const tool = new TestDisplayTool();
    tool.getTargetId = () => VOLUME_TARGET_ID;
    cache.getVolume.mockReturnValue({ volumeId: 'ct' });
    const viewport = makeAdapter('volume', 'orthographic');

    expect(tool.getReferencedImageId(viewport, [0, 0, 0], [1, 0, 0])).toBe(
      'closest-image'
    );
  });

  it('gives the closest image on a legacy volume viewport', () => {
    const tool = new TestDisplayTool();
    tool.getTargetId = () => VOLUME_TARGET_ID;
    cache.getVolume.mockReturnValue({ volumeId: 'ct' });

    expect(
      tool.getReferencedImageId(
        makeLegacy('orthographic'),
        [0, 0, 0],
        [1, 0, 0]
      )
    ).toBe('closest-image');
  });

  it('gives the image of the target id on a legacy adapter in stack mode', () => {
    const tool = new TestDisplayTool();
    tool.getTargetId = () => 'imageId:wadors:image-4';

    expect(
      tool.getReferencedImageId(
        makeAdapter('stack', 'stack'),
        [0, 0, 0],
        [0, 0, 1]
      )
    ).toBe('wadors:image-4');
    expect(utilities.getClosestImageId).not.toHaveBeenCalled();
  });
});

describe('LivewireContourTool edit data', () => {
  it('stops with a warning on a legacy adapter in volume mode, which has no getSliceViewInfo', () => {
    const tool = new LivewireContourTool();
    const getImageData = jest.fn();
    const viewport = makeAdapter('volume', 'orthographic', { getImageData });
    getEnabledElement.mockReturnValue({ viewport });

    expect(tool.setupBaseEditData([0, 0, 0], viewport.element, {})).toBe(false);
    expect(tool.isDrawing).toBeFalsy();
    expect(getImageData).not.toHaveBeenCalled();
    expect(utilities.getCurrentVolumeViewportSlice).not.toHaveBeenCalled();
  });

  it('takes the volume slice branch on a legacy volume viewport', () => {
    const tool = new LivewireContourTool();
    const viewport = makeLegacy('orthographic', {
      getImageData: () => ({ imageData: {} }),
      getSliceViewInfo: jest.fn(),
    });
    getEnabledElement.mockReturnValue({ viewport });

    expect(() =>
      tool.setupBaseEditData([0, 0, 0], viewport.element, {})
    ).toThrow('volume slice branch');
  });

  it('does not add an annotation when the edit data cannot be set up', () => {
    const tool = new LivewireContourTool();
    const viewport = makeAdapter('volume', 'orthographic', {
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

  it('jumps a legacy volume viewport to the brightest point', () => {
    const jumpToWorld = jest.fn();
    const target = makeLegacy('orthographic', { id: 'target', jumpToWorld });

    clickOn(makeLegacy('orthographic', { getVolumeId: () => 'ct' }), target);

    expect(jumpToWorld).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('stops without an error on a legacy adapter, which has no jumpToWorld', () => {
    const target = makeAdapter('volume', 'orthographic', { id: 'target' });

    expect(() =>
      clickOn(
        makeAdapter('volume', 'orthographic', { getVolumeId: () => 'ct' }),
        target
      )
    ).not.toThrow();
  });
});

describe('ZoomTool wheel', () => {
  function wheelOn(viewport) {
    const tool = new ZoomTool();
    tool.preMouseDownCallback = jest.fn(() => false);
    tool._dragCallback = jest.fn();
    getEnabledElement.mockReturnValue({ viewport, renderingEngineId: 're' });

    tool._zoom({
      detail: {
        element: viewport.element,
        points: { page: [0, 0], client: [0, 0], world: [0, 0, 0] },
        wheel: { direction: 1 },
      },
    });

    return tool;
  }

  const camera = {
    focalPoint: [0, 0, 0],
    position: [0, 0, -10],
    parallelProjection: true,
    parallelScale: 100,
    viewPlaneNormal: [0, 0, 1],
  };

  it('sets the zoom anchor on a legacy stack viewport', () => {
    const tool = wheelOn(makeLegacy('stack', { getCamera: () => camera }));

    expect(tool.preMouseDownCallback).toHaveBeenCalled();
  });

  it('sets the zoom anchor on a legacy adapter in stack mode', () => {
    const tool = wheelOn(
      makeAdapter('stack', 'stack', { getCamera: () => camera })
    );

    expect(tool.preMouseDownCallback).toHaveBeenCalled();
  });

  it('does not set it on a volume viewport, legacy or adapter', () => {
    for (const viewport of [
      makeLegacy('orthographic', { getCamera: () => camera }),
      makeAdapter('volume', 'orthographic', { getCamera: () => camera }),
    ]) {
      expect(wheelOn(viewport).preMouseDownCallback).not.toHaveBeenCalled();
    }
  });
});

describe('RectangleROIThresholdTool new annotation', () => {
  it('uses the image of the target id on a legacy adapter in stack mode', () => {
    const tool = new RectangleROIThresholdTool();
    tool.getTargetId = () => 'imageId:wadors:image-7';
    const viewport = makeAdapter('stack', 'stack', {
      getCamera: () => ({ viewPlaneNormal: [0, 0, 1], viewUp: [0, -1, 0] }),
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

  it('accepts a legacy adapter in stack mode and an ECG adapter', () => {
    expect(addOn(makeAdapter('stack', 'stack'))).not.toThrow();
    expect(
      addOn(
        makeAdapter('ecg', 'ecg', {
          getWaveformData: jest.fn(),
          getImageData: jest.fn(),
        })
      )
    ).not.toThrow();
  });

  it('accepts the legacy stack and ECG viewports and rejects a volume one', () => {
    expect(addOn(makeLegacy('stack'))).not.toThrow();
    expect(
      addOn(
        makeLegacy('ecg', {
          getCurrentMode: () => 'empty',
          getWaveformData: jest.fn(),
          getImageData: jest.fn(),
        })
      )
    ).not.toThrow();
    expect(addOn(makeLegacy('orthographic'))).toThrow(
      'UltrasoundDirectionalTool can only be used on a StackViewport or ECGViewport'
    );
  });
});

describe('VolumeCroppingControlTool drag', () => {
  it('ignores a drag on a 3D legacy adapter as on a legacy 3D viewport', () => {
    for (const viewport of [
      makeLegacy('volume3d'),
      makeAdapter('volume3d', 'volume3d'),
    ]) {
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
    }
  });
});

describe('vtkOrientationControllerWidget margin', () => {
  function markerX(viewport) {
    const widget = Object.create(vtkOrientationControllerWidget.prototype);
    viewport.canvas = { clientWidth: 1000, clientHeight: 1000 };
    viewport.canvasToWorld = ([x, y]) => [x, y, 0];

    return widget.calculateMarkerPosition(viewport, 'top-left', 100)?.[0];
  }

  it('uses the 3D margin on a 3D legacy adapter, from its requested type', () => {
    const legacy3D = markerX(makeLegacy('volume3d'));
    const adapter3D = markerX(makeAdapter('empty', 'volume3d'));
    const legacyPlanar = markerX(makeLegacy('orthographic'));

    expect(adapter3D).toBe(legacy3D);
    expect(adapter3D).not.toBe(legacyPlanar);
  });
});
