import { Events } from '../src/enums';
import PlanarViewport from '../src/RenderingEngine/GenericViewport/Planar/PlanarViewport';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import genericViewportDataSetMetadataProvider from '../src/utilities/genericViewportDataSetMetadataProvider';
import imageIdToURI from '../src/utilities/imageIdToURI';

let viewportCounter = 0;

function createViewport() {
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
  const renderingEngine = {
    id: renderingEngineId,
    getRenderer: jest.fn(() => renderer),
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

  const viewport = new PlanarViewport({
    id: viewportId,
    element,
    renderingEngineId,
    canvas: vtkCanvas,
    sWidth: 200,
    sHeight: 100,
    defaultOptions: {},
  });

  return {
    element,
    renderingEngine,
    renderingEngineId,
    viewport,
  };
}

describe('PlanarViewport view state', () => {
  let created = [];

  afterEach(() => {
    for (const { renderingEngineId, viewport } of created) {
      viewport.destroy();
      renderingEngineCache.delete(renderingEngineId);
    }

    created = [];
    genericViewportDataSetMetadataProvider.clear();
    jest.clearAllMocks();
  });

  function track(viewportContext) {
    created.push(viewportContext);
    return viewportContext;
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

  it('applies view-presentation pan in a single state write', () => {
    const { renderingEngine, viewport } = track(createViewport());

    renderingEngine.renderViewport.mockClear();

    viewport.setViewPresentation({
      zoom: 2,
      pan: [10, -5],
      rotation: 15,
    });

    expect(renderingEngine.renderViewport).toHaveBeenCalledTimes(1);
    const presentation = viewport.getViewPresentation();

    expect(presentation.zoom).toBeCloseTo(2, 5);
    expect(presentation.pan[0]).toBeCloseTo(10, 5);
    expect(presentation.pan[1]).toBeCloseTo(-5, 5);
    expect(presentation.rotation).toBe(15);
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

    first.viewport.setData = jest.fn(() => Promise.resolve());
    second.viewport.setData = jest.fn(() => Promise.resolve());

    await first.viewport.renderImageObject(firstImage);
    await second.viewport.renderImageObject(secondImage);

    expect(first.viewport.setData).toHaveBeenCalledWith(firstDataId, {
      orientation: expect.anything(),
    });
    expect(second.viewport.setData).toHaveBeenCalledWith(secondDataId, {
      orientation: expect.anything(),
    });
    expect(
      genericViewportDataSetMetadataProvider.get(
        genericViewportDataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
        firstDataId
      ).image
    ).toBe(firstImage);
    expect(
      genericViewportDataSetMetadataProvider.get(
        genericViewportDataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
        secondDataId
      ).image
    ).toBe(secondImage);
    expect(
      genericViewportDataSetMetadataProvider.get(
        genericViewportDataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
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

    viewport.setData = jest.fn(() => Promise.resolve());

    await viewport.renderImageObject(firstImage);
    await viewport.renderImageObject(secondImage);

    expect(
      genericViewportDataSetMetadataProvider.get(
        genericViewportDataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
        firstDataId
      )
    ).toBeUndefined();
    expect(
      genericViewportDataSetMetadataProvider.get(
        genericViewportDataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
        secondDataId
      ).image
    ).toBe(secondImage);
  });
});
