import type { Types, ECGGenericViewport } from '@cornerstonejs/core';
import { RenderingEngine, Enums, utilities } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { addDicomPart10Instance } from '@cornerstonejs/metadata/utilities/metadataProvider';
import {
  initDemo,
  setTitleAndDescription,
  addCheckboxToToolbar,
  addButtonToToolbar,
  addDropdownToToolbar,
  createImageIdsAndCacheMetaData,
  getLocalUrl,
  annotationTools,
  createLayoutRegions,
  ecgLayouts,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const { ToolGroupManager, WaveformRegionOverlayTool } = cornerstoneTools;

// ======== Constants ======= //
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'ecgViewport';
const toolGroupId = 'ecgToolGroup';
const ecgDataId = 'ecg:primary';

const StudyInstanceUID = '1.3.76.13.65829.2.20130125082826.1072139.2';
const SeriesInstanceUID = '1.3.6.1.4.1.20029.40.20130125105919.5407.1';
const wadoRsRoot =
  getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';

// ======== Set up page ======== //
setTitleAndDescription(
  'ECG Viewport',
  'Displays a 12-lead ECG using the GenericViewport ECG pipeline with WaveformRegionOverlayTool for lead badges. Use dropdown for annotation tools and layout presets (12x1, 6x2, 3x4, 3x4+1). Arrow keys scroll time.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '900px';
element.style.height = '600px';

content.appendChild(element);

element.oncontextmenu = (e) => e.preventDefault();

/**
 * Runs the demo
 */
async function run() {
  await initDemo();

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID,
    wadoRsRoot,
  });

  const ecgImageId = imageIds[0];

  // ======== Set up tools ======== //
  const { PanTool, ZoomTool } = cornerstoneTools;
  const { MouseBindings } = cornerstoneTools.Enums;

  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(WaveformRegionOverlayTool);
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
  toolGroup.addTool(WaveformRegionOverlayTool.toolName);
  toolGroup.setToolEnabled(WaveformRegionOverlayTool.toolName);

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
    type: ViewportType.ECG_NEXT,
    element,
    defaultOptions: {
      background: [0, 0.2, 0] as Types.Point3,
    },
  };

  renderingEngine.enableElement(viewportInput);
  toolGroup.addViewport(viewportId, renderingEngineId);

  const viewport = renderingEngine.getViewport<ECGGenericViewport>(viewportId);

  utilities.genericViewportDisplaySetMetadataProvider.add(ecgDataId, {
    kind: 'ecg',
    sourceDataId: ecgImageId,
  });
  await viewport.setDisplaySets({ displaySetId: ecgDataId });

  const initialWaveform = viewport.getWaveformData();
  if (initialWaveform) {
    const initialRegions = createLayoutRegions(
      '12x1',
      initialWaveform.channels.length
    );
    viewport.setDisplaySetPresentation(ecgDataId, {
      traceRegions: initialRegions,
    });
  }

  const { width: ecgWidth, height: ecgHeight } =
    viewport.getContentDimensions();
  element.style.width = `${ecgWidth}px`;
  element.style.height = `${ecgHeight}px`;
  renderingEngine.resize();

  let activeAnnotationTool: string | null = null;

  /**
   * Activates the selected annotation tool on primary mouse button
   * while setting any previously active tool to passive mode.
   *
   * @param toolName - Name of the tool to activate
   */
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

  let currentEcgDataId = ecgDataId;

  // Layout dropdown (12x1, 6x2, 3x4, 3x4+1)
  addDropdownToToolbar({
    options: { map: ecgLayouts, defaultIndex: 0 },
    onSelectedValueChange: (layoutKey) => {
      const waveform = viewport.getWaveformData();
      const nChannels = waveform?.channels.length || 12;
      const traceRegions = createLayoutRegions(layoutKey as any, nChannels);
      viewport.setDisplaySetPresentation(currentEcgDataId, {
        traceRegions,
      });
      viewport.render();
    },
  });

  // Reset camera / view button
  addButtonToToolbar({
    title: 'Reset View',
    onClick: () => {
      viewport.resetViewState();
    },
  });

  // Toggle all channels helper
  let allVisible = true;
  addButtonToToolbar({
    title: 'Show/Hide All Traces',
    onClick: () => {
      const waveform = viewport.getWaveformData();
      if (!waveform) return;
      allVisible = !allVisible;
      viewport.setDisplaySetPresentation(currentEcgDataId, {
        visibleChannels: allVisible ? waveform.channels.map((_, i) => i) : [],
      });
      viewport.render();
      const checkboxes = document.querySelectorAll(
        '#trace-checkboxes-container input[type="checkbox"]'
      ) as NodeListOf<HTMLInputElement>;
      checkboxes.forEach((cb) => {
        cb.checked = allVisible;
      });
    },
  });

  // Local file loading
  addButtonToToolbar({
    title: 'Local file',
    onClick: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.dcm,.dicom,application/dicom';
      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          const arrayBuffer = await file.arrayBuffer();
          const imageId = `ecg:local:${file.name}`;
          await addDicomPart10Instance(imageId, arrayBuffer);
          const localDataId = `ecg-next:local:${file.name}`;
          utilities.genericViewportDisplaySetMetadataProvider.add(localDataId, {
            kind: 'ecg',
            sourceDataId: imageId,
          });
          await viewport.setDisplaySets({ displaySetId: localDataId });
          currentEcgDataId = localDataId;
          const uploadedWaveform = viewport.getWaveformData();
          if (uploadedWaveform) {
            const layoutSelect = document.querySelectorAll(
              '#demo-toolbar select'
            )[1] as HTMLSelectElement | undefined;
            const currentLayout = layoutSelect?.value || '12x1';
            const uploadedRegions = createLayoutRegions(
              currentLayout,
              uploadedWaveform.channels.length
            );
            viewport.setDisplaySetPresentation(localDataId, {
              traceRegions: uploadedRegions,
            });
          }
          const { width: w, height: h } = viewport.getContentDimensions();
          element.style.width = `${w}px`;
          element.style.height = `${h}px`;
          renderingEngine.resize();
          allVisible = true;
          rebuildTraceCheckboxes();
          viewport.render();
        } catch (err) {
          console.error(err);
          alert(
            err instanceof Error ? err.message : 'Failed to load ECG file.'
          );
        }
      };
      input.click();
    },
  });

  // Keyboard scrolling: Left/Right Arrow keys scroll time
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      viewport.scroll(0.25);
    } else if (event.key === 'ArrowLeft') {
      viewport.scroll(-0.25);
    }
  });

  // Trace toggle checkboxes container
  const checkboxContainer = document.createElement('span');
  checkboxContainer.id = 'trace-checkboxes-container';
  const toolbar = document.getElementById('demo-toolbar');
  if (toolbar) {
    toolbar.appendChild(checkboxContainer);
  }

  const rebuildTraceCheckboxes = () => {
    checkboxContainer.innerHTML = '';
    const channels = viewport.getVisibleChannels();
    channels.forEach((channel, index) => {
      const label = document.createElement('label');
      label.style.display = 'inline-flex';
      label.style.alignItems = 'center';
      label.style.marginLeft = '6px';
      label.style.cursor = 'pointer';

      const span = document.createElement('span');
      span.innerText = channel.name;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = channel.visible !== false;
      checkbox.style.marginLeft = '2px';
      checkbox.onchange = () => {
        const waveform = viewport.getWaveformData();
        if (!waveform) return;

        const current =
          viewport.getDisplaySetPresentation(currentEcgDataId) || {};
        const nextVisibleChannels = new Set(
          current.visibleChannels ||
            waveform.channels.map((_, channelIndex) => channelIndex)
        );

        if (checkbox.checked) {
          nextVisibleChannels.add(index);
        } else {
          nextVisibleChannels.delete(index);
        }

        viewport.setDisplaySetPresentation(currentEcgDataId, {
          visibleChannels: Array.from(nextVisibleChannels).sort(
            (a, b) => a - b
          ),
        });
        viewport.render();
      };

      label.appendChild(span);
      label.appendChild(checkbox);
      checkboxContainer.appendChild(label);
    });
  };

  rebuildTraceCheckboxes();
}

run();
