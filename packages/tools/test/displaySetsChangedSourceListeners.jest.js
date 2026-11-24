import {
  cache,
  Enums,
  init,
  setRenderBackend,
  volumeLoader,
  displaySetRegistry,
} from '@cornerstonejs/core';
import {
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  jest,
} from '@jest/globals';
import { createPlanarViewportOnStandInEngine } from '../../core/test/utils/planarViewportOnStandInEngine';
import { resolveLabelmapRenderPlan } from '../src/tools/displayTools/Labelmap/labelmapRenderPlan';
import AdvancedMagnifyTool from '../src/tools/AdvancedMagnifyTool';
import CrosshairsTool from '../src/tools/CrosshairsTool';
import OrientationMarkerTool from '../src/tools/OrientationMarkerTool';
import VolumeCroppingTool from '../src/tools/VolumeCroppingTool';
import VolumeCroppingControlTool from '../src/tools/VolumeCroppingControlTool';

const { Events, OrientationAxis } = Enums;
const dimensions = [8, 8, 6];
const segmentationId = 'source-listeners-segmentation';
const labelmapVolumeId = 'source-listeners-labelmap';
const labelmapUID = `${segmentationId}-Labelmap-${segmentationId}-storage-0`;

/** Makes a 64 by 64 element in the document. */
function createElement() {
  const element = document.createElement('div');

  document.body.appendChild(element);
  ['offsetWidth', 'clientWidth', 'offsetHeight', 'clientHeight'].forEach(
    (key) => Object.defineProperty(element, key, { value: 64 })
  );
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width: 64, height: 64 }),
  });

  return element;
}

/**
 * Makes a local volume on the test grid and a display set of it, and gives
 * the id of the display set.
 */
function createSourceDisplaySet(volumeId) {
  const voxelCount = dimensions[0] * dimensions[1] * dimensions[2];

  volumeLoader.createLocalVolume(volumeId, {
    dimensions,
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    metadata: { Modality: 'CT', FrameOfReferenceUID: 'source-listeners' },
    scalarData: new Float32Array(voxelCount).map((_, index) => index),
  });

  const displaySetId = `display-set:${volumeId}`;

  displaySetRegistry.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });

  return displaySetId;
}

/** Mounts the labelmap of the test segmentation as an overlay of a viewport. */
async function mountLabelmap(viewport) {
  const voxelCount = dimensions[0] * dimensions[1] * dimensions[2];

  volumeLoader.createLocalVolume(labelmapVolumeId, {
    dimensions,
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    metadata: { Modality: 'SEG', FrameOfReferenceUID: 'source-listeners' },
    scalarData: new Uint8Array(voxelCount).fill(1),
  });

  const segmentation = {
    segmentationId,
    segments: { 1: { segmentIndex: 1, label: 'Segment 1', locked: false } },
    representationData: { Labelmap: { volumeId: labelmapVolumeId } },
  };

  await resolveLabelmapRenderPlan({
    viewport,
    segmentation,
    representation: { segmentationId, config: {} },
  }).mount({ labelMapData: segmentation.representationData.Labelmap });
}

/**
 * Hangs the DISPLAY_SETS_CHANGED listener of each of the five tools on an
 * element, as each tool does, with what the listener does on a source
 * change replaced by a spy. Gives the spies by tool.
 */
function listenWithTools(element, viewportInfo) {
  const crosshairs = new CrosshairsTool();
  const cropping = new VolumeCroppingTool();
  const croppingControl = new VolumeCroppingControlTool();
  const orientationMarker = new OrientationMarkerTool();
  const magnifyManager = new AdvancedMagnifyTool().magnifyViewportManager;

  crosshairs._syncVolumeListenersWithToolGroup = jest.fn();
  crosshairs._getViewportsInfo = jest.fn(() => []);
  crosshairs._computeToolCenter = jest.fn();
  element.addEventListener(Events.DISPLAY_SETS_CHANGED, (evt) =>
    crosshairs._onNewVolume(evt)
  );

  cropping._getViewportsInfo = jest.fn(() => [viewportInfo]);
  cropping._setHandlesInScene = jest.fn();
  cropping._initialize3DViewports = jest.fn();
  cropping._subscribeToViewportNewVolumeSet([viewportInfo]);

  croppingControl._getViewportsInfo = jest.fn(() => []);
  croppingControl._initializeViewports = jest.fn();
  croppingControl._subscribeToViewportNewVolumeSet([viewportInfo]);

  orientationMarker.initViewports = jest.fn();
  element.addEventListener(
    Events.DISPLAY_SETS_CHANGED,
    orientationMarker._onDisplaySetsChanged
  );

  magnifyManager._newImageCallback = jest.fn();
  magnifyManager._reset = jest.fn();
  magnifyManager._addSourceElementEventListener(element);

  return {
    teardown: () => {
      cropping._unsubscribeToViewportNewVolumeSet([viewportInfo]);
      croppingControl._unsubscribeToViewportNewVolumeSet([viewportInfo]);
      magnifyManager._removeSourceElementEventListener(element);
    },
    reactions: () => ({
      CrosshairsTool: crosshairs._computeToolCenter.mock.calls.length,
      VolumeCroppingTool: cropping._initialize3DViewports.mock.calls.length,
      VolumeCroppingControlTool:
        croppingControl._initializeViewports.mock.calls.length,
      OrientationMarkerTool: orientationMarker.initViewports.mock.calls.length,
      AdvancedMagnifyTool: magnifyManager._reset.mock.calls.length,
    }),
  };
}

describe('The tools that listen to DISPLAY_SETS_CHANGED for the source only', () => {
  let renderingEngine;
  let tools;

  beforeAll(() => {
    window.devicePixelRatio = 1;
    init({});
  });

  afterEach(() => {
    tools?.teardown();
    renderingEngine?.destroy();
    renderingEngine = undefined;
    setRenderBackend('auto');
    cache.purgeCache();
    displaySetRegistry.clear();
    document.body.innerHTML = '';
  });

  it('do not react when a labelmap is added to the viewport or removed from it, and react once when the source changes', async () => {
    setRenderBackend('cpu');

    let viewport;

    ({ renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
      createElement(),
      'source-listeners'
    ));
    renderingEngine.getViewport = () => viewport;

    const first = createSourceDisplaySet('source-listeners-first');
    const second = createSourceDisplaySet('source-listeners-second');
    const options = { orientation: OrientationAxis.AXIAL };
    const heard = [];

    await viewport.setDisplaySets({ displaySetId: first, options });
    viewport.element.addEventListener(Events.DISPLAY_SETS_CHANGED, (evt) =>
      heard.push({
        added: evt.detail.added,
        removed: evt.detail.removed,
        sourceChanged: evt.detail.sourceChanged,
      })
    );
    tools = listenWithTools(viewport.element, {
      viewportId: viewport.id,
      renderingEngineId: renderingEngine.id,
    });

    await mountLabelmap(viewport);
    viewport.removeDisplaySet(labelmapUID);

    const afterOverlay = tools.reactions();

    await viewport.setDisplaySets({ displaySetId: second, options });

    expect(heard).toEqual([
      { added: [labelmapUID], removed: [], sourceChanged: false },
      { added: [], removed: [labelmapUID], sourceChanged: false },
      { added: [second], removed: [first], sourceChanged: true },
    ]);
    expect(afterOverlay).toEqual({
      CrosshairsTool: 0,
      VolumeCroppingTool: 0,
      VolumeCroppingControlTool: 0,
      OrientationMarkerTool: 0,
      AdvancedMagnifyTool: 0,
    });
    expect(tools.reactions()).toEqual({
      CrosshairsTool: 1,
      VolumeCroppingTool: 1,
      VolumeCroppingControlTool: 1,
      OrientationMarkerTool: 1,
      AdvancedMagnifyTool: 1,
    });
  });
});
