import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  metaData,
  setUseCPURendering,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import htmlSetup from '../local/htmlSetup';
import uids from '../local/uids';

import {
  initDemo,
  setTitleAndDescription,
  addManipulationBindings,
  addUploadToToolbar,
  addToggleButtonToToolbar,
  addDropdownToToolbar,
  annotationTools,
  createImageIdsAndCacheMetaData,
  imageIds,
  setImageIds,
  handleFileSelect,
  setLoadImageListener,
  loadAndViewImages,
  viewportId,
  renderingEngineId,
} from '../../../../utils/demo/helpers';
import { toolGroupId } from '../../../../utils/demo/helpers/constants';

const { ToolGroupManager } = cornerstoneTools;

const { ViewportType } = Enums;

const { Enums: csToolsEnums } = cornerstoneTools;

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

// ======== Set up page ======== //
setTitleAndDescription(
  'Advanced Functionality DICOM P10 from local file system',
  'Allows testing tools and functionality with drag and drop or pre-selected images'
);

// ============================= //

const { element } = htmlSetup(document);
const { MouseBindings } = csToolsEnums;

const dropZone = document.getElementById('cornerstone-element');
dropZone.addEventListener('dragover', handleDragOver, false);
dropZone.addEventListener('drop', handleFileSelect, false);

let viewport;

addUploadToToolbar();

function createToolGroup(newToolGroupId = toolGroupId) {
  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(newToolGroupId);
  addManipulationBindings(toolGroup, { toolMap });

  return toolGroup;
}

let useCPU = false;

addToggleButtonToToolbar({
  id: 'cpu',
  title: 'Use CPU',
  onClick: () => {
    useCPU = !useCPU;
    setUseCPURendering(useCPU);
  },
});

const toolMap = new Map(annotationTools);
const defaultTool = 'Length';

addDropdownToToolbar({
  options: { map: toolMap, defaultValue: defaultTool },
  onSelectedValueChange: (newSelectedToolName, _data) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the old tool passive
    const selectedToolName = toolGroup.getActivePrimaryMouseButtonTool();
    if (selectedToolName) {
      toolGroup.setToolPassive(selectedToolName);
    }

    // Set the new tool active
    toolGroup.setToolActive(newSelectedToolName as string, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
        },
      ],
    });
  },
});

const wadoRsRoot = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';

const webSeries = new Map();
webSeries.set('', {});
webSeries.set('US Region with Calibration', {
  StudyInstanceUID:
    '1.3.6.1.4.1.14519.5.2.1.7085.2626.494695569589117268722281491772',
  SeriesInstanceUID:
    '1.3.6.1.4.1.14519.5.2.1.7085.2626.711316574089470618250806015633',
  SOPInstanceUID:
    '1.3.6.1.4.1.14519.5.2.1.7085.2626.126609591637341054592307275932',
  wadoRsRoot,
});
webSeries.set('US Region with no base calibration', {
  StudyInstanceUID:
    '1.3.6.1.4.1.14519.5.2.1.7085.2626.494695569589117268722281491772',
  SeriesInstanceUID:
    '1.3.6.1.4.1.14519.5.2.1.7085.2626.711316574089470618250806015633',
  SOPInstanceUID:
    '1.3.6.1.4.1.14519.5.2.1.7085.2626.153002229311736409855382581622',
  wadoRsRoot,
});

webSeries.set('ERMF from imager/pixel', {
  StudyInstanceUID: '1.3.46.670589.30.1.3.1.1625260923.1632320482484.1',
  SeriesInstanceUID: '1.3.46.670589.30.1.3.1.1625260923.1632320560703.1',
  wadoRsRoot,
});

webSeries.set('Projected', {
  StudyInstanceUID:
    '1.3.6.1.4.1.14519.5.2.1.99.1071.55651399101931177647030363790032',
  SeriesInstanceUID:
    '1.3.6.1.4.1.14519.5.2.1.99.1071.87075509829481869121008947712950',
  wadoRsRoot,
});

webSeries.set('Unknown Spacing', {
  StudyInstanceUID: '1.2.276.0.7230010.3.1.2.2155604110.4180.1021041295.21',
  SeriesInstanceUID: '1.2.840.113654.2.4.4.3.5.119950730134200',
  wadoRsRoot,
});

webSeries.set('Pixel Spacing', {
  StudyInstanceUID: '1.2.276.0.7230010.3.1.2.2155604110.4180.1021041295.21',
  SeriesInstanceUID: '1.2.392.200036.9125.0.198811291108.7',
  wadoRsRoot,
});

webSeries.set('US Multiple Region', {
  StudyInstanceUID: '1.2.840.113663.1500.1.248223208.1.1.20110323.105903.687',
  SeriesInstanceUID: '1.2.840.113663.1500.1.248223208.2.1.20110323.105903.687',
  SOPInstanceUID: '1.2.840.113663.1500.1.248223208.3.10.20110323.110423.875',
  wadoRsRoot,
});

/*
webSeries.set('', {
  StudyInstanceUID: '',
  SeriesInstanceUID: '',
  SOPInstanceUID: '',
  wadoRsRoot,
});
*/

addDropdownToToolbar({
  options: { map: webSeries, defaultValue: '' },
  onSelectedValueChange: async (newSelectedSeries, data) => {
    console.warn('newSelectedSeries', newSelectedSeries, data);
    if (!data?.wadoRsRoot) {
      return;
    }
    setImageIds(await createImageIdsAndCacheMetaData(data));
    loadAndViewImages(imageIds);
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroup = createToolGroup(toolGroupId);

  // Get Cornerstone imageIds and fetch metadata into RAM

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
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

function handleDragOver(evt) {
  evt.stopPropagation();
  evt.preventDefault();
  evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
}

setLoadImageListener(() => {
  const imageData = viewport.getImageData();

  const [imageId] = imageIds;
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

  document.getElementById('numberofimages').innerHTML = String(imageIds.length);
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
  document.getElementById('windowcenter').innerHTML = voiLutModule.windowCenter;
  document.getElementById('windowwidth').innerHTML = voiLutModule.windowWidth;
});

run();
