import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  initDemo,
  setTitleAndDescription,
  addCheckboxToToolbar,
  addButtonToToolbar,
  addDropdownToToolbar,
  createImageIdsAndCacheMetaData,
  getLocalUrl,
  annotationTools,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const { ToolGroupManager } = cornerstoneTools;

// ======== Constants ======= //
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'ecgViewport';
const toolGroupId = 'ecgToolGroup';

const StudyInstanceUID = '1.3.76.13.65829.2.20130125082826.1072139.2';
const SeriesInstanceUID = '1.3.6.1.4.1.20029.40.20130125105919.5407.1';
const wadoRsRoot =
  getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';

// ======== Set up page ======== //
setTitleAndDescription(
  'ECG Viewport',
  'Displays a 12-lead ECG from DICOM Waveform data. Left-click to use annotation tools (select from dropdown). Right-drag to pan, scroll to zoom. Use checkboxes to toggle traces.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
// Initial size — will be resized to match ECG content dimensions
element.style.width = '900px';
element.style.height = '600px';

content.appendChild(element);

// Prevent browser context menu so right-drag can be used for pan
element.oncontextmenu = (e) => e.preventDefault();

/**
 * Runs the demo
 */
async function run() {
  await initDemo();

  // Use the standard pipeline to fetch and cache DICOM metadata
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID,
    wadoRsRoot,
  });

  // ECG series have a single instance — use the first imageId
  const ecgImageId = imageIds[0];

  // ======== Set up tools ======== //
  const { PanTool, ZoomTool } = cornerstoneTools;
  const { MouseBindings } = cornerstoneTools.Enums;

  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  // LengthTool has no `tool` in annotationTools config (it's registered
  // by addManipulationBindings in other examples), so register it explicitly.
  cornerstoneTools.addTool(cornerstoneTools.LengthTool);
  for (const [, config] of annotationTools) {
    if (config.tool) {
      cornerstoneTools.addTool(config.tool);
    }
  }

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName, {
    minZoomScale: 0.001,
    maxZoomScale: 4000,
  });

  const { UltrasoundDirectionalTool } = cornerstoneTools;
  for (const [toolName, config] of annotationTools) {
    const toolConfig =
      toolName === UltrasoundDirectionalTool.toolName
        ? { ...config.configuration, displayBothAxesDistances: true }
        : config.configuration;
    if (config.baseTool) {
      if (!toolGroup.hasTool(config.baseTool)) {
        toolGroup.addTool(
          config.baseTool,
          annotationTools.get(config.baseTool)?.configuration
        );
      }
      toolGroup.addToolInstance(toolName, config.baseTool, toolConfig);
    } else if (!toolGroup.hasTool(toolName)) {
      toolGroup.addTool(toolName, toolConfig);
    }
    if (config.passive) {
      toolGroup.setToolPassive(toolName);
    }
  }

  // Pan: right-drag
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });
  // Zoom: scroll wheel (two-finger scroll on trackpad)
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  // ======== Create rendering engine and ECG viewport ======== //
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInput = {
    viewportId,
    type: ViewportType.ECG,
    element,
    defaultOptions: {
      background: [0, 0, 0] as Types.Point3,
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Bind tool group to this viewport
  toolGroup.addViewport(viewportId, renderingEngineId);

  const viewport = renderingEngine.getViewport(
    viewportId
  ) as Types.IECGViewport;

  // Load ECG data into the viewport (calibration is resolved via metadata provider in ECGViewport)
  await viewport.setEcg(ecgImageId);

  // Resize element to match ECG content dimensions
  const { width: ecgWidth, height: ecgHeight } =
    viewport.getContentDimensions();
  element.style.width = `${ecgWidth}px`;
  element.style.height = `${ecgHeight}px`;
  renderingEngine.resize();

  // ======== UI Controls ======== //

  // Annotation tool dropdown — activates on left-click
  let activeAnnotationTool: string | null = null;

  function activateAnnotationTool(toolName: string) {
    const tg = ToolGroupManager.getToolGroup(toolGroupId);
    if (activeAnnotationTool) {
      tg.setToolPassive(activeAnnotationTool);
    }
    tg.setToolActive(toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
    activeAnnotationTool = toolName;
  }

  addDropdownToToolbar({
    options: { map: annotationTools },
    onSelectedValueChange: (newToolName) => {
      activateAnnotationTool(newToolName as string);
    },
  });

  // Activate the first annotation tool on load
  const firstToolName = annotationTools.keys().next().value;
  if (firstToolName) {
    activateAnnotationTool(firstToolName);
  }

  // Reset camera button
  addButtonToToolbar({
    title: 'Reset View',
    onClick: () => {
      viewport.resetCamera();
    },
  });

  // Trace toggle checkboxes
  const channels = viewport.getVisibleChannels();
  channels.forEach((channel, index) => {
    addCheckboxToToolbar({
      title: channel.name,
      checked: channel.visible,
      onChange: (checked: boolean) => {
        viewport.setChannelVisibility(index, checked);
      },
    });
  });
}

run();
