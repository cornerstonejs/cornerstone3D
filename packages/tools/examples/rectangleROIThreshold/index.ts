import {
  cache,
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  CONSTANTS,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addSliderToToolbar,
  setCtTransferFunctionForVolumeActor,
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
  RectangleROIThresholdTool,
  PanTool,
  ZoomTool,
  StackScrollMouseWheelTool,
  annotation,
  utilities: csToolsUtils,
} = cornerstoneTools;

const { selection } = annotation;
const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;
const { ORIENTATION } = CONSTANTS;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';

let segmentationRepresentationByUID;

// ======== Set up page ======== //
setTitleAndDescription(
  'Rectangle ROI Threshold Tool',
  'Here we demonstrate usage of the ROI Threshold tool'
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
  - Draw a target region with the left click.
  - Move the sliders to set the number of slices perpendicular to the region to segment, and the thresholding range.
  - Click Execute Threshold to perform the thresholded segmentation.

  Middle Click: Pan
  Right Click: Zoom
  Mouse wheel: Scroll Stack
  `;

content.append(instructions);

// ============================= //

let numSlicesToProject = 3;
let lowerThreshold = 100;
let upperThreshold = 500;

addButtonToToolbar({
  title: 'Execute threshold',
  onClick: () => {
    const selectedAnnotationUIDs = selection.getAnnotationsSelectedByToolName(
      RectangleROIThresholdTool.toolName
    ) as Array<string>;

    if (!selectedAnnotationUIDs) {
      throw new Error('No annotation selected ');
    }

    const annotationUID = selectedAnnotationUIDs[0];
    const annotation = cornerstoneTools.annotation.state.getAnnotation(
      annotationUID
    ) as cornerstoneTools.Types.ToolSpecificAnnotationTypes.RectangleROIThresholdAnnotation;

    if (!annotation) {
      return;
    }

    const { metadata } = annotation; // assuming they are all overlayed on the same toolGroup
    const viewport = metadata.enabledElement.viewport as Types.IVolumeViewport;

    const volumeActorInfo = viewport.getDefaultActor();

    // Todo: this only works for volumeViewport
    const { uid } = volumeActorInfo;
    const referenceVolume = cache.getVolume(uid);
    const segmentationVolume = cache.getVolume(segmentationId);

    csToolsUtils.segmentation.rectangleROIThresholdVolumeByRange(
      selectedAnnotationUIDs,
      segmentationVolume,
      [referenceVolume],
      {
        numSlicesToProject,
        lower: lowerThreshold,
        upper: upperThreshold,
        overwrite: false,
      }
    );
  },
});

addSliderToToolbar({
  title: `Number of Slices to Segment: ${numSlicesToProject
    .toString()
    .padStart(4)}`,
  range: [1, 5],
  defaultValue: numSlicesToProject,
  onSelectedValueChange: (value) => {
    numSlicesToProject = Number(value);
  },
  updateLabelOnChange: (value, label) => {
    label.innerText = `Number of Slices to Segment: ${value}`;
  },
});

addSliderToToolbar({
  title: `Lower Threshold: ${lowerThreshold}`,
  range: [100, 400],
  defaultValue: lowerThreshold,
  onSelectedValueChange: (value) => {
    lowerThreshold = Number(value);
  },
  updateLabelOnChange: (value, label) => {
    label.innerText = `Lower Threshold: ${value}`;
  },
});

addSliderToToolbar({
  title: `Upper Threshold: ${upperThreshold.toString().padStart(4)}`,
  range: [500, 1000],
  defaultValue: upperThreshold,
  onSelectedValueChange: (value) => {
    upperThreshold = Number(value);
  },
  updateLabelOnChange: (value, label) => {
    label.innerText = `Upper Threshold: ${value}`;
  },
});

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
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(SegmentationDisplayTool);
  cornerstoneTools.addTool(RectangleROIThresholdTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Manipulation Tools
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);

  // Segmentation Tools
  toolGroup.addTool(SegmentationDisplayTool.toolName);
  toolGroup.addTool(RectangleROIThresholdTool.toolName);
  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

  toolGroup.setToolActive(RectangleROIThresholdTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Middle Click
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
    type: 'VOLUME',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();

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
        orientation: ORIENTATION.AXIAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
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
  const segmentationRepresentationByUIDs =
    await segmentation.addSegmentationRepresentations(toolGroupId, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ]);

  segmentationRepresentationByUID = segmentationRepresentationByUIDs[0];

  // Render the image
  renderingEngine.renderViewports([viewportId1, viewportId2, viewportId3]);
}

run();
