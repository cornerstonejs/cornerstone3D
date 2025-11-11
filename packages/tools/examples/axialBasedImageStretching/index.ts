import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  ProgressiveRetrieveImages,
  utilities,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addSliderToToolbar,
  setCtTransferFunctionForVolumeActor,
  getLocalUrl,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  LengthTool,
  RectangleROITool,
  EllipticalROITool,
  CircleROITool,
  BidirectionalTool,
  RectangleScissorsTool,
  SphereScissorsTool,
  CircleScissorsTool,
  BrushTool,
  PaintFillTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  utilities: cstUtils,
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils } = cstUtils;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`;
const renderingEngineId = 'myRenderingEngine';
const viewportId1 = 'CT_AXIAL';
const viewportId2 = 'CT_SAGITTAL';
const viewportId3 = 'CT_CORONAL';

// ======== Set up page ======== //
setTitleAndDescription(
  'Axial-based Image Stretching',
  'Here we demonstrate axial based stretching with annotation and segmentation tools'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;
element3.style.width = size;
element3.style.height = size;

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();
element3.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Left Click: Use selected Segmentation Tool.
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
  ThresholdCircle: 'ThresholdCircle',
  ScissorsEraser: 'ScissorsEraser',
};

const brushStrategies = {
  [brushInstanceNames.CircularBrush]: 'FILL_INSIDE_CIRCLE',
  [brushInstanceNames.CircularEraser]: 'ERASE_INSIDE_CIRCLE',
  [brushInstanceNames.SphereBrush]: 'FILL_INSIDE_SPHERE',
  [brushInstanceNames.SphereEraser]: 'ERASE_INSIDE_SPHERE',
  [brushInstanceNames.ThresholdCircle]: 'THRESHOLD_INSIDE_CIRCLE',
  [brushInstanceNames.ScissorsEraser]: 'ERASE_INSIDE',
};

const brushValues = [
  brushInstanceNames.CircularBrush,
  brushInstanceNames.CircularEraser,
  brushInstanceNames.SphereBrush,
  brushInstanceNames.SphereEraser,
  brushInstanceNames.ThresholdCircle,
];

const toolsNames = [
  LengthTool.toolName,
  RectangleROITool.toolName,
  EllipticalROITool.toolName,
  CircleROITool.toolName,
  BidirectionalTool.toolName,
];

const optionsValues = [
  ...brushValues,
  RectangleScissorsTool.toolName,
  CircleScissorsTool.toolName,
  SphereScissorsTool.toolName,
  brushInstanceNames.ScissorsEraser,
  PaintFillTool.toolName,
  ...toolsNames,
];

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

const thresholdOptions = new Map<string, any>();
thresholdOptions.set('CT Fat: (-150, -70)', {
  threshold: [-150, -70],
});
thresholdOptions.set('CT Bone: (200, 1000)', {
  threshold: [200, 1000],
});

addDropdownToToolbar({
  options: {
    values: Array.from(thresholdOptions.keys()),
    defaultValue: thresholdOptions[0],
  },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);

    const thresholdArgs = thresholdOptions.get(name);

    segmentationUtils.setBrushThresholdForToolGroup(toolGroupId, {
      range: thresholdArgs.threshold,
      isDynamic: false,
      dynamicRadius: null,
    });
  },
});

addSliderToToolbar({
  title: 'Brush Size',
  range: [5, 50],
  defaultValue: 25,
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const value = Number(valueAsStringOrNumber);
    segmentationUtils.setBrushSizeForToolGroup(toolGroupId, value);
  },
});

let stretchAxis = ['Stretch X', 'Stretch Y'];
let selectedAxis = stretchAxis[0];

const setStretch = (value) => {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewport = renderingEngine.getViewport(viewportId1);
  const { aspectRatio } = viewport.getCamera();
  if (selectedAxis === 'Stretch X') {
    viewport.setCamera({
      aspectRatio: [value, aspectRatio[1]],
    });
  } else {
    viewport.setCamera({
      aspectRatio: [aspectRatio[0], value],
    });
  }
  viewport.render();
};

addDropdownToToolbar({
  options: {
    values: stretchAxis,
    defaultValue: selectedAxis,
  },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);
    document.getElementById('stretchSlider').value = 1;
    setStretch(1);
    selectedAxis = name;
  },
});

addSliderToToolbar({
  id: 'stretchSlider',
  title: 'Stretch Value',
  range: [1, 10],
  defaultValue: 1,
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const value = Number(valueAsStringOrNumber);
    setStretch(value);
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
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // This is not necessary, but makes the images appear faster
  utilities.imageRetrieveMetadataProvider.add(
    'volume',
    ProgressiveRetrieveImages.interleavedRetrieveStages
  );

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(LengthTool);
  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(EllipticalROITool);
  cornerstoneTools.addTool(CircleROITool);
  cornerstoneTools.addTool(BidirectionalTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(RectangleScissorsTool);
  cornerstoneTools.addTool(CircleScissorsTool);
  cornerstoneTools.addTool(SphereScissorsTool);
  cornerstoneTools.addTool(PaintFillTool);
  cornerstoneTools.addTool(BrushTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Manipulation Tools
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  // Annotation Tools
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);
  toolGroup.addTool(EllipticalROITool.toolName);
  toolGroup.addTool(CircleROITool.toolName);
  toolGroup.addTool(BidirectionalTool.toolName);

  // Segmentation Tools
  toolGroup.addTool(RectangleScissorsTool.toolName);
  toolGroup.addTool(CircleScissorsTool.toolName);
  toolGroup.addTool(SphereScissorsTool.toolName);
  toolGroup.addToolInstance(
    brushInstanceNames.ScissorsEraser,
    SphereScissorsTool.toolName,
    {
      activeStrategy: brushStrategies.ScissorsEraser,
    }
  );
  toolGroup.addTool(PaintFillTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
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
    brushInstanceNames.ThresholdCircle,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.ThresholdCircle,
    }
  );

  toolGroup.setToolActive(brushInstanceNames.CircularBrush, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Shift Left Click
        modifierKey: KeyboardBindings.Shift,
      },
    ],
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
    ],
  });

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  volume.load();

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);
  toolGroup.addViewport(viewportId3, renderingEngineId);

  // Set the volume to load
  // volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    [viewportId1, viewportId2, viewportId3]
  );

  // Add the segmentation representation to the viewports
  const segmentationRepresentation = {
    segmentationId,
    type: csToolsEnums.SegmentationRepresentations.Labelmap,
  };

  await segmentation.addLabelmapRepresentationToViewportMap({
    [viewportId1]: [segmentationRepresentation],
    [viewportId2]: [segmentationRepresentation],
    [viewportId3]: [segmentationRepresentation],
  });

  // Render the image
  renderingEngine.render();
}

run();
