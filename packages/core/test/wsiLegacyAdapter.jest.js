import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import WSIViewportLegacyAdapter from '../src/RenderingEngine/GenericViewport/WSI/WSIViewportLegacyAdapter';

const WIDTH = 400;
const HEIGHT = 300;

/** A stand-in for the OpenLayers view of the microscopy viewer. */
function createView() {
  const state = { center: [1000, -2000], resolution: 4, zoom: 3, rotation: 0 };

  return {
    getCenter: () => [...state.center],
    setCenter: (center) => {
      state.center = [center[0], center[1]];
    },
    getResolution: () => state.resolution,
    setResolution: (resolution) => {
      state.resolution = resolution;
    },
    getZoom: () => state.zoom,
    setZoom: (zoom) => {
      state.zoom = zoom;
    },
    getRotation: () => state.rotation,
    setRotation: (rotation) => {
      state.rotation = rotation;
    },
  };
}

/**
 * A render path that mounts a slide on a stand-in map, so the adapter runs
 * without the microscopy viewer.
 */
function createRenderPathResolver() {
  return {
    register() {},
    resolve: () => ({
      createRenderPath: () => ({
        addData: async (ctx) => {
          const view = createView();
          const mapViewport = document.createElement('div');
          const rendering = {
            renderMode: 'wsi2d',
            microscopyElement: document.createElement('div'),
            viewer: { getAffine: () => undefined },
            map: {
              getView: () => view,
              getViewport: () => mapViewport,
              render() {},
              updateSize() {},
            },
            postrenderHandler() {},
          };

          ctx.element.appendChild(mapViewport);

          return {
            rendering,
            updateDataPresentation() {},
            applyViewState: (viewState) => {
              if (typeof viewState.resolution === 'number') {
                view.setResolution(viewState.resolution);
              }
              if (viewState.centerIndex) {
                view.setCenter(viewState.centerIndex);
              }
            },
            getFrameOfReferenceUID: () => '1.2.3',
            render() {},
            resize() {},
            removeData() {
              mapViewport.remove();
            },
          };
        },
      }),
    }),
  };
}

/** Makes a WSI legacy adapter on an element of a known size with a slide. */
async function createAdapter(args = {}) {
  const element = document.createElement('div');

  Object.defineProperty(element, 'clientWidth', { value: WIDTH });
  Object.defineProperty(element, 'clientHeight', { value: HEIGHT });
  document.body.appendChild(element);

  const viewport = new WSIViewportLegacyAdapter({
    id: 'wsi',
    element,
    renderingEngineId: 'renderingEngine',
    dataProvider: {
      load: async (id) => ({
        id,
        type: 'wsi',
        imageIds: ['wsi:1'],
        client: {},
        volumeImages: [],
        metadataDicomweb: [],
        metadata: {
          origin: [0, 0, 0],
          direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          spacing: [0.25, 0.25, 1],
          dimensions: [40000, 30000, 1],
          hasPixelSpacing: true,
        },
        frameOfReferenceUID: '1.2.3',
        imageURISet: new Set(['wsi:1']),
      }),
    },
    renderPathResolver: createRenderPathResolver(),
    ...args,
  });

  await viewport.setDisplaySets({ displaySetId: 'wsi:1' });

  return { viewport, element };
}

describe('WSI legacy adapter', () => {
  let viewport;
  let element;

  beforeEach(async () => {
    ({ viewport, element } = await createAdapter());
  });

  afterEach(() => {
    viewport.destroy();
    element.remove();
  });

  it('starts with no pan', () => {
    expect(viewport.getPan()).toEqual([0, 0]);
  });

  it('pans in canvas pixels relative to the first view', () => {
    const { focalPoint } = viewport.getCamera();

    viewport.setPan([40, -20]);

    const pan = viewport.getPan();

    expect(pan[0]).toBeCloseTo(40);
    expect(pan[1]).toBeCloseTo(-20);

    const canvasPoint = viewport.worldToCanvas(focalPoint);

    expect(canvasPoint[0]).toBeCloseTo(WIDTH / 2 + 40);
    expect(canvasPoint[1]).toBeCloseTo(HEIGHT / 2 - 20);

    viewport.setPan([0, 0]);

    expect(viewport.getPan()[0]).toBeCloseTo(0);
    expect(viewport.getPan()[1]).toBeCloseTo(0);
  });

  it('skips a pan under one pixel and stores the initial camera', () => {
    viewport.setPan([0.5, 0.5]);

    expect(viewport.getPan()).toEqual([0, 0]);

    viewport.setPan([30, 30], true);

    expect(viewport.getPan()[0]).toBeCloseTo(0);
    expect(viewport.getPan()[1]).toBeCloseTo(0);
  });

  it('has the legacy options, canvas and actor members', async () => {
    const canvas = document.createElement('canvas');
    const made = await createAdapter({
      canvas,
      defaultOptions: { background: [0, 1, 0], suppressEvents: true },
    });

    expect(made.viewport.canvas).toBe(canvas);
    expect(made.viewport.getCanvas()).toBe(canvas);
    expect(made.viewport.suppressEvents).toBe(true);
    expect(made.viewport.options).toEqual(made.viewport.defaultOptions);

    made.viewport.setOptions({ background: [1, 1, 1] });
    expect(made.viewport.options).toEqual({ background: [1, 1, 1] });

    made.viewport.reset();
    expect(made.viewport.options).toEqual({
      background: [0, 1, 0],
      suppressEvents: true,
    });
    made.viewport.destroy();
    made.element.remove();

    expect(viewport.isDisabled).toBe(false);
    expect(viewport.uid).toBe('wsi');
    expect(viewport.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(viewport.getActors()).toEqual([]);
    expect(viewport.getDefaultActor()).toBeUndefined();
    expect(viewport.getActor('any')).toBeUndefined();
    expect(viewport.getDisplayArea()).toBeUndefined();
    expect(viewport.isOrientationChangeable()).toBe(false);
  });
});
