import {
  Enums,
  RenderingEngine,
  Types,
  imageLoader,
  setVolumesForViewports,
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

import { ONNXSegmentationController } from '@cornerstonejs/ai';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  annotation,
} = cornerstoneTools;

const configuration = {
  preview: {
    enabled: true,
    previewColors: {
      0: [255, 255, 255, 128],
      1: [0, 255, 255, 255],
    },
  },
};
const logs = [];

/**
 * Log to the specified logger.
 */
function mlLogger(logName, ...args) {
  console.log(logName, ...args);
  const element = document.getElementById(logName);
  if (!element) {
    return;
  }
  if (logName === 'status') {
    logs.push(args.join(' '));
    if (logs.length > 5) {
      logs.splice(0, 1);
    }
    element.innerText = logs.join('\n');
    return;
  }
  element.innerText = args.join(' ');
}

const ml = new ONNXSegmentationController({
  listeners: [mlLogger],
});

const { ViewportType, Events } = Enums;
const { KeyboardBindings, MouseBindings } = csToolsEnums;
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
const defaultTool = ONNXSegmentationController.MarkerInclude;
toolMap.set(defaultTool, {
  baseTool: cornerstoneTools.ProbeTool.toolName,
  configuration: {
    ...configuration,
    getTextLines: () => null,
  },
});
toolStyle.getDefaultToolStyles()[defaultTool] = { color: 'blue' };

const excludeTool = ONNXSegmentationController.MarkerExclude;
toolMap.set(excludeTool, {
  baseTool: cornerstoneTools.ProbeTool.toolName,
  bindings: [{ mouseButton: MouseBindings.Secondary }],
  configuration: {
    ...configuration,
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
  'Here we demonstrate how to use various predictive AI/ML techniques to aid your segmentation.  ' +
    'The default model here uses "MarkerInclude" and "MarkerExclude" as segmentation AI prompts ' +
    'for the Segment Anything Model to use to generate a segmentation of the area of interest.  ' +
    'Then, these prompts can be copied to the next image by pressing the "n" key to interpolate ' +
    'markers on the current slice onto the next slice.'
);

const { canvas, canvasMask } = ml;

const size = `24vw`;
const content = document.getElementById('content');

addButtonToToolbar({
  title: 'Clear',
  onClick: () => {
    ml.clear(activeViewport);
    viewport.render();
  },
});

const viewportGrid = document.createElement('div');
let renderingEngine;
let viewport, volumeViewport, activeViewport;

viewportGrid.style.width = '99vw';

const viewportId = 'Stack';
const viewportIds = [viewportId, 'AXIAL', 'SAGITAL', 'CORONAL'];

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
const [element0, element1, element2, element3] = elements;
// Uncomment these to show the canvas/mask overlays separately
// viewportGrid.appendChild(canvas);
// viewportGrid.appendChild(canvasMask);

Object.assign(canvas.style, {
  width: size,
  height: size,
  display: 'inline-block',
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
encoderLatency.id = 'encoder';
content.appendChild(encoderLatency);

const decoderLatency = document.createElement('div');
decoderLatency.id = 'decoder';
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

addDropdownToToolbar({
  options: {
    values: viewportIds,
  },
  onSelectedValueChange: (value) => {
    activeViewport = renderingEngine.getViewport(value);
    ml.initViewport(activeViewport);
  },
});

addButtonToToolbar({
  title: 'Cache',
  onClick: () => {
    if (cached !== undefined) {
      return;
    }
    cached = false;
    ml.cacheImageEncodings();
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Get the load started here, as it can take a while.
  ml.initModel();

  // Init Cornerstone and related libraries
  await initDemo();

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup, { toolMap });
  // The threshold circle has preview turned on by default, so use it as the
  // tool to get/apply previews with.
  toolForPreview = toolGroup.getToolInstance('ThresholdCircle');

  const volumeToolGroup = ToolGroupManager.createToolGroup(volumeToolGroupId);
  addManipulationBindings(volumeToolGroup, { toolMap });

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
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId,
      type: ViewportType.STACK,
      element: element0,
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
  activeViewport = viewport;

  // Add a segmentation that will contains the contour annotations
  const segmentationImages =
    await imageLoader.createAndCacheDerivedLabelmapImages(imageIds);

  const segmentationImageIds = segmentationImages.map((image) => image.imageId);

  // Set the stack on the viewport
  await viewport.setStack(imageIds);
  viewport.setOptions(ONNXSegmentationController.viewportOptions);

  // This init model is waiting for completion, whereas the earlier one just
  // starts loading in the background.
  await ml.initModel();
  // Connect the default viewport here to start things off - requires the initModel to be done
  ml.initViewport(viewport, toolForPreview);

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  volume.load();

  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    viewportIds.slice(1)
  );

  // Render the image

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: segmentationImageIds,
        },
      },
    },
  ]);

  const segMap = {
    [viewportIds[0]]: [{ segmentationId }],
    [viewportIds[1]]: [{ segmentationId }],
    [viewportIds[2]]: [{ segmentationId }],
    [viewportIds[3]]: [{ segmentationId }],
  };

  // Create a segmentation representation associated to the toolGroupId
  await segmentation.addLabelmapRepresentationToViewportMap(segMap);

  elements.forEach((element) =>
    element.addEventListener(csToolsEnums.Events.KEY_DOWN, (evt) => {
      const { key } = evt.detail;
      const { element } = activeViewport;
      if (key === 'Escape') {
        cornerstoneTools.cancelActiveManipulations(element);
        toolForPreview.rejectPreview(element);
      } else if (key === 'Enter') {
        toolForPreview.acceptPreview(element);
      } else if (key === 'n') {
        ml.interpolateScroll(activeViewport, 1);
      }
    })
  );

  // volumeViewport.setViewReference(viewport.getViewReference());
  // volumeViewport.setViewPresentation(viewport.getViewPresentation());
}

run();
