import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addLabelToToolbar,
  createInfoSection,
} from '../../../../utils/demo/helpers';

import * as cornerstoneTools from '@cornerstonejs/tools';

const {
  WindowLevelTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const toolGroupId = 'STACK_TOOL_GROUP_ID';
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_SAGITTAL_STACK';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// ======== Set up page ======== //
setTitleAndDescription(
  'Sigmoid VOI Volume',
  'This example shows how to set a Sigmoid VOI on a Volume viewport, and how it ' +
    'differs from the linear VOI at the same window level.'
);

// Both buttons apply this same window (WW 1000 / WC -300) so that only the shape
// of the VOI LUT curve changes between them, which is the point of the example.
// The window is deliberately placed to clip both ends of this CT: the linear LUT
// maps everything below -800 to solid black and everything above 200 to solid
// white, while the sigmoid LUT rolls off instead of clipping and keeps mapping
// values out to about WC +/- 1.73 * WW. The lung and the bone are therefore
// where the two functions differ - flat with the linear LUT, and still showing
// gradation with the sigmoid one, up to about 30 of 255 grey levels of it right
// at the window edges. In the middle of the window the two curves nearly
// coincide, which is why an unconstrained window looks the same either way.
const voiRange = { lower: -800, upper: 200 };

let voiLabel: HTMLLabelElement;

function getViewport() {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId);

  // Get the volume viewport
  return renderingEngine.getViewport(viewportId) as Types.IVolumeViewport;
}

function setVOILUTFunction(VOILUTFunction: Enums.VOILUTFunctionType) {
  // The same voiRange is set with both functions, so the only thing that
  // changes is how the values inside (and outside) that range are mapped.
  const viewport = getViewport();

  viewport.setProperties({ VOILUTFunction, voiRange });
  viewport.render();
  updateVoiLabel();
}

// Shows which function is active and on which window, since the window level
// tool can change the window afterwards.
function updateVoiLabel() {
  const { voiRange: range, VOILUTFunction } = getViewport().getProperties();
  const windowWidth = Math.round(range.upper - range.lower);
  const windowCenter = Math.round((range.lower + range.upper) / 2);

  voiLabel.innerText = `${VOILUTFunction} - WW ${windowWidth} / WC ${windowCenter}`;
}

addButtonToToolbar({
  title: 'Set Linear VOI',
  onClick: () => setVOILUTFunction(Enums.VOILUTFunctionType.LINEAR),
});

addButtonToToolbar({
  title: 'Set Sigmoid VOI',
  onClick: () => setVOILUTFunction(Enums.VOILUTFunctionType.SAMPLED_SIGMOID),
});

voiLabel = addLabelToToolbar({
  id: 'voiState',
  title: 'VOI:',
  style: {
    paddingLeft: '10px',
  },
});

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '512px';
element.style.height = '512px';

content.appendChild(element);

createInfoSection(content)
  .addInstruction(
    'Both buttons apply the same window (WW 1000 / WC -300), so only the VOI LUT function changes'
  )
  .addInstruction(
    'Linear clips at the window: lung and air below -800 go solid black, bone above 200 goes solid white'
  )
  .addInstruction(
    'Sigmoid rolls off instead of clipping, so the lung and the bone keep some gradation - that is where to look for the difference'
  )
  .addInstruction(
    'Left click drag window levels the volume, and both functions follow the new window'
  );
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  cornerstoneTools.addTool(WindowLevelTool);
  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
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
  const renderingEngine = new RenderingEngine(renderingEngineId);
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  };

  renderingEngine.enableElement(viewportInput);
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Get the stack viewport that was created
  const viewport = renderingEngine.getViewport(
    viewportId
  ) as Types.IVolumeViewport;

  // Define a unique id for the volume
  const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
  const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
  const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();

  // Set the volume on the viewport
  await viewport.setVolumes([{ volumeId }]);

  // Keeps the label honest while the window level tool is used.
  element.addEventListener(Enums.Events.VOI_MODIFIED, updateVoiLabel);

  // Start off in the linear state that the buttons switch between, so that the
  // first click on either button is a pure change of the VOI LUT function.
  setVOILUTFunction(Enums.VOILUTFunctionType.LINEAR);
}

run();
