import { Enums, RenderingEngine, imageLoader } from '@cornerstonejs/core';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  createImageIdsAndCacheMetaData,
  initDemo,
  addDropdownToToolbar,
  setTitleAndDescription,
  addBrushSizeSlider,
  labelmapTools,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';
import { stackContextPrefetch } from '../../src/utilities';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  utilities: cstUtils,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils } = cstUtils;

// Define a unique id for the volume
let renderingEngine;
const renderingEngineId = 'myRenderingEngine';
const viewportId1 = 'LEFT_VIEWPORT';
const viewportId2 = 'RIGHT_VIEWPORT';
const toolGroupId = 'TOOL_GROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Segmentation in StackViewport with Different Stack Ordering',
  'This example demonstrates how to render a segmentation in a StackViewport, even when the underlying image stacks have different ordering. We use a mammography image as an example, showcasing how the correct labelmap is matched and rendered on a second viewport, regardless of the stack order.'
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
instructions.innerText = `
  Left Click: Use selected Segmentation Tool.
  Middle Click: Pan
  Right Click: Zoom
  Mouse wheel: Scroll Stack
  `;

content.append(instructions);

addDropdownToToolbar({
  id: 'LABELMAP_TOOLS_DROPDOWN',
  style: {
    width: '150px',
    marginRight: '10px',
  },
  options: { map: labelmapTools.toolMap, defaultIndex: 0 },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const tool = String(nameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the currently active tool disabled
    const toolName = toolGroup.getActivePrimaryMouseButtonTool();

    if (toolName) {
      toolGroup.setToolDisabled(toolName);
    }

    toolGroup.setToolActive(tool, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  },
  labelText: 'Tools: ',
});

let viewport1;

const segmentationId = 'SEGMENTATION';

addBrushSizeSlider({
  toolGroupId: toolGroupId,
});
// ============================= //

const thresholdOptions = ['CT Fat: (-150, -70)', 'CT Bone: (200, 1000)'];

addDropdownToToolbar({
  options: { values: thresholdOptions, defaultValue: thresholdOptions[0] },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);

    let threshold;
    if (name === thresholdOptions[0]) {
      threshold = [-150, -70];
    } else if (name == thresholdOptions[1]) {
      threshold = [100, 1000];
    }

    segmentationUtils.setBrushThresholdForToolGroup(toolGroupId, threshold);
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  addManipulationBindings(toolGroup, {
    toolMap: labelmapTools.toolMap,
  });

  toolGroup.setActivePrimaryTool('CircularBrush');

  const ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const ptImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId1,
      element: element1,
      type: ViewportType.STACK,
    },
    {
      viewportId: viewportId2,
      element: element2,
      type: ViewportType.STACK,
    },
  ];
  renderingEngine.setViewports(viewportInputArray);

  toolGroup.addViewport(viewportId1);
  toolGroup.addViewport(viewportId2);

  viewport1 = renderingEngine.getViewport(viewportId1);
  const viewport2 = renderingEngine.getViewport(viewportId2);

  viewport1.setStack(ctImageIds, 0);
  viewport2.setStack(ptImageIds, 0);

  stackContextPrefetch.enable(element1);
  stackContextPrefetch.enable(element2);

  renderingEngine.render();

  setTimeout(async () => {
    const segmentationImages =
      await cornerstone.imageLoader.createAndCacheDerivedLabelmapImages(
        ctImageIds
      );

    segmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          type: csToolsEnums.SegmentationRepresentations.Labelmap,
          data: {
            imageIds: segmentationImages.map((it) => it.imageId),
          },
        },
      },
    ]);

    // Add the segmentation representation to both viewports
    const segmentationRepresentation = {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    };

    await segmentation.addLabelmapRepresentationToViewportMap({
      [viewportId1]: [segmentationRepresentation],
      [viewportId2]: [segmentationRepresentation],
    });
  }, 100);
}

run();
