import vtkColormaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import {
  RenderingEngine,
  Types,
  Enums,
  cache,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import { utilities as cstUtils } from '@cornerstonejs/tools';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setCtTransferFunctionForVolumeActor,
  setPetColorMapTransferFunctionForVolumeActor,
  setTitleAndDescription,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers/index.js';
import * as cornerstoneTools from '@cornerstonejs/tools';

const { ViewportColorbar } = cstUtils.voi.colorbar;
const { ColorbarRangeTextPosition } = cstUtils.voi.colorbar.Enums;

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
const { MouseBindings } = csToolsEnums;
const renderingEngineId = 'myRenderingEngine';
const toolGroupIds = new Set<string>();
const colorbarWidth = 20; // px
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

// Convert all VTK colormaps to the one supported by the colorbar which actualy
// have almost the same properties.
const colormaps = vtkColormaps.rgbPresetNames.map((presetName) =>
  vtkColormaps.getPresetByName(presetName)
);

// Initial colormaps for CT and PT in this order
const initialColormapNames = ['Grayscale', 'Black-Body Radiation'];
const colormapDropdownLabels = ['CT', 'PT'];

// Info about all the three viewports (stack, volume sagittal and volume coronal)
const viewportsInfo = [
  {
    toolGroupId: 'STACK_TOOLGROUP_ID',
    fusion: false,
    colorbar: {
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
    colorbar: {
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
    colorbar: {
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
  'Advanced Colorbar',
  'Interactive colorbar that can be used to manipulate the VOI on stack and volume viewports with PT/CT series'
);

const content = document.getElementById('content');
const viewportsGrid = document.createElement('div');

// Grid were all viewports are added in a single row
viewportsGrid.style.display = 'grid';
viewportsGrid.style.width = '100%';
viewportsGrid.style.height = '512px';
viewportsGrid.style.marginTop = '5px';
viewportsGrid.style.gap = '5px';

// Generate the template columns based on the number of viewports to render.
// The template is set to "1fr 1fr 1fr" for 3 viewports.
viewportsGrid.style.gridTemplateColumns = new Array(viewportsInfo.length)
  .fill('1fr')
  .join(' ');

content.appendChild(viewportsGrid);

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

// =============================================================================

function setViewportColormap(viewportId, volumeId, colormapName) {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId);

  // Get the volume viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  );

  viewport.setProperties({ colormap: { name: colormapName } }, volumeId);
  viewport.render();
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

  // Add PT volume on fusion viewports
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

  // Apply initial CT colormap
  setViewportColormap(viewport.id, ctVolumeId, initialColormapNames[0]);

  // Apply initial PT colormap on fusion viewports
  if (fusion) {
    setViewportColormap(viewport.id, ptVolumeId, initialColormapNames[1]);
  }
}

// Creates one or more containers at the right side of the viewport
function createRightColorbarContainers(numContainers) {
  const containers = [];
  const height = 100 / numContainers;
  let top = 0;

  for (let i = 0; i < numContainers; i++, top += height) {
    const container = document.createElement('div');

    Object.assign(container.style, {
      position: 'absolute',
      top: `${top}%`,
      left: '0px',
      width: '100%',
      height: `${100 / numContainers}%`,
    });

    containers.push(container);
  }

  return containers;
}

// Creates one or more containers at the bottom of the viewport
function createBottomColorbarContainers(numContainers) {
  const containers = [];
  const width = 100 / numContainers;
  let left = 0;

  for (let i = 0; i < numContainers; i++, left += width) {
    const container = document.createElement('div');

    Object.assign(container.style, {
      position: 'absolute',
      top: '0px',
      left: `${left}%`,
      width: `${width}%`,
      height: '100%',
    });

    containers.push(container);
  }

  return containers;
}

// Creates one or more containers at the right side or at the bottom
// of the viewport based on `colorbar.position` config
function initializeColorbarContainers(viewportInfo, viewportContainer) {
  const numContainers = viewportInfo.fusion ? 2 : 1;
  const containers =
    viewportInfo.colorbar?.position === 'right'
      ? createRightColorbarContainers(numContainers)
      : createBottomColorbarContainers(numContainers);

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

// Create instaces of the color bars for CT or PT/CT viewports and add them to the DOM
function initializeColorbars(viewportInfo, colorbarContainers) {
  const { fusion, volumeIds, colorbar, viewportInput } = viewportInfo;
  const { element } = viewportInput;

  // Volume viewport has one or two volumeIds while stack viewport does not have
  const isVolumeViewport = !!volumeIds?.length;

  const scaleStyle = {
    font: '12px Arial',
    color: '#fff',
    maxNumTicks: 8,
    tickSize: 5,
    tickWidth: 1,
    labelMargin: 3,
  };

  const ctColorbarProps: cstUtils.voi.colorbar.Types.ViewportColorbarProps = {
    id: 'ctColorbar',
    element,
    container: colorbarContainers[0],
    colormaps,
    activeColormapName: initialColormapNames[0],
    ticks: {
      position: ColorbarRangeTextPosition.Left,
      style: scaleStyle,
    },
  };

  // Colorbars on volume viewports must have a volumeId
  if (isVolumeViewport) {
    ctColorbarProps.volumeId = volumeIds[0];
  }

  const ctColorbar = new ViewportColorbar(ctColorbarProps);

  colorbar.instances.push(ctColorbar);

  if (fusion && volumeIds?.length === 2) {
    const ptColorbar = new ViewportColorbar({
      id: 'ptColorbar',
      element,
      container: colorbarContainers[1],
      volumeId: volumeIds[1],
      colormaps,
      activeColormapName: initialColormapNames[1],
      ticks: {
        position: ColorbarRangeTextPosition.Left,
        style: scaleStyle,
      },
    });

    colorbar.instances.push(ptColorbar);
  }
}

function initializeViewportToolbar(container, viewportInfo) {
  const numColorbars = viewportInfo.fusion ? 2 : 1;
  const { volumeIds, viewportInput } = viewportInfo;
  const { viewportId } = viewportInput;

  // The grid have one line per colorbar/colormap and each line
  // have a label + dropdown
  Object.assign(container.style, {
    display: 'grid',
    gridTemplateColumns: 'max-content 1fr',
    columnGap: '5px',
  });

  for (let i = 0; i < numColorbars; i++) {
    const label = document.createElement('div');

    label.innerText = colormapDropdownLabels[i];

    Object.assign(label.style, {
      textAlign: 'right',
      padding: '5px 0px 5px 5px',
    });

    container.appendChild(label);

    addDropdownToToolbar({
      container,
      options: {
        values: colormaps.map((cm) => cm.Name),
        defaultValue: initialColormapNames[i],
      },
      style: {
        margin: '3px 0px',
      },
      onSelectedValueChange: (selectedValue) => {
        const colorbar = viewportInfo.colorbar.instances[i];
        colorbar.activeColormapName = selectedValue;

        // Volume viewports have volumeIds but stack viewports do not
        if (volumeIds) {
          setViewportColormap(viewportId, volumeIds[i], <string>selectedValue);
        } else {
          setViewportColormap(viewportId, undefined, <string>selectedValue);
        }
      },
    });
  }
}

function createViewportGrid(rootElement) {
  const viewportGrid = document.createElement('div');
  rootElement.append(viewportGrid);

  const viewportToolsContainer = document.createElement('div');
  const viewportContainer = document.createElement('div');
  const colorbarsContainer = document.createElement('div');

  viewportGrid.appendChild(viewportToolsContainer);
  viewportGrid.appendChild(viewportContainer);
  viewportGrid.appendChild(colorbarsContainer);

  Object.assign(viewportGrid.style, {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: `1fr ${colorbarWidth}px`,
    gridTemplateRows: 'max-content 1fr',
  });

  Object.assign(viewportToolsContainer.style, {
    position: 'relative',
    gridColumn: '1 / 3',
  });

  Object.assign(viewportContainer.style, {
    position: 'relative',
    gridRow: '2',
    gridColumn: '1',
  });

  Object.assign(colorbarsContainer.style, {
    position: 'relative',
    gridRow: '2',
    gridColumn: '2',
  });

  return { viewportToolsContainer, viewportContainer, colorbarsContainer };
}

/**
 * Creates a viewport, load its stack/volume and adds its color bar(s).
 * HTML Structure:
 *    viewportsGrid (N columns where N is the number of viewports)
 *       viewportGrid (1x1 [1st row] + 1x2 [2nd row])
 *          viewportToolsContainer (grid 2 x 2)
 *             label CT
 *             dropdown CT
 *             label PT
 *             dropdown PT
 *          viewportContainer
 *              viewport
 *                 canvas
 *          colorbarsContainer
 *             colorbarContainer (CT)
 *                colorbar (CT)
 *             colorbarContainer (PT)
 *                colorbar (PT)
 */
async function initializeViewport(renderingEngine, toolGroup, viewportInfo) {
  const { viewportInput } = viewportInfo;
  const { viewportToolsContainer, viewportContainer, colorbarsContainer } =
    createViewportGrid(viewportsGrid);

  initializeViewportToolbar(viewportToolsContainer, viewportInfo);

  const element = document.createElement('div');

  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();

  element.id = viewportInput.viewportId;
  Object.assign(element.style, {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  });

  viewportInput.element = element;
  viewportContainer.appendChild(element);

  const { viewportId } = viewportInput;
  const { id: renderingEngineId } = renderingEngine;

  // Enable the viewport
  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Create the color bar containers that will be used to append the
  // colorbars' rootElement
  const colorbarContainers = initializeColorbarContainers(
    viewportInfo,
    colorbarsContainer
  );

  // Create and add the color bars to the DOM
  initializeColorbars(viewportInfo, colorbarContainers);

  const ctImageIds = await getCTImageIds();
  const viewport = <Types.IViewport>renderingEngine.getViewport(viewportId);

  if (viewportInput.type === ViewportType.STACK) {
    await (<Types.IStackViewport>viewport).setStack(ctImageIds);

    // Apply initial CT colormap
    setViewportColormap(viewport.id, undefined, initialColormapNames[0]);
  } else if (viewportInput.type === ViewportType.ORTHOGRAPHIC) {
    await initializeVolumeViewport(
      viewportInfo,
      viewport as Types.IVolumeViewport
    );
  } else {
    throw new Error('Invalid viewport type');
  }
}

// Create a tool group and add all necessary tools to it
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
