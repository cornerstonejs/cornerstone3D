import {
  Events,
  ImageQualityStatus,
  MetadataModules,
  OrientationAxis,
  ViewportType,
} from '../src/enums';
import { ActorRenderMode } from '../src/types';
import * as metaData from '../src/metaData';
import {
  planarProjection,
  viewportProjection,
  volume3DProjection,
} from '../src/RenderingEngine/Viewports';
import PlanarViewport from '../src/RenderingEngine/Viewports/Planar/PlanarViewport';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import getViewportsWithVolumeId from '../src/utilities/getViewportsWithVolumeId';
import imageIdToURI from '../src/utilities/imageIdToURI';

let viewportCounter = 0;
let metadataProviders = [];

function createViewport(defaultOptions = {}) {
  const renderingEngineId = `planar-test-engine-${viewportCounter++}`;
  const viewportId = `planar-test-viewport-${viewportCounter}`;
  const element = document.createElement('div');
  const vtkCanvas = document.createElement('canvas');
  const activeCamera = {
    setParallelProjection: jest.fn(),
  };
  const renderer = {
    getActiveCamera: jest.fn(() => activeCamera),
    computeVisiblePropBounds: () => [1, -1, 1, -1, 1, -1],
    getViewProps: () => [],
  };
  let viewport;
  const renderingEngine = {
    id: renderingEngineId,
    getRenderer: jest.fn(() => renderer),
    getViewports: jest.fn(() => (viewport ? [viewport] : [])),
    renderViewport: jest.fn(),
  };

  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    value: 200,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: 100,
  });

  renderingEngineCache.set(renderingEngine);

  viewport = new PlanarViewport({
    id: viewportId,
    element,
    renderingEngineId,
    canvas: vtkCanvas,
    sWidth: 200,
    sHeight: 100,
    defaultOptions,
  });

  return {
    element,
    renderingEngine,
    renderingEngineId,
    viewport,
  };
}

function createPlanarImage(imageId, rows = 10, columns = 20) {
  return {
    imageId,
    rows,
    columns,
    width: columns,
    height: rows,
    rowPixelSpacing: 1,
    columnPixelSpacing: 1,
    sizeInBytes: rows * columns * 2,
    windowCenter: 0,
    windowWidth: 1,
  };
}

function addPlanarImageMetadata(imageIds) {
  const imageIdSet = new Set(imageIds);
  const provider = (type, imageId) => {
    if (!imageIdSet.has(imageId)) {
      return;
    }

    if (type === MetadataModules.IMAGE_PIXEL) {
      return {
        bitsAllocated: 16,
        bitsStored: 16,
        highBit: 15,
        photometricInterpretation: 'MONOCHROME2',
        pixelRepresentation: 0,
        samplesPerPixel: 1,
      };
    }

    if (type === MetadataModules.GENERAL_SERIES) {
      return {
        modality: 'CT',
      };
    }

    if (type === MetadataModules.IMAGE_PLANE) {
      return {
        columnCosines: [0, 1, 0],
        columnPixelSpacing: 1,
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        imagePositionPatient: [0, 0, 0],
        rowCosines: [1, 0, 0],
        rowPixelSpacing: 1,
      };
    }
  };

  metaData.addProvider(provider, 10000);
  metadataProviders.push(provider);
}

function mountStackBinding(viewport, images) {
  const displaySetId = `stack:${viewport.id}`;
  const rendering = {
    actorEntryUID: `${displaySetId}:actor`,
    currentImage: images[0],
    currentImageIdIndex: 0,
    imageData: {},
    loadRequestId: 0,
    renderMode: ActorRenderMode.VTK_IMAGE,
  };
  const binding = {
    applyViewState: jest.fn(),
    data: {
      id: displaySetId,
      type: 'image',
      image: images[0],
      imageIds: images.map((image) => image.imageId),
    },
    getFrameOfReferenceUID: () => 'planar-test-frame',
    removeData: jest.fn(),
    rendering,
    role: 'source',
    updateAppearance: jest.fn(),
  };

  viewport.bindings.set(displaySetId, binding);
  viewport.mountedData.promoteSourceDisplaySetId(displaySetId);

  return { binding, displaySetId, rendering };
}

function mountVolumeBinding(
  viewport,
  { displaySetId, imageData, role, volumeId }
) {
  const rendering = {
    renderMode: ActorRenderMode.VTK_VOLUME_SLICE,
  };
  const binding = {
    applyViewState: jest.fn(),
    data: {
      id: displaySetId,
      type: 'volume',
      volumeId,
    },
    getFrameOfReferenceUID: () => 'planar-test-frame',
    getImageData: jest.fn(() => imageData),
    removeData: jest.fn(),
    rendering,
    role,
    updateAppearance: jest.fn(),
  };

  viewport.bindings.set(displaySetId, binding);
  if (role === 'source') {
    viewport.mountedData.promoteSourceDisplaySetId(displaySetId);
  }

  return { binding, displaySetId, rendering };
}

describe('PlanarViewport view state', () => {
  let created = [];

  afterEach(() => {
    for (const { renderingEngineId, viewport } of created) {
      viewport.destroy();
      renderingEngineCache.delete(renderingEngineId);
    }

    created = [];
    for (const provider of metadataProviders) {
      metaData.removeProvider(provider);
    }
    metadataProviders = [];
    displaySetRegistry.clear();
    jest.clearAllMocks();
  });

  function track(viewportContext) {
    created.push(viewportContext);
    return viewportContext;
  }

  function applyProjectionPresentation(viewport, framing) {
    const nextViewState = viewportProjection.withFraming(viewport, framing);

    expect(nextViewState).toBeDefined();
    viewport.setViewState(nextViewState);
  }

  it('returns a cloned view state snapshot', () => {
    const { viewport } = track(createViewport());
    const anchorCanvas = [0.25, 0.75];
    const anchorWorld = [4, 5, 6];
    const scale = [2, 3];
    const sliceWorldPoint = [7, 8, 9];

    viewport.setViewState({
      anchorCanvas,
      anchorWorld,
      scale,
      slice: {
        kind: 'volumePoint',
        sliceWorldPoint,
      },
      displayArea: {
        type: 'FIT',
        imageArea: [0.5, 1],
        imageCanvasPoint: {
          imagePoint: [0.1, 0.2],
          canvasPoint: [0.3, 0.4],
        },
      },
    });

    anchorCanvas[0] = 0.9;
    anchorWorld[0] = 40;
    scale[0] = 20;
    sliceWorldPoint[0] = 70;

    const snapshot = viewport.getViewState();

    snapshot.anchorCanvas[0] = 0.8;
    snapshot.anchorWorld[0] = 30;
    snapshot.scale[0] = 10;
    snapshot.slice.sliceWorldPoint[0] = 80;
    snapshot.displayArea.imageArea[0] = 0.25;
    snapshot.displayArea.imageCanvasPoint.imagePoint[0] = 0.9;

    const nextSnapshot = viewport.getViewState();

    expect(nextSnapshot.anchorCanvas).toEqual([0.25, 0.75]);
    expect(nextSnapshot.anchorWorld).toEqual([4, 5, 6]);
    expect(nextSnapshot.scale).toEqual([2, 3]);
    expect(nextSnapshot.slice.sliceWorldPoint).toEqual([7, 8, 9]);
    expect(nextSnapshot.displayArea.imageArea).toEqual([0.5, 1]);
    expect(nextSnapshot.displayArea.imageCanvasPoint.imagePoint).toEqual([
      0.1, 0.2,
    ]);
  });

  it('does not emit camera-modified events without a resolved camera', () => {
    const { element, viewport } = track(createViewport());
    const events = [];

    element.addEventListener(Events.CAMERA_MODIFIED, (evt) => {
      events.push(evt.detail);
    });

    viewport.setViewState({ scale: [2, 2] });

    expect(events).toHaveLength(0);
  });

  it('does not expose view-presentation methods on Planar Next', () => {
    const { viewport } = track(createViewport());

    expect(viewport.getViewPresentation).toBeUndefined();
    expect(viewport.setViewPresentation).toBeUndefined();
    expect(viewport.resetCamera).toBeUndefined();
    expect(viewport.resetViewState).toBeInstanceOf(Function);
  });

  it('updates native camera state through updateViewState', () => {
    const { viewport } = track(createViewport());

    viewport.updateViewState(({ rotation = 0 }) => ({
      rotation: rotation + 30,
      scale: [1.5, 1.5],
    }));

    expect(viewport.getViewState().rotation).toBe(30);
    expect(viewport.getViewState().scale).toEqual([1.5, 1.5]);
  });

  it('applies projection presentation pan in a single state write', () => {
    const { renderingEngine, viewport } = track(createViewport());
    const image = createPlanarImage('presentation-pan-image');

    addPlanarImageMetadata([image.imageId]);
    mountStackBinding(viewport, [image]);
    renderingEngine.renderViewport.mockClear();

    applyProjectionPresentation(viewport, {
      zoom: 2,
      pan: [10, -5],
      rotation: 15,
    });

    expect(renderingEngine.renderViewport).toHaveBeenCalledTimes(1);
    const framing = viewportProjection.getFraming(viewport);

    expect(framing.zoom).toBeCloseTo(2, 5);
    expect(framing.pan[0]).toBeCloseTo(10, 5);
    expect(framing.pan[1]).toBeCloseTo(-5, 5);
    expect(framing.rotation).toBe(15);
  });

  it('reads and writes the framing of the view on the viewport, as the projection service does', () => {
    const { renderingEngine, viewport } = track(createViewport());
    const image = createPlanarImage('view-framing-image');

    addPlanarImageMetadata([image.imageId]);
    mountStackBinding(viewport, [image]);
    renderingEngine.renderViewport.mockClear();

    viewport.setViewFraming({ zoom: 2, pan: [10, -5], rotation: 15 });

    expect(renderingEngine.renderViewport).toHaveBeenCalledTimes(1);

    const framing = viewport.getViewFraming();

    expect(framing).toEqual(viewportProjection.getFraming(viewport));
    expect(framing.zoom).toBeCloseTo(2, 5);
    expect(framing.pan[0]).toBeCloseTo(10, 5);
    expect(framing.pan[1]).toBeCloseTo(-5, 5);
    expect(framing.rotation).toBe(15);
    expect(viewport.getViewFraming({ zoom: true })).toEqual(
      viewportProjection.getFraming(viewport, { selector: { zoom: true } })
    );
  });

  it('exposes the current planar camera through the projection service', () => {
    const { viewport } = track(createViewport());

    applyProjectionPresentation(viewport, {
      zoom: 2,
      pan: [10, -5],
      rotation: 15,
    });

    const snapshot = viewportProjection.get(viewport);
    const framing = planarProjection.adapter.getFraming(snapshot);
    const servicePresentation = viewportProjection.getFraming(viewport);

    expect(snapshot.kind).toBe('planar');
    expect(snapshot.adapterId).toBe('planar');
    expect(snapshot.framing.scale.kind).toBe('fit');
    expect(snapshot.framing.position.kind).toBe('anchor');
    expect(servicePresentation.zoom).toBeCloseTo(2, 5);
    expect(framing.zoom).toBeCloseTo(2, 5);
    expect(framing.pan[0]).toBeCloseTo(10, 5);
    expect(framing.pan[1]).toBeCloseTo(-5, 5);
    expect(framing.rotation).toBe(15);
  });

  it('exposes resolved planar projection capabilities and transforms', () => {
    const { viewport } = track(createViewport());
    const image = createPlanarImage('projection-image-1');

    addPlanarImageMetadata([image.imageId]);
    mountStackBinding(viewport, [image]);

    viewport.setViewState({
      anchorCanvas: [0.5, 0.5],
      anchorWorld: [5, 4, 0],
      scale: [1.5, 1.5],
      scaleMode: 'fitWidth',
    });

    const snapshot = viewportProjection.get(viewport);
    const worldPoint = snapshot.transforms.canvasToWorld([100, 50]);
    const canvasPoint = snapshot.transforms.worldToCanvas(worldPoint);

    expect(snapshot.spaces).toEqual({
      canvas: true,
      image: true,
      renderer: true,
      world: true,
    });
    expect(snapshot.frameOfReferenceUID).toBe('planar-test-frame');
    expect(snapshot.framing.scale.kind).toBe('fitWidth');
    expect(snapshot.framing.position).toEqual({
      kind: 'anchor',
      worldPoint: [5, 4, 0],
      canvasPoint: [0.5, 0.5],
    });
    expect(snapshot.rendererCamera).toBeDefined();
    expect(worldPoint).toHaveLength(3);
    expect(canvasPoint).toHaveLength(2);
  });

  it('round-trips planar presentation patches through the projection service', () => {
    const { viewport } = track(createViewport());
    const initialState = viewport.getViewState();

    const nextViewState = viewportProjection.withFraming(viewport, {
      zoom: 2,
      pan: [10, -5],
      rotation: 30,
    });

    expect(viewport.getViewState()).toEqual(initialState);

    viewport.setViewState(nextViewState);

    const framing = viewportProjection.getFraming(viewport);

    expect(framing.zoom).toBeCloseTo(2, 5);
    expect(framing.pan[0]).toBeCloseTo(10, 5);
    expect(framing.pan[1]).toBeCloseTo(-5, 5);
    expect(framing.rotation).toBe(30);
  });

  it('can clear display area through view-presentation projection writes', () => {
    const { viewport } = track(createViewport());

    viewport.setViewState({
      displayArea: {
        imageArea: [0.5, 0.5],
        type: 'FIT',
      },
    });

    applyProjectionPresentation(viewport, {
      displayArea: undefined,
    });

    expect(viewport.getViewState().displayArea).toBeUndefined();
  });

  describe('the display area in the view state', () => {
    const AREA = { imageArea: [0.5, 0.5] };
    const PANNED_ZOOM = {
      anchorCanvas: [0.6, 0.4],
      anchorWorld: [1, 2, 3],
      scale: [2, 2],
      scaleMode: 'fitAspect',
    };

    /** A viewport with a stack and a zoom, a pan and a scale mode. */
    function createZoomedViewport(defaultOptions) {
      const context = track(createViewport(defaultOptions));
      const image = createPlanarImage(`area-image-${viewportCounter}`);

      addPlanarImageMetadata([image.imageId]);
      mountStackBinding(context.viewport, [image]);
      context.viewport.setViewState({
        displayArea: undefined,
        ...PANNED_ZOOM,
      });

      return context.viewport;
    }

    function framingStateOf(viewport) {
      const { anchorCanvas, anchorWorld, displayArea, scale, scaleMode } =
        viewport.getViewState();

      return { anchorCanvas, anchorWorld, displayArea, scale, scaleMode };
    }

    it('is the display area of defaultOptions at creation, shown as it is', () => {
      const { viewport } = track(
        createViewport({
          displayArea: { ...AREA, scaleMode: 'fitWidth' },
        })
      );

      expect(framingStateOf(viewport)).toEqual({
        anchorCanvas: [0.5, 0.5],
        anchorWorld: undefined,
        displayArea: { ...AREA, scaleMode: 'fitWidth' },
        scale: [1, 1],
        scaleMode: 'fitWidth',
      });
    });

    it('is shown as it is by a patch with no scale, scale mode or anchor', () => {
      const viewport = createZoomedViewport();

      viewport.setViewState({ displayArea: AREA });

      expect(framingStateOf(viewport)).toEqual({
        anchorCanvas: [0.5, 0.5],
        anchorWorld: undefined,
        displayArea: AREA,
        scale: [1, 1],
        scaleMode: 'fit',
      });
    });

    it('takes the scale mode of the display area', () => {
      const viewport = createZoomedViewport();

      viewport.setViewState({
        displayArea: { ...AREA, scaleMode: 'fitHeight' },
      });

      expect(viewport.getViewState().scaleMode).toBe('fitHeight');
      expect(viewport.getViewState().scale).toEqual([1, 1]);
    });

    it.each([
      ['scale', { scale: [3, 3] }, { scale: [3, 3] }],
      [
        'scaleMode',
        { scaleMode: 'absolute' },
        { scale: [2, 2], scaleMode: 'absolute' },
      ],
      [
        'anchorWorld',
        { anchorWorld: [4, 5, 6] },
        { anchorWorld: [4, 5, 6], scale: [2, 2] },
      ],
      [
        'anchorCanvas',
        { anchorCanvas: [0.2, 0.3] },
        { anchorCanvas: [0.2, 0.3], scale: [2, 2] },
      ],
    ])(
      'keeps the rest of the view state when the patch has %s',
      (_key, patch, expected) => {
        const viewport = createZoomedViewport();

        viewport.setViewState({ displayArea: AREA, ...patch });

        expect(framingStateOf(viewport)).toEqual({
          anchorCanvas: PANNED_ZOOM.anchorCanvas,
          anchorWorld: PANNED_ZOOM.anchorWorld,
          displayArea: AREA,
          scaleMode: PANNED_ZOOM.scaleMode,
          ...expected,
        });
      }
    );

    it('is cleared by { displayArea: undefined }, which changes nothing else', () => {
      const viewport = createZoomedViewport();

      viewport.setViewState({ displayArea: AREA, scale: [3, 3] });
      viewport.setViewState({ displayArea: undefined });

      expect(framingStateOf(viewport)).toEqual({
        anchorCanvas: PANNED_ZOOM.anchorCanvas,
        anchorWorld: PANNED_ZOOM.anchorWorld,
        displayArea: undefined,
        scale: [3, 3],
        scaleMode: PANNED_ZOOM.scaleMode,
      });
    });

    it('stays through a patch that does not name it', () => {
      const viewport = createZoomedViewport();

      viewport.setViewState({ displayArea: AREA });
      viewport.setViewState({ rotation: 90 });

      expect(viewport.getViewState().displayArea).toEqual(AREA);
      expect(viewport.getViewState().scale).toEqual([1, 1]);
    });

    it('is cleared by resetViewState when none was given with storeAsInitialCamera', () => {
      const viewport = createZoomedViewport({ displayArea: AREA });

      viewport.setViewState({ displayArea: AREA });
      viewport.resetViewState();

      expect(framingStateOf(viewport)).toEqual({
        anchorCanvas: [0.5, 0.5],
        anchorWorld: undefined,
        displayArea: undefined,
        scale: [1, 1],
        scaleMode: 'fit',
      });
    });

    it('goes back to the display area of defaultOptions with storeAsInitialCamera at resetViewState', () => {
      const stored = {
        ...AREA,
        scaleMode: 'fitWidth',
        storeAsInitialCamera: true,
      };
      const viewport = createZoomedViewport({ displayArea: stored });

      expect(viewport.getViewState().displayArea).toBeUndefined();

      viewport.resetViewState();

      expect(framingStateOf(viewport)).toEqual({
        anchorCanvas: [0.5, 0.5],
        anchorWorld: undefined,
        displayArea: stored,
        scale: [1, 1],
        scaleMode: 'fitWidth',
      });
    });

    it('goes back to the last display area given with storeAsInitialCamera at resetViewState', () => {
      const later = { imageArea: [0.25, 0.25], storeAsInitialCamera: true };
      const viewport = createZoomedViewport({
        displayArea: { ...AREA, storeAsInitialCamera: true },
      });

      viewport.setViewState({ displayArea: later });
      viewport.setViewState({ displayArea: AREA });
      viewport.resetViewState();

      expect(viewport.getViewState().displayArea).toEqual(later);
    });

    it('stays through a reset that keeps the pan or the zoom', () => {
      const viewport = createZoomedViewport({
        displayArea: { ...AREA, storeAsInitialCamera: true },
      });

      viewport.setViewState({ displayArea: { imageArea: [0.25, 0.25] } });
      viewport.resetViewState({ resetPan: false });

      expect(viewport.getViewState().displayArea).toEqual({
        imageArea: [0.25, 0.25],
      });
    });

    it('is in the framing with the scale mode and the scale of the view state', () => {
      const viewport = createZoomedViewport();

      viewport.setViewState({
        displayArea: { ...AREA, scaleMode: 'fitWidth' },
        scale: [2, 2],
      });

      const framing = viewport.getViewFraming();

      expect(framing.displayArea).toEqual({ ...AREA, scaleMode: 'fitWidth' });
      expect(framing.scaleMode).toBe('fitWidth');
      expect(framing.fitScale).toEqual([2, 2]);
      expect(viewport.getViewFraming({ scaleMode: true })).toEqual({
        scaleMode: 'fitWidth',
      });
    });

    it.each([
      ['a fit with a pan', { displayArea: undefined, scaleMode: 'fit' }],
      ['a stretched fit with a pan', { displayArea: undefined }],
      [
        'a stretched fit',
        { displayArea: undefined, scale: [2, 1], scaleMode: 'fitAspect' },
      ],
      [
        'a stretched scale',
        { displayArea: undefined, scale: [2, 1], scaleMode: 'fit' },
      ],
      [
        'fitWidth',
        { displayArea: undefined, scale: [1.5, 1.5], scaleMode: 'fitWidth' },
      ],
      [
        'a display area with fitHeight and a scale',
        {
          displayArea: { ...AREA, scaleMode: 'fitHeight' },
          scale: [2, 2],
        },
      ],
      [
        'a display area with absolute',
        { displayArea: { imageArea: [0.5, 0.25], scaleMode: 'absolute' } },
      ],
    ])(
      'gives back the view state of %s through setViewFraming(getViewFraming())',
      (_name, patch) => {
        const viewport = createZoomedViewport();

        viewport.setViewState(patch);

        const before = viewport.getViewState();
        const picture = viewport.getResolvedView();

        viewport.setViewFraming(viewport.getViewFraming());

        const after = viewport.getViewState();
        const resolved = viewport.getResolvedView();

        expect(after.displayArea).toEqual(before.displayArea);
        expect(after.scaleMode).toBe(before.scaleMode);
        expect(after.scale[0]).toBeCloseTo(before.scale[0], 9);
        expect(after.scale[1]).toBeCloseTo(before.scale[1], 9);
        expect(resolved.pan[0]).toBeCloseTo(picture.pan[0], 3);
        expect(resolved.pan[1]).toBeCloseTo(picture.pan[1], 3);
        expect(resolved.scale[0]).toBeCloseTo(picture.scale[0], 9);
        expect(resolved.scale[1]).toBeCloseTo(picture.scale[1], 9);
      }
    );

    it('keeps the display area of a framing patch that has a pan too', () => {
      const viewport = createZoomedViewport();

      viewport.setViewFraming({ displayArea: AREA, pan: [40, 10] });

      expect(framingStateOf(viewport)).toEqual({
        anchorCanvas: [0.5, 0.5],
        anchorWorld: undefined,
        displayArea: AREA,
        scale: [1, 1],
        scaleMode: 'fit',
      });
    });

    it('takes the fitScale of a framing patch over its scale and zoom', () => {
      const viewport = createZoomedViewport();

      viewport.setViewFraming({
        displayArea: AREA,
        fitScale: [3, 3],
        scale: [7, 7],
        zoom: 5,
      });

      expect(viewport.getViewState().scale).toEqual([3, 3]);
    });
  });

  it('exposes volume3d cameras through the projection service', () => {
    const element = document.createElement('div');
    const camera = {
      focalPoint: [1, 2, 3],
      parallelProjection: true,
      parallelScale: 50,
      position: [1, 2, 103],
      rotation: 0,
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, 1, 0],
    };
    const resolvedView = {
      canvasToWorld: jest.fn(([x, y]) => [x, y, 7]),
      getFrameOfReferenceUID: jest.fn(() => 'resolved-volume-frame'),
      toICamera: jest.fn(() => camera),
      worldToCanvas: jest.fn(([x, y]) => [x, y]),
    };
    const viewport = {
      element,
      type: ViewportType.VOLUME_3D,
      getFrameOfReferenceUID: () => 'volume-frame',
      getResolvedView: () => resolvedView,
      getViewState: () => camera,
    };

    Object.defineProperty(element, 'clientWidth', {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(element, 'clientHeight', {
      configurable: true,
      value: 100,
    });

    const snapshot = viewportProjection.get(viewport);
    const nextCamera = viewportProjection.withFraming(viewport, {
      camera: { parallelScale: 25 },
    });

    expect(snapshot.kind).toBe('volume3d');
    expect(snapshot.adapterId).toBe('volume3d');
    expect(snapshot.frameOfReferenceUID).toBe('resolved-volume-frame');
    expect(snapshot.spaces).toEqual({
      canvas: true,
      renderer: true,
      world: true,
    });
    expect(snapshot.framing.position).toEqual({
      kind: 'focalPoint',
      worldPoint: [1, 2, 3],
    });
    expect(snapshot.framing.scale).toEqual({
      kind: 'physical',
      mmPerCanvasPixel: 1,
    });
    expect(volume3DProjection.adapter.getFraming(snapshot).camera).toEqual(
      expect.objectContaining(camera)
    );
    expect(snapshot.transforms.canvasToWorld([3, 4])).toEqual([3, 4, 7]);
    expect(snapshot.transforms.worldToCanvas([3, 4, 7])).toEqual([3, 4]);
    expect(snapshot.rendererCamera).toEqual(expect.objectContaining(camera));
    expect(snapshot.rendererCamera).not.toBe(camera);
    expect(nextCamera.parallelScale).toBe(25);
  });

  it('derives fallback setPan deltas from the existing anchor', () => {
    const { viewport } = track(createViewport());

    viewport.setViewState({
      anchorCanvas: [0.75, 0.5],
    });

    expect(viewport.getPan()).toEqual([50, 0]);

    viewport.setPan([60, 0]);

    const pan = viewport.getPan();

    expect(pan[0]).toBeCloseTo(60, 5);
    expect(pan[1]).toBeCloseTo(0, 5);
    expect(viewport.getViewState().anchorCanvas[0]).toBeCloseTo(0.8, 5);
  });

  it('caches the current resolved view snapshot', () => {
    const { viewport } = track(createViewport());
    const image = createPlanarImage('cache-image-1');

    addPlanarImageMetadata([image.imageId]);
    mountStackBinding(viewport, [image]);

    const firstResolvedView = viewport.getResolvedView();
    const secondResolvedView = viewport.getResolvedView();

    expect(secondResolvedView).toBe(firstResolvedView);
  });

  it('finds image data for every bound volume and rejects unknown explicit ids', () => {
    const { viewport } = track(createViewport());
    const sourceImageData = { name: 'source' };
    const overlayImageData = { name: 'overlay' };

    mountVolumeBinding(viewport, {
      displaySetId: 'ct-display-set',
      imageData: sourceImageData,
      role: 'source',
      volumeId: 'volume:ct',
    });
    mountVolumeBinding(viewport, {
      displaySetId: 'pt-display-set',
      imageData: overlayImageData,
      role: 'overlay',
      volumeId: 'volume:pt',
    });

    expect(viewport.hasVolumeId('volume:ct')).toBe(true);
    expect(viewport.hasVolumeId('volume:pt')).toBe(true);
    expect(getViewportsWithVolumeId('volume:pt')).toContain(viewport);
    expect(viewport.getImageData('volume:pt')).toBe(overlayImageData);
    expect(viewport.getImageData('volume:missing')).toBeUndefined();
    expect(viewport.getImageData()).toBe(sourceImageData);
  });

  it('invalidates the resolved view cache when view state changes', () => {
    const { viewport } = track(createViewport());
    const image = createPlanarImage('cache-image-2');

    addPlanarImageMetadata([image.imageId]);
    mountStackBinding(viewport, [image]);

    const firstResolvedView = viewport.getResolvedView();

    viewport.setViewState({ scale: [2, 2] });

    expect(viewport.getResolvedView()).not.toBe(firstResolvedView);
  });

  it('invalidates the resolved view cache when render paths swap image state', () => {
    const { viewport } = track(createViewport());
    const firstImage = createPlanarImage('cache-image-3');
    const secondImage = createPlanarImage('cache-image-4');
    const { rendering } = mountStackBinding(viewport, [
      firstImage,
      secondImage,
    ]);

    addPlanarImageMetadata([firstImage.imageId, secondImage.imageId]);

    const firstResolvedView = viewport.getResolvedView();

    rendering.currentImage = secondImage;
    rendering.currentImageIdIndex = 1;
    viewport.renderContext.viewport.invalidateResolvedView();

    const nextResolvedView = viewport.getResolvedView();

    expect(nextResolvedView).not.toBe(firstResolvedView);
    expect(nextResolvedView.state.image).toBe(secondImage);
  });

  it('does not cache explicit slice-index resolved view snapshots', () => {
    const { viewport } = track(createViewport());
    const image = createPlanarImage('cache-image-5');

    addPlanarImageMetadata([image.imageId]);
    mountStackBinding(viewport, [image]);

    const currentResolvedView = viewport.getResolvedView();
    const firstExplicitSliceView = viewport.getResolvedView({ sliceIndex: 0 });
    const secondExplicitSliceView = viewport.getResolvedView({ sliceIndex: 0 });

    expect(firstExplicitSliceView).not.toBe(secondExplicitSliceView);
    expect(viewport.getResolvedView()).toBe(currentResolvedView);
  });

  it('resets orientation and flips while honoring pan and zoom flags', () => {
    const { viewport } = track(
      createViewport({
        orientation: OrientationAxis.CORONAL,
      })
    );

    viewport.setViewState({
      anchorCanvas: [0.25, 0.75],
      anchorWorld: [4, 5, 6],
      flipHorizontal: true,
      flipVertical: true,
      orientation: OrientationAxis.SAGITTAL,
      rotation: 45,
      scale: [2, 3],
    });

    viewport.resetViewState({
      resetPan: false,
      resetZoom: false,
    });

    const state = viewport.getViewState();

    expect(state.anchorCanvas).toEqual([0.25, 0.75]);
    expect(state.anchorWorld).toEqual([4, 5, 6]);
    expect(state.flipHorizontal).toBe(false);
    expect(state.flipVertical).toBe(false);
    expect(state.orientation).toBe(OrientationAxis.CORONAL);
    expect(state.rotation).toBe(0);
    expect(state.scale).toEqual([2, 3]);
  });

  it('can preserve orientation and flips when resetViewState opts out', () => {
    const { viewport } = track(createViewport());

    viewport.setViewState({
      flipHorizontal: true,
      flipVertical: true,
      orientation: OrientationAxis.SAGITTAL,
      rotation: 45,
    });

    viewport.resetViewState({
      resetOrientation: false,
      resetFlip: false,
    });

    const state = viewport.getViewState();

    expect(state.flipHorizontal).toBe(true);
    expect(state.flipVertical).toBe(true);
    expect(state.orientation).toBe(OrientationAxis.SAGITTAL);
    expect(state.rotation).toBe(0);
  });

  it('rejects invalid custom orientation vectors', () => {
    const { viewport } = track(createViewport());

    expect(() =>
      viewport.setViewState({
        orientation: {
          viewPlaneNormal: [0, 0, 0],
        },
      })
    ).toThrow(/finite non-zero Point3/);

    expect(() =>
      viewport.setViewState({
        orientation: {
          viewPlaneNormal: [1, 0, 0],
          viewUp: [1, 0, 0],
        },
      })
    ).toThrow(/must be orthogonal/);
  });

  it('scopes renderImageObject metadata to the viewport instance', async () => {
    const first = track(createViewport());
    const second = track(createViewport());
    const imageId = 'same-image-id';
    const firstImage = { imageId };
    const secondImage = { imageId };
    const firstDisplaySetId = `image-object:${first.viewport.id}:${imageIdToURI(
      imageId
    )}`;
    const secondDisplaySetId = `image-object:${second.viewport.id}:${imageIdToURI(
      imageId
    )}`;

    first.viewport.setDisplaySets = jest.fn(() => Promise.resolve());
    second.viewport.setDisplaySets = jest.fn(() => Promise.resolve());

    await first.viewport.renderImageObject(firstImage);
    await second.viewport.renderImageObject(secondImage);

    expect(first.viewport.setDisplaySets).toHaveBeenCalledWith({
      displaySetId: firstDisplaySetId,
      options: { orientation: expect.anything() },
    });
    expect(second.viewport.setDisplaySets).toHaveBeenCalledWith({
      displaySetId: secondDisplaySetId,
      options: { orientation: expect.anything() },
    });
    expect(displaySetRegistry.get(firstDisplaySetId).image).toBe(firstImage);
    expect(displaySetRegistry.get(secondDisplaySetId).image).toBe(secondImage);
    expect(displaySetRegistry.get(imageId)).toBeUndefined();
  });

  it('removes stale renderImageObject metadata when replacing the image', async () => {
    const { viewport } = track(createViewport());
    const firstImage = { imageId: 'first-image-id' };
    const secondImage = { imageId: 'second-image-id' };
    const firstDisplaySetId = `image-object:${viewport.id}:${imageIdToURI(
      firstImage.imageId
    )}`;
    const secondDisplaySetId = `image-object:${viewport.id}:${imageIdToURI(
      secondImage.imageId
    )}`;

    viewport.setDisplaySets = jest.fn(() => Promise.resolve());

    await viewport.renderImageObject(firstImage);
    await viewport.renderImageObject(secondImage);

    expect(displaySetRegistry.get(firstDisplaySetId)).toBeUndefined();
    expect(displaySetRegistry.get(secondDisplaySetId).image).toBe(secondImage);
  });
});

describe('PlanarViewport fidelity events', () => {
  let context;

  afterEach(() => {
    context.viewport.destroy();
    renderingEngineCache.delete(context.renderingEngineId);
    for (const provider of metadataProviders) {
      metaData.removeProvider(provider);
    }
    metadataProviders = [];
  });

  it('fires VIEWPORT_FIDELITY_CHANGED once per change for a render path that draws itself', () => {
    context = createViewport();
    const { viewport, element } = context;
    const image = createPlanarImage('cpu:1');
    addPlanarImageMetadata([image.imageId]);
    const { binding, rendering } = mountStackBinding(viewport, [image]);
    let quality = ImageQualityStatus.LOSSY;
    // A CPU path draws in `render()`, marks the frame and fires IMAGE_RENDERED.
    binding.render = jest.fn(() => {
      rendering.imageQualityStatus = quality;
      viewport.renderContext.display.markRendered();
      element.dispatchEvent(new CustomEvent(Events.IMAGE_RENDERED));
    });
    const states = [];
    element.addEventListener(Events.VIEWPORT_FIDELITY_CHANGED, (evt) =>
      states.push(evt.detail.state.shownState)
    );

    viewport.render();
    expect(states).toEqual(['lossy']);
    viewport.renderContext.display.renderNow();
    quality = ImageQualityStatus.FULL_RESOLUTION;
    viewport.renderContext.display.renderNow();

    expect(binding.render).toHaveBeenCalledTimes(3);
    expect(states).toEqual(['lossy', 'done']);
  });

  it('fires VIEWPORT_FIDELITY_CHANGED after IMAGE_RENDERED of the same draw', () => {
    context = createViewport();
    const { viewport, element } = context;
    const image = createPlanarImage('cpu:order');
    addPlanarImageMetadata([image.imageId]);
    const { binding, rendering } = mountStackBinding(viewport, [image]);
    binding.render = () => {
      rendering.imageQualityStatus = ImageQualityStatus.LOSSY;
      viewport.renderContext.display.markRendered();
      element.dispatchEvent(new CustomEvent(Events.IMAGE_RENDERED));
    };
    const order = [];
    element.addEventListener(Events.IMAGE_RENDERED, () =>
      order.push('rendered')
    );
    element.addEventListener(Events.VIEWPORT_FIDELITY_CHANGED, () =>
      order.push('fidelity')
    );

    viewport.render();

    expect(order).toEqual(['rendered', 'fidelity']);
  });

  it('leaves the event to the engine for a render path that the engine draws', () => {
    context = createViewport();
    const { viewport, element } = context;
    addPlanarImageMetadata(['vtk:1']);
    const { binding, rendering } = mountStackBinding(viewport, [
      createPlanarImage('vtk:1'),
    ]);
    rendering.imageQualityStatus = ImageQualityStatus.LOSSY;
    binding.render = jest.fn();
    const listener = jest.fn();
    element.addEventListener(Events.VIEWPORT_FIDELITY_CHANGED, listener);

    viewport.render();

    expect(listener).not.toHaveBeenCalled();
  });
});
