import type { Types } from '@cornerstonejs/core';
import type { Types as csToolsTypes } from '@cornerstonejs/tools';
import { vec3 } from 'gl-matrix';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  setVolumesForViewports,
  volumeLoader,
  ProgressiveRetrieveImages,
  utilities,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  addSliderToToolbar,
  addToggleButtonToToolbar,
  setCtTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';
import { getStringUrlParam } from '../../../../utils/demo/helpers/exampleParameters';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  CrosshairsTool,
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
type ThresholdConfiguration = {
  range: Types.Point2;
  isDynamic: boolean;
  dynamicRadius: number;
};
type ThresholdOption = {
  threshold: ThresholdConfiguration;
};

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
const viewportIds = [viewportId1, viewportId2, viewportId3];
// const volumeId = encodeVolumeIdInfo({
//   loader: 'fakeVolumeLoader',
//   name: 'volumeURI',
//   rows: 100,
//   columns: 100,
//   slices: 10,
//   xSpacing: 1,
//   ySpacing: 1,
//   zSpacing: 1,
// });

// ======== Set up page ======== //
setTitleAndDescription(
  'Basic manual labelmap Segmentation tools',
  'Here we demonstrate manual segmentation tools. The crosshairs rotate the ' +
    'planes, and the "Axial Oblique Angle" slider tilts the axial plane by an ' +
    'exact angle. Use the crosshairs or the slider to make a plane oblique, ' +
    'then paint on that plane to test the shape of the brush on a rotated image.'
);

const size = '512px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';
viewportGrid.style.flexWrap = 'wrap';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element1.style.flexShrink = '0';
element2.style.width = size;
element2.style.height = size;
element2.style.flexShrink = '0';
element3.style.width = size;
element3.style.height = size;
element3.style.flexShrink = '0';

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
  Left Click: Use the selected segmentation tool.
  Shift + Left Click: Erase with the circular brush.
  Ctrl + Left Click: Pan.
  Alt + Left Click: Navigate the slices.
  Middle Click drag: Move the crosshairs. Drag a reference line to move that
    plane. Drag the circle handle on a reference line to rotate the planes.
    The "Crosshairs" button turns the crosshairs off, and then the middle
    button pans again.
  Middle Wheel: Navigate the slices of the viewport that is below the pointer.
  Right Click: Zoom.
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

const optionsValues = [
  ...brushValues,
  RectangleScissorsTool.toolName,
  CircleScissorsTool.toolName,
  SphereScissorsTool.toolName,
  brushInstanceNames.ScissorsEraser,
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

const thresholdOptions = new Map<string, ThresholdOption>();
thresholdOptions.set('CT Fat: (-150, -70)', {
  threshold: {
    range: [-150, -70] as Types.Point2,
    isDynamic: false,
    dynamicRadius: 0,
  },
});
thresholdOptions.set('CT Soft Tissue: (-100, 200)', {
  threshold: {
    range: [-100, 200] as Types.Point2,
    isDynamic: false,
    dynamicRadius: 0,
  },
});
thresholdOptions.set('CT Bone: (200, 1000)', {
  threshold: {
    range: [200, 1000] as Types.Point2,
    isDynamic: false,
    dynamicRadius: 0,
  },
});

const defaultThresholdOption = thresholdOptions.keys().next().value;
const defaultThresholdConfiguration = thresholdOptions.get(
  defaultThresholdOption
)?.threshold ?? {
  range: [-150, -70] as Types.Point2,
  isDynamic: false,
  dynamicRadius: 0,
};

addDropdownToToolbar({
  options: {
    values: Array.from(thresholdOptions.keys()),
    defaultValue: defaultThresholdOption,
  },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);

    const thresholdArgs = thresholdOptions.get(name);

    if (!thresholdArgs?.threshold) {
      return;
    }

    segmentationUtils.setBrushThresholdForToolGroup(
      toolGroupId,
      thresholdArgs.threshold
    );
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

// ======== Crosshairs and slice navigation ======== //

const viewportColors = {
  [viewportId1]: 'rgb(200, 0, 0)',
  [viewportId2]: 'rgb(200, 200, 0)',
  [viewportId3]: 'rgb(0, 200, 0)',
};

function getReferenceLineColor(viewportId) {
  return viewportColors[viewportId];
}

function getReferenceLineControllable() {
  return true;
}

function getReferenceLineDraggableRotatable() {
  return true;
}

function getReferenceLineSlabThicknessControlsOn() {
  return true;
}

/**
 * The brush keeps the primary mouse button, so the crosshairs use the middle
 * mouse button. The pan tool takes the middle mouse button back when the user
 * turns the crosshairs off.
 */
function setCrosshairsEnabled(enabled: boolean) {
  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

  if (!toolGroup) {
    return;
  }

  // setToolActive merges the bindings, so first remove all of the bindings of
  // the two tools that share the middle mouse button.
  toolGroup.setToolDisabled(CrosshairsTool.toolName);
  toolGroup.setToolDisabled(PanTool.toolName);

  const panBindings: csToolsTypes.IToolBinding[] = [
    {
      mouseButton: MouseBindings.Primary,
      modifierKey: KeyboardBindings.Ctrl,
    },
  ];

  if (enabled) {
    toolGroup.setToolActive(CrosshairsTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Auxiliary }],
    });
  } else {
    panBindings.push({ mouseButton: MouseBindings.Auxiliary });
  }

  toolGroup.setToolActive(PanTool.toolName, { bindings: panBindings });

  getRenderingEngine(renderingEngineId)?.renderViewports(viewportIds);
}

// The camera of the axial viewport before the example applies an oblique angle.
let axialBaseCamera: {
  viewPlaneNormal: Types.Point3;
  viewUp: Types.Point3;
  focalPoint: Types.Point3;
  distance: number;
};

/**
 * Rotates the axial viewport about the world X axis by an exact angle. An
 * oblique plane makes the brush fill voxels that the plane cuts at an angle,
 * and that is the condition that this example tests.
 *
 * The rotation keeps the focal point of the first camera, so the plane always
 * turns about the centre of the volume. `setCamera` must also get the new
 * position, because `viewPlaneNormal` alone turns the camera about its
 * position, and that moves the focal point out of the volume.
 */
function setAxialObliqueAngle(degrees: number) {
  const viewport = getRenderingEngine(renderingEngineId)?.getViewport(
    viewportId1
  ) as Types.IVolumeViewport;

  if (!viewport || !axialBaseCamera) {
    return;
  }

  const { focalPoint, distance } = axialBaseCamera;
  const radians = (degrees * Math.PI) / 180;
  const origin: Types.Point3 = [0, 0, 0];
  const viewPlaneNormal = vec3.create();
  const viewUp = vec3.create();

  vec3.rotateX(
    viewPlaneNormal,
    axialBaseCamera.viewPlaneNormal,
    origin,
    radians
  );
  vec3.rotateX(viewUp, axialBaseCamera.viewUp, origin, radians);

  // The view plane normal points from the focal point towards the camera.
  const position = vec3.scaleAndAdd(
    vec3.create(),
    focalPoint as vec3,
    viewPlaneNormal,
    distance
  );

  viewport.setCamera({
    focalPoint,
    position: Array.from(position) as Types.Point3,
    viewPlaneNormal: Array.from(viewPlaneNormal) as Types.Point3,
    viewUp: Array.from(viewUp) as Types.Point3,
  });
  viewport.render();
}

addToggleButtonToToolbar({
  id: 'crosshairs',
  title: 'Crosshairs',
  defaultToggle: true,
  onClick: (toggle) => {
    setCrosshairsEnabled(toggle);
  },
});

addSliderToToolbar({
  id: 'obliqueAngle',
  title: 'Axial Oblique Angle: 0 degrees',
  range: [0, 60],
  step: 1,
  defaultValue: 0,
  onSelectedValueChange: (valueAsStringOrNumber) => {
    setAxialObliqueAngle(Number(valueAsStringOrNumber));
  },
  updateLabelOnChange: (value, label) => {
    label.innerHTML = `Axial Oblique Angle: ${value} degrees`;
  },
});

addButtonToToolbar({
  title: 'Reset Cameras',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);

    if (!renderingEngine) {
      return;
    }

    const obliqueSlider = document.getElementById(
      'obliqueAngle'
    ) as HTMLInputElement;

    if (obliqueSlider) {
      obliqueSlider.value = '0';
    }

    const obliqueLabel = document.getElementById('obliqueAngle-label');

    if (obliqueLabel) {
      obliqueLabel.innerHTML = 'Axial Oblique Angle: 0 degrees';
    }

    viewportIds.forEach((viewportId) => {
      const viewport = renderingEngine.getViewport(
        viewportId
      ) as Types.IVolumeViewport;

      viewport.resetCamera({
        resetPan: true,
        resetZoom: true,
        resetToCenter: true,
        resetRotation: true,
      });
    });

    renderingEngine.renderViewports(viewportIds);
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
  const overwriteMode = getStringUrlParam('overwriteMode');
  // Init Cornerstone and related libraries
  await initDemo({
    tools: {
      segmentation: {
        overwriteMode:
          overwriteMode === 'all' ||
          overwriteMode === 'visible' ||
          overwriteMode === 'none'
            ? overwriteMode
            : undefined,
      },
    },
  });

  // This is not necessary, but makes the images appear faster
  utilities.imageRetrieveMetadataProvider.add(
    'volume',
    ProgressiveRetrieveImages.interleavedRetrieveStages
  );

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(RectangleScissorsTool);
  cornerstoneTools.addTool(CircleScissorsTool);
  cornerstoneTools.addTool(SphereScissorsTool);
  cornerstoneTools.addTool(PaintFillTool);
  cornerstoneTools.addTool(BrushTool);
  cornerstoneTools.addTool(CrosshairsTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Manipulation Tools
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

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
  toolGroup.addTool(CrosshairsTool.toolName, {
    getReferenceLineColor,
    getReferenceLineControllable,
    getReferenceLineDraggableRotatable,
    getReferenceLineSlabThicknessControlsOn,
  });
  toolGroup.addToolInstance(
    brushInstanceNames.CircularBrush,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.CircularBrush,
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
    brushInstanceNames.CircularEraser,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.CircularEraser,
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.SphereEraser,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.SphereEraser,
    }
  );
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
        modifierKey: KeyboardBindings.Alt,
      },
      {
        mouseButton: MouseBindings.Wheel, // Mouse wheel
      },
      {
        numTouchPoints: 1,
        modifierKey: KeyboardBindings.Meta,
      },
    ],
  });
  toolGroup.addToolInstance(
    brushInstanceNames.ThresholdCircle,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.ThresholdCircle,
      threshold: defaultThresholdConfiguration,
    }
  );

  toolGroup.setToolActive(brushInstanceNames.CircularBrush, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  toolGroup.setToolActive(brushInstanceNames.CircularEraser, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Shift Middle
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });

  // The pan tool and the crosshairs tool share the middle mouse button.
  // setCrosshairsEnabled gives the middle mouse button to one of the two tools,
  // and this example calls that function after it adds the viewports.

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
        background: [0.2, 0, 0.2] as Types.Point3,
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: [0.2, 0, 0.2] as Types.Point3,
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: [0.2, 0, 0.2] as Types.Point3,
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

  // The crosshairs tool needs the viewports of the tool group and a camera for
  // each viewport, so this call must come after setVolumesForViewports.
  setCrosshairsEnabled(true);

  // Keep the camera of the axial viewport. The "Axial Oblique Angle" slider
  // rotates this camera, and the "Reset Cameras" button restores it.
  const axialViewport = renderingEngine.getViewport(
    viewportId1
  ) as Types.IVolumeViewport;
  const { viewPlaneNormal, viewUp, focalPoint, position } =
    axialViewport.getCamera();
  axialBaseCamera = {
    viewPlaneNormal: [...viewPlaneNormal] as Types.Point3,
    viewUp: [...viewUp] as Types.Point3,
    focalPoint: [...focalPoint] as Types.Point3,
    distance: vec3.distance(position as vec3, focalPoint as vec3),
  };

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
