import {
  RenderingEngine,
  Types,
  Enums,
  getRenderingEngine,
  volumeLoader,
  setVolumesForViewports,
  eventTarget,
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
const { SegmentationDisplayTool } = cornerstoneTools;
const { MouseBindings } = cornerstoneTools.Enums;

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
  options: { map: toolMap },
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
    segmentation.activeSegmentation.setActiveSegmentationRepresentation(
      toolGroupId,
      isContour
        ? segmentationRepresentationUIDs[1]
        : segmentationRepresentationUIDs[0]
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
  title: 'Rotate Delta 90',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportId)
    );

    const { rotation } = viewport.getProperties();
    viewport.setProperties({ rotation: rotation + 90 });

    viewport.render();
  },
});

let selectedAnnotationUID;

function annotationModifiedListener(evt) {
  selectedAnnotationUID =
    evt.detail.annotation?.annotationUID ||
    evt.detail.annotationUID ||
    evt.detail.added?.[0];
}

function getActiveAnnotation() {
  return cornerstoneTools.annotation.state.getAnnotation(selectedAnnotationUID);
}

addButtonToToolbar({
  id: 'Delete',
  title: 'Delete Annotation',
  onClick() {
    const annotation = getActiveAnnotation();
    if (annotation) {
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

function addAnnotationListeners() {
  const { Events: toolsEvents } = csToolsEnums;
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_SELECTION_CHANGE,
    annotationModifiedListener
  );
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_MODIFIED,
    annotationModifiedListener
  );
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_COMPLETED,
    annotationModifiedListener
  );
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_REMOVED,
    annotationModifiedListener
  );
}

let segmentationRepresentationUIDs;

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  await volumeLoader.createAndCacheDerivedSegmentationVolume(volumeId, {
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

  segmentationRepresentationUIDs =
    await segmentation.addSegmentationRepresentations(toolGroupId, [
      {
        segmentationId: labelmapSegmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
      {
        segmentationId: contourSegmentationId,
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    ]);
}

const DEFAULT_SEGMENTATION_CONFIG = {
  fillAlpha: 0.5,
  fillAlphaInactive: 0.3,
  outlineOpacity: 1,
  outlineOpacityInactive: 0.85,
  outlineWidthActive: 3,
  outlineWidthInactive: 2,
  outlineDashActive: undefined,
  outlineDashInactive: undefined,
};

function initializeGlobalConfig() {
  const globalSegmentationConfig = segmentation.config.getGlobalConfig();

  Object.assign(
    globalSegmentationConfig.representations.CONTOUR,
    DEFAULT_SEGMENTATION_CONFIG
  );

  segmentation.config.setGlobalConfig(globalSegmentationConfig);
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
  initializeGlobalConfig();
  cornerstoneTools.addTool(SegmentationDisplayTool);
  toolGroup.addTool(SegmentationDisplayTool.toolName);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
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

  segmentation.segmentIndex.setActiveSegmentIndex(labelmapSegmentationId, 1);

  // Render the image
  viewport.render();
  addAnnotationListeners();
}

run();
