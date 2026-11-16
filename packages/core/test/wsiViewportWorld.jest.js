import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import WSIViewport from '../src/RenderingEngine/GenericViewport/WSI/WSIViewport';
import { canvasToIndexForWSI } from '../src/RenderingEngine/GenericViewport/WSI/wsiTransformUtils';

const WIDTH = 400;
const HEIGHT = 300;
const ROWS = 30000;
const COLUMNS = 40000;
const SPACING = 0.25;
const CENTER_COLUMN = 1000;
const CENTER_ROW = 2000;
const RESOLUTION = 4;

/**
 * A stand-in for the OpenLayers view of the microscopy viewer. The viewer
 * puts a pixel of the total pixel matrix at column x and row y on the map
 * point `[x, -y]`, so the centre of the view has a negative y.
 */
function createView() {
  const state = {
    center: [CENTER_COLUMN, -CENTER_ROW],
    resolution: RESOLUTION,
    zoom: 3,
    rotation: 0,
  };

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

/** A render path that mounts a slide on the stand-in view. */
function createRenderPathResolver() {
  return {
    register() {},
    resolve: () => ({
      createRenderPath: () => ({
        addData: async (ctx) => {
          const view = createView();
          const mapViewport = document.createElement('div');

          ctx.element.appendChild(mapViewport);

          return {
            rendering: {
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
            },
            updateDataPresentation() {},
            applyViewState() {},
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

/**
 * Makes a direct next WSI viewport with a slide whose total pixel matrix
 * starts at `origin` and runs along `direction`: the row direction first,
 * then the column direction, as ImageOrientationSlide gives them.
 */
async function createViewport(origin, direction) {
  const element = document.createElement('div');

  Object.defineProperty(element, 'clientWidth', { value: WIDTH });
  Object.defineProperty(element, 'clientHeight', { value: HEIGHT });
  document.body.appendChild(element);

  const viewport = new WSIViewport({
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
          origin,
          direction,
          spacing: [SPACING, SPACING, 1],
          dimensions: [COLUMNS, ROWS, 1],
          hasPixelSpacing: true,
        },
        frameOfReferenceUID: '1.2.3',
        imageURISet: new Set(['wsi:1']),
      }),
    },
    renderPathResolver: createRenderPathResolver(),
  });

  await viewport.setDisplaySets({ displaySetId: 'wsi:1' });

  return { viewport, element };
}

/** The slide point of a pixel: origin plus column and row steps. */
function slidePoint(origin, direction, column, row) {
  return [0, 1, 2].map(
    (axis) =>
      origin[axis] +
      column * SPACING * direction[axis] +
      row * SPACING * direction[3 + axis]
  );
}

function expectClose(actual, expected, precision = 6) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index], precision)
  );
}

describe('Next WSI viewport world coordinates', () => {
  let made;

  afterEach(() => {
    made.viewport.destroy();
    made.element.remove();
  });

  it('puts the centre of the view on the pixel of the total pixel matrix that it shows', async () => {
    const origin = [10, 20, 0];
    const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];

    made = await createViewport(origin, direction);

    const { viewport } = made;
    const centre = viewport.canvasToWorld([WIDTH / 2, HEIGHT / 2]);

    expectClose(
      centre,
      slidePoint(origin, direction, CENTER_COLUMN, CENTER_ROW)
    );
    expectClose(viewport.getResolvedView().toICamera().focalPoint, centre);
    expectClose(viewport.getImageData().imageData.worldToIndex(centre), [
      CENTER_COLUMN,
      CENTER_ROW,
      0,
    ]);
  });

  it('gives a probe below the centre a larger row inside the slide, as the image goes down', async () => {
    made = await createViewport([10, 20, 0], [1, 0, 0, 0, 1, 0, 0, 0, 1]);

    const { viewport } = made;
    const probe = viewport.canvasToWorld([WIDTH / 2 + 20, HEIGHT / 2 + 50]);
    const index = viewport.getImageData().imageData.worldToIndex(probe);

    expectClose(index, [
      CENTER_COLUMN + 20 * RESOLUTION,
      CENTER_ROW + 50 * RESOLUTION,
      0,
    ]);
    expect(index[1]).toBeGreaterThanOrEqual(0);
    expect(index[1]).toBeLessThan(ROWS);
  });

  it('follows the slide orientation and origin of the metadata', async () => {
    const origin = [25, 70, 1];
    const direction = [0, -1, 0, -1, 0, 0, 0, 0, -1];

    made = await createViewport(origin, direction);

    const { viewport } = made;

    expectClose(
      viewport.canvasToWorld([WIDTH / 2, HEIGHT / 2]),
      slidePoint(origin, direction, CENTER_COLUMN, CENTER_ROW)
    );
  });

  it('maps a world point back to the canvas point it came from', async () => {
    made = await createViewport([10, 20, 0], [0, -1, 0, -1, 0, 0, 0, 0, -1]);

    const { viewport } = made;
    const canvasPoint = [123, 45];

    expectClose(
      viewport.worldToCanvas(viewport.canvasToWorld(canvasPoint)),
      canvasPoint
    );
  });
});

describe('Next WSI viewport on a screen with device pixel ratio 2', () => {
  const originalPixelRatio = window.devicePixelRatio;
  let made;

  beforeEach(() => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2,
    });
  });

  afterEach(() => {
    made.viewport.destroy();
    made.element.remove();
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: originalPixelRatio,
    });
  });

  it('maps canvas points to the same pixels of the slide as at pixel ratio 1', async () => {
    made = await createViewport([10, 20, 0], [1, 0, 0, 0, 1, 0, 0, 0, 1]);

    const { viewport } = made;
    const { worldToIndex } = viewport.getImageData().imageData;

    expectClose(worldToIndex(viewport.canvasToWorld([WIDTH / 2, HEIGHT / 2])), [
      CENTER_COLUMN,
      CENTER_ROW,
      0,
    ]);
    expectClose(
      worldToIndex(viewport.canvasToWorld([WIDTH / 2 + 20, HEIGHT / 2 + 50])),
      [CENTER_COLUMN + 20 * RESOLUTION, CENTER_ROW + 50 * RESOLUTION, 0]
    );
    expectClose(
      viewport.worldToCanvas(viewport.canvasToWorld([30, 40])),
      [30, 40]
    );
  });

  it('keeps the pixel under the cursor when it zooms at a canvas point', async () => {
    made = await createViewport([10, 20, 0], [1, 0, 0, 0, 1, 0, 0, 0, 1]);

    const { viewport } = made;
    const canvasPoint = [WIDTH / 2 + 60, HEIGHT / 2 - 30];
    const resolvedView = viewport.getResolvedView();
    const { view } = resolvedView.state;
    const before = canvasToIndexForWSI({
      canvasPos: canvasPoint,
      canvasWidth: WIDTH,
      canvasHeight: HEIGHT,
      view,
    });
    const { centerIndex, resolution } = resolvedView.withZoom(
      view.getZoom() + 1,
      canvasPoint
    ).state.viewState;
    const after = canvasToIndexForWSI({
      canvasPos: canvasPoint,
      canvasWidth: WIDTH,
      canvasHeight: HEIGHT,
      view: {
        getCenter: () => centerIndex,
        getResolution: () => resolution,
        getRotation: () => 0,
      },
    });

    expect(resolution).toBe(RESOLUTION / 2);
    expectClose(after, before);
  });
});
