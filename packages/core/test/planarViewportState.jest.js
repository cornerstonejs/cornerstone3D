import {
  Events,
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
} from '../src/RenderingEngine/GenericViewport';
import PlanarViewport from '../src/RenderingEngine/GenericViewport/Planar/PlanarViewport';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import genericViewportDisplaySetMetadataProvider from '../src/utilities/genericViewportDisplaySetMetadataProvider';
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
  const dataId = `stack:${viewport.id}`;
  const rendering = {
    actorEntryUID: `${dataId}:actor`,
    currentImage: images[0],
    currentImageIdIndex: 0,
    imageData: {},
    loadRequestId: 0,
    renderMode: ActorRenderMode.VTK_IMAGE,
  };
  const binding = {
    applyViewState: jest.fn(),
    data: {
      id: dataId,
      type: 'image',
      image: images[0],
      imageIds: images.map((image) => image.imageId),
    },
    getFrameOfReferenceUID: () => 'planar-test-frame',
    removeData: jest.fn(),
    rendering,
    role: 'source',
    updateDataPresentation: jest.fn(),
  };

  viewport.bindings.set(dataId, binding);
  viewport.mountedData.promoteSourceDataId(dataId);

  return { binding, dataId, rendering };
}

function mountVolumeBinding(viewport, { dataId, imageData, role, volumeId }) {
  const rendering = {
    renderMode: ActorRenderMode.VTK_VOLUME_SLICE,
  };
  const binding = {
    applyViewState: jest.fn(),
    data: {
      id: dataId,
      type: 'volume',
      volumeId,
    },
    getFrameOfReferenceUID: () => 'planar-test-frame',
    getImageData: jest.fn(() => imageData),
    removeData: jest.fn(),
    rendering,
    role,
    updateDataPresentation: jest.fn(),
  };

  viewport.bindings.set(dataId, binding);
  if (role === 'source') {
    viewport.mountedData.promoteSourceDataId(dataId);
  }

  return { binding, dataId, rendering };
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
    genericViewportDisplaySetMetadataProvider.clear();
    jest.clearAllMocks();
  });

  function track(viewportContext) {
    created.push(viewportContext);
    return viewportContext;
  }

  function applyProjectionPresentation(viewport, presentation) {
    const nextViewState = viewportProjection.withPresentation(
      viewport,
      presentation
    );

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
    const presentation = viewportProjection.getPresentation(viewport);

    expect(presentation.zoom).toBeCloseTo(2, 5);
    expect(presentation.pan[0]).toBeCloseTo(10, 5);
    expect(presentation.pan[1]).toBeCloseTo(-5, 5);
    expect(presentation.rotation).toBe(15);
  });

  it('exposes the current planar camera through the projection service', () => {
    const { viewport } = track(createViewport());

    applyProjectionPresentation(viewport, {
      zoom: 2,
      pan: [10, -5],
      rotation: 15,
    });

    const snapshot = viewportProjection.get(viewport);
    const presentation = planarProjection.adapter.getPresentation(snapshot);
    const servicePresentation = viewportProjection.getPresentation(viewport);

    expect(snapshot.kind).toBe('planar');
    expect(snapshot.adapterId).toBe('planar');
    expect(snapshot.presentation.scale.kind).toBe('fit');
    expect(snapshot.presentation.position.kind).toBe('anchor');
    expect(servicePresentation.zoom).toBeCloseTo(2, 5);
    expect(presentation.zoom).toBeCloseTo(2, 5);
    expect(presentation.pan[0]).toBeCloseTo(10, 5);
    expect(presentation.pan[1]).toBeCloseTo(-5, 5);
    expect(presentation.rotation).toBe(15);
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
    expect(snapshot.presentation.scale.kind).toBe('fitWidth');
    expect(snapshot.presentation.position).toEqual({
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

    const nextViewState = viewportProjection.withPresentation(viewport, {
      zoom: 2,
      pan: [10, -5],
      rotation: 30,
    });

    expect(viewport.getViewState()).toEqual(initialState);

    viewport.setViewState(nextViewState);

    const presentation = viewportProjection.getPresentation(viewport);

    expect(presentation.zoom).toBeCloseTo(2, 5);
    expect(presentation.pan[0]).toBeCloseTo(10, 5);
    expect(presentation.pan[1]).toBeCloseTo(-5, 5);
    expect(presentation.rotation).toBe(30);
  });

  it('can clear display area through view-presentation projection writes', () => {
    const { viewport } = track(createViewport());

    viewport.setDisplayArea({
      imageArea: [0.5, 0.5],
      type: 'FIT',
    });

    applyProjectionPresentation(viewport, {
      displayArea: undefined,
    });

    expect(viewport.getViewState().displayArea).toBeUndefined();
    expect(viewport.getDisplayArea()).toBeUndefined();
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
      type: ViewportType.VOLUME_3D_NEXT,
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
    const nextCamera = viewportProjection.withPresentation(viewport, {
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
    expect(snapshot.presentation.position).toEqual({
      kind: 'focalPoint',
      worldPoint: [1, 2, 3],
    });
    expect(snapshot.presentation.scale).toEqual({
      kind: 'physical',
      mmPerCanvasPixel: 1,
    });
    expect(volume3DProjection.adapter.getPresentation(snapshot).camera).toEqual(
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
      dataId: 'ct-display-set',
      imageData: sourceImageData,
      role: 'source',
      volumeId: 'volume:ct',
    });
    mountVolumeBinding(viewport, {
      dataId: 'pt-display-set',
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
    const firstDataId = `image-object:${first.viewport.id}:${imageIdToURI(
      imageId
    )}`;
    const secondDataId = `image-object:${second.viewport.id}:${imageIdToURI(
      imageId
    )}`;

    first.viewport.setDisplaySets = jest.fn(() => Promise.resolve());
    second.viewport.setDisplaySets = jest.fn(() => Promise.resolve());

    await first.viewport.renderImageObject(firstImage);
    await second.viewport.renderImageObject(secondImage);

    expect(first.viewport.setDisplaySets).toHaveBeenCalledWith({
      displaySetId: firstDataId,
      options: { orientation: expect.anything() },
    });
    expect(second.viewport.setDisplaySets).toHaveBeenCalledWith({
      displaySetId: secondDataId,
      options: { orientation: expect.anything() },
    });
    expect(
      genericViewportDisplaySetMetadataProvider.get(
        genericViewportDisplaySetMetadataProvider.VIEWPORT_V2_DISPLAY_SET,
        firstDataId
      ).image
    ).toBe(firstImage);
    expect(
      genericViewportDisplaySetMetadataProvider.get(
        genericViewportDisplaySetMetadataProvider.VIEWPORT_V2_DISPLAY_SET,
        secondDataId
      ).image
    ).toBe(secondImage);
    expect(
      genericViewportDisplaySetMetadataProvider.get(
        genericViewportDisplaySetMetadataProvider.VIEWPORT_V2_DISPLAY_SET,
        imageId
      )
    ).toBeUndefined();
  });

  it('removes stale renderImageObject metadata when replacing the image', async () => {
    const { viewport } = track(createViewport());
    const firstImage = { imageId: 'first-image-id' };
    const secondImage = { imageId: 'second-image-id' };
    const firstDataId = `image-object:${viewport.id}:${imageIdToURI(
      firstImage.imageId
    )}`;
    const secondDataId = `image-object:${viewport.id}:${imageIdToURI(
      secondImage.imageId
    )}`;

    viewport.setDisplaySets = jest.fn(() => Promise.resolve());

    await viewport.renderImageObject(firstImage);
    await viewport.renderImageObject(secondImage);

    expect(
      genericViewportDisplaySetMetadataProvider.get(
        genericViewportDisplaySetMetadataProvider.VIEWPORT_V2_DISPLAY_SET,
        firstDataId
      )
    ).toBeUndefined();
    expect(
      genericViewportDisplaySetMetadataProvider.get(
        genericViewportDisplaySetMetadataProvider.VIEWPORT_V2_DISPLAY_SET,
        secondDataId
      ).image
    ).toBe(secondImage);
  });
});
