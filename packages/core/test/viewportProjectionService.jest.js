import {
  ViewportProjectionService,
  viewportProjection,
} from '../src/RenderingEngine/GenericViewport';
import { ViewportType } from '../src/enums';
import VideoViewport from '../src/RenderingEngine/GenericViewport/Video/VideoViewport';
import VideoResolvedView from '../src/RenderingEngine/GenericViewport/Video/VideoResolvedView';
import ECGViewport from '../src/RenderingEngine/GenericViewport/ECG/ECGViewport';
import ECGResolvedView from '../src/RenderingEngine/GenericViewport/ECG/ECGResolvedView';
import WSIViewport from '../src/RenderingEngine/GenericViewport/WSI/WSIViewport';
import VolumeViewport3D from '../src/RenderingEngine/GenericViewport/Volume3D/viewport3D';

function createAdapter(id, viewportTypes = ['testViewport']) {
  return {
    id,
    viewportTypes,
    getSnapshot: jest.fn((request) => ({
      adapterId: id,
      kind: id,
      presentation: {
        requestedDataId: request.dataId,
      },
      spaces: {},
      viewportType: request.viewportType ?? request.viewport?.type,
    })),
    getPresentation: jest.fn((snapshot) => ({
      adapterId: snapshot.adapterId,
      requestedDataId: snapshot.presentation.requestedDataId,
    })),
    withPresentation: jest.fn((_snapshot, presentation) => ({
      adapterId: id,
      presentation,
    })),
  };
}

function setElementSize(element, width, height) {
  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: height,
  });
}

function createVideoResolvedView(viewState) {
  return new VideoResolvedView({
    viewState,
    containerHeight: 100,
    containerWidth: 200,
    frameOfReferenceUID: 'video-frame',
    intrinsicHeight: 50,
    intrinsicWidth: 100,
    objectFit: 'contain',
  });
}

function createECGResolvedView(viewState, canvas) {
  return new ECGResolvedView({
    viewState,
    canvas,
    dataPresentation: undefined,
    frameOfReferenceUID: 'ecg-frame',
    metrics: {
      ecgWidth: 200,
      ecgHeight: 100,
      channelScale: 10,
      worldToCanvasRatio: 1,
      xOffsetCanvas: 0,
      yOffsetCanvas: 0,
    },
    waveform: {
      channels: [
        {
          name: 'I',
          data: new Int16Array(1000),
          min: -1,
          max: 1,
        },
      ],
      numberOfChannels: 1,
      numberOfSamples: 1000,
      samplingFrequency: 500,
      bitsAllocated: 16,
      sampleInterpretation: 'SS',
    },
  });
}

function createWSIResolvedView(viewState) {
  return {
    state: {
      canvasHeight: 100,
      canvasWidth: 200,
      view: {
        getZoom: () => viewState.zoom,
        getRotation: () => viewState.rotation,
      },
      viewState,
    },
    canvasToWorld: jest.fn(([x, y]) => [x / 100, y / 25, 0]),
    getFrameOfReferenceUID: jest.fn(() => 'wsi-frame'),
    toICamera: jest.fn(() => ({
      focalPoint: [1, 2, 0],
      parallelProjection: true,
      parallelScale: 100,
      position: [1, 2, 100],
      rotation: viewState.rotation,
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, -1, 0],
    })),
    withZoom: jest.fn((zoom) =>
      createWSIResolvedView({
        ...viewState,
        resolution: 0.5,
        zoom,
      })
    ),
    worldToCanvas: jest.fn(([x, y]) => [x * 100, y * 25]),
  };
}

describe('ViewportProjectionService', () => {
  it('registers built-in projection adapters with the package service', () => {
    const adapterIds = viewportProjection
      .getRegisteredAdapters()
      .map((adapter) => adapter.id);

    expect(adapterIds).toEqual(
      expect.arrayContaining(['planar', 'volume3d', 'video', 'ecg', 'wsi'])
    );
    expect(
      viewportProjection.getAdapter({
        type: ViewportType.PLANAR_NEXT,
      })?.id
    ).toBe('planar');
    expect(
      viewportProjection.getAdapter({
        type: ViewportType.VOLUME_3D_NEXT,
      })?.id
    ).toBe('volume3d');
    expect(
      viewportProjection.getAdapter({
        type: ViewportType.VIDEO_NEXT,
      })?.id
    ).toBe('video');
    expect(
      viewportProjection.getAdapter({
        type: ViewportType.ECG_NEXT,
      })?.id
    ).toBe('ecg');
    expect(
      viewportProjection.getAdapter({
        type: ViewportType.WHOLE_SLIDE_NEXT,
      })?.id
    ).toBe('wsi');
  });

  it('does not expose view-presentation methods on non-planar Next viewports', () => {
    expect(VideoViewport.prototype.getViewPresentation).toBeUndefined();
    expect(VideoViewport.prototype.setViewPresentation).toBeUndefined();
    expect(VideoViewport.prototype.resetCamera).toBeUndefined();
    expect(VideoViewport.prototype.resetViewState).toBeInstanceOf(Function);
    expect(ECGViewport.prototype.getViewPresentation).toBeUndefined();
    expect(ECGViewport.prototype.setViewPresentation).toBeUndefined();
    expect(ECGViewport.prototype.resetCamera).toBeUndefined();
    expect(ECGViewport.prototype.resetViewState).toBeInstanceOf(Function);
    expect(WSIViewport.prototype.getViewPresentation).toBeUndefined();
    expect(WSIViewport.prototype.setViewPresentation).toBeUndefined();
    expect(WSIViewport.prototype.resetCamera).toBeUndefined();
    expect(WSIViewport.prototype.resetViewState).toBeInstanceOf(Function);
    expect(VolumeViewport3D.prototype.getViewPresentation).toBeUndefined();
    expect(VolumeViewport3D.prototype.setViewPresentation).toBeUndefined();
    expect(VolumeViewport3D.prototype.resetCamera).toBeUndefined();
    expect(VolumeViewport3D.prototype.resetViewState).toBeInstanceOf(Function);
  });

  it('exposes Video projections in media-pixel space', () => {
    const element = document.createElement('div');
    const viewState = {
      currentTimeSeconds: 0,
      anchorCanvas: [0.5, 0.5],
      scale: 1,
      scaleMode: 'fit',
      rotation: 15,
    };
    const resolvedView = createVideoResolvedView(viewState);
    const viewport = {
      element,
      type: ViewportType.VIDEO_NEXT,
      getFrameOfReferenceUID: () => 'fallback-video-frame',
      getResolvedView: () => resolvedView,
      getViewState: () => viewState,
    };

    setElementSize(element, 200, 100);

    const snapshot = viewportProjection.get(viewport);
    const presentation = viewportProjection.getPresentation(viewport);
    const nextViewState = viewportProjection.withPresentation(
      viewport,
      {
        zoom: 2,
        pan: [5, -3],
      },
      {},
      {
        anchorCanvas: [100, 50],
      }
    );

    expect(snapshot.kind).toBe('video');
    expect(snapshot.adapterId).toBe('video');
    expect(snapshot.frameOfReferenceUID).toBe('video-frame');
    expect(snapshot.presentation.position).toEqual({
      kind: 'mediaPoint',
      mediaPoint: [50, 25],
      canvasPoint: [100, 50],
    });
    expect(snapshot.presentation.scale).toEqual({
      kind: 'nativePixel',
      pixelsPerCanvasPixel: 0.5,
    });
    expect(snapshot.spaces).toEqual({
      canvas: true,
      image: false,
      renderer: true,
      world: true,
    });
    expect(snapshot.transforms.canvasToWorld([20, 10])).toEqual([10, 5, 0]);
    expect(snapshot.transforms.worldToCanvas([10, 5, 0])).toEqual([20, 10]);
    expect(presentation.zoom).toBeCloseTo(1, 5);
    expect(presentation.pan).toEqual([0, 0]);
    expect(presentation.rotation).toBe(15);
    expect(viewState.scale).toBe(1);
    expect(nextViewState.scale).toBe(2);
    expect(nextViewState.anchorWorld).toHaveLength(2);
  });

  it('exposes ECG projections in signal space', () => {
    const element = document.createElement('div');
    const canvas = document.createElement('canvas');
    const viewState = {
      timeRange: [0, 2000],
      valueRange: [-1, 1],
      scrollOffset: 0,
      anchorCanvas: [0.5, 0.5],
      scale: 1,
      scaleMode: 'fit',
      rotation: 0,
    };
    const resolvedView = createECGResolvedView(viewState, canvas);
    const viewport = {
      canvas,
      element,
      type: ViewportType.ECG_NEXT,
      getFrameOfReferenceUID: () => 'fallback-ecg-frame',
      getResolvedView: () => resolvedView,
      getViewState: () => viewState,
    };

    setElementSize(element, 200, 100);
    setElementSize(canvas, 200, 100);

    const snapshot = viewportProjection.get(viewport);
    const presentation = viewportProjection.getPresentation(viewport);
    const nextViewState = viewportProjection.withPresentation(
      viewport,
      {
        zoom: 2,
        pan: [5, -3],
      },
      {},
      {
        anchorCanvas: [100, 50],
      }
    );

    expect(snapshot.kind).toBe('ecg');
    expect(snapshot.adapterId).toBe('ecg');
    expect(snapshot.frameOfReferenceUID).toBe('ecg-frame');
    expect(snapshot.presentation.position.kind).toBe('signalPoint');
    expect(snapshot.presentation.position.sampleIndex).toBeCloseTo(500, 5);
    expect(snapshot.presentation.position.value).toBeCloseTo(-3, 5);
    expect(snapshot.presentation.position.channelIndex).toBe(0);
    expect(snapshot.presentation.position.canvasPoint).toEqual([100, 50]);
    expect(snapshot.presentation.scale.kind).toBe('signal');
    expect(snapshot.presentation.scale.samplesPerCanvasPixel).toBeCloseTo(5, 5);
    expect(snapshot.presentation.scale.valueUnitsPerCanvasPixel).toBeCloseTo(
      0.1,
      5
    );
    expect(snapshot.spaces).toEqual({
      canvas: true,
      image: false,
      renderer: true,
      world: true,
    });
    expect(snapshot.transforms.canvasToWorld([100, 50])[0]).toBeCloseTo(500, 5);
    expect(snapshot.transforms.worldToCanvas([500, -3, 0])).toEqual([100, 50]);
    expect(presentation.zoom).toBeCloseTo(1, 5);
    expect(presentation.pan).toEqual([0, 0]);
    expect(viewState.scale).toBe(1);
    expect(nextViewState.scale).toBe(2);
    expect(nextViewState.timeRange).toEqual([0, 2000]);
    expect(nextViewState.valueRange).toEqual([-1, 1]);
  });

  it('exposes WSI projections through the projection service', () => {
    const element = document.createElement('div');
    const viewState = {
      centerIndex: [1, 2],
      resolution: 1,
      rotation: 0.25,
      zoom: 1,
    };
    const resolvedView = createWSIResolvedView(viewState);
    const viewport = {
      element,
      type: ViewportType.WHOLE_SLIDE_NEXT,
      getFrameOfReferenceUID: () => 'fallback-wsi-frame',
      getResolvedView: () => resolvedView,
      getViewState: () => viewState,
    };

    setElementSize(element, 200, 100);

    const snapshot = viewportProjection.get(viewport);
    const presentation = viewportProjection.getPresentation(viewport);
    const nextViewState = viewportProjection.withPresentation(viewport, {
      rotation: 0.5,
      zoom: 2,
    });

    expect(snapshot.kind).toBe('wsi');
    expect(snapshot.adapterId).toBe('wsi');
    expect(snapshot.frameOfReferenceUID).toBe('wsi-frame');
    expect(snapshot.presentation.position).toEqual({
      kind: 'anchor',
      worldPoint: [1, 2, 0],
      canvasPoint: [100, 50],
    });
    expect(snapshot.presentation.scale).toEqual({
      kind: 'physical',
      mmPerCanvasPixel: 1,
    });
    expect(snapshot.spaces).toEqual({
      canvas: true,
      image: true,
      renderer: true,
      world: true,
    });
    expect(snapshot.transforms.canvasToWorld([100, 50])).toEqual([1, 2, 0]);
    expect(snapshot.transforms.worldToCanvas([1, 2, 0])).toEqual([100, 50]);
    expect(presentation.zoom).toBe(1);
    expect(presentation.rotation).toBe(0.25);
    expect(viewState.zoom).toBe(1);
    expect(nextViewState.zoom).toBe(2);
    expect(nextViewState.rotation).toBe(0.5);
  });

  it('selects custom adapters by viewport type and optional kind', () => {
    const service = new ViewportProjectionService();
    const firstAdapter = createAdapter('firstProjection');
    const secondAdapter = createAdapter('secondProjection');
    const viewport = { type: 'testViewport' };

    service.register(firstAdapter);
    service.register(secondAdapter);

    expect(service.get(viewport).adapterId).toBe('firstProjection');
    expect(
      service.get(viewport, {
        kind: 'secondProjection',
        dataId: 'target-data',
      }).adapterId
    ).toBe('secondProjection');
    expect(secondAdapter.getSnapshot).toHaveBeenCalledWith({
      kind: 'secondProjection',
      dataId: 'target-data',
      viewport,
    });
  });

  it('uses explicit viewportType requests for adapter lookup', () => {
    const service = new ViewportProjectionService();
    const adapter = createAdapter('externalProjection', ['externalViewport']);

    service.register(adapter);

    const snapshot = service.get(
      {},
      {
        viewportType: 'externalViewport',
      }
    );

    expect(snapshot.adapterId).toBe('externalProjection');
    expect(snapshot.viewportType).toBe('externalViewport');
  });

  it('returns presentation and semantic state through the selected adapter', () => {
    const service = new ViewportProjectionService();
    const adapter = createAdapter('stateProjection');
    const viewport = { type: 'testViewport' };

    service.register(adapter);

    expect(
      service.getPresentation(viewport, {
        dataId: 'presentation-data',
      })
    ).toEqual({
      adapterId: 'stateProjection',
      requestedDataId: 'presentation-data',
    });
    expect(
      service.withPresentation(viewport, {
        zoom: 2,
      })
    ).toEqual({
      adapterId: 'stateProjection',
      presentation: {
        zoom: 2,
      },
    });
  });

  it('keeps downstream-style presentation synchronization pure until view state is applied', () => {
    const service = new ViewportProjectionService();
    const sourceViewport = {
      type: 'syncViewport',
      viewState: {
        pan: [20, -10],
        rotation: 15,
        zoom: 1.5,
      },
    };
    const targetViewport = {
      type: 'syncViewport',
      setViewState: jest.fn((nextState) => {
        targetViewport.viewState = nextState;
      }),
      viewState: {
        pan: [0, 0],
        rotation: 0,
        zoom: 1,
      },
    };
    const adapter = {
      id: 'syncProjection',
      viewportTypes: ['syncViewport'],
      getSnapshot: jest.fn(({ viewport }) => ({
        adapterId: 'syncProjection',
        kind: 'syncProjection',
        presentation: { ...viewport.viewState },
        spaces: {},
        viewState: { ...viewport.viewState },
        viewportType: viewport.type,
      })),
      getPresentation: jest.fn((snapshot) => ({
        pan: [...snapshot.presentation.pan],
        rotation: snapshot.presentation.rotation,
        zoom: snapshot.presentation.zoom,
      })),
      withPresentation: jest.fn((snapshot, presentation) => ({
        ...snapshot.viewState,
        ...presentation,
      })),
    };

    service.register(adapter);

    const sourcePresentation = service.getPresentation(sourceViewport);
    const nextTargetState = service.withPresentation(
      targetViewport,
      sourcePresentation
    );

    expect(targetViewport.viewState).toEqual({
      pan: [0, 0],
      rotation: 0,
      zoom: 1,
    });
    expect(targetViewport.setViewState).not.toHaveBeenCalled();

    targetViewport.setViewState(nextTargetState);

    expect(targetViewport.setViewState).toHaveBeenCalledWith({
      pan: [20, -10],
      rotation: 15,
      zoom: 1.5,
    });
    expect(targetViewport.viewState).toEqual({
      pan: [20, -10],
      rotation: 15,
      zoom: 1.5,
    });
  });

  it('can unregister and clear custom adapters', () => {
    const service = new ViewportProjectionService();
    const firstAdapter = createAdapter('firstProjection');
    const secondAdapter = createAdapter('secondProjection');
    const viewport = { type: 'testViewport' };

    service.register(firstAdapter);
    service.register(secondAdapter);

    expect(service.getRegisteredAdapters()).toHaveLength(2);

    service.unregister('firstProjection');

    expect(service.get(viewport).adapterId).toBe('secondProjection');

    service.clear();

    expect(service.get(viewport)).toBeUndefined();
    expect(service.getRegisteredAdapters()).toHaveLength(0);
  });
});
