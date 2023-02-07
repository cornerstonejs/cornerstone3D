import {
  cache,
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addSliderToToolbar,
  addDropdownToToolbar,
  setCtTransferFunctionForVolumeActor,
  setPetColorMapTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import perfusionColorMap from './preset';

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

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use

const ctVolumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`; // VolumeId with loader id + volume id
const ptVolumeName = 'PT_VOLUME_ID';
const ptVolumeId = `${volumeLoaderScheme}:${ptVolumeName}`;
const volumeId = ptVolumeId;

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
let ctLowerThreshold = -900;
let ctUpperThreshold = -700;
const overwrite = true;

let ptLowerThreshold = 0;
let ptUpperThreshold = 5;
let overlapType = 0;

addDropdownToToolbar({
  options: {
    values: ['All voxels', 'Any voxel'],
    defaultValue: 'Any voxel',
  },
  onSelectedValueChange: (selectedValue) => {
    if (selectedValue === 'All voxels') {
      overlapType = 1;
    } else if (selectedValue === 'Any voxel') {
      overlapType = 0;
    }
  },
});

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

    // Todo: this only works for volumeViewport
    const ctVolume = cache.getVolume(ctVolumeId);
    const ptVolume = cache.getVolume(ptVolumeId);
    const segmentationVolume = cache.getVolume(segmentationId);

    csToolsUtils.segmentation.rectangleROIThresholdVolumeByRange(
      selectedAnnotationUIDs,
      segmentationVolume,
      [
        { volume: ctVolume, lower: ctLowerThreshold, upper: ctUpperThreshold },
        { volume: ptVolume, lower: ptLowerThreshold, upper: ptUpperThreshold },
      ],
      {
        numSlicesToProject,
        overwrite,
        overlapType,
      }
    );
  },
});

addSliderToToolbar({
  title: `#Slices to Segment: ${numSlicesToProject}`,
  range: [1, 10],
  defaultValue: numSlicesToProject,
  onSelectedValueChange: (value) => {
    numSlicesToProject = Number(value);
  },
  updateLabelOnChange: (value, label) => {
    label.innerText = `#Slices to Segment: ${value}`;
  },
});

addSliderToToolbar({
  title: `PT Lower Thresh: ${ptLowerThreshold}`,
  range: [0, 10],
  defaultValue: ptLowerThreshold,
  onSelectedValueChange: (value) => {
    ptLowerThreshold = Number(value);
  },
  updateLabelOnChange: (value, label) => {
    label.innerText = `PT Lower Thresh: ${value}`;
  },
});

addSliderToToolbar({
  title: `PT Upper Thresh: ${ptUpperThreshold}`,
  range: [0, 10],
  defaultValue: ptUpperThreshold,
  onSelectedValueChange: (value) => {
    ptUpperThreshold = Number(value);
  },
  updateLabelOnChange: (value, label) => {
    label.innerText = `PT Upper Thresh: ${value}`;
  },
});

addSliderToToolbar({
  title: `CT Lower Thresh: ${ctLowerThreshold}`,
  range: [-1000, 1000],
  defaultValue: ctLowerThreshold,
  onSelectedValueChange: (value) => {
    ctLowerThreshold = Number(value);
  },
  updateLabelOnChange: (value, label) => {
    label.innerText = `CT Lower Thresh: ${value}`;
  },
});

addSliderToToolbar({
  title: `CT Upper Thresh: ${ctUpperThreshold}`,
  range: [-1000, 1000],
  defaultValue: ctUpperThreshold,
  onSelectedValueChange: (value) => {
    ctUpperThreshold = Number(value);
  },
  updateLabelOnChange: (value, label) => {
    label.innerText = `CT Upper Thresh: ${value}`;
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

  const wadoRsRoot = 'https://domvja9iplmyu.cloudfront.net/dicomweb';
  const StudyInstanceUID =
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339';

  // Get Cornerstone imageIds and fetch metadata into RAM
  const ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.367700692008930469189923116409',
    wadoRsRoot,
  });

  const ptImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.780462962868572737240023906400',
    wadoRsRoot,
  });

  // Define a volume in memory
  const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
    imageIds: ctImageIds,
  });
  // Define a volume in memory
  const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
    imageIds: ptImageIds,
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

  // Set the volumes to load
  ptVolume.load();
  ctVolume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    [viewportId1, viewportId2, viewportId3]
  );

  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId: ctVolumeId,
        callback: setCtTransferFunctionForVolumeActor,
      },
      {
        volumeId: ptVolumeId,
        callback: ({ volumeActor }) =>
          setPetColorMapTransferFunctionForVolumeActor({
            volumeActor,
            preset: perfusionColorMap,
          }),
      },
    ],
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
