import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  getRenderingEngines,
  cache,
  resetInitialization,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  ZoomTool,
  EllipticalROITool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

// ======== Set up page ======== //
setTitleAndDescription(
  'Annotation Tools On Volumes',
  'Here we demonstrate how annotation tools can be drawn/rendered on any plane.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
element1.oncontextmenu = () => false;
element2.oncontextmenu = () => false;

element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText =
  'Left Click to draw length measurements on any viewport.\n Use the mouse wheel to scroll through the stack.';

content.append(instructions);

const toolGroupId = 'TOOLGROUP';

// Add tools to Cornerstone3D
cornerstoneTools.addTool(cornerstoneTools.EllipticalROITool);
cornerstoneTools.addTool(ZoomTool);

// Define a tool group, which defines how mouse events map to tool commands for
// Any viewport using the group
const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

// Add the tools to the tool group and specify which volume they are pointing at
toolGroup.addTool(EllipticalROITool.toolName, { volumeId });
toolGroup.addTool(ZoomTool.toolName, { volumeId });

// Set the initial state of the tools, here we set one tool active on left click.
// This means left click will draw that tool.
toolGroup.setToolActive(EllipticalROITool.toolName, {
  bindings: [
    {
      mouseButton: MouseBindings.Primary, // Left Click
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

const configToUse = {
  rendering: {
    preferSizeOverAccuracy: false,
  },
};

async function handleRenderingOptionChange(selectedValue) {
  const renderingEngines = getRenderingEngines();
  const renderingEngine = renderingEngines[0];

  switch (selectedValue) {
    case 'Prefer size over accuracy':
      configToUse.rendering.preferSizeOverAccuracy = true;
      break;
    case 'Use norm 16 texture':
      configToUse.rendering.preferSizeOverAccuracy = false;
      break;
    default:
      configToUse.rendering.preferSizeOverAccuracy = false;
      break;
  }

  // Destroy and reinitialize the rendering engine
  resetInitialization();
  renderingEngine.destroy();
  cache.purgeCache();
  await run();
}

addDropdownToToolbar({
  options: {
    values: ['Default', 'Prefer size over accuracy', 'Use norm 16 texture'],
    defaultValue: 'Default',
  },
  onSelectedValueChange: handleRenderingOptionChange,
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo({
    core: {
      ...configToUse,
    },
  });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportIds = ['CT_AXIAL_STACK', 'CT_SAGITTAL_STACK'];

  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewports
  viewportIds.forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  );

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();

  setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);

  // Render the image
  renderingEngine.renderViewports(viewportIds);
}

run();
