import type { Types } from '@cornerstonejs/core';
import {
  CONSTANTS,
  Enums,
  getRenderingEngine,
  RenderingEngine,
  setVolumesForViewports,
  volumeLoader,
  setVolume3DTargetFps,
  setVolume3DTargetFpsEnabled,
  getVolume3DTargetFpsSnapshot,
  VOLUME_3D_DEFAULT_TARGET_FPS,
  VOLUME_3D_DEFAULT_INTERACTIVE_SAMPLE_DISTANCE_FACTOR,
  VOLUME_3D_MIN_TARGET_FPS,
  VOLUME_3D_MAX_TARGET_FPS,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addButtonToToolbar,
  addCheckboxToToolbar,
  addDropdownToToolbar,
  addSliderToToolbar,
  addManipulationBindings,
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ToolGroupManager } = cornerstoneTools;

const { ViewportType } = Enums;

// Define a unique id for the volume
let renderingEngine;
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const renderingEngineId = 'myRenderingEngine';

const viewportIds = {
  axial: 'CT_AXIAL',
  sagittal: 'CT_SAGITTAL',
  coronal: 'CT_CORONAL',
  volume3d: 'CT_3D',
};

/** Sampling Distance dropdown value (baseline multiplier). */
let sampleDistanceMultiplier = 1;

// ======== Set up page ======== //
setTitleAndDescription(
  '3D Volume Rendering with MPR',
  '2×2 layout: axial, sagittal, and coronal MPR plus a legacy VolumeViewport3D. Sampling Distance, presets, and Interactive fidelity degradation apply to the 3D viewport.'
);

const size = '400px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = '1fr 1fr';
viewportGrid.style.gridTemplateRows = '1fr 1fr';
viewportGrid.style.gap = '10px';
viewportGrid.style.width = '820px';
viewportGrid.style.height = '820px';

function createViewportElement(): HTMLDivElement {
  const element = document.createElement('div');
  element.oncontextmenu = () => false;
  element.style.width = size;
  element.style.height = size;
  element.style.border = '1px solid #ccc';
  return element;
}

function createLabeledContainer(
  labelText: string,
  element: HTMLDivElement
): HTMLDivElement {
  const container = document.createElement('div');
  const label = document.createElement('div');
  label.textContent = labelText;
  label.style.textAlign = 'center';
  label.style.fontWeight = 'bold';
  label.style.marginBottom = '5px';
  container.appendChild(label);
  container.appendChild(element);
  return container;
}

const elementAxial = createViewportElement();
const elementSagittal = createViewportElement();
const elementCoronal = createViewportElement();
const element3D = createViewportElement();

const volume3dWrapper = document.createElement('div');
volume3dWrapper.style.position = 'relative';
volume3dWrapper.style.width = size;
volume3dWrapper.style.height = size;
volume3dWrapper.appendChild(element3D);

const targetFpsOverlay = document.createElement('pre');
targetFpsOverlay.id = 'target-fps-overlay';
targetFpsOverlay.style.display = 'none';
targetFpsOverlay.style.position = 'absolute';
targetFpsOverlay.style.top = 'auto';
targetFpsOverlay.style.bottom = '8px';
targetFpsOverlay.style.left = '8px';
targetFpsOverlay.style.margin = '0';
targetFpsOverlay.style.padding = '8px 10px';
targetFpsOverlay.style.background = 'rgba(0, 0, 0, 0.72)';
targetFpsOverlay.style.color = '#e8e8e8';
targetFpsOverlay.style.font =
  '12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
targetFpsOverlay.style.borderRadius = '4px';
targetFpsOverlay.style.pointerEvents = 'none';
targetFpsOverlay.style.zIndex = '2';
targetFpsOverlay.style.whiteSpace = 'pre';
volume3dWrapper.appendChild(targetFpsOverlay);

const volume3dContainer = document.createElement('div');
const volume3dLabel = document.createElement('div');
volume3dLabel.textContent = '3D';
volume3dLabel.style.textAlign = 'center';
volume3dLabel.style.fontWeight = 'bold';
volume3dLabel.style.marginBottom = '5px';
volume3dContainer.appendChild(volume3dLabel);
volume3dContainer.appendChild(volume3dWrapper);

viewportGrid.appendChild(createLabeledContainer('Axial', elementAxial));
viewportGrid.appendChild(volume3dContainer);
viewportGrid.appendChild(createLabeledContainer('Coronal', elementCoronal));
viewportGrid.appendChild(createLabeledContainer('Sagittal', elementSagittal));

content.appendChild(viewportGrid);

let targetFpsOverlayRaf = 0;

function formatBudgetPx(pixels: number): string {
  if (pixels >= 1_000_000) {
    return `${(pixels / 1_000_000).toFixed(2)}M`;
  }
  if (pixels >= 1_000) {
    return `${Math.round(pixels / 1_000)}k`;
  }
  return `${Math.round(pixels)}`;
}

function renderTargetFpsOverlay(): void {
  const snapshot = getVolume3DTargetFpsSnapshot(viewportIds.volume3d);
  const sampleText =
    snapshot && snapshot.sampleDistance > 0
      ? snapshot.sampleDistance.toFixed(3)
      : '—';

  if (snapshot?.enabled) {
    const emaFpsText = snapshot.emaMs > 0 ? snapshot.emaFps.toFixed(1) : '—';
    targetFpsOverlay.textContent = [
      `Target FPS  ${snapshot.targetFps}  (${snapshot.targetMs.toFixed(1)} ms)`,
      `EMA FPS     ${emaFpsText}`,
      `Phase       ${snapshot.phase}`,
      `Budget      ${formatBudgetPx(snapshot.budgetPx)} / ${formatBudgetPx(snapshot.maxPx)} px`,
      `LOD         steps ${snapshot.steps}  sample ${sampleText}  scale ${snapshot.scale.toFixed(2)}`,
      `Drag frames ${snapshot.dragFrames}`,
    ].join('\n');
    return;
  }

  const interacting = snapshot?.interacting === true;
  const factor = interacting
    ? VOLUME_3D_DEFAULT_INTERACTIVE_SAMPLE_DISTANCE_FACTOR
    : 1;
  targetFpsOverlay.textContent = [
    `LOD         fixedSampleDistance`,
    `Multiplier  ${sampleDistanceMultiplier}`,
    `Factor      ×${factor}${interacting ? ' (drag)' : ' (idle)'}`,
    `Sample      ${sampleText}`,
  ].join('\n');
}

function startTargetFpsOverlay(): void {
  targetFpsOverlay.style.display = 'block';
  const tick = () => {
    renderTargetFpsOverlay();
    targetFpsOverlayRaf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(targetFpsOverlayRaf);
  targetFpsOverlayRaf = requestAnimationFrame(tick);
}

const instructions = document.createElement('p');
instructions.innerText =
  'MPR: pan/zoom/scroll. 3D: click and drag to rotate (pan/zoom with other mouse buttons). Sampling Distance, presets, and Interactive fidelity degradation apply to the 3D viewport only. During 3D drag a fixed ×2 sample-distance factor applies unless IFD is enabled.';

content.append(instructions);

addButtonToToolbar({
  title: 'Apply random rotation',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(
      viewportIds.volume3d
    ) as Types.IVolumeViewport;
    viewport.setViewPresentation({ rotation: Math.random() * 360 });
    viewport.render();
  },
});
addDropdownToToolbar({
  options: {
    values: CONSTANTS.VIEWPORT_PRESETS.map((preset) => preset.name),
    defaultValue: 'CT-Bone',
  },
  onSelectedValueChange: (presetName) => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(viewportIds.volume3d);
    viewport.setProperties({ preset: presetName as string });
    viewport.render();
  },
});

addDropdownToToolbar({
  options: {
    values: Array.from({ length: 16 }, (_, i) => i + 1), // [1, 2, ..., 16]
    defaultValue: 1,
  },
  onSelectedValueChange: (value) => {
    sampleDistanceMultiplier = Number(value);
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(viewportIds.volume3d);
    viewport.setProperties({
      sampleDistanceMultiplier,
    });
    viewport.render();
  },
});

const toolbar = document.getElementById('demo-toolbar');

const fidelityRow = document.createElement('div');
fidelityRow.style.display = 'flex';
fidelityRow.style.alignItems = 'center';
fidelityRow.style.gap = '8px';
fidelityRow.style.marginTop = '8px';
fidelityRow.style.flexWrap = 'wrap';
toolbar?.appendChild(fidelityRow);

addCheckboxToToolbar({
  id: 'interactive-fidelity-enabled',
  title: 'Interactive fidelity degradation',
  container: fidelityRow,
  onChange: (checked) => {
    setVolume3DTargetFpsEnabled(viewportIds.volume3d, checked);
    const fpsSlider = document.getElementById(
      'interactive-fidelity-fps'
    ) as HTMLInputElement | null;
    if (fpsSlider) {
      fpsSlider.disabled = !checked;
    }
    const renderingEngine = getRenderingEngine(renderingEngineId);
    renderingEngine?.getViewport(viewportIds.volume3d)?.render();
  },
});

// Helper sets checked="false" as an attribute, which HTML still treats as checked.
(
  document.getElementById('interactive-fidelity-enabled') as HTMLInputElement
).checked = false;

addSliderToToolbar({
  id: 'interactive-fidelity-fps',
  title: `Target FPS: ${VOLUME_3D_DEFAULT_TARGET_FPS}`,
  range: [VOLUME_3D_MIN_TARGET_FPS, VOLUME_3D_MAX_TARGET_FPS],
  defaultValue: VOLUME_3D_DEFAULT_TARGET_FPS,
  container: fidelityRow,
  onSelectedValueChange: (value) => {
    const fps = Number(value);
    setVolume3DTargetFps(viewportIds.volume3d, fps);
    const renderingEngine = getRenderingEngine(renderingEngineId);
    renderingEngine?.getViewport(viewportIds.volume3d)?.render();
  },
  updateLabelOnChange: (value, label) => {
    label.innerHTML = `Target FPS: ${value}`;
  },
});

// Target FPS slider starts disabled while Interactive fidelity degradation is off.
const fpsSliderEl = document.getElementById(
  'interactive-fidelity-fps'
) as HTMLInputElement | null;
if (fpsSliderEl) {
  fpsSliderEl.disabled = true;
}

// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroupIdMpr = 'TOOL_GROUP_MPR';
  const toolGroupId3d = 'TOOL_GROUP_3D';

  const toolGroupMpr = ToolGroupManager.createToolGroup(toolGroupIdMpr);
  const toolGroup3d = ToolGroupManager.createToolGroup(toolGroupId3d);

  addManipulationBindings(toolGroupMpr);
  addManipulationBindings(toolGroup3d, {
    is3DViewport: true,
  });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.367700692008930469189923116409',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputArray = [
    {
      viewportId: viewportIds.axial,
      type: ViewportType.ORTHOGRAPHIC,
      element: elementAxial,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: viewportIds.sagittal,
      type: ViewportType.ORTHOGRAPHIC,
      element: elementSagittal,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportIds.coronal,
      type: ViewportType.ORTHOGRAPHIC,
      element: elementCoronal,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
    {
      viewportId: viewportIds.volume3d,
      type: ViewportType.VOLUME_3D,
      element: element3D,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: CONSTANTS.BACKGROUND_COLORS.slicer3D,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroupMpr.addViewport(viewportIds.axial, renderingEngineId);
  toolGroupMpr.addViewport(viewportIds.sagittal, renderingEngineId);
  toolGroupMpr.addViewport(viewportIds.coronal, renderingEngineId);
  toolGroup3d.addViewport(viewportIds.volume3d, renderingEngineId);

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();
  const viewport3d = renderingEngine.getViewport(viewportIds.volume3d);

  const allViewportIds = [
    viewportIds.axial,
    viewportIds.sagittal,
    viewportIds.coronal,
    viewportIds.volume3d,
  ];

  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    allViewportIds
  ).then(() => {
    viewport3d.setProperties({
      preset: 'CT-Bone',
    });
    setVolume3DTargetFps(viewportIds.volume3d, VOLUME_3D_DEFAULT_TARGET_FPS);
    setVolume3DTargetFpsEnabled(viewportIds.volume3d, false);
    startTargetFpsOverlay();
    renderingEngine.renderViewports(allViewportIds);
  });
}

run();
