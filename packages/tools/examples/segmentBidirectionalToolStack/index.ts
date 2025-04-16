import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums, imageLoader } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addSliderToToolbar,
  addButtonToToolbar,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  BrushTool,
  PanTool,
  BidirectionalTool,
  SegmentBidirectionalTool,
  utilities: cstUtils,
} = cornerstoneTools;

const { roundNumber } = cstUtils;

const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils } = cstUtils;
let renderingEngine;
const viewportId1 = 'STACK_VIEWPORT';

// Define a unique id for the segmentation
const segmentationId = 'STACK_SEGMENTATION';
const toolGroupId = 'TOOL_GROUP_ID';

const actionConfiguration = {
  contourBidirectional: {
    method: cstUtils.segmentation.segmentContourAction,
    bindings: [
      {
        key: 'c',
      },
    ],
    data: {
      segmentData: new Map(),
    },
  },
};

// ======== Set up page ======== //
setTitleAndDescription(
  'Segment bidirectional tool',
  'Here we demonstrate automatic creation of the largest bidirectional tool which will fit the segment, or the combined segments ' +
    'when a segment is configured to be comprised of several segment indices.'
);

const size = '512px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Segment index 3 is consider to be 3, 2 and 1.
  Other indices are individual ones.
  Left Click: Use selected Segmentation Tool.
  Press 'c' to apply a new bidirectional on largest segment on a slice.
  Middle Click: Pan
  Right Click: Zoom
  Mouse wheel: Scroll Stack
  `;

content.append(instructions);

const brushInstanceNames = {
  CircularBrush: 'CircularBrush',
  CircularEraser: 'CircularEraser',
  SphereBrush: 'SphereBrush',
  SphereEraser: 'SphereEraser',
  ThresholdBrush: 'ThresholdBrush',
};

const brushStrategies = {
  [brushInstanceNames.CircularBrush]: 'FILL_INSIDE_CIRCLE',
  [brushInstanceNames.CircularEraser]: 'ERASE_INSIDE_CIRCLE',
  [brushInstanceNames.SphereBrush]: 'FILL_INSIDE_SPHERE',
  [brushInstanceNames.SphereEraser]: 'ERASE_INSIDE_SPHERE',
  [brushInstanceNames.ThresholdBrush]: 'THRESHOLD_INSIDE_CIRCLE',
};

const brushValues = [
  brushInstanceNames.CircularBrush,
  brushInstanceNames.CircularEraser,
  brushInstanceNames.SphereBrush,
  brushInstanceNames.SphereEraser,
  brushInstanceNames.ThresholdBrush,
];

const optionsValues = [...brushValues, BidirectionalTool.toolName];

// ============================= //
addDropdownToToolbar({
  options: { values: optionsValues, defaultValue: BrushTool.toolName },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the currently active tool disabled
    const toolName = toolGroup.getActivePrimaryMouseButtonTool();

    if (toolName) {
      toolGroup.setToolDisabled(toolName);
    }

    if (brushValues.includes(name)) {
      toolGroup.setToolActive(name, {
        bindings: [{ mouseButton: MouseBindings.Primary }],
      });
    } else {
      const toolName = name;

      toolGroup.setToolActive(toolName, {
        bindings: [{ mouseButton: MouseBindings.Primary }],
      });
    }
  },
});

addSliderToToolbar({
  title: 'Brush Size',
  range: [5, 100],
  defaultValue: 25,
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const value = Number(valueAsStringOrNumber);
    segmentationUtils.setBrushSizeForToolGroup(toolGroupId, value);
  },
});

addDropdownToToolbar({
  options: { values: ['1', '2', '3,2,1', '4'], defaultValue: '1' },
  labelText: 'Segment',
  onSelectedValueChange: (segmentIndex) => {
    const indices = String(segmentIndex).split(',');
    segmentation.segmentIndex.setActiveSegmentIndex(
      segmentationId,
      Number(indices[0])
    );
  },
});

addButtonToToolbar({
  title: 'Find Bidirectional',
  onClick: async () => {
    [element1].forEach(async (element) => {
      const bidirectionalData =
        await cstUtils.segmentation.getSegmentLargestBidirectional({
          segmentationId,
          segmentIndices: [1],
        });

      bidirectionalData.forEach((bidirectional) => {
        const { segmentIndex } = bidirectional;
        const { majorAxis, minorAxis, maxMajor, maxMinor } = bidirectional;

        cornerstoneTools.SegmentBidirectionalTool.hydrate(
          viewportId1,
          [majorAxis, minorAxis],
          {
            segmentIndex,
            segmentationId,
          }
        );

        // render the bidirectional tool data
      });
    });
  },
});

// ============================= //

async function addSegmentationsToState(imageIds) {
  // Create a segmentation of the same resolution as the source data
  const segImages = await imageLoader.createAndCacheDerivedLabelmapImages(
    imageIds
  );

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data
        data: {
          imageIds: segImages.map((it) => it.imageId),
        },
      },
    },
  ]);

  // Add the segmentation representation to the viewport
  await segmentation.addSegmentationRepresentations(viewportId1, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);
}

/**
 * One possible way to create segment colours and combinations
 */
function createSegmentConfiguration(segmentIndex, otherSegments?) {
  const containedSegmentIndices = otherSegments
    ? { has: (segmentIndex) => otherSegments.indexOf(segmentIndex) !== -1 }
    : undefined;
  const colorConfig = segmentation.config.color.getSegmentIndexColor(
    viewportId1,
    segmentationId,
    segmentIndex
  );
  // Allow null style to skip style set
  let color, activeColor;
  if (colorConfig?.length) {
    color = `rgb(${colorConfig.join(',')})`;
    // Possible alternative if you want a slightly different active color
    // activeColor = `rgb(${colorConfig
    //   .map((sample) => {
    //     return Math.round(
    //       sample < 128 ? sample + 64 : sample + (255 - sample) * 0.1
    //     );
    //   })
    //   .join(',')})`;
    activeColor = color;
  }
  const style = {
    color,
    colorHighlightedActive: activeColor,
    colorActive: activeColor,
    textBoxColor: color,
    textBoxColorActive: activeColor,
    textBoxColorHighlightedActive: activeColor,
  };
  const label = otherSegments
    ? `Combined ${segmentIndex} with ${otherSegments.join(', ')}`
    : `Segment ${segmentIndex}`;

  actionConfiguration.contourBidirectional.data.segmentData.set(segmentIndex, {
    containedSegmentIndices,
    label,
    style,
  });
}

const wadoRsRoot = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
const StudyInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';

async function getCtImageIds() {
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.137585363493444318569098508293',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.699272945123913604672897602509',
    SOPInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.295285318555680716246271899544',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });
  return imageIds;
}

function getMGImageIds() {
  return createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.4792.2001.105216574054253895819671475627',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.4792.2001.326862698868700146219088322924',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(BidirectionalTool);
  cornerstoneTools.addTool(BrushTool);
  cornerstoneTools.addTool(SegmentBidirectionalTool);
  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  toolGroup.addTool(SegmentBidirectionalTool.toolName, {});

  addManipulationBindings(toolGroup, { enableShiftClickZoom: true });

  toolGroup.addTool(BidirectionalTool.toolName, {
    actions: actionConfiguration,
  });

  // Segmentation Tools
  toolGroup.addToolInstance(
    brushInstanceNames.CircularBrush,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.CircularBrush,
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.CircularEraser,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.CircularEraser,
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.SphereBrush,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.SphereBrush,
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.SphereEraser,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.SphereEraser,
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.ThresholdBrush,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.ThresholdBrush,
    }
  );
  toolGroup.setToolPassive(SegmentBidirectionalTool.toolName, {});

  toolGroup.setToolActive(brushInstanceNames.CircularBrush, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Middle Click
      },
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Ctrl,
      },
    ],
  });
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(BidirectionalTool.toolName);

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  // const imageIds = await getCtImageIds();
  // const imageIds = await getMGImageIds();
  const imageIds = await getCtImageIds();

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.STACK,
      element: element1,
      defaultOptions: {
        background: <Types.Point3>[255, 0, 0],
      },
    },
  ];

  cornerstoneTools.utilities.stackContextPrefetch.enable(element1);

  renderingEngine.setViewports(viewportInputArray);

  // Add the viewport to the toolgroup
  toolGroup.addViewport(viewportId1, renderingEngineId);

  const viewport = renderingEngine.getViewport(viewportId1);
  await viewport.setStack(imageIds, 0);

  // Add some segmentations based on the source data
  await addSegmentationsToState(imageIds);
  segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);

  // Setup configuration for contour bidirectional action
  createSegmentConfiguration(1);
  createSegmentConfiguration(2);
  createSegmentConfiguration(3, [1, 2]);

  // Enable stack prefetch
  cornerstoneTools.utilities.stackContextPrefetch.enable(element1);

  // Render the image
  renderingEngine.render();
}

run();
