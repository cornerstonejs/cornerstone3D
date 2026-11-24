import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import { getConfiguration } from '../src/init';
import WSIViewport from '../src/RenderingEngine/Viewports/WSI/WSIViewport';
import { viewportProjection } from '../src/RenderingEngine/Viewports/viewportProjection';

const WIDTH = 400;
const HEIGHT = 300;
const SPACING = 0.25;
const ORIGIN = [10, 20, 0];
const DIRECTION = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const MAX_RESOLUTION = 32;

/**
 * A stand-in for the OpenLayers view that the microscopy viewer makes. It
 * starts at the rotation of the slide, as the viewer gives it, and keeps the
 * zoom and the resolution tied as OpenLayers does.
 */
function createView(slideRotation) {
  const state = {
    center: [1000, -2000],
    resolution: 4,
    rotation: slideRotation,
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
    getResolutionForZoom: (zoom) => MAX_RESOLUTION / Math.pow(2, zoom),
    getZoom: () => Math.log2(MAX_RESOLUTION / state.resolution),
    setZoom: (zoom) => {
      state.resolution = MAX_RESOLUTION / Math.pow(2, zoom);
    },
    getRotation: () => state.rotation,
    setRotation: (rotation) => {
      state.rotation = rotation;
    },
    getProjection: () => ({ getExtent: () => [0, -30000, 40000, 0] }),
  };
}

/**
 * A stand-in for the dicom-microscopy-viewer module. Its viewer makes a map
 * whose view starts at the rotation of the slide.
 */
function createMicroscopyViewerModule(slideRotation, views) {
  class VolumeImageViewer {
    constructor() {
      const view = createView(slideRotation);
      const mapViewport = document.createElement('div');

      views.push(view);
      this.map = {
        getView: () => view,
        getViewport: () => mapViewport,
        on() {},
        un() {},
        render() {},
        updateSize() {},
      };
    }

    render() {}

    deactivateDragPanInteraction() {}

    getMap() {
      return this.map;
    }

    getAffine() {
      return undefined;
    }

    cleanup() {}
  }

  return {
    viewer: { VolumeImageViewer },
    utils: {
      applyTransform: ({ coordinate }) => coordinate,
      applyInverseTransform: ({ coordinate }) => coordinate,
    },
  };
}

function createDataProvider() {
  return {
    load: async (id) => ({
      id,
      type: 'wsi',
      imageIds: ['wsi:1'],
      client: {},
      volumeImages: [],
      metadataDicomweb: [],
      metadata: {
        origin: ORIGIN,
        direction: DIRECTION,
        spacing: [SPACING, SPACING, 1],
        dimensions: [40000, 30000, 1],
        hasPixelSpacing: true,
      },
      frameOfReferenceUID: '1.2.3',
      imageURISet: new Set(['wsi:1']),
    }),
  };
}

/**
 * Mounts a slide on a next WSI viewport, or on the legacy adapter, through
 * the real microscopy render path and a stand-in microscopy viewer.
 */
async function mount(ViewportClass, slideRotation) {
  const views = [];
  const configuration = getConfiguration();
  const peerImport = configuration.peerImport;
  const element = document.createElement('div');

  configuration.peerImport = async (moduleId) =>
    moduleId === 'dicom-microscopy-viewer'
      ? createMicroscopyViewerModule(slideRotation, views)
      : peerImport(moduleId);
  Object.defineProperty(element, 'clientWidth', { value: WIDTH });
  Object.defineProperty(element, 'clientHeight', { value: HEIGHT });
  document.body.appendChild(element);

  const viewport = new ViewportClass({
    id: 'wsi',
    element,
    renderingEngineId: 'renderingEngine',
    dataProvider: createDataProvider(),
  });

  try {
    await viewport.setDisplaySets({ displaySetId: 'wsi:1' });
  } finally {
    configuration.peerImport = peerImport;
  }

  return { viewport, element, view: views[views.length - 1] };
}

/**
 * The pixel of the total pixel matrix under a canvas point, computed the way
 * OpenLayers draws a view: the canvas offset from the anchor, scaled by the
 * resolution with y up, turned by the rotation. The anchor is the canvas
 * point that shows the map point `center`, the canvas centre by default.
 * The microscopy viewer puts the pixel of column x and row y on the map
 * point `[x, -y]`.
 */
function referencePixel(
  { center, resolution, rotation },
  canvasPoint,
  anchor = [WIDTH / 2, HEIGHT / 2]
) {
  const dx = (canvasPoint[0] - anchor[0]) * resolution;
  const dy = -(canvasPoint[1] - anchor[1]) * resolution;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const mapPoint = [
    center[0] + cos * dx - sin * dy,
    center[1] + sin * dx + cos * dy,
  ];

  return [mapPoint[0], -mapPoint[1], 0];
}

function readView(view) {
  return {
    center: view.getCenter(),
    resolution: view.getResolution(),
    rotation: view.getRotation(),
  };
}

/**
 * The centre and the resolution of the view, with the rotation that the
 * legacy viewport shows: the rotation of the slide, plus a rotation on top.
 */
function legacyView(view, slideRotation, rotation = 0) {
  return { ...readView(view), rotation: slideRotation + rotation };
}

function pixelAt(viewport, canvasPoint) {
  return viewport
    .getImageData()
    .imageData.worldToIndex(viewport.canvasToWorld(canvasPoint));
}

function worldOfPixel(pixel) {
  return [
    ORIGIN[0] + pixel[0] * SPACING,
    ORIGIN[1] + pixel[1] * SPACING,
    ORIGIN[2],
  ];
}

/** An angle in radians, in the degrees that the view state takes. */
function degrees(radians) {
  return (radians * 180) / Math.PI;
}

function expectClose(actual, expected, precision = 2) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index], precision)
  );
}

const SLIDE_ROTATIONS = [
  ['a slide turned by -pi/2', -Math.PI / 2],
  ['a slide turned by an odd angle', 0.4],
];

describe.each(SLIDE_ROTATIONS)(
  'Next WSI viewport on %s',
  (_, slideRotation) => {
    let made;

    beforeEach(async () => {
      made = await mount(WSIViewport, slideRotation);
    });

    afterEach(() => {
      made.viewport.destroy();
      made.element.remove();
    });

    it('keeps the rotation that the microscopy viewer gives the slide at mount', () => {
      expect(made.view.getRotation()).toBeCloseTo(slideRotation, 12);
      expect(made.viewport.getViewState().rotation).toBeCloseTo(0, 12);
    });

    it('turns the view on top of the rotation of the slide and reads it back', () => {
      const { viewport, view } = made;

      viewport.setViewState({ rotation: degrees(0.3) });

      expect(view.getRotation()).toBeCloseTo(slideRotation + 0.3, 12);
      expect(viewport.getViewState().rotation).toBeCloseTo(degrees(0.3), 12);

      viewport.setViewState({ zoom: view.getZoom() + 1 });

      expect(viewport.getViewState().rotation).toBeCloseTo(degrees(0.3), 12);
      expect(view.getRotation()).toBeCloseTo(slideRotation + 0.3, 12);
    });

    it('goes back to the rotation of the slide on a reset', () => {
      const { viewport, view } = made;

      viewport.setViewState({ rotation: 1.1 });

      expect(viewport.resetViewState()).toBe(true);
      expect(view.getRotation()).toBeCloseTo(slideRotation, 12);
      expect(viewport.getViewState().rotation).toBeCloseTo(0, 12);
    });

    it('maps canvas points to the pixels that the turned map shows, and back', () => {
      const { viewport, view } = made;
      const canvasPoint = [WIDTH / 2 + 50, HEIGHT / 2 + 30];
      const expected = referencePixel(
        legacyView(view, slideRotation),
        canvasPoint
      );

      expectClose(pixelAt(viewport, canvasPoint), expected);
      expectClose(viewport.worldToCanvas(worldOfPixel(expected)), canvasPoint);
      expectClose(
        viewport.worldToCanvas(viewport.canvasToWorld([17, 233])),
        [17, 233]
      );
    });

    it('keeps the pixel under the cursor when it zooms at a canvas point', () => {
      const { viewport, view } = made;
      const canvasPoint = [WIDTH / 2 + 60, HEIGHT / 2 - 30];
      const before = referencePixel(
        legacyView(view, slideRotation),
        canvasPoint
      );

      viewport.setZoom(view.getZoom() + 1, canvasPoint);

      expect(view.getResolution()).toBeCloseTo(
        MAX_RESOLUTION / Math.pow(2, viewport.getZoom()),
        9
      );
      expectClose(pixelAt(viewport, canvasPoint), before);
      expectClose(
        referencePixel(legacyView(view, slideRotation), canvasPoint),
        before
      );
    });

    it('keeps the pixel under the cursor when the view rotation cancels the rotation of the slide', () => {
      const { viewport, view } = made;
      const canvasPoint = [WIDTH / 2 - 80, HEIGHT / 2 + 45];

      viewport.setViewState({ rotation: degrees(-slideRotation) });

      expect(view.getRotation()).toBeCloseTo(0, 12);

      const before = referencePixel(
        legacyView(view, slideRotation, -slideRotation),
        canvasPoint
      );

      viewport.setZoom(view.getZoom() + 1, canvasPoint);

      expectClose(pixelAt(viewport, canvasPoint), before);
    });

    it('gives the camera of the legacy viewport for the turned map', () => {
      const { viewport, view } = made;
      const canvasPoint = [WIDTH / 2 + 90, HEIGHT / 2 + 35];
      const pixel = referencePixel(
        legacyView(view, slideRotation),
        canvasPoint
      );

      viewport.setZoom(view.getZoom() + 1, canvasPoint);

      const camera = viewport.getResolvedView().toICamera();
      const centre = referencePixel(
        {
          center: [pixel[0], -pixel[1]],
          resolution: view.getResolution(),
          rotation: slideRotation,
        },
        [WIDTH / 2, HEIGHT / 2],
        canvasPoint
      );

      expectClose(camera.focalPoint, worldOfPixel(centre));
      expect(camera.viewUp).toEqual([0, -1, 0]);
      expect(camera.parallelScale).toBeCloseTo(
        HEIGHT * view.getResolution() * SPACING,
        9
      );
      expect(camera.rotation).toBeCloseTo(0, 12);
    });

    it('reads and sets a view presentation without moving the slide', () => {
      const { viewport, view } = made;

      viewport.setViewState({ rotation: degrees(0.25) });

      const before = readView(view);
      const presentation = viewportProjection.getPresentation(viewport);

      expect(presentation.rotation).toBeCloseTo(degrees(0.25), 12);

      viewport.setViewState(
        viewportProjection.withPresentation(viewport, presentation)
      );

      const after = readView(view);

      expect(after.rotation).toBeCloseTo(slideRotation + 0.25, 12);
      expect(after.resolution).toBeCloseTo(before.resolution, 9);
      expectClose(after.center, before.center);
    });

    it('puts a probe and the corners of a rectangle on the pixels under the cursor', () => {
      const { viewport, view } = made;
      const state = legacyView(view, slideRotation);
      const probe = [WIDTH / 2 - 70, HEIGHT / 2 + 40];
      const corners = [
        [WIDTH / 2 - 100, HEIGHT / 2 - 80],
        [WIDTH / 2 - 20, HEIGHT / 2 - 80],
        [WIDTH / 2 - 100, HEIGHT / 2 + 10],
        [WIDTH / 2 - 20, HEIGHT / 2 + 10],
      ];

      expectClose(pixelAt(viewport, probe), referencePixel(state, probe));
      expectClose(viewport.worldToCanvas(viewport.canvasToWorld(probe)), probe);
      corners.forEach((corner) =>
        expectClose(pixelAt(viewport, corner), referencePixel(state, corner))
      );

      const world = corners.map((corner) => viewport.canvasToWorld(corner));
      const side = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

      expect(side(world[0], world[1]) * side(world[0], world[2])).toBeCloseTo(
        80 * 90 * Math.pow(state.resolution * SPACING, 2),
        1
      );
    });
  }
);
