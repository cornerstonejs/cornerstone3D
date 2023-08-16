import htmlStr from './layout';
import {
  RenderingEngine,
  Types,
  Enums,
  setUseCPURendering,
  setPreferSizeOverAccuracy,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import uids from '../uids';
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
  addToggleButtonToToolbar,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

// add to the script tag
const div = document.createElement('div');
div.innerHTML = htmlStr;
document.getElementById('content').appendChild(div);

setTitleAndDescription(
  'Example of displaying a DICOM P10 image using Cornerstone DICOM Image Loader',
  'You can toggle different settings as using CPU or GPU rendering, using preferSizeOverAccuracy setting'
);

addToggleButtonToToolbar({
  title: 'Toggle CPU Rendering',
  defaultToggle: false,
  onClick(toggle) {
    toggle ? setUseCPURendering(true) : setUseCPURendering(false);
  },
});

addToggleButtonToToolbar({
  title: 'Toggle Prefer Size Over Accuracy',
  defaultToggle: false,
  onClick(toggle) {
    toggle ? setPreferSizeOverAccuracy(true) : setPreferSizeOverAccuracy(false);
  },
});

const { ViewportType } = Enums;
const element = document.querySelector(
  '#cornerstone-element'
) as HTMLDivElement;

const toolGroupId = 'myToolGroup';
let viewport;

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
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId);

  toolGroup.addViewport(viewportId, renderingEngineId);
}

async function loadAndViewImage(imageId) {
  // Set the stack on the viewport
  const start = new Date().getTime();
  viewport.setStack([imageId]).then(
    () => {
      // Set the VOI of the stack
      // viewport.setProperties({ voiRange: ctVoiRange });
      // Render the image
      viewport.render();

      const image = viewport.csImage;

      function getTransferSyntax() {
        const value = image.data.string('x00020010');
        return value + ' [' + uids[value] + ']';
      }

      function getSopClass() {
        const value = image.data.string('x00080016');
        return value + ' [' + uids[value] + ']';
      }

      function getPixelRepresentation() {
        const value = image.data.uint16('x00280103');
        if (value === undefined) {
          return;
        }
        return value + (value === 0 ? ' (unsigned)' : ' (signed)');
      }

      function getPlanarConfiguration() {
        const value = image.data.uint16('x00280006');
        if (value === undefined) {
          return;
        }
        return value + (value === 0 ? ' (pixel)' : ' (plane)');
      }

      document.getElementById('transferSyntax').textContent =
        getTransferSyntax();
      document.getElementById('sopClass').textContent = getSopClass();
      document.getElementById('samplesPerPixel').textContent =
        image.data.uint16('x00280002');
      document.getElementById('photometricInterpretation').textContent =
        image.data.string('x00280004');
      document.getElementById('numberOfFrames').textContent =
        image.data.string('x00280008');
      document.getElementById('planarConfiguration').textContent =
        getPlanarConfiguration();
      document.getElementById('rows').textContent =
        image.data.uint16('x00280010');
      document.getElementById('columns').textContent =
        image.data.uint16('x00280011');
      document.getElementById('pixelSpacing').textContent =
        image.data.string('x00280030');
      document.getElementById('rowPixelSpacing').textContent =
        image.rowPixelSpacing;
      document.getElementById('columnPixelSpacing').textContent =
        image.columnPixelSpacing;
      document.getElementById('bitsAllocated').textContent =
        image.data.uint16('x00280100');
      document.getElementById('bitsStored').textContent =
        image.data.uint16('x00280101');
      document.getElementById('highBit').textContent =
        image.data.uint16('x00280102');
      document.getElementById('pixelRepresentation').textContent =
        getPixelRepresentation();
      document.getElementById('windowCenter').textContent =
        image.data.string('x00281050');
      document.getElementById('windowWidth').textContent =
        image.data.string('x00281051');
      document.getElementById('rescaleIntercept').textContent =
        image.data.string('x00281052');
      document.getElementById('rescaleSlope').textContent =
        image.data.string('x00281053');
      document.getElementById('basicOffsetTable').textContent = image.data
        .elements.x7fe00010.basicOffsetTable
        ? image.data.elements.x7fe00010.basicOffsetTable.length
        : '';
      document.getElementById('fragments').textContent = image.data.elements
        .x7fe00010.fragments
        ? image.data.elements.x7fe00010.fragments.length
        : '';
      document.getElementById('minStoredPixelValue').textContent =
        image.minPixelValue;
      document.getElementById('maxStoredPixelValue').textContent =
        image.maxPixelValue;
      const end = new Date().getTime();
      const time = end - start;
      document.getElementById('totalTime').textContent = time + 'ms';
      document.getElementById('loadTime').textContent =
        image.loadTimeInMS + 'ms';
      document.getElementById('decodeTime').textContent =
        image.decodeTimeInMS + 'ms';
    },
    function (err) {
      throw err;
    }
  );
}

function downloadAndView(downloadUrl) {
  let url = downloadUrl || document.getElementById('wadoURL').value;

  // prefix the url with wadouri: so cornerstone can find the image loader
  url = 'wadouri:' + url;

  // image enable the dicomImage element and activate a few tools
  loadAndViewImage(url);
}

function handleImageSelection(event) {
  const selectedFile = event.target.value;
  console.log('Selected file:', selectedFile);

  if (selectedFile) {
    let url;

    if (selectedFile.startsWith('TG_18')) {
      url =
        'https://raw.githubusercontent.com/OHIF/viewer-testdata/master/dcm/tg18/' +
        selectedFile.substring(6);
    } else {
      url =
        'https://raw.githubusercontent.com/cornerstonejs/cornerstone3D/main/packages/dicomImageLoader/testImages/' +
        selectedFile;
    }

    downloadAndView(url);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const imageSelector = document.getElementById('imageSelector');
  imageSelector.addEventListener('change', handleImageSelection);
});

run();
