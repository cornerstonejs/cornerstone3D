import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import {
  initDemo,
  setTitleAndDescription,
  addCheckboxToToolbar,
  addButtonToToolbar,
  addDropdownToToolbar,
  createImageIdsAndCacheMetaData,
  getLocalUrl,
  addManipulationBindings,
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

// DICOM tags for the Waveform module (used to parse raw DICOM JSON metadata)
const TAG = {
  WaveformSequence: '54000100',
  NumberOfWaveformChannels: '003A0005',
  NumberOfWaveformSamples: '003A0010',
  SamplingFrequency: '003A001A',
  MultiplexGroupLabel: '003A0020',
  ChannelDefinitionSequence: '003A0200',
  ChannelSourceSequence: '003A0208',
  CodeMeaning: '00080104',
  WaveformBitsAllocated: '54001004',
  WaveformSampleInterpretation: '54001006',
  WaveformData: '54001010',
} as const;

// ======== Set up page ======== //
setTitleAndDescription(
  'ECG Viewport',
  'Displays a 12-lead ECG from DICOM Waveform data. Left-drag to pan, right-drag to zoom. Use checkboxes to toggle traces.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
// Initial size — will be resized to match ECG content dimensions
element.style.width = '900px';
element.style.height = '600px';

content.appendChild(element);

// Prevent browser context menu so right-drag can be used for zoom
element.oncontextmenu = (e) => e.preventDefault();

// ======== DICOM JSON helpers ======== //

/**
 * Raw DICOM JSON instance — each tag maps to { vr, Value } or { BulkDataURI }.
 */
type DicomInstance = Record<string, Record<string, unknown>>;

function getDicomValue(instance: DicomInstance, tag: string): unknown {
  return (instance[tag]?.Value as unknown[])?.[0];
}

function getDicomValues(instance: DicomInstance, tag: string): unknown[] {
  return (instance[tag]?.Value as unknown[]) ?? [];
}

/**
 * Parses raw DICOM JSON metadata into the shape expected by ECGViewport.setEcg().
 * Returns a WaveformSequenceInput-compatible object.
 */
function parseWaveformSequence(instance: DicomInstance) {
  const waveformSeqItems = getDicomValues(instance, TAG.WaveformSequence);
  if (waveformSeqItems.length === 0) {
    return null;
  }

  const waveform = waveformSeqItems[0] as DicomInstance;

  const channelDefs = getDicomValues(waveform, TAG.ChannelDefinitionSequence);
  const channelDefinitionSequence = channelDefs.map((cd: unknown) => {
    const channelDef = cd as DicomInstance;
    const sourceSeqItems = getDicomValues(
      channelDef,
      TAG.ChannelSourceSequence
    );
    const sourceSeq = (sourceSeqItems[0] as DicomInstance) || {};
    const codeMeaning = getDicomValue(sourceSeq, TAG.CodeMeaning) as string;
    return {
      ChannelSourceSequence: {
        CodeMeaning: codeMeaning || 'Unknown',
      },
    };
  });

  return {
    NumberOfWaveformChannels: getDicomValue(
      waveform,
      TAG.NumberOfWaveformChannels
    ) as number,
    NumberOfWaveformSamples: getDicomValue(
      waveform,
      TAG.NumberOfWaveformSamples
    ) as number,
    SamplingFrequency: getDicomValue(waveform, TAG.SamplingFrequency) as number,
    WaveformBitsAllocated: getDicomValue(
      waveform,
      TAG.WaveformBitsAllocated
    ) as number,
    WaveformSampleInterpretation: getDicomValue(
      waveform,
      TAG.WaveformSampleInterpretation
    ) as string,
    MultiplexGroupLabel:
      (getDicomValue(waveform, TAG.MultiplexGroupLabel) as string) || 'ECG',
    ChannelDefinitionSequence: channelDefinitionSequence,
    WaveformData: (waveform[TAG.WaveformData] as Record<string, unknown>) || {},
  };
}

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
  const instanceMetaData =
    cornerstoneDICOMImageLoader.wadors.metaDataManager.get(ecgImageId);

  if (!instanceMetaData) {
    console.error('No metadata found for ECG imageId:', ecgImageId);
    return;
  }

  const waveformMeta = parseWaveformSequence(
    instanceMetaData as unknown as DicomInstance
  );

  if (!waveformMeta) {
    console.error('No WaveformSequence found in instance');
    return;
  }

  // ======== Set up tools ======== //
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup, { toolMap: annotationTools });

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

  // Load ECG data into the viewport
  await viewport.setEcg(waveformMeta, wadoRsRoot, StudyInstanceUID);

  // Resize element to match ECG content dimensions
  const { width, height } = viewport.getContentDimensions();
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  renderingEngine.resize();

  // ======== UI Controls ======== //

  // Annotation tool dropdown bound to right click
  let activeRightClickTool: string | null = null;
  addDropdownToToolbar({
    options: { map: annotationTools },
    onSelectedValueChange: (newToolName) => {
      const tg = ToolGroupManager.getToolGroup(toolGroupId);
      if (activeRightClickTool) {
        tg.setToolPassive(activeRightClickTool);
      }
      tg.setToolActive(newToolName as string, {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
        ],
      });
      activeRightClickTool = newToolName as string;
    },
  });

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
