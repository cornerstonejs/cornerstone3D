import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addSliderToToolbar,
  setCtTransferFunctionForVolumeActor,
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
const viewportId1 = 'volumeViewport';

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = 'volumeSegmentationId';
const toolGroupId = 'toolgroupIdVolume';

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

const optionsValues = [...brushValues, SegmentBidirectionalTool.toolName];

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

        SegmentBidirectionalTool.hydrate(viewportId1, [majorAxis, minorAxis], {
          segmentIndex,
          segmentationId,
        });

        // render the bidirectional tool data
      });
    });
  },
});

// ============================= //

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });

  // Add the segmentations to state
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

  // Add the segmentation representation to the viewport
  await segmentation.addSegmentationRepresentations(viewportId1, [
    {
      segmentationId: segmentationId,
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

function getCtImageIds() {
  return createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot,
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
  cornerstoneTools.addTool(SegmentBidirectionalTool);
  cornerstoneTools.addTool(BrushTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  addManipulationBindings(toolGroup, { enableShiftClickZoom: true });

  toolGroup.addTool(BidirectionalTool.toolName, {
    actions: actionConfiguration,
  });
  toolGroup.addTool(SegmentBidirectionalTool.toolName, {});

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

  toolGroup.setToolActive(brushInstanceNames.CircularBrush, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  toolGroup.setToolPassive(SegmentBidirectionalTool.toolName, {});

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
  const imageIds = await getCtImageIds();

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[255, 0, 0],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);
  ToolGroupManager.getToolGroup(toolGroupId).addViewport(
    viewportId1,
    renderingEngineId
  );

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    [viewportId1]
  );

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();
  segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);

  // // Add the segmentation representation to the viewport
  // Setup configuration for contour bidirectional action
  createSegmentConfiguration(1);
  createSegmentConfiguration(2);
  createSegmentConfiguration(3, [1, 2]);

  // Render the image
  renderingEngine.renderViewports([viewportId1]);
}

run();
