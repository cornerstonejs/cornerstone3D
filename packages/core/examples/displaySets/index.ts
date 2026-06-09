import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums, utilities } from '@cornerstonejs/core';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import { api } from 'dicomweb-client';
import {
  initDemo,
  setTitleAndDescription,
  createImageIdsAndCacheMetaData,
  splitDisplaySetsFromImageIds,
  setCtTransferFunctionForVolumeActor,
  getLocalUrl,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const { wadors } = dicomImageLoader;

const renderingEngineId = 'displaySetsRenderingEngine';
const wadoRsRoot =
  getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';

type DisplaySet = ReturnType<typeof splitDisplaySetsFromImageIds>[number];

// Maps a display set's viewport-type hint to the cornerstone viewport type to
// enable for it.
const HINT_TO_VIEWPORT_TYPE: Record<string, Enums.ViewportType> = {
  stack: ViewportType.STACK,
  volume: ViewportType.ORTHOGRAPHIC,
  volume3d: ViewportType.VOLUME_3D,
  video: ViewportType.VIDEO,
  wholeslide: ViewportType.WHOLE_SLIDE,
  ecg: ViewportType.ECG,
};

const BACKGROUND_BY_HINT: Record<string, Types.Point3> = {
  stack: [0.1, 0.1, 0.1],
  volume: [0.1, 0.1, 0.1],
  volume3d: [0, 0, 0],
  video: [0, 0.1, 0],
  wholeslide: [0, 0.1, 0],
  ecg: [0.1, 0, 0.1],
};

setTitleAndDescription(
  'Display Sets — one viewport per display set',
  'Each source series is split into display sets, and every display set gets ' +
    'its own viewport with the associated information to its right (so the ' +
    'mixed US video series shows two viewports - one for the still images and ' +
    'one for the video). The per-display-set dropdown switches that display ' +
    'set between its allowed viewport types; only the volumetric (CT) series ' +
    'permits more than one. Each viewport is driven by viewport.setDisplaySets().'
);

const content = document.getElementById('content');

// A vertical stack of rows; each row is [viewport | info + type dropdown].
const rowsContainer = document.createElement('div');
rowsContainer.style.display = 'flex';
rowsContainer.style.flexDirection = 'column';
rowsContainer.style.gap = '16px';
content.appendChild(rowsContainer);

// ======== Source series (one or more display sets each) ======== //

type SourceSeries = {
  label: string;
  StudyInstanceUID: string;
  SeriesInstanceUID: string;
  /** WSI needs a DICOMweb client and non-converted multiframe metadata. */
  isWsi?: boolean;
};

const SOURCE_SERIES: SourceSeries[] = [
  {
    label: 'US — mixed still images + video',
    StudyInstanceUID: '2.25.96975534054447904995905761963464388233',
    SeriesInstanceUID: '2.25.15054212212536476297201250326674987992',
  },
  {
    label: 'CT — volumetric',
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
  },
  {
    label: 'ECG — 12-lead waveform',
    StudyInstanceUID: '1.3.76.13.65829.2.20130125082826.1072139.2',
    SeriesInstanceUID: '1.3.6.1.4.1.20029.40.20130125105919.5407.1',
  },
  {
    label: 'SM — whole slide microscopy',
    StudyInstanceUID: '2.25.269859997690759739055099378767846712697',
    SeriesInstanceUID: '2.25.274641717059635090989922952756233538416',
    isWsi: true,
  },
];

// ======== Per-display-set row state ======== //

type Row = {
  displaySetId: string;
  viewportId: string;
  displaySet: DisplaySet;
  /** The currently selected viewport-type hint. */
  hint: string;
  viewportElement: HTMLDivElement;
  detailsElement: HTMLDivElement;
  /** DICOMweb client, only needed for whole-slide display sets. */
  client?: unknown;
};

let renderingEngine: RenderingEngine;

function instanceField(displaySet: DisplaySet, key: string): string {
  const instance = displaySet.instances[0] as
    | Record<string, unknown>
    | undefined;
  const value = instance?.[key];
  return value === undefined || value === null ? '—' : String(value);
}

function registerDisplaySetData(row: Row) {
  const { displaySetId, displaySet, hint, client } = row;
  const imageIds = [...displaySet.imageIds];
  const provider = utilities.genericViewportDataSetMetadataProvider;

  switch (hint) {
    case 'video':
      provider.add(displaySetId, { kind: 'video', sourceDataId: imageIds[0] });
      break;
    case 'ecg':
      provider.add(displaySetId, { kind: 'ecg', sourceDataId: imageIds[0] });
      break;
    case 'wholeslide':
      provider.add(displaySetId, {
        imageIds,
        kind: 'wsi',
        options: { webClient: client },
      });
      break;
    case 'stack':
      provider.add(displaySetId, {
        imageIds,
        kind: 'planar',
        initialImageIdIndex: Math.floor(imageIds.length / 2),
      });
      break;
    default:
      // volume / volume3d
      provider.add(displaySetId, {
        imageIds,
        volumeId: `cornerstoneStreamingImageVolume:${displaySetId}`,
      });
  }
}

function renderDetails(row: Row, viewport: Types.IViewport, status: string) {
  const ds = row.displaySet;
  const recorded = viewport
    .getDisplaySets()
    .map((entry) => entry.displaySetId)
    .join(', ');

  const lines: Array<[string, string]> = [
    ['Series', instanceField(ds, 'SeriesDescription')],
    ['Modality', instanceField(ds, 'Modality')],
    ['SOP class', instanceField(ds, 'SOPClassUID')],
    ['Instances', String(ds.instances.length)],
    ['Image ids', String(ds.imageIds.length)],
    ['Preferred', ds.preferredViewportType],
    ['Allowed', ds.viewportTypes.join(', ')],
    ['Mounted as', row.hint],
    ['getDisplaySets()', `[${recorded}]`],
  ];

  row.detailsElement.innerHTML = '';
  for (const [label, value] of lines) {
    const line = document.createElement('div');
    line.innerHTML = `<strong>${label}:</strong> ${value}`;
    row.detailsElement.appendChild(line);
  }
  if (status) {
    const statusLine = document.createElement('div');
    statusLine.style.color = '#f1c40f';
    statusLine.innerText = status;
    row.detailsElement.appendChild(statusLine);
  }
}

async function mountRow(row: Row) {
  const viewportType = HINT_TO_VIEWPORT_TYPE[row.hint] ?? ViewportType.STACK;

  try {
    registerDisplaySetData(row);

    // Each viewport type needs its own viewport class, so (re)create it.
    if (renderingEngine.getViewport(row.viewportId)) {
      renderingEngine.disableElement(row.viewportId);
    }
    renderingEngine.enableElement({
      viewportId: row.viewportId,
      type: viewportType,
      element: row.viewportElement,
      defaultOptions: {
        background: BACKGROUND_BY_HINT[row.hint] ?? [0.1, 0.1, 0.1],
      },
    });

    const viewport = renderingEngine.getViewport(row.viewportId);

    const options =
      row.hint === 'volume'
        ? { callback: setCtTransferFunctionForVolumeActor }
        : undefined;

    // The unified entry point: resolves the displaySetId through the registry,
    // loads the type-specific data, and records the mounted display set.
    await viewport.setDisplaySets({ displaySetId: row.displaySetId, options });

    if (row.hint === 'volume3d') {
      // 3D needs a preset to be visible; setDisplaySets already loaded the volume.
      (viewport as Types.IVolumeViewport).setProperties({ preset: 'CT-Bone' });
    }
    if (row.hint === 'video') {
      (viewport as Types.IVideoViewport).play();
    }

    viewport.render();
    renderDetails(row, viewport, '');
  } catch (err) {
    const viewport = renderingEngine.getViewport(row.viewportId);
    const message = err instanceof Error ? err.message : String(err);
    if (viewport) {
      renderDetails(row, viewport, `Error: ${message}`);
    }
    console.error(`[displaySets] Failed to mount ${row.displaySetId}:`, err);
  }
}

function buildRow(
  displaySet: DisplaySet,
  client: unknown,
  seriesIndex: number,
  dsIndex: number
): Row {
  const displaySetId = `displaySets:ds-${seriesIndex}-${dsIndex}`;
  const viewportId = `displaySets-vp-${seriesIndex}-${dsIndex}`;

  const rowElement = document.createElement('div');
  rowElement.style.display = 'flex';
  rowElement.style.gap = '12px';
  rowElement.style.alignItems = 'flex-start';

  const viewportElement = document.createElement('div');
  viewportElement.id = viewportId;
  viewportElement.style.width = '320px';
  viewportElement.style.height = '320px';
  viewportElement.style.flex = '0 0 auto';
  viewportElement.oncontextmenu = (e) => e.preventDefault();

  const infoElement = document.createElement('div');
  infoElement.style.fontFamily = 'monospace';
  infoElement.style.fontSize = '12px';

  const detailsElement = document.createElement('div');
  infoElement.appendChild(detailsElement);

  const row: Row = {
    displaySetId,
    viewportId,
    displaySet,
    hint: displaySet.preferredViewportType,
    viewportElement,
    detailsElement,
    client,
  };

  // Per-display-set dropdown to switch among the allowed viewport types.
  const selectLabel = document.createElement('label');
  selectLabel.style.display = 'block';
  selectLabel.style.marginTop = '8px';
  selectLabel.innerText = 'Viewport type: ';

  const select = document.createElement('select');
  for (const hint of displaySet.viewportTypes) {
    const option = document.createElement('option');
    option.value = hint;
    option.text = hint;
    option.selected = hint === displaySet.preferredViewportType;
    select.appendChild(option);
  }
  select.disabled = displaySet.viewportTypes.length <= 1;
  select.onchange = () => {
    row.hint = select.value;
    mountRow(row);
  };
  selectLabel.appendChild(select);
  infoElement.appendChild(selectLabel);

  rowElement.appendChild(viewportElement);
  rowElement.appendChild(infoElement);
  rowsContainer.appendChild(rowElement);

  return row;
}

async function loadSeries(series: SourceSeries) {
  let client: unknown;
  let imageIds: string[];

  if (series.isWsi) {
    const webClient = new api.DICOMwebClient({ url: wadoRsRoot });
    imageIds = await createImageIdsAndCacheMetaData({
      StudyInstanceUID: series.StudyInstanceUID,
      SeriesInstanceUID: series.SeriesInstanceUID,
      client: webClient,
      wadoRsRoot,
      convertMultiframe: false,
    });
    webClient.getDICOMwebMetadata = (imageId) =>
      wadors.metaDataManager.get(imageId);
    client = webClient;
  } else {
    imageIds = await createImageIdsAndCacheMetaData({
      StudyInstanceUID: series.StudyInstanceUID,
      SeriesInstanceUID: series.SeriesInstanceUID,
      wadoRsRoot,
    });
  }

  const displaySets = splitDisplaySetsFromImageIds(imageIds);
  return { displaySets, client };
}

async function run() {
  await initDemo();

  renderingEngine = new RenderingEngine(renderingEngineId);

  for (let seriesIndex = 0; seriesIndex < SOURCE_SERIES.length; seriesIndex++) {
    const series = SOURCE_SERIES[seriesIndex];

    // Section header so the display sets are grouped by their source series.
    const header = document.createElement('h3');
    header.innerText = series.label;
    header.style.margin = '4px 0';
    rowsContainer.appendChild(header);

    try {
      const { displaySets, client } = await loadSeries(series);

      if (!displaySets.length) {
        const empty = document.createElement('div');
        empty.innerText = 'No display sets found in series.';
        rowsContainer.appendChild(empty);
        continue;
      }

      for (let dsIndex = 0; dsIndex < displaySets.length; dsIndex++) {
        const row = buildRow(
          displaySets[dsIndex],
          client,
          seriesIndex,
          dsIndex
        );
        // Mount sequentially so heavy loads (volume/WSI) don't all contend.
        await mountRow(row);
      }
    } catch (err) {
      const errorEl = document.createElement('div');
      errorEl.style.color = '#e74c3c';
      errorEl.innerText = `Failed to load series: ${
        err instanceof Error ? err.message : String(err)
      }`;
      rowsContainer.appendChild(errorEl);
      console.error(`[displaySets] Failed to load ${series.label}:`, err);
    }
  }
}

run();
