import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import {
  cache,
  Enums,
  init,
  metaData,
  setRenderBackend,
  utilities,
  volumeLoader,
  displaySetRegistry,
} from '@cornerstonejs/core';
import {
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  beforeEach,
  jest,
} from '@jest/globals';
import VolumeViewport3D from '../../core/src/RenderingEngine/Viewports/Volume3D/viewport3D';
import renderingEngineCache from '../../core/src/RenderingEngine/renderingEngineCache';
import { createPlanarViewportOnStandInEngine } from '../../core/test/utils/planarViewportOnStandInEngine';
import getOrCreateImageVolume from '../src/utilities/segmentation/getOrCreateImageVolume';

const { OrientationAxis } = Enums;
const fullDimensions = [8, 8, 6];
const reducedDimensions = [4, 4, 3];
const displaySetId = 'volume-id-mounts:ct';
let fullVolumeId;
let reducedVolumeId;
let testIndex = 0;

/** Gives an element its size, as the browser would after layout. */
function setSize(element, width, height) {
  Object.defineProperty(element, 'offsetWidth', { value: width });
  Object.defineProperty(element, 'offsetHeight', { value: height });
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height }),
  });
}

/** Makes a 64 by 64 element in the document. */
function createElement() {
  const element = document.createElement('div');

  setSize(element, 64, 64);
  document.body.appendChild(element);

  return element;
}

/**
 * Makes a local volume of the cache on a grid, with the series module of
 * its images, so that its image ids form a volume (`isValidVolume`).
 */
function createVolume(volumeId, dimensions) {
  const voxelCount = dimensions[0] * dimensions[1] * dimensions[2];
  const spacing = fullDimensions.map((size, axis) => size / dimensions[axis]);
  const volume = volumeLoader.createLocalVolume(volumeId, {
    dimensions,
    spacing,
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    metadata: { Modality: 'CT', FrameOfReferenceUID: 'volume-id-mounts' },
    scalarData: new Float32Array(voxelCount).map((_, index) => index),
  });

  seriesImageIds.push(...volume.imageIds);

  return volume;
}

const seriesImageIds = [];

/**
 * The series module and the window of the images of the local volumes of
 * this file. With the window, a volume takes its first VOI from the metadata
 * and loads no image for it.
 */
function seriesMetadataProvider(type, imageId) {
  if (!seriesImageIds.includes(imageId)) {
    return;
  }

  if (type === 'generalSeriesModule') {
    return { modality: 'CT', seriesInstanceUID: 'volume-id-mounts' };
  }

  if (type === 'voiLutModule') {
    return { windowWidth: 400, windowCenter: 40 };
  }
}

/**
 * Makes a direct 3D viewport on a stand-in rendering engine with a vtk
 * renderer that draws nothing, since jsdom has no WebGL.
 */
function create3DViewportOnStandInEngine(element, viewportId) {
  const renderer = vtkRenderer.newInstance();
  let viewport;
  const renderingEngine = {
    id: utilities.uuidv4(),
    getRenderer: () => renderer,
    getViewports: () => (viewport ? [viewport] : []),
    renderViewport() {},
    destroy() {
      renderingEngineCache.delete(renderingEngine.id);
    },
  };

  renderingEngineCache.set(renderingEngine);
  viewport = new VolumeViewport3D({
    id: viewportId,
    element,
    renderingEngineId: renderingEngine.id,
    canvas: document.createElement('canvas'),
    sWidth: 64,
    sHeight: 64,
    defaultOptions: {},
  });

  return { renderingEngine, viewport };
}

describe('The volume id of a display set: one default, given at registration or on the mount', () => {
  const engines = [];

  /** A planar viewport, drawn on the CPU as jsdom has no WebGL. */
  function createPlanarViewport(viewportId) {
    const created = createPlanarViewportOnStandInEngine(
      createElement(),
      viewportId
    );

    engines.push(created.renderingEngine);

    return created.viewport;
  }

  /** A 3D viewport whose renderer draws nothing. */
  function create3DViewport(viewportId) {
    const created = create3DViewportOnStandInEngine(
      createElement(),
      viewportId
    );

    engines.push(created.renderingEngine);

    return created.viewport;
  }

  beforeAll(() => {
    window.devicePixelRatio = 1;
    init({});
    metaData.addProvider(seriesMetadataProvider, 10000);
  });

  beforeEach(() => {
    testIndex += 1;
    fullVolumeId = `volume-id-mounts:${testIndex}:full`;
    reducedVolumeId = `volume-id-mounts:${testIndex}:reduced`;
  });

  afterEach(() => {
    engines.splice(0).forEach((engine) => engine.destroy());
    setRenderBackend('auto');
    displaySetRegistry.clear();
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('shows a display set registered with a volumeId as a stack when the mount asks for nothing', async () => {
    setRenderBackend('cpu');
    const full = createVolume(fullVolumeId, fullDimensions);
    const viewport = createPlanarViewport('stack-with-volume-id');

    displaySetRegistry.add(displaySetId, {
      imageIds: full.imageIds,
      volumeId: fullVolumeId,
    });
    await viewport.setDisplaySets({ displaySetId });

    expect(viewport.getCurrentMode()).toBe('stack');
    expect(viewport.hasVolumeId(fullVolumeId)).toBe(false);
  });

  it('ignores the volumeId of the mount in stack mode', async () => {
    setRenderBackend('cpu');
    const full = createVolume(fullVolumeId, fullDimensions);

    createVolume(reducedVolumeId, reducedDimensions);

    const viewport = createPlanarViewport('stack-mode');

    displaySetRegistry.add(displaySetId, { imageIds: full.imageIds });
    await viewport.setDisplaySets({
      displaySetId,
      options: { mode: 'stack', volumeId: reducedVolumeId },
    });

    expect(viewport.getCurrentMode()).toBe('stack');
    expect(viewport.hasVolumeId(reducedVolumeId)).toBe(false);
    expect(viewport.getImageIds()).toEqual(full.imageIds);
  });

  it('gives the same default volume id to the planar viewport, the 3D viewport and the tools, which find one volume', async () => {
    setRenderBackend('cpu');
    const { imageIds } = createVolume(fullVolumeId, fullDimensions);
    const defaultVolumeId = utilities.getDefaultVolumeId(imageIds);

    expect(defaultVolumeId).toBe(
      `cornerstoneStreamingImageVolume:${cache.generateVolumeId(imageIds)}`
    );
    expect(utilities.getDefaultVolumeId([...imageIds].reverse())).toBe(
      defaultVolumeId
    );

    const toolsVolume = getOrCreateImageVolume(imageIds);

    expect(toolsVolume.volumeId).toBe(defaultVolumeId);

    const planar = createPlanarViewport('default-planar');
    const viewport3D = create3DViewport('default-3d');

    displaySetRegistry.add(displaySetId, { imageIds });
    await planar.setDisplaySets({ displaySetId, options: { mode: 'volume' } });
    await viewport3D.setDisplaySets({ displaySetId });

    expect(planar.getCurrentMode()).toBe('volume');
    expect(planar.getVolumeId()).toBe(defaultVolumeId);
    expect(viewport3D.getVolumeId()).toBe(defaultVolumeId);
    expect(getOrCreateImageVolume(imageIds)).toBe(toolsVolume);
    expect(cache.getVolume(defaultVolumeId)).toBe(toolsVolume);
  });

  it('lets the volumeId of the mount win over the volumeId of the registration, on a planar and on a 3D viewport', async () => {
    setRenderBackend('cpu');
    const full = createVolume(fullVolumeId, fullDimensions);

    createVolume(reducedVolumeId, reducedDimensions);

    const planar = createPlanarViewport('mount-wins-planar');
    const viewport3D = create3DViewport('mount-wins-3d');

    displaySetRegistry.add(displaySetId, {
      imageIds: full.imageIds,
      volumeId: fullVolumeId,
    });
    await planar.setDisplaySets({
      displaySetId,
      options: { mode: 'volume', volumeId: reducedVolumeId },
    });
    await viewport3D.setDisplaySets({
      displaySetId,
      options: { volumeId: reducedVolumeId },
    });

    expect(planar.getVolumeId()).toBe(reducedVolumeId);
    expect(viewport3D.getVolumeId()).toBe(reducedVolumeId);
  });

  it('mounts two volumes of one display set in two viewports through the volumeId of the mount', async () => {
    setRenderBackend('cpu');
    const full = createVolume(fullVolumeId, fullDimensions);

    createVolume(reducedVolumeId, reducedDimensions);

    const fullViewport = createPlanarViewport('two-volumes-full');
    const reducedViewport = createPlanarViewport('two-volumes-reduced');

    displaySetRegistry.add(displaySetId, {
      imageIds: full.imageIds,
      volumeId: fullVolumeId,
    });
    await fullViewport.setDisplaySets({
      displaySetId,
      options: { mode: 'volume', orientation: OrientationAxis.AXIAL },
    });
    await reducedViewport.setDisplaySets({
      displaySetId,
      options: {
        mode: 'volume',
        orientation: OrientationAxis.AXIAL,
        volumeId: reducedVolumeId,
      },
    });

    expect(fullViewport.getSourceDisplaySetId()).toBe(displaySetId);
    expect(reducedViewport.getSourceDisplaySetId()).toBe(displaySetId);
    expect(fullViewport.getVolumeId()).toBe(fullVolumeId);
    expect(reducedViewport.getVolumeId()).toBe(reducedVolumeId);
    expect(fullViewport.getImageData().dimensions).toEqual(fullDimensions);
    expect(reducedViewport.getImageData().dimensions).toEqual(
      reducedDimensions
    );
  });

  it('mounts a display set registered with a volumeId and no image ids on a planar and on a 3D viewport', async () => {
    setRenderBackend('cpu');
    const full = createVolume(fullVolumeId, fullDimensions);
    const planar = createPlanarViewport('volume-only-planar');
    const viewport3D = create3DViewport('volume-only-3d');

    displaySetRegistry.add(displaySetId, { volumeId: fullVolumeId });
    await planar.setDisplaySets({ displaySetId });
    await viewport3D.setDisplaySets({ displaySetId });

    expect(planar.getCurrentMode()).toBe('volume');
    expect(planar.getVolumeId()).toBe(fullVolumeId);
    expect(planar.getImageIds()).toEqual(full.imageIds);
    expect(viewport3D.getVolumeId()).toBe(fullVolumeId);
    await expect(
      planar.setDisplaySets({ displaySetId, options: { mode: 'stack' } })
    ).rejects.toThrow("mode 'stack'");
  });

  it('shows the volume with the default id for a mount that asks for a volume, also without a volumeId in the registration', async () => {
    setRenderBackend('cpu');
    const { imageIds } = createVolume(fullVolumeId, fullDimensions);
    const viewport = createPlanarViewport('volume-mode-default-id');

    getOrCreateImageVolume(imageIds);
    displaySetRegistry.add(displaySetId, { imageIds });
    await viewport.setDisplaySets({
      displaySetId,
      options: { mode: 'volume' },
    });

    expect(viewport.getCurrentMode()).toBe('volume');
    expect(viewport.getVolumeIds()).toEqual([
      utilities.getDefaultVolumeId(imageIds),
    ]);
  });
});
