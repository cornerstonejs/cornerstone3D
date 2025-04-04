import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  volumeLoader,
  setVolumesForViewports,
  utilities as csUtils,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addButtonToToolbar,
  annotationTools,
  labelmapTools,
  contourTools,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

const { segmentation } = cornerstoneTools;
const { MouseBindings } = cornerstoneTools.Enums;
const { DefaultHistoryMemo } = csUtils.HistoryMemo;

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  AnnotationTool,
} = cornerstoneTools;

const { ViewportType } = Enums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';
const labelmapSegmentationId = 'labelmapSegmentationId';
const contourSegmentationId = 'contourSegmentationId';
const defaultTool = 'ThresholdCircle';

const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

const toolMap = new Map(annotationTools);
for (const [key, value] of labelmapTools.toolMap) {
  toolMap.set(key, value);
}
for (const [key, value] of contourTools.toolMap) {
  toolMap.set(key, value);
}

// ======== Set up page ======== //
setTitleAndDescription('Tool History', 'Demonstrate undo/redo on tools');

const content = document.getElementById('content');
const element = document.createElement('div');

// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault();

element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const info = document.createElement('div');
content.appendChild(info);

const instructions = document.createElement('p');
instructions.innerText = `
Left Click to use selected tool
z to undo, y to redo
`;
info.appendChild(instructions);

// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';

const cancelToolDrawing = (evt) => {
  const { element, key } = evt.detail;
  if (key === 'Escape') {
    cornerstoneTools.cancelActiveManipulations(element);
  }
};

element.addEventListener(csToolsEnums.Events.KEY_DOWN, (evt) => {
  cancelToolDrawing(evt);
});

addDropdownToToolbar({
  options: { map: toolMap, defaultValue: defaultTool },
  onSelectedValueChange: (newSelectedToolName, data) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the old tool passive
    const selectedToolName = toolGroup.getActivePrimaryMouseButtonTool();
    if (selectedToolName) {
      toolGroup.setToolPassive(selectedToolName);
    }

    // Set the new tool active
    toolGroup.setToolActive(newSelectedToolName as string, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
        },
      ],
    });
    const isContour =
      data?.segmentationType ===
      csToolsEnums.SegmentationRepresentations.Contour;
    segmentation.activeSegmentation.setActiveSegmentation(
      viewportId,
      isContour ? contourSegmentationId : labelmapSegmentationId
    );
  },
});

addDropdownToToolbar({
  options: { values: ['1', '2', '3'], defaultValue: '1' },
  labelText: 'Segment',
  onSelectedValueChange: (segmentIndex) => {
    segmentation.segmentIndex.setActiveSegmentIndex(
      labelmapSegmentationId,
      Number(segmentIndex)
    );
    segmentation.segmentIndex.setActiveSegmentIndex(
      contourSegmentationId,
      Number(segmentIndex)
    );
  },
});

addButtonToToolbar({
  id: 'Undo',
  title: 'Undo',
  onClick() {
    DefaultHistoryMemo.undo();
  },
});

addButtonToToolbar({
  id: 'Redo',
  title: 'Redo',
  onClick() {
    DefaultHistoryMemo.redo();
  },
});

addButtonToToolbar({
  id: 'Delete',
  title: 'Delete Annotation',
  onClick() {
    const annotationUIDs =
      cornerstoneTools.annotation.selection.getAnnotationsSelected();

    if (annotationUIDs.length === 0) {
      return;
    }

    const annotation = cornerstoneTools.annotation.state.getAnnotation(
      annotationUIDs[0]
    );

    if (annotation) {
      // Note that delete needs to have a memo created for it, as the underlying
      // state manager doesn't record this directly.
      // The deleting flag is set to true meaning that this annotation is about
      // to be deleted (but is NOT yet deleted).
      AnnotationTool.createAnnotationMemo(element, annotation, {
        deleting: true,
      });
      cornerstoneTools.annotation.state.removeAnnotation(
        annotation.annotationUID
      );
      getRenderingEngine(renderingEngineId).render();
    }
  },
});

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  await volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: labelmapSegmentationId,
  });

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId: labelmapSegmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          volumeId: labelmapSegmentationId,
        },
      },
    },
    {
      segmentationId: contourSegmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Contour,
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

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup, { toolMap });

  // Get Cornerstone imageIds and fetch metadata into RAM
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

  await addSegmentationsToState();

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Get the stack viewport that was created
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  );
  volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId]);

  // Render the image
  viewport.render();

  await segmentation.addLabelmapRepresentationToViewport(viewportId, [
    { segmentationId: labelmapSegmentationId },
  ]);
}

run();
