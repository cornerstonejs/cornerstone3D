import { vec3 } from 'gl-matrix';
import {
  Enums,
  RenderingEngine,
  Types,
  volumeLoader,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  SegmentationDisplayTool,
  WindowLevelTool,
  StackScrollMouseWheelTool,
  ZoomTool,
  segmentation,
  Enums: csToolsEnums,
} = cornerstoneTools;

import { makeVolumeMetadata } from '../../../streaming-image-volume-loader/src/helpers';

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
let renderingEngine;
const renderingEngineId = 'myRenderingEngine';
const segmentationId = 'MY_SEGMENTATION_ID';
const viewportId = 'STACK_VIEWPORT';

// ======== Set up page ======== //
setTitleAndDescription(
  'Segmentation in StackViewport',
  'Here we demonstrate how to render a segmentation in StackViewport with a mammography image.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
element1.oncontextmenu = () => false;

element1.style.width = size;
element1.style.height = size;

viewportGrid.appendChild(element1);

const element2 = document.createElement('div');
element2.oncontextmenu = () => false;

element2.style.width = size;
element2.style.height = size;

viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = 'Click the image to rotate it.';

content.append(instructions);

async function getImageIds() {
  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.4792.2001.105216574054253895819671475627',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.4792.2001.326862698868700146219088322924',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  return imageIds;
}

function setupTools(toolGroupId) {
  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(SegmentationDisplayTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group and specify which volume they are pointing at
  toolGroup.addTool(StackScrollMouseWheelTool.toolName, { loop: true });
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(SegmentationDisplayTool.toolName);

  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });
  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Middle Click
      },
    ],
  });
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
  return toolGroup;
}
// ============================= //

/**
 * Adds two concentric circles to each axial slice of the demo segmentation.
 */
function createMockEllipsoidSegmentation(segmentationVolume) {
  const scalarData = segmentationVolume.scalarData;
  const { dimensions } = segmentationVolume;

  const center = [dimensions[0] / 2, dimensions[1] / 2, dimensions[2] / 2];
  const outerRadius = 512;
  const innerRadius = 256;

  let voxelIndex = 0;

  for (let z = 0; z < dimensions[2]; z++) {
    for (let y = 0; y < dimensions[1]; y++) {
      for (let x = 0; x < dimensions[0]; x++) {
        const distanceFromCenter = Math.sqrt(
          (x - center[0]) * (x - center[0]) +
            (y - center[1]) * (y - center[1]) +
            (z - center[2]) * (z - center[2])
        );
        if (distanceFromCenter < innerRadius) {
          scalarData[voxelIndex] = 1;
        } else if (distanceFromCenter < outerRadius) {
          scalarData[voxelIndex] = 2;
        }
        voxelIndex++;
      }
    }
  }
}

async function createSegmentationVolume(imageIds) {
  // creating volume metadata from imageIds
  const metadata = makeVolumeMetadata(imageIds);

  // Its a bogus volume so use 8 bits
  metadata.BitsAllocated = 8;
  metadata.BitsStored = 8;
  metadata.HighBit = 7;
  metadata.ImageOrientationPatient = [1, 0, 0, 0, 1, 0];

  // defining bogus values for the volume parameters created with one image
  const { PixelSpacing } = metadata;

  // defining arbitrarily spacing
  const spacing = <Types.Point3>[PixelSpacing[1], PixelSpacing[0], 4];
  const scanAxisNormal = vec3.create();

  // in this MG example this variables are null so defining default values
  const rowCosines = <Types.Point3>[1, 0, 0];
  const columnCosines = <Types.Point3>[0, 1, 0];
  const origin = <Types.Point3>[100, 100, 0];

  vec3.cross(scanAxisNormal, rowCosines, columnCosines);
  const direction = [
    ...rowCosines,
    ...columnCosines,
    ...scanAxisNormal,
  ] as Types.Mat3;

  // defining a size arbitrarily for the segmentation volume
  const dimensions = <Types.Point3>[1024, 1024, 100];
  const length = dimensions[0] * dimensions[1] * dimensions[2];
  const scalarData = new Uint8Array(length);
  const options = {
    scalarData,
    metadata,
    spacing,
    origin,
    direction,
    dimensions,
    sizeInBytes: length,
  };

  const preventCache = false;
  const segmentationVolume = await volumeLoader.createLocalVolume(
    options,
    segmentationId,
    preventCache
  );
  return { segmentationVolume, options };
}

async function addSegmentationsToState(imageIds) {
  const { segmentationVolume } = await createSegmentationVolume(imageIds);
  // Add the segmentation to state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          volumeId: segmentationId,
        },
      },
    },
  ]);

  // Add some data to the segmentation
  createMockEllipsoidSegmentation(segmentationVolume);
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroupId = 'TOOL_GROUP_ID';
  const toolGroup = setupTools(toolGroupId);

  const imageIds = await getImageIds();

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId,
      type: ViewportType.STACK,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
  ];
  renderingEngine.setViewports(viewportInputArray);
  toolGroup.addViewport(viewportId, renderingEngineId);
  const viewport = renderingEngine.getViewport(viewportId);
  await viewport.setStack(imageIds);

  // creating segmentation using some mammography info
  addSegmentationsToState(imageIds);
  // // Add the segmentation representation to the toolgroup
  await segmentation.addSegmentationRepresentations(toolGroupId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  // Render the image
  renderingEngine.renderViewports([viewportId]);
}

run();
