import { getConfiguration } from '../../src/init';
import { displaySetRegistry } from '@cornerstonejs/metadata';

export const WIDTH = 400;
export const HEIGHT = 300;
export const SPACING = 0.25;
export const COLUMNS = 40000;
export const ROWS = 30000;
export const ORIGIN = [10, 20, 0];
export const FRAME_OF_REFERENCE_UID = '1.2.3';
export const IMAGE_ID = 'wadors:https://server/studies/1/series/2/instances/3';
const MAX_RESOLUTION = 32;

/**
 * A stand-in for the OpenLayers view that the microscopy viewer makes. It
 * starts at the rotation of the slide, as the viewer gives it, and keeps the
 * zoom and the resolution tied as OpenLayers does.
 */
export function createView(slideRotation = 0) {
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
    getProjection: () => ({ getExtent: () => [0, -ROWS, COLUMNS, 0] }),
  };
}

/**
 * The DICOMweb metadata of the slide: one volume image with the pixel
 * spacing, the origin and the frame of reference of the constants above.
 */
function createSlideMetadata() {
  return {
    NumberOfFrames: 1,
    TotalPixelMatrixColumns: COLUMNS,
    TotalPixelMatrixRows: ROWS,
    ImageOrientationSlide: [1, 0, 0, 0, 1, 0],
    ImagedVolumeWidth: COLUMNS * SPACING,
    ImagedVolumeHeight: ROWS * SPACING,
    ImagedVolumeDepth: 1,
    TotalPixelMatrixOriginSequence: [
      {
        XOffsetInSlideCoordinateSystem: ORIGIN[0],
        YOffsetInSlideCoordinateSystem: ORIGIN[1],
        ZOffsetInSlideCoordinateSystem: ORIGIN[2],
      },
    ],
    '00080008': { Value: ['ORIGINAL', 'PRIMARY', 'VOLUME', 'NONE'] },
    '00200052': { Value: [FRAME_OF_REFERENCE_UID] },
  };
}

/** A stand-in for the DICOMweb client that gives the slide metadata. */
export function createClient() {
  return { getDICOMwebMetadata: () => createSlideMetadata() };
}

/**
 * A stand-in for the dicom-microscopy-viewer module. Its viewer makes a map
 * whose view starts at the rotation of the slide, and pushes the view into
 * `views`.
 */
export function createMicroscopyViewerModule(slideRotation, views) {
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

  class VLWholeSlideMicroscopyImage {
    constructor({ metadata }) {
      Object.assign(this, metadata, {
        ImageType: metadata['00080008'].Value,
      });
    }
  }

  return {
    viewer: { VolumeImageViewer },
    metadata: { VLWholeSlideMicroscopyImage },
    utils: {
      applyTransform: ({ coordinate }) => coordinate,
      applyInverseTransform: ({ coordinate }) => coordinate,
    },
  };
}

/** Makes an element of the test size, with a canvas of the same size. */
function createElement() {
  const element = document.createElement('div');
  const viewportElement = document.createElement('div');
  const canvas = document.createElement('canvas');

  Object.defineProperty(element, 'clientWidth', {
    value: WIDTH,
    writable: true,
  });
  Object.defineProperty(element, 'clientHeight', {
    value: HEIGHT,
    writable: true,
  });
  Object.defineProperty(canvas, 'clientWidth', {
    value: WIDTH,
    writable: true,
  });
  Object.defineProperty(canvas, 'clientHeight', {
    value: HEIGHT,
    writable: true,
  });
  viewportElement.appendChild(canvas);
  element.appendChild(viewportElement);
  document.body.appendChild(element);

  return { element, canvas };
}

/**
 * Runs `mountFn` with the stand-in microscopy viewer as the peer import of
 * dicom-microscopy-viewer.
 */
export async function withMicroscopyViewer(slideRotation, mountFn) {
  const views = [];
  const configuration = getConfiguration();
  const peerImport = configuration.peerImport;

  configuration.peerImport = async (moduleId) =>
    moduleId === 'dicom-microscopy-viewer'
      ? createMicroscopyViewerModule(slideRotation, views)
      : peerImport(moduleId);

  try {
    await mountFn();
  } finally {
    configuration.peerImport = peerImport;
  }

  return views[views.length - 1];
}

/**
 * Mounts the slide on a next WSI viewport class (the direct class or the
 * adapter) through the default data provider and the real microscopy render
 * path, as an application does. Without a web client the data has none, and
 * without a canvas the viewport gets only the element.
 */
export async function mountNext(
  ViewportClass,
  slideRotation = 0,
  { withWebClient = true, withCanvas = true, defaultOptions } = {}
) {
  const { element, canvas } = createElement();
  const viewport = new ViewportClass({
    id: 'wsiNext',
    element,
    canvas: withCanvas ? canvas : undefined,
    renderingEngineId: 'renderingEngine',
    defaultOptions,
  });

  displaySetRegistry.add(IMAGE_ID, {
    imageIds: [IMAGE_ID],
    options: {
      miniNavigationOverlay: false,
      webClient: withWebClient ? createClient() : undefined,
    },
  });

  const view = await withMicroscopyViewer(slideRotation, () =>
    viewport.setDisplaySets({ displaySetId: IMAGE_ID })
  );

  return { viewport, element, view };
}

/**
 * Mounts the slide again on a next WSI viewport that shows it, and returns
 * the view of the new map.
 */
export function remountNext(viewport, slideRotation = 0) {
  return withMicroscopyViewer(slideRotation, () =>
    viewport.setDisplaySets({ displaySetId: IMAGE_ID })
  );
}

/** Removes a mounted viewport and its element. */
export function unmount({ viewport, element }) {
  viewport.destroy?.();
  element.remove();
}
