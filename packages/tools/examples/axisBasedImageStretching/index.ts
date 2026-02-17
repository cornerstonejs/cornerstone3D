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
  addButtonToToolbar,
  addManipulationBindings,
  setCtTransferFunctionForVolumeActor,
  annotationTools,
  contourTools,
  labelmapTools,
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
  utilities: cstUtils,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils } = cstUtils;

// Combined tool map: annotationTools first, then labelmapTools, then contourTools
const toolMap = new Map(annotationTools);
for (const [key, value] of labelmapTools.toolMap) {
  toolMap.set(key, value);
}
for (const [key, value] of contourTools.toolMap) {
  toolMap.set(key, value);
}

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
  'Axis-based Image Stretching',
  'Here we demonstrate axis based stretching with annotation and segmentation tools'
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
  Shift Left Click: Zoom
  Alt Left Click: Stack Scroll
  `;

content.append(instructions);

const defaultTool = 'CircularBrush';

// ============================= //
addDropdownToToolbar({
  options: { map: toolMap, defaultValue: defaultTool },
  onSelectedValueChange: (newSelectedToolName) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the old tool passive
    const selectedToolName = toolGroup.getActivePrimaryMouseButtonTool();
    if (selectedToolName) {
      toolGroup.setToolPassive(selectedToolName);
    }

    // Set the new tool active
    toolGroup.setToolActive(newSelectedToolName as string, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
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
    defaultValue: Array.from(thresholdOptions.keys())[0],
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
  let [sx, sy] = aspectRatio;
  if (selectedAxis === 'Stretch X') {
    [sx, sy] = [value, aspectRatio[1]];
  } else {
    [sx, sy] = [aspectRatio[0], value];
  }
  [viewportId1, viewportId2, viewportId3].forEach((id) => {
    const vp = renderingEngine.getViewport(id);
    vp.setAspectRatio([sx, sy]);
    vp.render();
  });
};

const aspects = ['1:1', '1:2', '2:1', '0.5:1', '1:0.5', '3:17'];
addDropdownToToolbar({
  id: 'aspect',
  options: {
    values: aspects,
    defaultValue: aspects[0],
  },
  onSelectedValueChange: (value) => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const aspect = (value as string)
      .split(':')
      .map((it) => Number(it)) as Types.Point2;

    [viewportId1, viewportId2, viewportId3].forEach((id) => {
      const vp = renderingEngine.getViewport(id);
      vp.setAspectRatio(aspect);
      vp.render();
    });
  },
});

addDropdownToToolbar({
  options: {
    values: stretchAxis,
    defaultValue: selectedAxis,
  },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);
    (document.getElementById('stretchSlider') as HTMLInputElement).value = '10';
    setStretch(1);
    selectedAxis = name;
  },
});

addSliderToToolbar({
  id: 'stretchSlider',
  title: 'Stretch Value',
  range: [1, 100],
  defaultValue: 10,
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const value = Number(valueAsStringOrNumber);
    setStretch(value / 10);
  },
});

const rotationValues = [0, 10, 20, 30, 40, 45, 60, 90, 120, 180];
addDropdownToToolbar({
  id: 'rotation',
  labelText: 'Rotation',
  options: {
    values: rotationValues.map(String),
    defaultValue: '0',
  },
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const rotation = Number(valueAsStringOrNumber);
    const renderingEngine = getRenderingEngine(renderingEngineId);
    [viewportId1, viewportId2, viewportId3].forEach((id) => {
      const vp = renderingEngine.getViewport(id) as Types.IVolumeViewport;
      vp.setViewPresentation({ rotation });
      vp.render();
    });
  },
});

addButtonToToolbar({
  title: 'Flip',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    [viewportId1, viewportId2, viewportId3].forEach((id) => {
      const vp = renderingEngine.getViewport(id) as Types.IVolumeViewport;
      const { flipHorizontal, flipVertical } = vp.getCamera();
      vp.setCamera({
        flipHorizontal: !flipHorizontal,
        flipVertical: !flipVertical,
      });
      vp.render();
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

  // Define tool groups
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup, {
    toolMap,
    enableShiftClickZoom: true,
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
