import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import {
  cache,
  Enums,
  init,
  setRenderBackend,
  utilities,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  jest,
} from '@jest/globals';
import VolumeViewport3D from '../../core/src/RenderingEngine/GenericViewport/Volume3D/viewport3D';
import renderingEngineCache from '../../core/src/RenderingEngine/renderingEngineCache';
import { createPlanarViewportOnStandInEngine } from '../../core/test/utils/planarViewportOnStandInEngine';
import { resolveLabelmapRenderPlan } from '../src/tools/displayTools/Labelmap/labelmapRenderPlan';
import { addLabelmapToPlanarGenericViewport } from '../src/tools/displayTools/Labelmap/labelmapRenderPlan/planarGenericVolumeLabelmap';
import { addLabelmapToVolume3DNextViewport } from '../src/tools/displayTools/Labelmap/labelmapRenderPlan/volume3DNextLabelmap';

jest.mock(
  '../src/tools/displayTools/Labelmap/labelmapRenderPlan/planarGenericVolumeLabelmap',
  () => {
    const actual = jest.requireActual(
      '../src/tools/displayTools/Labelmap/labelmapRenderPlan/planarGenericVolumeLabelmap'
    );

    return {
      ...actual,
      addLabelmapToPlanarGenericViewport: jest.fn(
        actual.addLabelmapToPlanarGenericViewport
      ),
    };
  }
);

jest.mock(
  '../src/tools/displayTools/Labelmap/labelmapRenderPlan/volume3DNextLabelmap',
  () => {
    const actual = jest.requireActual(
      '../src/tools/displayTools/Labelmap/labelmapRenderPlan/volume3DNextLabelmap'
    );

    return {
      ...actual,
      addLabelmapToVolume3DNextViewport: jest.fn(
        actual.addLabelmapToVolume3DNextViewport
      ),
    };
  }
);

const { BlendModes, OrientationAxis, ViewportType } = Enums;
const dimensions = [8, 8, 6];
const segmentationId = 'mount-proof-segmentation';
const sourceVolumeId = 'mount-proof-source';
const labelmapVolumeId = 'mount-proof-labelmap';

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
  document.body.innerHTML = '<div id="element"></div>';
  const element = document.getElementById('element');

  setSize(element, 64, 64);

  return element;
}

/**
 * Makes a local source volume and a labelmap volume on the same grid, and a
 * display set of the source.
 */
function createVolumes() {
  const voxelCount = dimensions[0] * dimensions[1] * dimensions[2];
  const geometry = {
    dimensions,
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    metadata: { Modality: 'CT', FrameOfReferenceUID: 'mount-proof-frame' },
  };

  volumeLoader.createLocalVolume(sourceVolumeId, {
    ...geometry,
    scalarData: new Float32Array(voxelCount).map((_, index) => index),
  });
  volumeLoader.createLocalVolume(labelmapVolumeId, {
    ...geometry,
    scalarData: new Uint8Array(voxelCount).fill(1),
  });

  const displaySetId = `display-set:${sourceVolumeId}`;

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: cache.getVolume(sourceVolumeId).imageIds,
    volumeId: sourceVolumeId,
  });

  return displaySetId;
}

/**
 * Makes a direct next 3D viewport on a stand-in rendering engine with a vtk
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

/** The Labelmap segmentation of the labelmap volume. */
function createSegmentation() {
  return {
    segmentationId,
    segments: { 1: { segmentIndex: 1, label: 'Segment 1', locked: false } },
    representationData: {
      Labelmap: { volumeId: labelmapVolumeId },
    },
  };
}

/** Resolves the render plan of the segmentation on a viewport and mounts it. */
async function mountLabelmap(viewport, blendMode) {
  const segmentation = createSegmentation();
  const renderPlan = resolveLabelmapRenderPlan({
    viewport,
    segmentation,
    representation: {
      segmentationId,
      config: blendMode === undefined ? {} : { blendMode },
    },
  });
  const mountResult = await renderPlan.mount({
    labelMapData: segmentation.representationData.Labelmap,
  });

  return { renderPlan, mountResult };
}

const labelmapRepresentationUID = `${segmentationId}-Labelmap-${segmentationId}-storage-0`;

describe('The volume labelmap mount on the next viewports', () => {
  let renderingEngine;

  beforeAll(() => {
    window.devicePixelRatio = 1;
    init({});
  });

  afterEach(() => {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    setRenderBackend('auto');
    cache.purgeCache();
    utilities.genericViewportDisplaySetMetadataProvider.clear();
    jest.clearAllMocks();
  });

  it.each([
    ['the default blend mode', undefined],
    ['edge projection', BlendModes.LABELMAP_EDGE_PROJECTION_BLEND],
  ])(
    'mounts the labelmap of a planar viewport in volume mode as an overlay display set, with %s',
    async (_name, blendMode) => {
      setRenderBackend('cpu');
      let viewport;

      ({ renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
        createElement(),
        'mount-proof-planar'
      ));

      const displaySetId = createVolumes();

      await viewport.setDisplaySets({
        displaySetId,
        options: { orientation: OrientationAxis.AXIAL },
      });

      expect(viewport.type).toBe(ViewportType.PLANAR_NEXT);
      expect(viewport.addVolumes).toBeUndefined();

      const { renderPlan, mountResult } = await mountLabelmap(
        viewport,
        blendMode
      );

      expect(renderPlan.renderMode).toBe('volume');
      expect(renderPlan.isVolumeImageMapper).toBe(false);
      expect(addLabelmapToPlanarGenericViewport).toHaveBeenCalledTimes(1);
      expect(addLabelmapToPlanarGenericViewport.mock.calls[0][0].viewport).toBe(
        viewport
      );
      expect(
        addLabelmapToPlanarGenericViewport.mock.calls[0][0].blendMode
      ).toBe(blendMode ?? BlendModes.MAXIMUM_INTENSITY_BLEND);
      expect(addLabelmapToVolume3DNextViewport).not.toHaveBeenCalled();
      expect(viewport.getDisplaySetRole(labelmapRepresentationUID)).toBe(
        'overlay'
      );
      expect(mountResult.uid).toBe(
        viewport
          .getActors()
          .find(
            (entry) => entry.representationUID === labelmapRepresentationUID
          ).uid
      );
    }
  );

  it.each([
    ['the default blend mode', undefined],
    ['edge projection', BlendModes.LABELMAP_EDGE_PROJECTION_BLEND],
  ])(
    'mounts the labelmap of a 3D viewport as an overlay display set, with %s',
    async (_name, blendMode) => {
      let viewport;

      ({ renderingEngine, viewport } = create3DViewportOnStandInEngine(
        createElement(),
        'mount-proof-3d'
      ));

      const displaySetId = createVolumes();

      await viewport.setDisplaySets({
        displaySetId,
        options: { renderMode: 'vtkVolume3d' },
      });

      expect(viewport.type).toBe(ViewportType.VOLUME_3D_NEXT);
      expect(viewport.addVolumes).toBeUndefined();

      const { renderPlan, mountResult } = await mountLabelmap(
        viewport,
        blendMode
      );

      expect(renderPlan.renderMode).toBe('volume');
      expect(renderPlan.isVolumeImageMapper).toBe(false);
      expect(addLabelmapToVolume3DNextViewport).toHaveBeenCalledTimes(1);
      expect(addLabelmapToVolume3DNextViewport.mock.calls[0][0].viewport).toBe(
        viewport
      );
      expect(addLabelmapToVolume3DNextViewport.mock.calls[0][0].blendMode).toBe(
        BlendModes.MAXIMUM_INTENSITY_BLEND
      );
      expect(addLabelmapToPlanarGenericViewport).not.toHaveBeenCalled();
      expect(mountResult.uid).toBe(
        viewport
          .getActors()
          .find(
            (entry) => entry.representationUID === labelmapRepresentationUID
          ).uid
      );
    }
  );
});
