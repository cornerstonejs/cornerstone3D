import htmlStr from './layout';
import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  setUseCPURendering,
  setPreferSizeOverAccuracy,
  cache,
  metaData,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import uids from '../uids';
const {
  PanTool,
  WindowLevelTool,
  StackScrollTool,
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
    cache.purgeCache();
  },
});

addToggleButtonToToolbar({
  title: 'Toggle Prefer Size Over Accuracy',
  defaultToggle: false,
  onClick(toggle) {
    toggle ? setPreferSizeOverAccuracy(true) : setPreferSizeOverAccuracy(false);
    cache.purgeCache();
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
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

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
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
    ],
  });

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
      if (!image) {
        console.error('Image failed to load');
        return;
      }

      // Use metadata API with imageId instead of direct dataset access
      const { MetadataModules } = Enums;
      const transferSyntaxMeta = metaData.get(
        MetadataModules.TRANSFER_SYNTAX,
        imageId
      );
      const sopCommonMeta = metaData.get(MetadataModules.SOP_COMMON, imageId);
      const imagePixelMeta = metaData.get(MetadataModules.IMAGE_PIXEL, imageId);
      const generalImageMeta = metaData.get(
        MetadataModules.GENERAL_IMAGE,
        imageId
      );
      const voiLutMeta = metaData.get(MetadataModules.VOI_LUT, imageId);
      const modalityLutMeta = metaData.get(
        MetadataModules.MODALITY_LUT,
        imageId
      );
      const compressedFrameData = metaData.getMetaData(
        MetadataModules.COMPRESSED_FRAME_DATA,
        imageId,
        { frameIndex: 0 }
      );

      function getTransferSyntax() {
        const value =
          transferSyntaxMeta?.transferSyntaxUID ??
          transferSyntaxMeta?.transferSyntaxUid;
        if (value == null) return '';
        return value + ' [' + (uids[value] ?? '') + ']';
      }

      function getSopClass() {
        const value = sopCommonMeta?.sopClassUid;
        if (value == null) return '';
        return value + ' [' + (uids[value] ?? '') + ']';
      }

      function getPixelRepresentation() {
        const value = imagePixelMeta?.pixelRepresentation;
        if (value === undefined) return '';
        return value + (value === 0 ? ' (unsigned)' : ' (signed)');
      }

      function getPlanarConfiguration() {
        const value = imagePixelMeta?.planarConfiguration;
        if (value === undefined) return '';
        return value + (value === 0 ? ' (pixel)' : ' (plane)');
      }

      // basicOffsetTable is not exposed via metadata API; show empty when using metadata
      const basicOffsetTableText = '';
      const fragmentsText =
        compressedFrameData?.pixelData != null
          ? Array.isArray(compressedFrameData.pixelData)
            ? String(compressedFrameData.pixelData.length)
            : '1'
          : '';

      document.getElementById('transferSyntax').textContent =
        getTransferSyntax();
      document.getElementById('sopClass').textContent = getSopClass();
      document.getElementById('samplesPerPixel').textContent =
        imagePixelMeta?.samplesPerPixel ?? '';
      document.getElementById('photometricInterpretation').textContent =
        imagePixelMeta?.photometricInterpretation ?? '';
      document.getElementById('numberOfFrames').textContent =
        generalImageMeta?.numberOfFrames ?? '';
      document.getElementById('planarConfiguration').textContent =
        getPlanarConfiguration();
      document.getElementById('rows').textContent = imagePixelMeta?.rows ?? '';
      document.getElementById('columns').textContent =
        imagePixelMeta?.columns ?? '';
      document.getElementById('pixelSpacing').textContent =
        generalImageMeta?.pixelSpacing ?? '';
      document.getElementById('rowPixelSpacing').textContent =
        image.rowPixelSpacing ?? '';
      document.getElementById('columnPixelSpacing').textContent =
        image.columnPixelSpacing ?? '';
      document.getElementById('bitsAllocated').textContent =
        imagePixelMeta?.bitsAllocated ?? '';
      document.getElementById('bitsStored').textContent =
        imagePixelMeta?.bitsStored ?? '';
      document.getElementById('highBit').textContent =
        imagePixelMeta?.highBit ?? '';
      document.getElementById('pixelRepresentation').textContent =
        getPixelRepresentation();
      document.getElementById('windowCenter').textContent =
        voiLutMeta?.windowCenter ?? '';
      document.getElementById('windowWidth').textContent =
        voiLutMeta?.windowWidth ?? '';
      document.getElementById('rescaleIntercept').textContent =
        modalityLutMeta?.rescaleIntercept ?? '';
      document.getElementById('rescaleSlope').textContent =
        modalityLutMeta?.rescaleSlope ?? '';
      document.getElementById('basicOffsetTable').textContent =
        basicOffsetTableText;
      document.getElementById('fragments').textContent = fragmentsText;
      document.getElementById('minStoredPixelValue').textContent =
        image.minPixelValue ?? '';
      document.getElementById('maxStoredPixelValue').textContent =
        image.maxPixelValue ?? '';
      const end = new Date().getTime();
      const time = end - start;
      document.getElementById('totalTime').textContent = time + 'ms';
      document.getElementById('loadTime').textContent =
        image.loadTimeInMS != null ? image.loadTimeInMS + 'ms' : '';
      document.getElementById('decodeTime').textContent =
        image.decodeTimeInMS != null ? image.decodeTimeInMS + 'ms' : '';
    },
    function (err) {
      throw err;
    }
  );
}

function downloadAndView(downloadUrl) {
  // @ts-ignore
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
