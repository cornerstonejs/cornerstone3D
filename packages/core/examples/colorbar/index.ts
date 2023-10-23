import vtkColormaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import {
  RenderingEngine,
  Types,
  Enums,
  cache,
  volumeLoader,
  getRenderingEngine,
  ui,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setCtTransferFunctionForVolumeActor,
  setPetColorMapTransferFunctionForVolumeActor,
  setTitleAndDescription,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

const { ViewportColorBar } = ui.widgets.colorbar;
const { ColorBarScalePosition } = ui.widgets.colorbar.Enums;

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  WindowLevelTool,
  StackScrollMouseWheelTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings, KeyboardBindings } = csToolsEnums;
const renderingEngineId = 'myRenderingEngine';
const toolGroupIds = new Set<string>();
const colorBarWidth = 20; // px
const imageIdsCache = new Map<string, string[]>();

const wadoRsRoot = 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb';
const StudyInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';

const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const ctVolumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`; // VolumeId with loader id + volume id

// Define a unique id for the volume
const ptVolumeName = 'PT_VOLUME_ID';
const ptVolumeId = `${volumeLoaderScheme}:${ptVolumeName}`;

const colormaps = vtkColormaps.rgbPresetNames.map(
  (presetName) => vtkColormaps.getPresetByName(presetName) as Colormap
);
let currentPTColormapName = 'Black-Body Radiation';

const viewportsInfo = [
  {
    toolGroupId: 'STACK_TOOLGROUP_ID',
    fusion: false,
    colorBar: {
      position: 'right',
      instances: [],
    },
    viewportInput: {
      viewportId: 'CT_STACK_AXIAL',
      type: ViewportType.STACK,
      element: null,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  },
  {
    volumeIds: [ctVolumeId, ptVolumeId],
    toolGroupId: 'VOLUME_TOOLGROUP_ID',
    fusion: true,
    colorBar: {
      position: 'right',
      instances: [],
    },
    viewportInput: {
      viewportId: 'CT_VOLUME_SAGITTAL',
      type: ViewportType.ORTHOGRAPHIC,
      element: null,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  },
  {
    volumeIds: [ctVolumeId, ptVolumeId],
    toolGroupId: 'VOLUME_TOOLGROUP_ID',
    fusion: true,
    colorBar: {
      position: 'right',
      instances: [],
    },
    viewportInput: {
      viewportId: 'CT_VOLUME_CORONAL',
      type: ViewportType.ORTHOGRAPHIC,
      element: null,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  },
];

// ======== Set up page ======== //
setTitleAndDescription(
  'Color Bar',
  'Interactive color bar that can be used to manipulate the VOI'
);

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'grid';
viewportGrid.style.width = '100%';
viewportGrid.style.height = '500px';
viewportGrid.style.marginTop = '5px';
viewportGrid.style.gap = '5px';

// Generate the template columns based on the number of viewports to render.
// The template is set to "auto auto auto" for 3 viewports.
viewportGrid.style.gridTemplateColumns = new Array(viewportsInfo.length)
  .fill('auto')
  .join(' ');

content.appendChild(viewportGrid);

const info = document.createElement('div');
content.appendChild(info);

const addInstruction = (instruction) => {
  const node = document.createElement('p');
  node.innerText = instruction;
  info.appendChild(node);
};

addInstruction(
  'Viewports: Stack/Axial (left) | Volume/Sagittal (middle) | Volume/Coronal (right)'
);
addInstruction('- Select different colormaps');
addInstruction('- Click and drag on the viewport to change VOI');
addInstruction('- Click and drag on the color bar to change VOI');

// ==[ Toolbar ]================================================================

addDropdownToToolbar({
  options: {
    values: colormaps.map((cm) => cm.Name),
    defaultValue: currentPTColormapName,
  },
  style: {
    maxWidth: '200px',
  },
  onSelectedValueChange: (selectedValue) => {
    setPTColormap(<string>selectedValue);
  },
});

// =============================================================================

function setPTViewportColormap(viewportInfo, colormapName: string) {
  const { fusion, colorBar, viewportInput } = viewportInfo;
  const { viewportId } = viewportInput;

  if (!fusion) {
    return;
  }

  const ptColorBar = colorBar?.instances?.[1];

  if (ptColorBar) {
    ptColorBar.activeColormapName = colormapName;
  }

  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId);

  // Get the volume viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  );

  viewport.setProperties({ colormap: { name: colormapName } }, ptVolumeId);
  viewport.render();
}

function setPTColormap(colormapName: string) {
  currentPTColormapName = colormapName;

  viewportsInfo.forEach((viewportInfo) =>
    setPTViewportColormap(viewportInfo, colormapName)
  );
}

async function createAndCacheVolume(volumeId, imageIds) {
  let volume = cache.getVolume(volumeId) as any;

  if (!volume) {
    volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });

    // Set the volume to load
    volume.load();
  }
}

async function initializeVolumeViewport(
  viewportInfo,
  viewport: Types.IVolumeViewport
) {
  const { fusion } = viewportInfo;
  const volumes = [];
  const ctImageIds = await getCTImageIds();

  await createAndCacheVolume(ctVolumeId, ctImageIds);

  volumes.push({
    volumeId: ctVolumeId,
    callback: setCtTransferFunctionForVolumeActor,
  });

  if (fusion) {
    const ptImageIds = await getPTImageIds();

    await createAndCacheVolume(ptVolumeId, ptImageIds);

    volumes.push({
      volumeId: ptVolumeId,
      callback: setPetColorMapTransferFunctionForVolumeActor,
    });
  }

  // Set the volume on the viewport
  await viewport.setVolumes(volumes);

  if (fusion) {
    setPTViewportColormap(viewportInfo, currentPTColormapName);
  }
}

function createRightColorBarContainers(numContainers) {
  const containers = [];
  const height = 100 / numContainers;
  let top = 0;

  for (let i = 0; i < numContainers; i++, top += height) {
    const container = document.createElement('div');

    Object.assign(container.style, {
      position: 'absolute',
      top: `${top}%`,
      left: `calc(100% - ${colorBarWidth}px)`,
      width: `${colorBarWidth}px`,
      height: `${100 / numContainers}%`,
    });

    containers.push(container);
  }

  return containers;
}

function createBottomColorBarContainers(numContainers) {
  const containers = [];
  const width = 100 / numContainers;
  let left = 0;

  for (let i = 0; i < numContainers; i++, left += width) {
    const container = document.createElement('div');

    Object.assign(container.style, {
      position: 'absolute',
      top: `calc(100% - ${colorBarWidth}px)`,
      left: `${left}%`,
      width: `${width}%`,
      height: `${colorBarWidth}px`,
    });

    containers.push(container);
  }

  return containers;
}

function initializeColorBarContainers(viewportInfo, viewportContainer) {
  const numContainers = viewportInfo.fusion ? 2 : 1;
  const containers =
    viewportInfo.colorBar?.position === 'right'
      ? createRightColorBarContainers(numContainers)
      : createBottomColorBarContainers(numContainers);

  containers.forEach((container) => {
    Object.assign(container.style, {
      boxSizing: 'border-box',
      display: 'block',
      border: 'solid 1px #555',
      cursor: 'initial',
    });

    viewportContainer.appendChild(container);
  });

  return containers;
}

function initializeColorBars(viewportInfo, colorBarContainers) {
  const { fusion, volumeIds = [], colorBar, viewportInput } = viewportInfo;
  const { element } = viewportInput;

  const scaleStyle = {
    font: '16px Arial',
    color: '#fff',
    maxNumTicks: 8,
    tickSize: 5,
    tickWidth: 1,
    labelMargin: 3,
  };

  const ctColorBar = new ViewportColorBar({
    id: 'ctColorBar',
    element,
    container: colorBarContainers[0],
    volumeId: volumeIds[0],
    colormaps,
    activeColormapName: 'Grayscale',
    scalePosition: ColorBarScalePosition.TopOrLeft,
    scaleStyle,
  });

  colorBar.instances.push(ctColorBar);

  if (fusion && volumeIds.length === 2) {
    const ptColorBar = new ViewportColorBar({
      id: 'ptColorBar',
      element,
      container: colorBarContainers[1],
      volumeId: volumeIds[1],
      colormaps,
      activeColormapName: currentPTColormapName,
      scalePosition: ColorBarScalePosition.TopOrLeft,
      scaleStyle,
    });

    colorBar.instances.push(ptColorBar);
  }
}

async function initializeViewport(renderingEngine, toolGroup, viewportInfo) {
  const { viewportInput } = viewportInfo;

  const viewportContainer = document.createElement('div');

  Object.assign(viewportContainer.style, {
    position: 'relative',
    width: '100%',
    height: '100%',
    border: 'solid 1px #0f0',
  });

  viewportGrid.appendChild(viewportContainer);

  const element = document.createElement('div');
  let width = '100%';
  let height = '100%';

  if (viewportInfo.colorBar?.position === 'right') {
    width = `calc(100% - ${colorBarWidth}px)`;
  } else {
    height = `calc(100% - ${colorBarWidth}px)`;
  }

  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();

  element.id = viewportInput.viewportId;
  element.style.overflow = 'hidden';

  Object.assign(element.style, {
    width,
    height,
  });

  viewportInput.element = element;
  viewportContainer.appendChild(element);

  const { viewportId } = viewportInput;
  const { id: renderingEngineId } = renderingEngine;

  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId);

  const colorBarContainers = initializeColorBarContainers(
    viewportInfo,
    viewportContainer
  );

  initializeColorBars(viewportInfo, colorBarContainers);

  const ctImageIds = await getCTImageIds();
  const viewport = <Types.IViewport>renderingEngine.getViewport(viewportId);

  if (viewportInput.type === ViewportType.STACK) {
    (<Types.IStackViewport>viewport).setStack(ctImageIds);
  } else if (viewportInput.type === ViewportType.ORTHOGRAPHIC) {
    await initializeVolumeViewport(
      viewportInfo,
      viewport as Types.IVolumeViewport
    );
  } else {
    throw new Error('Invalid viewport type');
  }
}

function initializeToolGroup(toolGroupId) {
  let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

  if (toolGroup) {
    return toolGroup;
  }

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);

  // Set the initial state of the tools, here all tools are active and bound to
  // Different mouse inputs
  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Middle Click
      },
    ],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });

  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

  return toolGroup;
}

async function getCTImageIds() {
  let imageIds = imageIdsCache.get('ct');

  if (!imageIds) {
    imageIds = await createImageIdsAndCacheMetaData({
      StudyInstanceUID,
      SeriesInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
      wadoRsRoot,
    });

    imageIdsCache.set('ct', imageIds);
  }

  return imageIds;
}

async function getPTImageIds() {
  let imageIds = imageIdsCache.get('pt');

  if (!imageIds) {
    imageIds = await createImageIdsAndCacheMetaData({
      StudyInstanceUID,
      SeriesInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
      wadoRsRoot,
    });

    imageIdsCache.set('pt', imageIds);
  }

  return imageIds;
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(ZoomTool);

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  for (let i = 0; i < viewportsInfo.length; i++) {
    const viewportInfo = viewportsInfo[i];
    const { toolGroupId } = viewportInfo;
    const toolGroup = initializeToolGroup(toolGroupId);

    toolGroupIds.add(toolGroupId);

    await initializeViewport(renderingEngine, toolGroup, viewportInfo);
  }
}

run();
