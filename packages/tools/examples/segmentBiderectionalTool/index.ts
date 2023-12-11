import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  cache,
} from '@cornerstonejs/core';
import { adaptersRT } from '@cornerstonejs/adapters';
import * as cornerstoneTools from '@cornerstonejs/tools';

import vtkImageMarchingSquares from '@kitware/vtk.js/Filters/General/ImageMarchingSquares';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { vec3 } from 'gl-matrix';

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

const EPSILON = 1e-2;

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
  utilities: cstUtils,
} = cornerstoneTools;

const { roundNumber } = cstUtils;

const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils } = cstUtils;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';
let representationUID;

// ======== Set up page ======== //
setTitleAndDescription(
  'Basic manual labelmap Segmentation tools',
  'Here we demonstrate manual segmentation tools'
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

addSliderToToolbar({
  title: 'Brush Size',
  range: [5, 50],
  defaultValue: 25,
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const value = Number(valueAsStringOrNumber);
    segmentationUtils.setBrushSizeForToolGroup(toolGroupId, value);
  },
});

addButtonToToolbar({
  title: 'Find Bidirectional',
  onClick: () => {
    const segmentationsList = segmentation.state.getSegmentations();
    console.log('Found segmentations', segmentationsList, adaptersRT);
    const { generateContourSetsFromLabelmap } = adaptersRT.Cornerstone3D.RTSS;
    const vtkUtils = {
      vtkImageMarchingSquares,
      vtkDataArray,
      vtkImageData,
    };

    const config1 = segmentation.config.getSegmentSpecificConfig(
      toolGroupId,
      representationUID,
      1
    ) || { label: 'Segmentation', color: null };
    const segmentations = {
      ...segmentationsList[0],
      segments: [null, config1],
    };

    console.time('contour');
    const contours = generateContourSetsFromLabelmap({
      segmentations,
      cornerstoneCache: cache,
      cornerstoneToolsEnums: csToolsEnums,
      vtkUtils,
    });
    console.timeEnd('contour');

    console.log('Found contours', contours);
    if (!contours?.length || !contours[0].sliceContours.length) {
      instructions.innerText = 'No contours found';
      return;
    }

    const bidirectional = generateBidirectional(contours[0]);
    if (bidirectional) {
      console.log('Found bidirectional measurement', bidirectional);
      const { handle0, handle1, handle2, handle3, maxMajor, maxMinor } =
        bidirectional;

      instructions.innerText = `
    Major Axis: ${handle0}-${handle1} length ${roundNumber(maxMajor)}
    Minor Axis: ${handle2}-${handle3} length ${roundNumber(maxMinor)}
    `;
    }
  },
});

function findLargestSlice(sliceContours) {
  // TODO - implement this.
  return sliceContours[0];
}

function createBidirectional(sliceContours) {
  let maxBidirectional;
  for (const sliceContour of sliceContours) {
    const bidirectional = createBidirectionalForSlice(sliceContour);
    if (!bidirectional) {
      continue;
    }
    if (
      !maxBidirectional ||
      maxBidirectional.maxMajor > bidirectional.maxMajor ||
      (maxBidirectional.maxMajor === bidirectional.maxMajor &&
        maxBidirectional.maxMinor > bidirectional.maxMinor)
    ) {
      maxBidirectional = bidirectional;
    }
  }
  return maxBidirectional;
}

function createBidirectionalForSlice(sliceContour, currentMax) {
  const { points } = sliceContour.polyData;
  let maxMajor = 0;
  let maxMajorPoints = [0, 1];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const pointI = points[i];
      const pointJ = points[j];
      const distance = vec3.distance(pointI, pointJ);
      if (distance > maxMajor) {
        maxMajor = distance;
        maxMajorPoints = [i, j];
      }
    }
  }
  if (maxMajor < currentMax) {
    return;
  }
  const handle0 = points[maxMajorPoints[0]];
  const handle1 = points[maxMajorPoints[1]];
  const majorDelta = vec3.sub(vec3.create(), handle0, handle1);

  let maxMinor = 0;
  let maxMinorPoints = [0, 0];

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const delta = vec3.sub(vec3.create(), points[i], points[j]);
      const distance = vec3.distance(points[i], points[j]);
      const dot = Math.abs(vec3.dot(delta, majorDelta)) / distance / maxMajor;
      if (dot > EPSILON) {
        continue;
      }
      if (distance > maxMinor) {
        maxMinor = distance;
        maxMinorPoints = [i, j];
      }
    }
  }

  const handle2 = points[maxMinorPoints[0]];
  const handle3 = points[maxMinorPoints[1]];

  const bidirectional = {
    handle0,
    handle1,
    handle2,
    handle3,
    maxMajor,
    maxMinor,
  };
  return bidirectional;
}

function generateBidirectional(contour) {
  const bidirectional = createBidirectional(contour.sliceContours);
  return bidirectional;
}

// ============================= //

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  // using volumeLoader.createAndCacheDerivedVolume.
  await volumeLoader.createAndCacheDerivedVolume(volumeId, {
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

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(SegmentationDisplayTool);
  cornerstoneTools.addTool(RectangleScissorsTool);
  cornerstoneTools.addTool(CircleScissorsTool);
  cornerstoneTools.addTool(SphereScissorsTool);
  cornerstoneTools.addTool(PaintFillTool);
  cornerstoneTools.addTool(BrushTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Manipulation Tools
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);

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

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d1qmxk7r72ysft.cloudfront.net/dicomweb',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();
  segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportId1 = 'CT_AXIAL';
  const viewportId2 = 'CT_SAGITTAL';
  const viewportId3 = 'CT_CORONAL';

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
  volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    [viewportId1, viewportId2, viewportId3]
  );

  // // Add the segmentation representation to the toolgroup
  const [segmentationRepresentationUID] =
    await segmentation.addSegmentationRepresentations(toolGroupId, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ]);
  representationUID = segmentationRepresentationUID;

  // Render the image
  renderingEngine.renderViewports([viewportId1, viewportId2, viewportId3]);
}

run();
