import type { Types, ECGViewportNext } from '@cornerstonejs/core';
import { RenderingEngine, Enums, utilities } from '@cornerstonejs/core';
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
import { getBooleanUrlParam } from '../../../../utils/demo/helpers/exampleParameters';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const { ToolGroupManager } = cornerstoneTools;

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'ecgNextViewport';
const toolGroupId = 'ecgNextToolGroup';
const ecgDataId = 'ecg-next:primary';

const StudyInstanceUID = '1.3.76.13.65829.2.20130125082826.1072139.2';
const SeriesInstanceUID = '1.3.6.1.4.1.20029.40.20130125105919.5407.1';
const wadoRsRoot =
  getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';

function getNextExampleBackground(): Types.Point3 {
  return getBooleanUrlParam('cpu') ? [0, 0, 0] : [0, 0.2, 0];
}

setTitleAndDescription(
  'ECG ViewportNext',
  'Displays a 12-lead ECG using the clean ViewportNext ECG API.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '900px';
element.style.height = '600px';

content.appendChild(element);

element.oncontextmenu = (e) => e.preventDefault();

async function run() {
  await initDemo();

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID,
    wadoRsRoot,
  });
  const ecgImageId = imageIds[0];

  const { PanTool, ZoomTool } = cornerstoneTools;
  const { MouseBindings } = cornerstoneTools.Enums;

  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
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

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.ECG_NEXT,
    element,
    defaultOptions: {
      background: getNextExampleBackground(),
    },
  });

  toolGroup.addViewport(viewportId, renderingEngineId);

  const viewport = renderingEngine.getViewport<ECGViewportNext>(viewportId);

  utilities.viewportNextDataSetMetadataProvider.add(ecgDataId, {
    kind: 'ecg',
    sourceDataId: ecgImageId,
  });
  await viewport.setDataList([{ dataId: ecgDataId }]);

  const { width: ecgWidth, height: ecgHeight } =
    viewport.getContentDimensions();
  element.style.width = `${ecgWidth}px`;
  element.style.height = `${ecgHeight}px`;
  renderingEngine.resize();

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

  const firstToolName = annotationTools.keys().next().value;
  if (firstToolName) {
    activateAnnotationTool(firstToolName);
  }

  addButtonToToolbar({
    title: 'Reset View',
    onClick: () => {
      viewport.resetCamera();
    },
  });

  const channels = viewport.getVisibleChannels();
  channels.forEach((channel, index) => {
    addCheckboxToToolbar({
      title: channel.name,
      checked: channel.visible,
      onChange: (checked: boolean) => {
        const waveform = viewport.getWaveformData();

        if (!waveform) {
          return;
        }

        const current = viewport.getDataPresentation(ecgDataId) || {};
        const nextVisibleChannels = new Set(
          current.visibleChannels ||
            waveform.channels.map((_channel, channelIndex) => channelIndex)
        );

        if (checked) {
          nextVisibleChannels.add(index);
        } else {
          nextVisibleChannels.delete(index);
        }

        viewport.setDataPresentation(ecgDataId, {
          visibleChannels: Array.from(nextVisibleChannels).sort(
            (a, b) => a - b
          ),
        });
      },
    });
  });
}

run();
