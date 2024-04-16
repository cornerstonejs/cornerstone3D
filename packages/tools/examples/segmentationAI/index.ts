import {
  Enums,
  RenderingEngine,
  Types,
  eventTarget,
  imageLoader,
  volumeLoader,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addButtonToToolbar,
  addDropdownToToolbar,
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
  addManipulationBindings,
  getLocalUrl,
  addSegmentIndexDropdown,
  labelmapTools,
  annotationTools,
} from '../../../../utils/demo/helpers';

import { filterAnnotationsForDisplay } from '../../src/utilities/planar';

import MLController, { viewportOptions } from './mlController';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  SegmentationDisplayTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  annotation,
  utilities: cstUtils,
} = cornerstoneTools;

const ml = new MLController();
const { viewportRenderedListener } = ml;

const { ViewportType, Events } = Enums;
const { Events: toolsEvents, KeyboardBindings, MouseBindings } = csToolsEnums;
const { state: annotationState } = annotation;
const { style: toolStyle } = cornerstoneTools.annotation.config;
const volumeId = 'volumeId';
const segVolumeId = 'segVolumeId';

// Define various constants for the tool definition
const toolGroupId = 'DEFAULT_TOOLGROUP_ID';
const volumeToolGroupId = 'VOLUME_TOOLGROUP_ID';

const segmentationId = `SEGMENTATION_ID`;
// Stores information on whether the AI data is encoded in cache
let cached;
let toolForPreview;

const toolMap = new Map(annotationTools);
const defaultTool = 'MarkerInclude';
toolMap.set(defaultTool, {
  baseTool: cornerstoneTools.ProbeTool.toolName,
  configuration: {
    getTextLines: () => null,
  },
});
toolStyle.getDefaultToolStyles()[defaultTool] = { color: 'blue' };

const excludeTool = 'MarkerExclude';
toolMap.set(excludeTool, {
  baseTool: cornerstoneTools.ProbeTool.toolName,
  bindings: [{ mouseButton: MouseBindings.Secondary }],
  configuration: {
    getTextLines: () => null,
  },
});
toolStyle.getDefaultToolStyles()[excludeTool] = {
  color: 'pink',
  colorSelected: 'red',
};

for (const [key, value] of labelmapTools.toolMap) {
  toolMap.set(key, value);
}

toolMap.set(cornerstoneTools.ZoomTool.toolName, {
  bindings: [
    {
      mouseButton: MouseBindings.Auxiliary,
      modifierKey: KeyboardBindings.Ctrl,
    },
  ],
});

// ======== Set up page ======== //

setTitleAndDescription(
  'Segmentation AI',
  'Here we demonstrate how to use various predictive AI/ML techniques to aid your segmentation'
);

const canvas = document.createElement('canvas');
canvas.oncontextmenu = () => false;
const canvasMask = document.createElement('canvas');
const originalImage = document.createElement('img');
originalImage.id = 'original-image';

const size = `${512 / devicePixelRatio}px`;
const content = document.getElementById('content');

addButtonToToolbar({
  title: 'Clear',
  onClick: () => {
    ml.clearML();
    viewport.render();
  },
});

const viewportGrid = document.createElement('div');
let viewport, volumeViewport;

viewportGrid.style.width = '95vw';
// viewportGrid.style.flexDirection = 'column';

const viewportId = 'VIEWPORT_ID';
const viewportIds = ['VIEWPORT_ID', 'AXIAL', 'SAGITAL', 'CORONAL'];

const elements = [];
for (const id of viewportIds) {
  const el = document.createElement('div');
  elements.push(el);
  el.oncontextmenu = () => false;
  el.id = id;

  Object.assign(el.style, {
    width: size,
    height: size,
    display: 'inline-block',
  });
  viewportGrid.appendChild(el);
}
const [element, element1, element2, element3] = elements;

Object.assign(canvas.style, {
  width: size,
  height: size,
  display: 'none',
  background: 'red',
});

Object.assign(canvasMask.style, {
  width: size,
  height: size,
  display: 'inline-block',
  background: 'black',
});

// viewportGrid.appendChild(canvas);
// viewportGrid.appendChild(canvasMask);

content.appendChild(viewportGrid);

const encoderLatency = document.createElement('div');
encoderLatency.id = 'encoder_latency';
content.appendChild(encoderLatency);

const decoderLatency = document.createElement('div');
decoderLatency.id = 'decoder_latency';
content.appendChild(decoderLatency);

const logDiv = document.createElement('div');
logDiv.id = 'status';
content.appendChild(logDiv);

// ============================= //
addDropdownToToolbar({
  options: { map: toolMap, defaultValue: defaultTool },
  toolGroupId: [toolGroupId, volumeToolGroupId],
});

addSegmentIndexDropdown(segmentationId);

addButtonToToolbar({
  title: 'Cache',
  onClick: () => {
    if (cached !== undefined) {
      return;
    }
    cached = false;
    ml.cacheImageEncodings(viewport.getCurrentImageIdIndex());
  },
});

/**
 * Maps world points to destination points.
 * Assumes the destination canvas is scale to fit at 100% in both dimensions,
 * while the source point is also assumed to be in the same position, but not
 * the same scale.
 *
 * TODO - add mapping from index coordinates to dest coordinates
 * TODO - handle non-square aspect ratios (center relative)
 * TODO - handle alternate orientations
 */
function mapAnnotationPoint(worldPoint) {
  const canvasPoint = viewport.worldToCanvas(worldPoint);
  const { width, height } = viewport.canvas;
  const { width: destWidth, height: destHeight } = canvas;

  const x = Math.trunc((canvasPoint[0] * destWidth * devicePixelRatio) / width);
  const y = Math.trunc(
    (canvasPoint[1] * destHeight * devicePixelRatio) / height
  );
  return [x, y];
}

/**
 * Gets a list of the include/exclude orientation annotations applying to the
 * current image id.
 */
function getCurrentAnnotations() {
  const annotations = [
    ...annotationState.getAnnotations(defaultTool, element),
    ...annotationState.getAnnotations(excludeTool, element),
  ];
  const currentAnnotations = filterAnnotationsForDisplay(viewport, annotations);
  return currentAnnotations;
}

/*
 * Adds annotation listeners so that on updates the new annotation gets called
 */
function addAnnotationListeners() {
  const boundListener = ml.annotationModifiedListener;
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_SELECTION_CHANGE,
    boundListener
  );
  eventTarget.addEventListener(toolsEvents.ANNOTATION_MODIFIED, boundListener);
  eventTarget.addEventListener(toolsEvents.ANNOTATION_COMPLETED, boundListener);
  eventTarget.addEventListener(toolsEvents.ANNOTATION_ADDED, boundListener);
}

async function interpolateScroll(dir = 1) {
  toolForPreview.acceptPreview(element);
  const annotations = [
    ...annotationState.getAnnotations(defaultTool, element),
    ...annotationState.getAnnotations(excludeTool, element),
  ];

  const currentAnnotations = filterAnnotationsForDisplay(viewport, annotations);
  const viewRef = viewport.getViewReference({
    sliceIndex: viewport.getCurrentImageIdIndex() + dir,
  });
  if (!viewRef) {
    return;
  }

  if (!currentAnnotations.length) {
    viewport.scroll(dir);
    return;
  }

  const nextAnnotations = annotations.filter((filterAnnotation) => {
    const { sliceIndex: filterSliceIndex } = filterAnnotation.metadata;
    return filterSliceIndex === viewRef.sliceIndex;
  });
  if (nextAnnotations.length > 0) {
    console.log('Already has annotations, not interpolating');
    return;
  }
  for (const annotation of currentAnnotations) {
    annotation.interpolationUID ||= crypto.randomUUID();
    const newAnnotation = structuredClone(annotation);
    newAnnotation.annotationUID = undefined;
    Object.assign(newAnnotation.metadata, viewRef);
    (newAnnotation as any).cachedStats = {};
    annotationState.addAnnotation(newAnnotation, viewport.element);
  }
  viewport.scroll(dir);
}

const handleKeyEvent = (evt) => {
  const { element, key } = evt.detail;
  if (key === 'Escape') {
    cornerstoneTools.cancelActiveManipulations(element);
    toolForPreview.rejectPreview(element);
  } else if (key === 'Enter') {
    toolForPreview.acceptPreview(element);
  } else if (key === 'n') {
    interpolateScroll(1);
  }
};

function navigateVolumeListener(event) {
  volumeViewport.setView(
    viewport.getViewReference(),
    viewport.getViewPresentation()
  );
  viewportRenderedListener(event);
}

/**
 * Runs the demo
 */
async function run() {
  // Get the load started here, as it can take a while.
  ml.loadAI();

  // Init Cornerstone and related libraries
  await initDemo();

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup, { toolMap });
  toolForPreview = toolGroup.getToolInstance('ThresholdCircle');

  const volumeToolGroup = ToolGroupManager.createToolGroup(volumeToolGroupId);
  addManipulationBindings(volumeToolGroup, { toolMap });

  cornerstoneTools.addTool(SegmentationDisplayTool);
  toolGroup.addTool(SegmentationDisplayTool.toolName);

  volumeToolGroup.addTool(SegmentationDisplayTool.toolName);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIdsFull = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot:
      getLocalUrl() || 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  const imageIds = imageIdsFull.reverse(); // .slice(35, 45);
  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId,
      type: ViewportType.STACK,
      element: element,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0.2, 0],
      },
    },
    {
      viewportId: viewportIds[2],
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0, 0.2, 0],
      },
    },
    {
      viewportId: viewportIds[3],
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);
  toolGroup.addViewport(viewportId, renderingEngineId);
  volumeToolGroup.addViewport(viewportIds[1], renderingEngineId);
  volumeToolGroup.addViewport(viewportIds[2], renderingEngineId);
  volumeToolGroup.addViewport(viewportIds[3], renderingEngineId);

  // Get the stack viewport that was created
  viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId);

  // Add a segmentation that will contains the contour annotations
  const { imageIds: segmentationImageIds } =
    await imageLoader.createAndCacheDerivedSegmentationImages(imageIds);

  // Set the stack on the viewport
  await viewport.setStack(imageIds);
  viewport.setOptions(viewportOptions);

  // Add the canvas after the viewport
  // element.appendChild(canvas);
  ml.connectViewport(
    viewport,
    getCurrentAnnotations,
    excludeTool,
    toolForPreview
  );
  await ml.loadAI();
  element.addEventListener(Events.IMAGE_RENDERED, navigateVolumeListener);
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });
  volumeViewport = renderingEngine.getViewport(viewportIds[1]);
  volume.load();

  volumeViewport.setVolumes([{ volumeId }]);
  const sagViewport = renderingEngine.getViewport(
    viewportIds[2]
  ) as Types.IVolumeViewport;
  sagViewport.setVolumes([{ volumeId }]);
  const corViewport = renderingEngine.getViewport(
    viewportIds[3]
  ) as Types.IVolumeViewport;
  corViewport.setVolumes([{ volumeId }]);

  // Render the image
  renderingEngine.render();

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIdReferenceMap: cstUtils.segmentation.createImageIdReferenceMap(
            imageIds,
            segmentationImageIds
          ),
        },
      },
    },
  ]);
  const volumeReps = await segmentation.convertStackToVolumeSegmentation({
    segmentationId,
    options: {
      toolGroupId: volumeToolGroupId,
      volumeId: segVolumeId,
    },
  });

  // Create a segmentation representation associated to the toolGroupId
  const segmentationRepresentationUIDs =
    await segmentation.addSegmentationRepresentations(toolGroupId, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ]);
  segmentationRepresentationUIDs.push(...volumeReps);

  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);
  volumeToolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

  element.addEventListener(csToolsEnums.Events.KEY_DOWN, (evt) => {
    handleKeyEvent(evt);
  });
  volumeViewport.setView(
    viewport.getViewReference(),
    viewport.getViewPresentation()
  );
  addAnnotationListeners();
}

run();
