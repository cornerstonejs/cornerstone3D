/**
 * Direct next planar viewports and local volumes for jest tests: a planar
 * viewport on a stand-in rendering engine with CPU rendering (jsdom has no
 * WebGL), and volumes whose images have an image plane module, as a DICOM
 * series of the volume would give it.
 */
import * as cornerstone3D from '../../src/index';
import PlanarViewport from '../../src/RenderingEngine/Viewports/Planar/PlanarViewport';
import renderingEngineCache from '../../src/RenderingEngine/renderingEngineCache';
import { displaySetRegistry } from '@cornerstonejs/metadata';

const { utilities, setRenderBackend, init, volumeLoader, metaData, Enums } =
  cornerstone3D;

function setSize(element, width, height) {
  Object.defineProperty(element, 'offsetWidth', { value: width });
  Object.defineProperty(element, 'offsetHeight', { value: height });
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height }),
  });
}

/**
 * Makes a direct next planar viewport of 64 by 64 pixels on its own stand-in
 * rendering engine with CPU rendering. Destroy it with `destroyViewport`.
 */
export function createCpuViewport(viewportId, defaultOptions = {}) {
  window.devicePixelRatio = 1;
  init({});
  setRenderBackend('cpu');

  const element = document.createElement('div');

  document.body.appendChild(element);
  setSize(element, 64, 64);

  const renderer = {
    getActiveCamera: () => ({ setParallelProjection() {} }),
    computeVisiblePropBounds: () => [1, -1, 1, -1, 1, -1],
    getViewProps: () => [],
  };
  let viewport;
  const renderingEngine = {
    id: utilities.uuidv4(),
    getRenderer: () => renderer,
    getViewports: () => (viewport ? [viewport] : []),
    renderViewport() {},
  };

  renderingEngineCache.set(renderingEngine);
  viewport = new PlanarViewport({
    id: viewportId,
    element,
    renderingEngineId: renderingEngine.id,
    canvas: document.createElement('canvas'),
    sWidth: 64,
    sHeight: 64,
    defaultOptions,
  });

  return viewport;
}

/** Destroys a viewport of `createCpuViewport` and its rendering engine. */
export function destroyViewport(viewport) {
  const { renderingEngineId, element } = viewport;

  viewport.destroy();
  renderingEngineCache.delete(renderingEngineId);
  element.remove();
}

function normalize(vector) {
  const length = Math.hypot(...vector);

  return vector.map((value) => value / length);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * A local volume of `dimensions` voxels (columns, rows, slices) of
 * `spacing`, whose rows run along `rowCosines` and columns along
 * `columnCosines` from `origin`, in the frame of reference
 * `frameOfReferenceUID`. Its images get an image plane module, and the
 * volume a display set of the same id.
 */
export function createLocalVolume(
  volumeId,
  {
    dimensions,
    spacing = [1, 1, 1],
    origin = [0, 0, 0],
    rowCosines = [1, 0, 0],
    columnCosines = [0, 1, 0],
    frameOfReferenceUID = 'cpuPlanarFrame',
  }
) {
  const row = normalize(rowCosines);
  const column = normalize(columnCosines);
  const scanAxis = cross(row, column);
  const volume = volumeLoader.createLocalVolume(volumeId, {
    dimensions,
    spacing,
    origin,
    direction: [...row, ...column, ...scanAxis],
    metadata: { Modality: 'CT', FrameOfReferenceUID: frameOfReferenceUID },
    scalarData: new Uint8Array(dimensions[0] * dimensions[1] * dimensions[2]),
  });
  const { imageIds } = volume;

  metaData.addProvider((type, imageId) => {
    const sliceIndex = imageIds.indexOf(imageId);

    if (type !== 'imagePlaneModule' || sliceIndex < 0) {
      return;
    }

    return {
      imageOrientationPatient: [...row, ...column],
      rowCosines: row,
      columnCosines: column,
      imagePositionPatient: origin.map(
        (value, axis) => value + scanAxis[axis] * spacing[2] * sliceIndex
      ),
      pixelSpacing: [spacing[1], spacing[0]],
      rowPixelSpacing: spacing[1],
      columnPixelSpacing: spacing[0],
      rows: dimensions[1],
      columns: dimensions[0],
      frameOfReferenceUID,
    };
  }, 20000);
  displaySetRegistry.add(volumeId, { imageIds, volumeId });

  return volume;
}

/**
 * Mounts the volume of a display set on a viewport in volume mode with the
 * options, and gives the NEW_IMAGE events that the mount fired.
 */
export async function mountVolume(viewport, displaySetId, options = {}) {
  const newImages = [];
  const onNewImage = (evt) => newImages.push(evt.detail);

  viewport.element.addEventListener(Enums.Events.NEW_IMAGE, onNewImage);

  try {
    await viewport.setDisplaySets({
      displaySetId,
      options: { mode: 'volume', ...options },
    });
  } finally {
    viewport.element.removeEventListener(Enums.Events.NEW_IMAGE, onNewImage);
  }

  return newImages;
}

/** Removes what the tests of these viewports leave behind. */
export function cleanUp() {
  setRenderBackend('auto');
  displaySetRegistry.clear();
  cornerstone3D.cache.purgeCache();
  metaData.removeAllProviders();
}
