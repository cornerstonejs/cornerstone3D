import type {
  PlanarViewport,
  GenericVolumeViewport3D,
  Types,
} from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  CONSTANTS,
  getRenderingEngine,
  utilities,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addManipulationBindings,
  addDropdownToToolbar,
  addToggleButtonToToolbar,
  addButtonToToolbar,
  ctVoiRange,
  getLocalUrl,
} from '../../../../utils/demo/helpers';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  CrosshairsTool,
  WindowLevelTool,
  StackScrollTool,
  MagnifyTool,
  ScaleOverlayTool,
  ReferenceCursors,
  PanTool,
  ZoomTool,
  Enums: csToolsEnums,
  utilities: csToolsUtilities,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType, OrientationAxis } = Enums;

const LOG = 'GenericViewportShowcase:';

// ----------------------------------------------------------------------------
// Identifiers
// ----------------------------------------------------------------------------
const renderingEngineId = 'NEXT_SHOWCASE_ENGINE';

const acqViewportId = 'NEXT_SHOWCASE_ACQUISITION';
const axialViewportId = 'NEXT_SHOWCASE_MPR_AXIAL';
const sagittalViewportId = 'NEXT_SHOWCASE_MPR_SAGITTAL';
const coronalViewportId = 'NEXT_SHOWCASE_MPR_CORONAL';
const volume3dViewportId = 'NEXT_SHOWCASE_VR';

const mprViewportIds = [axialViewportId, sagittalViewportId, coronalViewportId];

// The three MPR viewports must share a single display-set id so the migrated
// Crosshairs tool recognises them as "the same scene" (it compares the view
// reference dataId, not a legacy actorUID).
const acqDataId = 'next-showcase:acquisition';
const mprDataId = 'next-showcase:volume-mpr';
const volume3dDataId = 'next-showcase:volume-3d';

const volumeId = 'cornerstoneStreamingImageVolume:NEXT_SHOWCASE_CT';

const acqToolGroupId = 'NEXT_SHOWCASE_ACQ_TOOLGROUP';
const mprToolGroupId = 'NEXT_SHOWCASE_MPR_TOOLGROUP';
const vr3dToolGroupId = 'NEXT_SHOWCASE_VR_TOOLGROUP';

const defaultPresetName = 'CT-Bone';

const viewportColors = {
  [axialViewportId]: 'rgb(200, 0, 0)',
  [sagittalViewportId]: 'rgb(200, 200, 0)',
  [coronalViewportId]: 'rgb(0, 200, 0)',
};

// ----------------------------------------------------------------------------
// Page chrome
// ----------------------------------------------------------------------------
setTitleAndDescription(
  'GenericViewport (next) Showcase',
  [
    'A single example that exercises everything migrated to the native next API:',
    'planar acquisition rendering, volume MPR (axial/sagittal/coronal PlanarViewport),',
    'native 3D volume rendering, plus Crosshairs, Cine, Reference Cursors, Magnify,',
    'Scale Overlay and Window Level - all running on GenericViewports.',
  ].join(' ')
);

const content = document.getElementById('content');

const grid = document.createElement('div');
grid.style.display = 'flex';
grid.style.flexWrap = 'wrap';
grid.style.gap = '8px';
grid.style.marginTop = '8px';
content.appendChild(grid);

const VIEWPORT_SIZE_PX = 340;

/**
 * Builds a labelled viewport panel and returns its render element.
 */
function createViewportPanel(
  title: string,
  viewportId: string,
  background: string
): HTMLDivElement {
  const panel = document.createElement('div');
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.gap = '4px';

  const heading = document.createElement('div');
  heading.innerText = title;
  heading.style.fontWeight = '600';
  heading.style.fontSize = '13px';
  panel.appendChild(heading);

  const element = document.createElement('div');
  element.id = viewportId;
  element.style.width = `${VIEWPORT_SIZE_PX}px`;
  element.style.height = `${VIEWPORT_SIZE_PX}px`;
  element.style.background = background;
  element.oncontextmenu = (e) => e.preventDefault();
  panel.appendChild(element);

  grid.appendChild(panel);

  return element;
}

const acqElement = createViewportPanel(
  'Acquisition (PlanarViewport stack)',
  acqViewportId,
  'rgb(10, 10, 20)'
);
const axialElement = createViewportPanel(
  'MPR Axial (PlanarViewport volume)',
  axialViewportId,
  'rgb(20, 0, 0)'
);
const sagittalElement = createViewportPanel(
  'MPR Sagittal (PlanarViewport volume)',
  sagittalViewportId,
  'rgb(20, 20, 0)'
);
const coronalElement = createViewportPanel(
  'MPR Coronal (PlanarViewport volume)',
  coronalViewportId,
  'rgb(0, 20, 0)'
);
const volume3dElement = createViewportPanel(
  'Volume 3D (native VR)',
  volume3dViewportId,
  'rgb(15, 0, 25)'
);

// ----------------------------------------------------------------------------
// Viewport accessors
// ----------------------------------------------------------------------------
function getViewport<T>(viewportId: string): T {
  return getRenderingEngine(renderingEngineId).getViewport(viewportId) as T;
}

function getAcqViewport(): PlanarViewport {
  return getViewport<PlanarViewport>(acqViewportId);
}

function getMprViewports(): PlanarViewport[] {
  return mprViewportIds.map((id) => getViewport<PlanarViewport>(id));
}

function getVolume3dViewport(): GenericVolumeViewport3D {
  return getViewport<GenericVolumeViewport3D>(volume3dViewportId);
}

function renderAll(): void {
  getRenderingEngine(renderingEngineId).render();
}

// ----------------------------------------------------------------------------
// Crosshairs reference-line configuration
// ----------------------------------------------------------------------------
function getReferenceLineColor(viewportId: string): string {
  return viewportColors[viewportId] || 'rgb(200, 200, 200)';
}

function getReferenceLineControllable(): boolean {
  return true;
}

function getReferenceLineDraggableRotatable(): boolean {
  // Must be true for the crosshairs to be interactive: it gates both the
  // reference-line grab (drag-to-translate, which reslices the other MPR
  // viewports - the "jump") and the center gap. Rotation drag itself is a
  // no-op on native PLANAR_NEXT (the tool gates OPERATION.ROTATE off for
  // GenericViewports), so the rotation handles render but are inert for now.
  return true;
}

function getReferenceLineSlabThicknessControlsOn(): boolean {
  // Slab-thickness handles stay off: slab control is not supported on native
  // PLANAR_NEXT yet.
  return false;
}

// ----------------------------------------------------------------------------
// 3D volume-rendering preset handling
// ----------------------------------------------------------------------------
function applyVolumeRenderingPreset(presetName: string): void {
  const viewport = getVolume3dViewport();
  const preset = CONSTANTS.VIEWPORT_PRESETS.find(
    ({ name }) => name === presetName
  );
  const actorEntry = viewport.getDefaultActor();

  if (!preset || !actorEntry?.actor) {
    console.warn(`${LOG} could not apply 3D preset ${presetName}`);
    return;
  }

  utilities.applyPreset(actorEntry.actor as never, preset);
  viewport.render();
  console.log(`${LOG} applied 3D preset ${presetName}`);
}

// ----------------------------------------------------------------------------
// Toolbar - primary tool selectors
// ----------------------------------------------------------------------------
const acqPrimaryTools = [
  WindowLevelTool.toolName,
  MagnifyTool.toolName,
  PanTool.toolName,
  ZoomTool.toolName,
  StackScrollTool.toolName,
];
let currentAcqPrimaryTool = acqPrimaryTools[0];

addDropdownToToolbar({
  options: {
    values: acqPrimaryTools,
    defaultValue: currentAcqPrimaryTool,
  },
  labelText: 'Acquisition tool: ',
  onSelectedValueChange: (selectedValue) => {
    const toolGroup = ToolGroupManager.getToolGroup(acqToolGroupId);
    toolGroup.setToolPassive(currentAcqPrimaryTool);
    toolGroup.setToolActive(selectedValue as string, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
    currentAcqPrimaryTool = selectedValue as string;
    console.log(`${LOG} acquisition primary tool -> ${selectedValue}`);
  },
});

const mprPrimaryTools = [
  CrosshairsTool.toolName,
  WindowLevelTool.toolName,
  ReferenceCursors.toolName,
  PanTool.toolName,
  ZoomTool.toolName,
];
let currentMprPrimaryTool = mprPrimaryTools[0];

addDropdownToToolbar({
  options: {
    values: mprPrimaryTools,
    defaultValue: currentMprPrimaryTool,
  },
  labelText: 'MPR tool: ',
  onSelectedValueChange: (selectedValue) => {
    const toolGroup = ToolGroupManager.getToolGroup(mprToolGroupId);
    toolGroup.setToolPassive(currentMprPrimaryTool);
    toolGroup.setToolActive(selectedValue as string, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
    currentMprPrimaryTool = selectedValue as string;
    console.log(`${LOG} MPR primary tool -> ${selectedValue}`);
  },
});

// ----------------------------------------------------------------------------
// Toolbar - 3D preset selector
// ----------------------------------------------------------------------------
addDropdownToToolbar({
  options: {
    values: [
      'CT-Bone',
      'CT-AAA',
      'CT-Soft-Tissue',
      'CT-Lung',
      'CT-MIP',
      'CT-Cardiac',
    ],
    defaultValue: defaultPresetName,
  },
  labelText: '3D preset: ',
  onSelectedValueChange: (selectedValue) => {
    applyVolumeRenderingPreset(selectedValue as string);
  },
});

// ----------------------------------------------------------------------------
// Toolbar - Cine toggle (acquisition stack)
// ----------------------------------------------------------------------------
addToggleButtonToToolbar({
  title: 'Cine (acquisition)',
  defaultToggle: false,
  onClick: (toggle) => {
    const element = getAcqViewport().element;
    if (toggle) {
      csToolsUtilities.cine.playClip(element, {
        framesPerSecond: 20,
        loop: true,
      });
      console.log(`${LOG} cine started on acquisition viewport`);
    } else {
      csToolsUtilities.cine.stopClip(element);
      console.log(`${LOG} cine stopped on acquisition viewport`);
    }
  },
});

// ----------------------------------------------------------------------------
// Toolbar - Scale Overlay toggle (acquisition + MPR)
// ----------------------------------------------------------------------------
addToggleButtonToToolbar({
  title: 'Scale Overlay',
  defaultToggle: false,
  onClick: (toggle) => {
    [acqToolGroupId, mprToolGroupId].forEach((toolGroupId) => {
      const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
      if (toggle) {
        toolGroup.setToolEnabled(ScaleOverlayTool.toolName);
      } else {
        toolGroup.setToolDisabled(ScaleOverlayTool.toolName);
      }
    });
    renderAll();
    console.log(`${LOG} scale overlay ${toggle ? 'enabled' : 'disabled'}`);
  },
});

// ----------------------------------------------------------------------------
// Toolbar - Reset all viewports
// ----------------------------------------------------------------------------
addButtonToToolbar({
  title: 'Reset All',
  onClick: () => {
    getAcqViewport().resetViewState();
    getMprViewports().forEach((viewport) => viewport.resetViewState());
    getVolume3dViewport().resetViewState();
    renderAll();
    console.log(`${LOG} reset all viewports`);
  },
});

// ----------------------------------------------------------------------------
// Run
// ----------------------------------------------------------------------------
async function run() {
  await initDemo();

  cornerstoneTools.addTool(CrosshairsTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(MagnifyTool);
  cornerstoneTools.addTool(ScaleOverlayTool);
  cornerstoneTools.addTool(ReferenceCursors);

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const middleImageIndex = Math.floor(imageIds.length / 2);

  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.enableElement({
    viewportId: acqViewportId,
    type: ViewportType.PLANAR_NEXT,
    element: acqElement,
    defaultOptions: {
      background: [0.04, 0.04, 0.08] as Types.Point3,
    },
  });
  renderingEngine.enableElement({
    viewportId: axialViewportId,
    type: ViewportType.PLANAR_NEXT,
    element: axialElement,
    defaultOptions: {
      orientation: OrientationAxis.AXIAL,
      background: [0.08, 0, 0] as Types.Point3,
    },
  });
  renderingEngine.enableElement({
    viewportId: sagittalViewportId,
    type: ViewportType.PLANAR_NEXT,
    element: sagittalElement,
    defaultOptions: {
      orientation: OrientationAxis.SAGITTAL,
      background: [0.08, 0.08, 0] as Types.Point3,
    },
  });
  renderingEngine.enableElement({
    viewportId: coronalViewportId,
    type: ViewportType.PLANAR_NEXT,
    element: coronalElement,
    defaultOptions: {
      orientation: OrientationAxis.CORONAL,
      background: [0, 0.08, 0] as Types.Point3,
    },
  });
  renderingEngine.enableElement({
    viewportId: volume3dViewportId,
    type: ViewportType.VOLUME_3D_NEXT,
    element: volume3dElement,
    defaultOptions: {
      orientation: OrientationAxis.CORONAL,
      background: [0.06, 0, 0.1] as Types.Point3,
    },
  });

  // --------------------------------------------------------------------------
  // Register display-set metadata
  // --------------------------------------------------------------------------
  utilities.genericViewportDataSetMetadataProvider.add(acqDataId, {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: middleImageIndex,
  });
  utilities.genericViewportDataSetMetadataProvider.add(mprDataId, {
    imageIds,
    kind: 'planar',
    volumeId,
    initialImageIdIndex: middleImageIndex,
  });
  utilities.genericViewportDataSetMetadataProvider.add(volume3dDataId, {
    imageIds,
    volumeId,
  });

  // --------------------------------------------------------------------------
  // Mount display sets
  // --------------------------------------------------------------------------
  const acqViewport = getAcqViewport();
  await acqViewport.setDisplaySets({
    displaySetId: acqDataId,
    options: {},
  });
  acqViewport.setDisplaySetPresentation(acqDataId, { voiRange: ctVoiRange });
  acqViewport.render();
  console.log(`${LOG} acquisition viewport mounted (stack render path)`);

  const [axialViewport, sagittalViewport, coronalViewport] = getMprViewports();
  await Promise.all([
    axialViewport.setDisplaySets({
      displaySetId: mprDataId,
      options: { orientation: OrientationAxis.AXIAL },
    }),
    sagittalViewport.setDisplaySets({
      displaySetId: mprDataId,
      options: { orientation: OrientationAxis.SAGITTAL },
    }),
    coronalViewport.setDisplaySets({
      displaySetId: mprDataId,
      options: { orientation: OrientationAxis.CORONAL },
    }),
  ]);
  getMprViewports().forEach((viewport) => {
    viewport.setDisplaySetPresentation(mprDataId, { voiRange: ctVoiRange });
    viewport.render();
  });
  console.log(`${LOG} MPR viewports mounted (axial/sagittal/coronal volume)`);

  const volume3dViewport = getVolume3dViewport();
  await volume3dViewport.setDisplaySets({
    displaySetId: volume3dDataId,
    options: { renderMode: 'vtkVolume3d' },
  });
  volume3dViewport.setDisplaySetPresentation(volume3dDataId, {
    sampleDistanceMultiplier: 1,
  });
  applyVolumeRenderingPreset(defaultPresetName);
  volume3dViewport.render();
  console.log(`${LOG} 3D VR viewport mounted`);

  // --------------------------------------------------------------------------
  // Acquisition tool group (window level / magnify / scale overlay / cine)
  // --------------------------------------------------------------------------
  const acqToolGroup = ToolGroupManager.createToolGroup(acqToolGroupId);
  addManipulationBindings(acqToolGroup);
  acqToolGroup.addTool(WindowLevelTool.toolName);
  acqToolGroup.addTool(MagnifyTool.toolName);
  acqToolGroup.addTool(ScaleOverlayTool.toolName);
  acqToolGroup.addViewport(acqViewportId, renderingEngineId);
  acqToolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  // --------------------------------------------------------------------------
  // MPR tool group (crosshairs / reference cursors / window level)
  // --------------------------------------------------------------------------
  const mprToolGroup = ToolGroupManager.createToolGroup(mprToolGroupId);
  addManipulationBindings(mprToolGroup);
  mprToolGroup.addTool(WindowLevelTool.toolName, { volumeId });
  mprToolGroup.addTool(ScaleOverlayTool.toolName);
  mprToolGroup.addTool(ReferenceCursors.toolName);
  mprToolGroup.addTool(CrosshairsTool.toolName, {
    getReferenceLineColor,
    getReferenceLineControllable,
    getReferenceLineDraggableRotatable,
    getReferenceLineSlabThicknessControlsOn,
  });
  mprViewportIds.forEach((id) =>
    mprToolGroup.addViewport(id, renderingEngineId)
  );
  mprToolGroup.setToolActive(CrosshairsTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  console.log(`${LOG} crosshairs active across MPR viewports`);

  // --------------------------------------------------------------------------
  // 3D tool group (trackball rotate / pan / zoom)
  // --------------------------------------------------------------------------
  const vr3dToolGroup = ToolGroupManager.createToolGroup(vr3dToolGroupId);
  addManipulationBindings(vr3dToolGroup, { is3DViewport: true });
  vr3dToolGroup.addViewport(volume3dViewportId, renderingEngineId);
  console.log(`${LOG} 3D trackball rotate active on VR viewport`);

  // Cine prefetch so stack scrolling/cine stays smooth.
  csToolsUtilities.stackPrefetch.enable(acqViewport.element);

  renderAll();
  console.log(`${LOG} ready`);
}

run();
