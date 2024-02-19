import {
  RenderingEngine,
  Enums,
  CONSTANTS,
  imageLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  addToggleButtonToToolbar,
  createInfoSection,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  SegmentationDisplayTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  BrushTool,
} = cornerstoneTools;

setTitleAndDescription(
  'Stack Labelmap to Surface',
  'This demonstration showcases the usage of PolySEG WASM module to convert a labelmap to a surface representation.'
);

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

const segmentationId = 'MY_SEGMENTATION_ID';

// ======== Set up page ======== //

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);

createInfoSection(content, { ordered: true })
  .addInstruction('Use the Brush Tool for segmentation in Stack viewports')
  .addInstruction(
    'Toggle between different segmentation tools like Circle Brush and Eraser'
  )
  .addInstruction('Convert the labelmap to a 3D surface representation')
  .addInstruction('Manipulate the 3D view using the Trackball Rotate Tool')
  .addInstruction('Toggle the visibility of the 3D anatomy model');

// ============================= //
const toolGroupId = 'ToolGroup_MPR';
const toolGroupId2 = 'ToolGroup_3D';
let toolGroup1, toolGroup2;
let renderingEngine;
// Create the viewports
const viewportId1 = 'CT_STACK';
const viewportId2 = 'CT_3D';

const segmentIndexes = [1, 2, 3, 4, 5];

addButtonToToolbar({
  title: 'Convert labelmap to surface',
  onClick: async () => {
    // add the 3d representation to the 3d toolgroup
    await segmentation.addSegmentationRepresentations(toolGroupId2, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Surface,
        options: {
          polySeg: {
            enabled: true,
          },
        },
      },
    ]);
  },
});

addDropdownToToolbar({
  labelText: 'Segment Index',
  options: { values: segmentIndexes, defaultValue: segmentIndexes[0] },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    segmentation.segmentIndex.setActiveSegmentIndex(
      segmentationId,
      nameAsStringOrNumber as number
    );
  },
});

addToggleButtonToToolbar({
  title: 'Toggle Brush and Eraser',
  defaultToggle: true,
  onClick: async (toggle) => {
    if (toggle) {
      toolGroup1.setToolDisabled('EraserBrush', {});
      toolGroup1.setToolActive('CircularBrush', {
        bindings: [
          {
            mouseButton: MouseBindings.Primary, // Middle Click
          },
        ],
      });
    } else {
      toolGroup1.setToolDisabled('CircularBrush', {});
      toolGroup1.setToolActive('EraserBrush', {
        bindings: [
          {
            mouseButton: MouseBindings.Primary, // Middle Click
          },
        ],
      });
    }
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(SegmentationDisplayTool);
  cornerstoneTools.addTool(BrushTool);

  // Define tool groups to add the segmentation display tool to
  toolGroup1 = ToolGroupManager.createToolGroup(toolGroupId);
  toolGroup2 = ToolGroupManager.createToolGroup(toolGroupId2);

  addManipulationBindings(toolGroup1);
  addManipulationBindings(toolGroup2, { is3DViewport: true });

  // Segmentation Tools
  toolGroup1.addTool(SegmentationDisplayTool.toolName);
  toolGroup1.addToolInstance('CircularBrush', BrushTool.toolName, {
    activeStrategy: 'FILL_INSIDE_CIRCLE',
  });
  toolGroup1.addToolInstance('EraserBrush', BrushTool.toolName, {
    activeStrategy: 'ERASE_INSIDE_CIRCLE',
  });

  toolGroup2.addTool(SegmentationDisplayTool.toolName);

  // activations
  toolGroup1.setToolEnabled(SegmentationDisplayTool.toolName);
  toolGroup2.setToolEnabled(SegmentationDisplayTool.toolName);

  toolGroup1.setToolActive('CircularBrush', {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Middle Click
      },
    ],
  });

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  let imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  imageIds = imageIds.slice(0, 2);

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.STACK,
      element: element1,
    },
    {
      viewportId: viewportId2,
      type: ViewportType.VOLUME_3D,
      element: element2,
      defaultOptions: {
        background: CONSTANTS.BACKGROUND_COLORS.slicer3D,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroup1.addViewport(viewportId1, renderingEngineId);
  toolGroup2.addViewport(viewportId2, renderingEngineId);

  const viewport1 = renderingEngine.getViewport(viewportId1);
  await viewport1.setStack(imageIds, 0);

  cornerstoneTools.utilities.stackContextPrefetch.enable(element1);

  const { imageIds: segmentationImageIds } =
    await imageLoader.createAndCacheDerivedSegmentationImages(imageIds);

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIdReferenceMap:
            cornerstoneTools.utilities.segmentation.createImageIdReferenceMap(
              imageIds,
              segmentationImageIds
            ),
        },
      },
    },
  ]);

  // Add the segmentation representation to the toolgroup
  await segmentation.addSegmentationRepresentations(toolGroupId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  // Render the image
  renderingEngine.renderViewports([viewportId1, viewportId2]);
}

run();
