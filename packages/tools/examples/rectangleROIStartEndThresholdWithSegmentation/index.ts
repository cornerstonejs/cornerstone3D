import type { Types } from '@cornerstonejs/core';
import {
  cache,
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addCheckboxToToolbar,
  addInputToToolbar,
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
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  RectangleROIStartEndThresholdTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  annotation,
} = cornerstoneTools;

const { selection } = annotation;
const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';

const ctVolumeName = 'CT_VOLUME_ID';
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`;

const ptVolumeName = 'PT_VOLUME_ID';
const ptVolumeId = `${volumeLoaderScheme}:${ptVolumeName}`;

const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';

let thresholdLower = 0.41; // Typical default
let thresholdByMaxRelative = true;

// Helper function - based off of getThresholdValue from OHIF Viewer
function getReliableAnnotationMaxValue(annotation, volume) {
  if (!annotation) {
    console.error('getReliableAnnotationMaxValue: Missing annotation.');
    return -Infinity; // Or throw error
  }

  if (!volume) {
    console.error('getReliableAnnotationMaxValue: Missing volume.');
    return -Infinity; // Or throw error
  }

  if (!volume.imageData || typeof volume.imageData.get !== 'function') {
    console.error(
      `getReliableAnnotationMaxValue: Volume ${volume.volumeId} or its imageData/get method not found.`
    );
    return -Infinity;
  }

  const primaryVmData = volume.imageData.get('voxelManager');
  if (!primaryVmData || !primaryVmData.voxelManager) {
    console.error(
      `getReliableAnnotationMaxValue: Nested voxelManager not found for volume ${volume.volumeId}.`
    );
    return -Infinity;
  }
  const actualVoxelManager = primaryVmData.voxelManager;

  const boundsIJK =
    cornerstoneTools.utilities.rectangleROITool.getBoundsIJKFromRectangleAnnotations(
      [annotation], // Pass as an array
      volume
    );

  if (!boundsIJK) {
    console.warn(
      `getReliableAnnotationMaxValue: Could not get boundsIJK for annotation ${annotation.annotationUID}`
    );
    return -Infinity;
  }

  let maxValue = -Infinity;
  let iteratedCount = 0;
  try {
    actualVoxelManager.forEach(
      ({ value: voxelValue }) => {
        iteratedCount++;
        if (voxelValue > maxValue) {
          maxValue = voxelValue;
        }
      },
      { boundsIJK }
    );
  } catch (e) {
    console.error(
      `Error during voxelManager.forEach in getReliableAnnotationMaxValue: ${e.message}`
    );
    return -Infinity; // Or rethrow if critical
  }

  if (iteratedCount === 0 && maxValue === -Infinity) {
    console.warn(
      `getReliableAnnotationMaxValue: forEach did not iterate or all values <= -Infinity for annotation ${
        annotation.annotationUID
      }. BoundsIJK: ${JSON.stringify(boundsIJK)}.`
    );
  }

  return maxValue;
}

// ======== Set up page ======== //
setTitleAndDescription(
  'Rectangle ROI Start End Threshold Tool',
  'Here we demonstrate usage of the Start en End ROI tool'
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
  - Click Set Start Slice to set the first slice for the annotation.
  - Click Set End Slice Threshold to set the last slice for the annotation.

  Middle Click: Pan
  Right Click: Zoom
  Mouse wheel: Scroll Stack
  `;

content.append(instructions);

// ============================= //

addButtonToToolbar({
  title: 'Set Start Slice',
  onClick: () => {
    const selectedAnnotationUIDs = selection.getAnnotationsSelectedByToolName(
      RectangleROIStartEndThresholdTool.toolName
    ) as Array<string>;

    if (!selectedAnnotationUIDs) {
      throw new Error('No annotation selected ');
    }

    const annotationUID = selectedAnnotationUIDs[0];
    const annotation = cornerstoneTools.annotation.state.getAnnotation(
      annotationUID
    ) as cornerstoneTools.Types.ToolSpecificAnnotationTypes.RectangleROIStartEndThresholdAnnotation;

    if (!annotation) {
      return;
    }

    const viewport = annotation.metadata.enabledElement.viewport;

    // get the current focalpoint
    const focalPointToStart = viewport.getCamera().focalPoint;
    annotation.data.startCoordinate = focalPointToStart;

    // IMPORTANT: invalidate the toolData for the cached stat to get updated
    // and re-calculate the projection points
    annotation.invalidated = true;
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Set End Slice',
  onClick: () => {
    const selectedAnnotationUIDs = selection.getAnnotationsSelectedByToolName(
      RectangleROIStartEndThresholdTool.toolName
    ) as Array<string>;

    if (!selectedAnnotationUIDs) {
      throw new Error('No annotation selected ');
    }

    const annotationUID = selectedAnnotationUIDs[0];
    const annotation = cornerstoneTools.annotation.state.getAnnotation(
      annotationUID
    ) as cornerstoneTools.Types.ToolSpecificAnnotationTypes.RectangleROIStartEndThresholdAnnotation;

    if (!annotation) {
      return;
    }

    const viewport = annotation.metadata.enabledElement.viewport;

    // get the current focalpoint
    const focalPointToEnd = viewport.getCamera().focalPoint;
    annotation.data.endCoordinate = focalPointToEnd;

    // IMPORTANT: invalidate the toolData for the cached stat to get updated
    // and re-calculate the projection points
    annotation.invalidated = true;

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Run Segmentation',
  onClick: () => {
    const annotations = cornerstoneTools.annotation.state.getAllAnnotations();
    const labelmapVolume = cache.getVolume(segmentationId);

    if (!annotations || annotations.length === 0) {
      alert('Please draw an annotation first.');
      return;
    }

    const volume = cache.getVolume(ptVolumeId);

    const annotationUIDs = annotations.map((a) => {
      return a.annotationUID;
    });

    const upper = Infinity;
    let lower = thresholdLower;
    if (thresholdByMaxRelative) {
      // Works normally, but doesn't populate in time for playwright
      //const annotationMaxValue = annotations[0].data.cachedStats.statistics.max;

      // Alternative more reliable method
      //const sourceVolume = cache.getVolume(volumeId);
      const annotationMaxValue = getReliableAnnotationMaxValue(
        annotations[0],
        volume
      );
      if (annotationMaxValue !== -Infinity) {
        lower = thresholdLower * annotationMaxValue;
        console.log(annotationMaxValue);
        console.log(lower);
      }
    }

    //const volume = cache.getVolumes()[0]; // 0 is volume loaded

    cornerstoneTools.utilities.segmentation.rectangleROIThresholdVolumeByRange(
      annotationUIDs,
      labelmapVolume,
      [{ volume, lower, upper }],
      { overwrite: true, segmentationId }
    );

    cornerstoneTools.segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
      labelmapVolume.volumeId
    );
    labelmapVolume.modified();

    // example calculate TMTV
    const segmentationIds = [segmentationId];
    cornerstoneTools.utilities.segmentation
      .computeMetabolicStats({
        segmentationIds,
        segmentIndex: 1,
      })
      .then((stats) => {
        console.log(stats);
      });

    // Example get statistics over threshold region
    cornerstoneTools.utilities.segmentation
      .getStatistics({
        segmentationId,
        segmentIndices: 1,
        mode: 'individual',
      })
      .then((stats) => {
        console.log(stats);
      });
  },
});

addInputToToolbar({
  id: 'thresholdSlider',
  title: `Threshold:`,
  defaultValue: thresholdLower,
  onSelectedValueChange: (newVal) => {
    thresholdLower = parseFloat(newVal);
  },
});

addCheckboxToToolbar({
  id: 'thresholdMaxRelative',
  title: 'Relative to Max',
  checked: thresholdByMaxRelative,
  onChange: (newChecked) => {
    thresholdByMaxRelative = newChecked;
  },
});

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  volumeLoader.createAndCacheDerivedLabelmapVolume(ptVolumeId, {
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
  cornerstoneTools.addTool(RectangleROIStartEndThresholdTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Manipulation Tools
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  const isPreferredTargetId = (
    viewport: any,
    targetInfo: { targetId: string; cachedState: any }
  ) => {
    return targetInfo.targetId.includes('PT_');
  };

  // Segmentation Tools
  toolGroup.addTool(RectangleROIStartEndThresholdTool.toolName, {
    /* Define if the stats are calculated while drawing the annotation or at the end */
    calculatePointsInsideVolume: false,
    showTextBox: true,
    storePointData: true,
    /*Set a custom wait time */
    throttleTimeout: 100,
    isPreferredTargetId,
  });

  toolGroup.setToolActive(RectangleROIStartEndThresholdTool.toolName, {
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
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  const wadoRsRoot = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
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
  const viewportId1 = 'PT_AXIAL';
  const viewportId2 = 'PT_SAGITTAL';
  const viewportId3 = 'PT_CORONAL';

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[1, 1, 1],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[1, 1, 1],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[1, 1, 1],
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
  renderingEngine.renderViewports([viewportId1, viewportId2, viewportId3]);
}

run();
