import type { Types } from '@cornerstonejs/core';
import type { Types as csToolsTypes } from '@cornerstonejs/tools';
import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
  addCheckboxToToolbar,
  addManipulationBindings,
  getLocalUrl,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  CrosshairsTool,
  WindowLevelTool,
  ZoomTool,
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType } = Enums;

const volumeName = 'CT_VOLUME_ID';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:${volumeName}`;
const toolGroupId = 'CROSSHAIRS_BINDINGS_TOOLGROUP_ID';
const viewportId1 = 'CROSSHAIRS_BINDINGS_AXIAL';
const viewportId2 = 'CROSSHAIRS_BINDINGS_SAGITTAL';
const viewportId3 = 'CROSSHAIRS_BINDINGS_CORONAL';
const viewportIds = [viewportId1, viewportId2, viewportId3];
const renderingEngineId = 'crosshairsBindingsRenderingEngine';
let usePrimaryClickForCrosshairs = true;

setTitleAndDescription(
  'Crosshairs Binding Modes',
  'Demonstrates Crosshairs as a normal active tool binding. Use the toolbar checkbox to switch between Crosshairs on left click and Crosshairs on Shift plus left click while Window/Level stays on left click.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');

for (const element of [element1, element2, element3]) {
  element.style.width = size;
  element.style.height = size;
  element.oncontextmenu = (e) => e.preventDefault();
  viewportGrid.appendChild(element);
}

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
content.append(instructions);

function updateInstructions(usePrimaryClick: boolean) {
  const crosshairsBinding = usePrimaryClick
    ? 'Left click/drag anywhere in a viewport to move the center of the crosshairs.'
    : 'Shift + left click/drag anywhere in a viewport to move the center of the crosshairs.';
  const companionBinding = usePrimaryClick
    ? 'Right click zooms.'
    : 'Left click/drag applies Window/Level, and right click zooms.';

  instructions.innerText = `
  Basic controls:
  - ${crosshairsBinding}
  - ${companionBinding}
  - Drag a reference line to move it, scrolling the other views.
  - Toggle the toolbar checkbox to switch Crosshairs between primary click and Shift + primary click bindings.

  Advanced controls:
  - Square handle (closest to center): Drag to change slab thickness in that plane.
  - Circle handle (further from center): Drag to rotate the axes.
  `;
}

function applyCrosshairsBindings(
  toolGroup: csToolsTypes.IToolGroup,
  usePrimaryClick: boolean
) {
  // setToolActive merges bindings, so reset the tools that swap between demo modes.
  toolGroup.setToolDisabled(CrosshairsTool.toolName);
  toolGroup.setToolDisabled(WindowLevelTool.toolName);
  toolGroup.setToolDisabled(ZoomTool.toolName);

  if (usePrimaryClick) {
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Secondary }],
    });
    toolGroup.setToolActive(CrosshairsTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  } else {
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Secondary }],
    });
    toolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
    toolGroup.setToolActive(CrosshairsTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
          modifierKey: KeyboardBindings.Shift,
        },
      ],
    });
  }

  usePrimaryClickForCrosshairs = usePrimaryClick;
  updateInstructions(usePrimaryClick);
}

updateInstructions(usePrimaryClickForCrosshairs);

addButtonToToolbar({
  title: 'Reset Camera',
  onClick: () => {
    const viewport = getRenderingEngine(renderingEngineId).getViewport(
      viewportId1
    ) as Types.IVolumeViewport;

    viewport.resetCamera({
      resetPan: true,
      resetZoom: true,
      resetToCenter: true,
      resetRotation: true,
    });

    viewport.render();
  },
});

addCheckboxToToolbar({
  id: 'use-primary-click-for-crosshairs-bindings',
  title: 'Use Primary Click For Crosshairs',
  checked: usePrimaryClickForCrosshairs,
  onChange: (checked) => {
    usePrimaryClickForCrosshairs = checked;
    updateInstructions(checked);

    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    if (!toolGroup) {
      return;
    }

    applyCrosshairsBindings(toolGroup, checked);
  },
});

const viewportColors = {
  [viewportId1]: 'rgb(200, 0, 0)',
  [viewportId2]: 'rgb(200, 200, 0)',
  [viewportId3]: 'rgb(0, 200, 0)',
};

function getReferenceLineColor(viewportId) {
  return viewportColors[viewportId];
}

function getReferenceLineControllable() {
  return true;
}

function getReferenceLineDraggableRotatable() {
  return true;
}

function getReferenceLineSlabThicknessControlsOn() {
  return true;
}

async function run() {
  await initDemo();

  cornerstoneTools.addTool(CrosshairsTool);
  cornerstoneTools.addTool(WindowLevelTool);

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.setViewports([
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
  ]);

  volume.load();

  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId,
        callback: setCtTransferFunctionForVolumeActor,
      },
    ],
    viewportIds
  );

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);
  toolGroup.addTool(WindowLevelTool.toolName, { volumeId });

  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);
  toolGroup.addViewport(viewportId3, renderingEngineId);

  const isMobile = window.matchMedia('(any-pointer:coarse)').matches;

  toolGroup.addTool(CrosshairsTool.toolName, {
    getReferenceLineColor,
    getReferenceLineControllable,
    getReferenceLineDraggableRotatable,
    getReferenceLineSlabThicknessControlsOn,
    mobile: {
      enabled: isMobile,
      opacity: 0.8,
      handleRadius: 9,
    },
  });

  applyCrosshairsBindings(toolGroup, usePrimaryClickForCrosshairs);

  renderingEngine.renderViewports(viewportIds);
}

run();
