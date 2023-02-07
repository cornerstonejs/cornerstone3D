import { RenderingEngine, Types, Enums, metaData } from '@cornerstonejs/core';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import * as cornerstoneTools from '@cornerstonejs/tools';
import htmlSetup from './htmlSetup';
import uids from './uids';

const {
  PanTool,
  WindowLevelTool,
  StackScrollMouseWheelTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;

import {
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import {
  convertMultiframeImageIds,
  prefetchMetadataInformation,
} from '../../../../utils/demo/helpers/convertMultiframeImageIds';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// ======== Set up page ======== //
setTitleAndDescription(
  'DICOM P10 from local file system',
  'Example of displaying a DICOM P10 from the local file system.'
);

// ============================= //

const { element } = htmlSetup(document);

const dropZone = document.getElementById('cornerstone-element');
dropZone.addEventListener('dragover', handleDragOver, false);
dropZone.addEventListener('drop', handleFileSelect, false);

let viewport;

const toolGroupId = 'myToolGroup';

document
  .getElementById('selectFile')
  .addEventListener('change', function (e: any) {
    // Add the file to the cornerstoneFileImageLoader and get unique
    // number for that file
    const file = e.target.files[0];
    const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
    loadAndViewImage(imageId);
  });

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add tools to the tool group
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

  // Get Cornerstone imageIds and fetch metadata into RAM

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportId = 'CT_STACK';
  const viewportInput = {
    viewportId,
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId);

  toolGroup.addViewport(viewportId, renderingEngineId);
}

// this function gets called once the user drops the file onto the div
function handleFileSelect(evt) {
  evt.stopPropagation();
  evt.preventDefault();

  // Get the FileList object that contains the list of files that were dropped
  const files = evt.dataTransfer.files;

  // this UI is only built for a single file so just dump the first one
  const file = files[0];
  const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
  loadAndViewImage(imageId);
}

function handleDragOver(evt) {
  evt.stopPropagation();
  evt.preventDefault();
  evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
}

async function loadAndViewImage(imageId) {
  await prefetchMetadataInformation([imageId]);
  const stack = convertMultiframeImageIds([imageId]);
  // Set the stack on the viewport
  viewport.setStack(stack).then(() => {
    // Set the VOI of the stack
    // viewport.setProperties({ voiRange: ctVoiRange });
    // Render the image
    viewport.render();

    const imageData = viewport.getImageData();

    const {
      pixelRepresentation,
      bitsAllocated,
      bitsStored,
      highBit,
      photometricInterpretation,
    } = metaData.get('imagePixelModule', imageId);

    const voiLutModule = metaData.get('voiLutModule', imageId);

    const sopCommonModule = metaData.get('sopCommonModule', imageId);
    const transferSyntax = metaData.get('transferSyntax', imageId);

    document.getElementById('transfersyntax').innerHTML =
      transferSyntax.transferSyntaxUID;
    document.getElementById('sopclassuid').innerHTML = `${
      sopCommonModule.sopClassUID
    } [${uids[sopCommonModule.sopClassUID]}]`;
    document.getElementById('sopinstanceuid').innerHTML =
      sopCommonModule.sopInstanceUID;
    document.getElementById('rows').innerHTML = imageData.dimensions[0];
    document.getElementById('columns').innerHTML = imageData.dimensions[1];
    document.getElementById('spacing').innerHTML = imageData.spacing.join('\\');
    document.getElementById('direction').innerHTML = imageData.direction
      .map((x) => Math.round(x * 100) / 100)
      .join(',');

    document.getElementById('origin').innerHTML = imageData.origin
      .map((x) => Math.round(x * 100) / 100)
      .join(',');
    document.getElementById('modality').innerHTML = imageData.metadata.Modality;

    document.getElementById('pixelrepresentation').innerHTML =
      pixelRepresentation;
    document.getElementById('bitsallocated').innerHTML = bitsAllocated;
    document.getElementById('bitsstored').innerHTML = bitsStored;
    document.getElementById('highbit').innerHTML = highBit;
    document.getElementById('photometricinterpretation').innerHTML =
      photometricInterpretation;
    document.getElementById('windowcenter').innerHTML =
      voiLutModule.windowCenter;
    document.getElementById('windowwidth').innerHTML = voiLutModule.windowWidth;
  });
}

run();
