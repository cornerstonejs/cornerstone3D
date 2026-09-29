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
  addDropdownToToolbar,
  addInputToToolbar,
  setCtTransferFunctionForVolumeActor,
  setPetColorMapTransferFunctionForVolumeActor,
  setPetTransferFunctionForVolumeActor,
  getLocalUrl,
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
  measurementTargetFilters,
} = cornerstoneTools;

const { selection } = annotation;
const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeName = 'PT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

// The CT of the same study, which the "CT + PT fusion" view adds beside the PT
// volume.  The fusion view is not the default one, because the CT covers more
// of the patient than the PT.  A viewport that holds both volumes therefore
// resets its camera to the combined bounds, and a given slice index then shows
// a different PT slice.  `tests/rectangleROIThresholdStatisticsMIM.spec.ts`
// compares the statistics of the default view against MIM reference values at
// fixed slice indices, and those values apply to the PT volume alone.
const ctVolumeName = 'CT_VOLUME_ID';
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`;

const PT_ONLY_VIEW = 'PT only';
const FUSION_VIEW = 'CT + PT fusion';

const viewportId1 = 'PT_AXIAL';
const viewportId2 = 'PT_SAGITTAL';
const viewportId3 = 'PT_CORONAL';
const viewportIds = [viewportId1, viewportId2, viewportId3];

// `run` sets these, and the view dropdown reads them.
let renderingEngine;
let ctVolumeLoaded;

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

/**
 * Puts the labelmap representation of the segmentation on every viewport.
 */
function addSegmentationRepresentations() {
  const representation = {
    segmentationId,
    type: csToolsEnums.SegmentationRepresentations.Labelmap,
  };

  segmentation.addLabelmapRepresentationToViewportMap({
    [viewportId1]: [representation],
    [viewportId2]: [representation],
    [viewportId3]: [representation],
  });
}

/**
 * Loads the CT volume of the study, once.  The "PT only" view never calls this
 * function, so the default view fetches the PT series alone.
 */
function loadCtVolume() {
  ctVolumeLoaded ??= (async () => {
    const ctImageIds = await createImageIdsAndCacheMetaData({
      StudyInstanceUID: '1.2.840.113619.2.290.3.3767434740.226.1600859119.501', // Water phantom
      SeriesInstanceUID:
        '2.16.840.1.114362.1.12114306.25269253871.642214906.452.682', // CTAC
      wadoRsRoot:
        getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
    });

    const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
      imageIds: ctImageIds,
    });

    ctVolume.load();
  })();

  return ctVolumeLoaded;
}

/**
 * Shows the PT volume alone, or the CT volume and the PT volume together.
 *
 * The fusion view puts the CT volume first, which makes the CT volume the
 * default measurement target of the viewport.  The `targetsFilter` and the
 * `targetPredicate` of the tool then select the PT volume instead, which is
 * what this view demonstrates.
 */
async function setViewMode(mode: string) {
  if (!renderingEngine) {
    return;
  }

  if (mode === FUSION_VIEW) {
    await loadCtVolume();

    await setVolumesForViewports(
      renderingEngine,
      [
        {
          volumeId: ctVolumeId,
          callback: setCtTransferFunctionForVolumeActor,
        },
        {
          volumeId,
          callback: ({ volumeActor }) =>
            setPetColorMapTransferFunctionForVolumeActor({
              volumeActor,
              preset: perfusionColorMap,
            }),
        },
      ],
      viewportIds
    );
  } else {
    await setVolumesForViewports(
      renderingEngine,
      [{ volumeId, callback: setPetTransferFunctionForVolumeActor }],
      viewportIds
    );
  }

  // `setVolumesForViewports` replaces the actors of the viewports, which
  // removes the labelmap actor, so the representation has to go back on.
  addSegmentationRepresentations();

  renderingEngine.renderViewports(viewportIds);
}

// ======== Set up page ======== //
setTitleAndDescription(
  'Rectangle ROI Start End Threshold Tool',
  'Here we demonstrate usage of the Start en End ROI tool'
);

const size = '512px';
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

addDropdownToToolbar({
  labelText: 'View: ',
  options: {
    values: [PT_ONLY_VIEW, FUSION_VIEW],
    defaultValue: PT_ONLY_VIEW,
  },
  onSelectedValueChange: (value) => {
    setViewMode(String(value));
  },
});

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
      alert('Draw an annotation first.');
      return;
    }

    const volume = cache.getVolume(volumeId);

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
      // The annotation covers no voxel of the PT volume, so there is no
      // maximum to take the threshold relative to.  Stop here, because the
      // relative value is not an absolute threshold.
      if (annotationMaxValue === -Infinity) {
        alert(
          'The annotation covers no voxel of the PT volume, so a relative threshold has no maximum. Draw the annotation over the volume, or clear "Threshold by max relative".'
        );
        return;
      }
      lower = thresholdLower * annotationMaxValue;
      console.log(annotationMaxValue);
      console.log(lower);
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

  // Segmentation Tools
  toolGroup.addTool(RectangleROIStartEndThresholdTool.toolName, {
    /* Define if the stats are calculated while drawing the annotation or at the end */
    calculatePointsInsideVolume: false,
    showTextBox: true,
    storePointData: true,
    /*Set a custom wait time */
    throttleTimeout: 100,
    // The "CT + PT fusion" view shows a CT volume and a PT volume together,
    // and the threshold statistics must come from the PT volume.  The
    // viewport's default (first) volume is the CT one, so the tool needs this
    // configuration to measure the PT volume instead.  The `firstPixelData`
    // chooser takes the first eligible candidate, and the `forModality`
    // predicate narrows eligibility to PT; `measurementTargetFilters.forId(
    // volumeId)` would select the same volume by id.  This tool measures a
    // single target, so the `allPixelData` chooser behaves the same here.
    // The "PT only" view holds the PT volume alone, so the configuration
    // selects the same volume that the default selection gives.
    targetsFilter: measurementTargetFilters.firstPixelData,
    targetPredicate: measurementTargetFilters.forModality('PT'),
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

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.2.840.113619.2.290.3.3767434740.226.1600859119.501', // Water phantom
    //'1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463', // Original

    SeriesInstanceUID:
      '2.16.840.1.114362.1.12114306.25269253871.642214905.509.634', // PT AC192
    //'1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015', // Original

    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  renderingEngine = new RenderingEngine(renderingEngineId);

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

  // Set the volume to load
  volume.load();

  // Start on the PT only view.  `setViewMode` sets the volumes of the
  // viewports and adds the segmentation representation to each of them.
  await setViewMode(PT_ONLY_VIEW);
}

run();
