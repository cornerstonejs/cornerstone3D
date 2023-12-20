import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  imageLoader,
  getEnabledElement,
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
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  SegmentationDisplayTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  RectangleScissorsTool,
  SphereScissorsTool,
  CircleScissorsTool,
  BrushTool,
  PaintFillTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  StackScrollMouseWheelTool,
  BidirectionalTool,
  utilities: cstUtils,
} = cornerstoneTools;

const { roundNumber } = cstUtils;

const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils } = cstUtils;
let renderingEngine;
const viewportId1 = 'volumeViewport';
const viewportId2 = 'stackViewport';

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationIdVolume = 'volumeSegmentationId';
const segmentationIdStack = 'stackSegmentationId';
const toolGroupIds = ['toolgroupIdVolume', 'toolgroupIdStack'];
const segmentationRepresentationUIDs = [];
let stackImageIds;

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

const element2 = document.createElement('div');
element2.oncontextmenu = () => false;

element2.style.width = size;
element2.style.height = size;

viewportGrid.appendChild(element2);

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

const optionsValues = [
  ...brushValues,
  RectangleScissorsTool.toolName,
  CircleScissorsTool.toolName,
  SphereScissorsTool.toolName,
  PaintFillTool.toolName,
  BidirectionalTool.toolName,
];

// ============================= //
addDropdownToToolbar({
  options: { values: optionsValues, defaultValue: BrushTool.toolName },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);
    toolGroupIds.forEach((toolGroupId) => {
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
    });
  },
});

addSliderToToolbar({
  title: 'Brush Size',
  range: [5, 50],
  defaultValue: 25,
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const value = Number(valueAsStringOrNumber);
    toolGroupIds.forEach((toolGroupId) => {
      segmentationUtils.setBrushSizeForToolGroup(toolGroupId, value);
    });
  },
});

addDropdownToToolbar({
  options: { values: ['1', '2', '3,2,1', '4'], defaultValue: '1' },
  labelText: 'Segment',
  onSelectedValueChange: (segmentIndex) => {
    const indices = String(segmentIndex).split(',');
    segmentation.segmentIndex.setActiveSegmentIndex(
      segmentationIdVolume,
      Number(indices[0])
    );
    segmentation.segmentIndex.setActiveSegmentIndex(
      segmentationIdStack,
      Number(indices[0])
    );
  },
});

addButtonToToolbar({
  title: 'Find Bidirectional',
  onClick: () => {
    [element1, element2].forEach((element) => {
      const bidirectional = actionConfiguration.contourBidirectional.method(
        element,
        actionConfiguration.contourBidirectional
      );

      if (!bidirectional) {
        console.log('No bidirectional found');
        return;
      }
      const { majorAxis, minorAxis, maxMajor, maxMinor } = bidirectional;
      const [majorPoint0, majorPoint1] = majorAxis;
      const [minorPoint0, minorPoint1] = minorAxis;
      instructions.innerText = `
    Major Axis: ${majorPoint0}-${majorPoint1} length ${roundNumber(maxMajor)}
    Minor Axis: ${minorPoint0}-${minorPoint1} length ${roundNumber(maxMinor)}
    `;
    });
  },
});

// ============================= //

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  // using volumeLoader.createAndCacheDerivedVolume.
  await volumeLoader.createAndCacheDerivedVolume(volumeId, {
    volumeId: segmentationIdVolume,
  });

  const { imageIds: segmentationImageIds } =
    await imageLoader.createAndCacheDerivedImages(stackImageIds);

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId: segmentationIdVolume,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          volumeId: segmentationIdVolume,
        },
      },
    },
    {
      segmentationId: segmentationIdStack,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIdReferenceMap: new Map(
            stackImageIds.map((imageId, index) => [
              imageId,
              segmentationImageIds[index],
            ])
          ),
        },
      },
    },
  ]);
  // Add the segmentation representation to the toolgroup
  segmentationRepresentationUIDs.push(
    ...(await segmentation.addSegmentationRepresentations(toolGroupIds[0], [
      {
        segmentationId: segmentationIdVolume,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ]))
  );
  segmentationRepresentationUIDs.push(
    ...(await segmentation.addSegmentationRepresentations(toolGroupIds[1], [
      {
        segmentationId: segmentationIdStack,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ]))
  );
}

/**
 * One possible way to create segment colours and combinations
 */
function createSegmentConfiguration(segmentIndex, otherSegments?) {
  const containedSegmentIndices = otherSegments
    ? { has: (segmentIndex) => otherSegments.indexOf(segmentIndex) !== -1 }
    : undefined;
  const colorConfig = segmentation.config.color.getColorForSegmentIndex(
    toolGroupIds[0],
    segmentationRepresentationUIDs[0],
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

const wadoRsRoot = 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb';
const StudyInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';

function getPtImageIds() {
  return createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot,
  });
}
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
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(BidirectionalTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(SegmentationDisplayTool);
  cornerstoneTools.addTool(RectangleScissorsTool);
  cornerstoneTools.addTool(CircleScissorsTool);
  cornerstoneTools.addTool(SphereScissorsTool);
  cornerstoneTools.addTool(PaintFillTool);
  cornerstoneTools.addTool(BrushTool);

  // Define tool groups to add the segmentation display tool to
  toolGroupIds.forEach((toolGroupId) => {
    const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

    // Manipulation Tools
    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(StackScrollTool.toolName);
    toolGroup.addTool(ZoomTool.toolName);
    toolGroup.addTool(StackScrollMouseWheelTool.toolName);

    toolGroup.addTool(BidirectionalTool.toolName, {
      actions: actionConfiguration,
    });

    // Segmentation Tools
    toolGroup.addTool(SegmentationDisplayTool.toolName);
    toolGroup.addTool(RectangleScissorsTool.toolName);
    toolGroup.addTool(CircleScissorsTool.toolName);
    toolGroup.addTool(SphereScissorsTool.toolName);
    toolGroup.addTool(PaintFillTool.toolName);
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
    toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

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
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Secondary, // Right Click
        },
        {
          mouseButton: MouseBindings.Primary,
          modifierKey: KeyboardBindings.Shift,
        },
      ],
    });
    toolGroup.setToolActive(StackScrollTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
          modifierKey: KeyboardBindings.Alt,
        },
      ],
    });
    // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
    // hook instead of mouse buttons, it does not need to assign any mouse button.
    toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
    toolGroup.setToolActive(BidirectionalTool.toolName);
  });

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const [imageIds, imageIdsStack] = await Promise.all([
    getCtImageIds(),
    getPtImageIds(),
  ]);
  stackImageIds = imageIdsStack;

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
    {
      viewportId: viewportId2,
      type: ViewportType.STACK,
      element: element2,
      defaultOptions: {
        background: <Types.Point3>[0, 255, 0],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);
  ToolGroupManager.getToolGroup(toolGroupIds[0]).addViewport(
    viewportId1,
    renderingEngineId
  );
  ToolGroupManager.getToolGroup(toolGroupIds[1]).addViewport(
    viewportId2,
    renderingEngineId
  );
  const stackViewport = renderingEngine.getViewport(viewportId2);

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    [viewportId1]
  );
  await stackViewport.setStack(imageIdsStack);

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();
  segmentation.segmentIndex.setActiveSegmentIndex(segmentationIdVolume, 1);
  segmentation.segmentIndex.setActiveSegmentIndex(segmentationIdStack, 1);

  // // Add the segmentation representation to the toolgroup
  // Setup configuration for contour bidirectional action
  createSegmentConfiguration(1);
  createSegmentConfiguration(2);
  createSegmentConfiguration(3, [1, 2]);

  // Render the image
  renderingEngine.renderViewports([viewportId1, viewportId2]);
}

run();
