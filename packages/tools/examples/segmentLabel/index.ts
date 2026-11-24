import type { PlanarViewport } from '@cornerstonejs/core';
import {
  Enums,
  RenderingEngine,
  imageLoader,
  viewportProjection,
} from '@cornerstonejs/core';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addManipulationBindings,
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import { ctPresentation } from '../../../../utils/demo/helpers/volumePresentationRecipes';
import {
  fillStackSegmentationWithMockData,
  fillVolumeLabelmapWithMockData,
  addMockContourSegmentation,
} from '../../../../utils/test/testUtils';
import type { IStreamingImageVolume } from '@cornerstonejs/core/types';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,

  Enums: csToolsEnums,
  SegmentLabelTool,
  segmentation,
  PlanarFreehandContourSegmentationTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
let renderingEngine;
const volumeId = 'myVolume';
const renderingEngineId = 'myRenderingEngine';
const stackDisplaySetId = 'segmentLabel:stack';
const volumeDisplaySetId = 'segmentLabel:volume';

// Number of slices between segment 1 and segment 2 in the volume contour
// viewport. They must be NON-adjacent: a single-slice gap (~1 voxel) is within
// the contour render/pick tolerance, so segment 2 would still be hit-tested
// from segment 1's slice and its name would leak onto empty space. A larger gap
// puts segment 2 unambiguously off segment 1's displayed slice.
// NOTE: tests/segmentLabelHover.spec.ts hard-codes this same value to scroll to
// segment 2's slice - keep the two in sync.
const SEGMENT_SLICE_SEPARATION = 10;

// ======== Set up page ======== //
setTitleAndDescription(
  'Segment Label Tool in Both Stack and Volume Viewport',
  'Here, we demonstrate how you can use the Segment Label Tool in both stack and volume viewports to hover and visualize the label of the segment that is below it. It works after some deliberate delay. ' +
    `The bottom-right (volume contour) viewport seeds Segment 1 and Segment 2 ${SEGMENT_SLICE_SEPARATION} slices apart: hovering empty space on Segment 1’s slice must NOT show Segment 2’s name. Scroll ${SEGMENT_SLICE_SEPARATION} slices to reach Segment 2’s slice to see its name appear.`
);

const size = '512px';

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexWrap = 'wrap';
viewportGrid.style.width = '1000px'; // Add this line to limit grid width

const row1 = document.createElement('div');
row1.style.display = 'flex';
row1.style.flexDirection = 'row';

const row2 = document.createElement('div');
row2.style.display = 'flex';
row2.style.flexDirection = 'row';

const elements = [];
for (let i = 1; i <= 4; i++) {
  const element = document.createElement('div');
  element.oncontextmenu = () => false;
  element.style.width = size;
  element.style.height = size;
  elements.push(element);

  if (i <= 2) {
    row1.appendChild(element);
  } else {
    row2.appendChild(element);
  }
}

const [element1, element2, element3, element4] = elements;

viewportGrid.appendChild(row1);
viewportGrid.appendChild(row2);

content.appendChild(viewportGrid);

const stackSegLabelmapId = 'SEGMENTATION_LABELMAP_STACK';
const volumeSegLabelmapId = 'SEGMENTATION_LABELMAP_VOLUME';
const stackSegContourId = 'SEGMENTATION_CONTOUR_STACK';
const volumeSegContourId = 'SEGMENTATION_CONTOUR_VOLUME';

const stackSegLabelmapToolGroupId = 'TOOL_GROUP_STACK';
const volumeSegLabelmapToolGroupId = 'TOOL_GROUP_VOLUME';
const stackSegContourToolGroupId = 'TOOL_GROUP_STACK_CONTOUR';
const volumeSegContourToolGroupId = 'TOOL_GROUP_VOLUME_CONTOUR';

const viewportId1 = 'viewport1';
const viewportId2 = 'viewport2';
const viewportId3 = 'viewport3';
const viewportId4 = 'viewport4';

// ============================= //

cornerstoneTools.addTool(SegmentLabelTool);
cornerstoneTools.addTool(PlanarFreehandContourSegmentationTool);

function setupTools(toolGroupId, isContour = false) {
  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  if (isContour) {
    toolGroup.addTool(PlanarFreehandContourSegmentationTool.toolName);
    toolGroup.setToolPassive(PlanarFreehandContourSegmentationTool.toolName);
  }

  addManipulationBindings(toolGroup);

  // Segmentation Tools
  toolGroup.addTool(SegmentLabelTool.toolName);

  toolGroup.setToolActive(SegmentLabelTool.toolName);

  if (isContour) {
    toolGroup.setToolActive(PlanarFreehandContourSegmentationTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    });
  }

  return toolGroup;
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const stackLabelmapToolGroup = setupTools(stackSegLabelmapToolGroupId);
  const volumeLabelmapToolGroup = setupTools(volumeSegLabelmapToolGroupId);
  const stackContourToolGroup = setupTools(stackSegContourToolGroupId, true);
  const volumeContourToolGroup = setupTools(volumeSegContourToolGroupId, true);

  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.2.840.113663.1500.1.248223208.1.1.20110323.105903.687',
    SeriesInstanceUID:
      '1.2.840.113663.1500.1.248223208.2.1.20110323.105903.687',
    SOPInstanceUID: '1.2.840.113663.1500.1.248223208.3.10.20110323.110423.875',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const volumeImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.367700692008930469189923116409',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.PLANAR,
      element: element1,
    },
    {
      viewportId: viewportId2,
      type: ViewportType.PLANAR,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.PLANAR,
      element: element3,
    },
    {
      viewportId: viewportId4,
      type: ViewportType.PLANAR,
      element: element4,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
  ];
  renderingEngine.setViewports(viewportInputArray);

  stackLabelmapToolGroup.addViewport(viewportId1, renderingEngineId);
  volumeLabelmapToolGroup.addViewport(viewportId2, renderingEngineId);
  stackContourToolGroup.addViewport(viewportId3, renderingEngineId);
  volumeContourToolGroup.addViewport(viewportId4, renderingEngineId);

  _handleStackViewports(stackImageIds);
  _handleVolumeViewports(volumeImageIds, renderingEngine);

  // set the fillAlpha for the labelmap to 0
  segmentation.config.style.setStyle(
    {
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
    {
      fillAlpha: 0.05,
      activeSegmentOutlineWidthDelta: 3,
    }
  );
  segmentation.config.style.setStyle(
    {
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
    {
      fillAlpha: 0,
      activeSegmentOutlineWidthDelta: 3,
    }
  );
}

run();

async function _handleVolumeViewports(volumeImageIds, renderingEngine) {
  const volume = (await cornerstone.volumeLoader.createAndCacheVolume(
    volumeId,
    {
      imageIds: volumeImageIds,
    }
  )) as IStreamingImageVolume;

  // Set the volume to load
  await volume.load();

  // Set volumes on the viewports
  cornerstone.displaySetRegistry.add(volumeDisplaySetId, {
    imageIds: volumeImageIds,
    volumeId,
  });

  await Promise.all(
    [viewportId2, viewportId4].map(async (viewportId) => {
      const viewport: PlanarViewport = renderingEngine.getViewport(viewportId);

      await viewport.setDisplaySets({ displaySetId: volumeDisplaySetId });
      viewport.setDisplaySetPresentation(volumeDisplaySetId, ctPresentation());
    })
  );

  // Create a segmentation of the same resolution as the source data
  cornerstone.volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: volumeSegLabelmapId,
  });

  fillVolumeLabelmapWithMockData({
    volumeId: volumeSegLabelmapId,
    cornerstone,
  });

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId: volumeSegLabelmapId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          volumeId: volumeSegLabelmapId,
        },
      },
    },
  ]);

  // Add the segmentation representation to the viewport
  segmentation.addSegmentationRepresentations(viewportId2, [
    {
      segmentationId: volumeSegLabelmapId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  segmentation.addSegmentations([
    {
      segmentationId: volumeSegContourId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
      config: {
        segments: {
          1: { label: 'Segment 1' },
          2: { label: 'Segment 2' },
        },
      },
    },
  ]);

  // Add the segmentation representation to the viewport
  await segmentation.addSegmentationRepresentations(viewportId4, [
    {
      segmentationId: volumeSegContourId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
  ]);

  // Place segment 1 and segment 2 SEGMENT_SLICE_SEPARATION slices apart (i.e.
  // NON-adjacent) to demonstrate that the hovered label is scoped to the
  // current slice. addMockContourSegmentation projects the contour onto the
  // viewport's current focal plane, so we seed segment 1, scroll several slices
  // away, seed segment 2, then return to segment 1's slice.
  const volumeContourViewport: PlanarViewport =
    renderingEngine.getViewport(viewportId4);

  addMockContourSegmentation({
    segmentationId: volumeSegContourId,
    viewport: volumeContourViewport,
    contours: [
      {
        segmentIndex: 1,
        radius: 75,
      },
    ],
  });

  // Remember segment 1's slice (view reference) so we can return to it
  // deterministically after seeding segment 2, instead of relying on a
  // symmetric scroll back.
  const segment1ViewReference = volumeContourViewport.getViewReference();

  // Move several slices away before seeding segment 2.
  //
  // If both contours got projected onto the SAME slice, the slice-scoping
  // demo/test breaks. Retry scroll() until it actually changes the slice so
  // segment 2 is guaranteed to land on a different slice.
  await scrollUntilSliceChanges(
    volumeContourViewport,
    SEGMENT_SLICE_SEPARATION
  );

  addMockContourSegmentation({
    segmentationId: volumeSegContourId,
    viewport: volumeContourViewport,
    contours: [
      {
        segmentIndex: 2,
        radius: 75,
        centerOffset: [0, -150],
      },
    ],
  });

  // Return to segment 1's slice so the bug is reproducible on load. Restore the
  // view reference directly (rather than scroll(-SEGMENT_SLICE_SEPARATION)) so
  // the displayed slice is exactly segment 1's, independent of scroll timing.
  volumeContourViewport.setViewReference(segment1ViewReference);
  renderingEngine.render();
}

/**
 * Scrolls the volume viewport by `delta` slices, retrying until the slice
 * index actually changes. This guards against scrolling before the volume
 * is ready (which makes scroll() a no-op).
 */
async function scrollUntilSliceChanges(
  viewport: PlanarViewport,
  delta,
  maxAttempts = 500
) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const before = viewport.getCurrentImageIdIndex();
    viewport.scroll(delta);
    const after = viewport.getCurrentImageIdIndex();

    if (after !== before) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.warn(
    'segmentLabel example: volume viewport never became scrollable; ' +
      'segment 2 may have been seeded on the same slice as segment 1.'
  );
}

async function _handleStackViewports(stackImageIds: string[]) {
  const viewport1: PlanarViewport = renderingEngine.getViewport(viewportId1);
  const viewport3: PlanarViewport = renderingEngine.getViewport(viewportId3);

  const imageIdsArray = [stackImageIds[0]];

  const segImages =
    await imageLoader.createAndCacheDerivedLabelmapImages(imageIdsArray);

  const segmentationImageIds = segImages.map((it) => it.imageId);

  cornerstone.displaySetRegistry.add(stackDisplaySetId, {
    imageIds: imageIdsArray,
    initialImageIdIndex: 0,
  });

  await viewport1.setDisplaySets({ displaySetId: stackDisplaySetId });
  await viewport3.setDisplaySets({ displaySetId: stackDisplaySetId });

  fillStackSegmentationWithMockData({
    imageIds: imageIdsArray,
    segmentationImageIds,
    cornerstone,
  });

  segmentation.addSegmentations([
    {
      segmentationId: stackSegLabelmapId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: segmentationImageIds,
        },
      },
    },
  ]);

  // Add the segmentation representation to the viewport
  await segmentation.addSegmentationRepresentations(viewportId1, [
    {
      segmentationId: stackSegLabelmapId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  segmentation.addSegmentations([
    {
      segmentationId: stackSegContourId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    },
  ]);

  // Add the segmentation representation to the viewport
  await segmentation.addSegmentationRepresentations(viewportId3, [
    {
      segmentationId: stackSegContourId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
  ]);

  addMockContourSegmentation({
    segmentationId: stackSegContourId,
    viewport: renderingEngine.getViewport(viewportId3),
    contours: [
      {
        segmentIndex: 1,
        radius: 50,
        centerOffset: [50, 0],
      },
      {
        segmentIndex: 2,
        radius: 50,
        centerOffset: [-50, 0],
      },
    ],
  });

  setTimeout(() => {
    [viewport1, viewport3].forEach((viewport) => {
      const viewState = viewportProjection.withPresentation(viewport, {
        zoom: 5,
      });

      if (viewState) {
        viewport.setViewState(viewState);
      }
    });
    renderingEngine.render();
  }, 100);
}
