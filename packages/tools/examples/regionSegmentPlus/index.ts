import {
  RenderingEngine,
  Enums,
  imageLoader,
  cache,
  metaData,
  utilities as csCoreUtilities,
  type Types,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  createInfoSection,
  addButtonToToolbar,
  addSliderToToolbar,
  addDropdownToToolbar,
  addManipulationBindings,
  addCheckboxToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  RegionSegmentPlusTool,
  WindowLevelTool,
  segmentation,
  ToolGroupManager,
  Enums: csToolsEnums,
  utilities: cstUtils,
} = cornerstoneTools;

const { ViewportType, Events: csCoreEvents } = Enums;
const { MouseBindings, KeyboardBindings } = csToolsEnums;

/** Default intensity strategy for this example (canvas disk, 10 CSS px radius). */
const DEFAULT_FILL_STRATEGY = 'canvasDiskTriClassLarge' as const;

/**
 * Primary binding = one-click region segment. Tool class is registered explicitly
 * before addManipulationBindings — that helper skips addTool for toolMap entries
 * once its module `registered` flag is true (e.g. after opening another example).
 */
const regionSegmentPlusToolMap = new Map([
  [
    RegionSegmentPlusTool.toolName,
    {
      selected: true,
      configuration: {
        hoverPrecheckEnabled: false,
        intensityRangeStrategy: DEFAULT_FILL_STRATEGY,
      },
    },
  ],
]);

const WADO_RS_ROOT = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';

/** Same includefield as OHIF demo series listings (e.g. LIDC / chest PET-CT). */
const STUDY_SERIES_QS =
  'includefield=00080021%2C00080031%2C0008103E%2C00200011';

const DEMO_STUDIES = [
  {
    studyInstanceUID:
      '1.3.6.1.4.1.9328.50.17.15423521354819720574322014551955370036',
    label: 'Chest PET/CT (9328)',
  },
  {
    studyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339',
    label: 'Whole-body PET/CT (871108…960339)',
  },
  {
    studyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    label: 'Whole-body PET/CT (334240…327463)',
  },
] as const;

const SELECT_ID_STUDY = 'region-seg-plus-study';
/** Left viewport: non-PT stack series (scouts excluded). */
const SELECT_ID_LEFT = 'region-seg-plus-left-series';
const SELECT_ID_PT = 'region-seg-plus-pt-series';
const SELECT_ID_FILL_STRATEGY = 'region-seg-plus-fill-strategy';

const FILL_STRATEGY_OPTIONS = [
  {
    value: 'meanStdMapped',
    label: 'Mean ±σ neighborhood (VOI-mapped)',
  },
  {
    value: 'fixedPercent5',
    label: 'Fixed ±5% around click (VOI-mapped)',
  },
  {
    value: 'fixedPercent10',
    label: 'Fixed ±10% around click (VOI-mapped)',
  },
  {
    value: 'canvasDiskTriClassSmall',
    label: 'Canvas disk (small, 3 px) — tri-class from rendered window',
  },
  {
    value: 'canvasDiskTriClassLarge',
    label: 'Canvas disk (large, 10 px) — tri-class from rendered window',
  },
] as const;

let currentStudyUID: string = DEMO_STUDIES[0].studyInstanceUID;

const renderingEngineId = 'myRenderingEngine';
const viewportIdCt = 'CT_STACK_LEFT';
const viewportIdPt = 'PT_STACK_RIGHT';
const segmentationIdCt = 'REGION_SEG_PLUS_CT';
const segmentationIdPt = 'REGION_SEG_PLUS_PT';
const toolGroupId = 'STACK_TOOL_GROUP_ID';

type StudySeriesEntry = {
  seriesInstanceUID: string;
  modality: string;
  description: string;
  seriesNumber: number;
};

let toolGroup;
let viewportCt;
let viewportPt;
let renderingEngine;

setTitleAndDescription(
  'Region Segment Plus Tool with Stack Viewport',
  'OHIF demo studies: non-scout non-PT (left) and PT (right). Default mouse mode is one-click region segment; standard pan/zoom/scroll bindings apply.'
);

const content = document.getElementById('content');

const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = '1fr 1fr';
viewportGrid.style.gap = '10px';
viewportGrid.style.width = '1010px';
viewportGrid.style.gridTemplateRows = '500px auto';

const elementCt = document.createElement('div');
elementCt.oncontextmenu = (e) => e.preventDefault();
elementCt.style.width = '500px';
elementCt.style.height = '500px';

const elementPt = document.createElement('div');
elementPt.oncontextmenu = (e) => e.preventDefault();
elementPt.style.width = '500px';
elementPt.style.height = '500px';

const stackStatusCt = document.createElement('div');
const stackStatusPt = document.createElement('div');
/** Plain object only — never assign from `element.style` (CSSStyleDeclaration breaks Object.assign). */
const stackStatusLabelStyle = {
  fontSize: '12px',
  fontFamily: 'ui-monospace, monospace',
  color: '#333',
  maxWidth: '500px',
  lineHeight: '1.35',
};
Object.assign(stackStatusCt.style, stackStatusLabelStyle);
Object.assign(stackStatusPt.style, stackStatusLabelStyle);

viewportGrid.appendChild(elementCt);
viewportGrid.appendChild(elementPt);
viewportGrid.appendChild(stackStatusCt);
viewportGrid.appendChild(stackStatusPt);
content.appendChild(viewportGrid);

let stackStatusListenersAttached = false;

function updateStackStatusLabel(
  viewport: Types.IStackViewport,
  labelEl: HTMLElement
) {
  const imageIds = viewport.getImageIds?.() ?? [];
  if (!imageIds.length) {
    labelEl.textContent = 'No instances loaded';
    return;
  }
  const idx = viewport.getCurrentImageIdIndex?.() ?? 0;
  const imageId = imageIds[idx];
  const instanceNum = idx + 1;
  const total = imageIds.length;
  let positionExtra = '';
  try {
    const { imagePositionPatient } = metaData.get('imagePlaneModule', imageId);
    if (
      Array.isArray(imagePositionPatient) &&
      imagePositionPatient.length >= 3
    ) {
      const [x, y, z] = imagePositionPatient.map((v) => Number(v).toFixed(1));
      positionExtra = ` · IPP (${x}, ${y}, ${z}) mm`;
    }
  } catch {
    // metadata may not be ready for every id
  }
  labelEl.textContent = `Instance ${instanceNum} / ${total}${positionExtra}`;
}

function attachStackStatusListeners() {
  if (stackStatusListenersAttached) {
    return;
  }
  stackStatusListenersAttached = true;
  elementCt.addEventListener(csCoreEvents.STACK_NEW_IMAGE, () => {
    if (viewportCt) {
      updateStackStatusLabel(viewportCt, stackStatusCt);
    }
  });
  elementPt.addEventListener(csCoreEvents.STACK_NEW_IMAGE, () => {
    if (viewportPt) {
      updateStackStatusLabel(viewportPt, stackStatusPt);
    }
  });
}

// prettier-ignore
createInfoSection(content)
  .addInstruction('Study drives both series lists; changing study reloads left and right. Scouts/localizers never appear.')
  .addInstruction('Primary click (default): Region Segment Plus. Hover precheck is off by default (second toolbar row); enable it to require a short stable hover before segmenting.')
  .addInstruction('Intensity strategy changes log to the console; each segment click logs the resolved raw intensity band from runFloodFillSegmentation.')
  .addInstruction('Canvas disk small/large are separate intensity options (3 px vs 10 px); the green circle matches the active choice.')
  .addInstruction('Middle mouse / Ctrl+drag: Pan · Right click: Zoom · Wheel / Alt+drag: Stack scroll · Shift+Ctrl+click: Length');

// ==[ Toolbar ]================================================================

addButtonToToolbar({
  title: 'Shrink',
  onClick: async () => {
    toolGroup.getToolInstance(RegionSegmentPlusTool.toolName).shrink();
  },
});

addButtonToToolbar({
  title: 'Expand',
  onClick: async () => {
    toolGroup.getToolInstance(RegionSegmentPlusTool.toolName).expand();
  },
});

addButtonToToolbar({
  title: 'Clear segmentation',
  onClick: async () => {
    [segmentationIdCt, segmentationIdPt].forEach((segId) => {
      const segmentationData = segmentation.state.getSegmentation(segId);
      if (segmentationData?.representationData?.Labelmap) {
        const labelmapData = segmentationData.representationData.Labelmap;
        if ('imageIds' in labelmapData && labelmapData.imageIds) {
          labelmapData.imageIds.forEach((imageId) => {
            const image = cache.getImage(imageId);
            if (image?.voxelManager) {
              image.voxelManager.clear();
            }
          });
        }
        segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
          segId
        );
      }
    });
  },
});

addSliderToToolbar({
  title: 'Positive threshold (10%)',
  range: [0, 100],
  defaultValue: 5,
  label: {
    html: 'test',
  },
  onSelectedValueChange: (value: string) => {
    updateSeedVariancesConfig({ positiveSeedVariance: value });
  },
  updateLabelOnChange: (value: string, label: HTMLElement) => {
    label.innerHTML = `Positive threshold (${value}%)`;
  },
});

addSliderToToolbar({
  title: 'Negative threshold (50%)',
  range: [0, 100],
  defaultValue: 50,
  label: {
    html: 'test',
  },
  onSelectedValueChange: (value: string) => {
    updateSeedVariancesConfig({ negativeSeedVariance: value });
  },
  updateLabelOnChange: (value: string, label: HTMLElement) => {
    label.innerHTML = `Negative threshold (${value}%)`;
  },
});

// =============================================================================

const updateSeedVariancesConfig = cstUtils.throttle(
  ({ positiveSeedVariance, negativeSeedVariance }) => {
    const toolInstance = toolGroup.getToolInstance(
      RegionSegmentPlusTool.toolName
    );
    const { configuration: config } = toolInstance;

    if (positiveSeedVariance !== undefined) {
      config.positiveSeedVariance = Number(positiveSeedVariance) / 100;
    }

    if (negativeSeedVariance !== undefined) {
      config.negativeSeedVariance = Number(negativeSeedVariance) / 100;
    }

    toolInstance.refresh();
  },
  1000
);

function parseStudySeries(dicomSeriesArray: unknown[]): StudySeriesEntry[] {
  const out: StudySeriesEntry[] = [];

  for (const item of dicomSeriesArray) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const rec = item as Record<string, { Value?: unknown[] }>;
    const uidRaw = rec['0020000E']?.Value?.[0];
    if (uidRaw === undefined) {
      continue;
    }
    const modalityRaw = rec['00080060']?.Value?.[0];
    const descRaw = rec['0008103E']?.Value?.[0];
    const numRaw = rec['00200011']?.Value?.[0];
    out.push({
      seriesInstanceUID: String(uidRaw),
      modality: String(modalityRaw ?? ''),
      description: descRaw !== undefined ? String(descRaw) : '',
      seriesNumber: Number(numRaw ?? 0),
    });
  }

  return out.sort(
    (a, b) =>
      a.seriesNumber - b.seriesNumber ||
      a.description.localeCompare(b.description)
  );
}

function studySeriesListUrl(studyInstanceUID: string) {
  return `${WADO_RS_ROOT}/studies/${studyInstanceUID}/series?${STUDY_SERIES_QS}`;
}

async function fetchStudySeries(
  studyInstanceUID: string
): Promise<StudySeriesEntry[]> {
  const response = await fetch(studySeriesListUrl(studyInstanceUID));
  if (!response.ok) {
    throw new Error(
      `Failed to load study series list: ${response.status} ${response.statusText}`
    );
  }
  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Study series response is not a JSON array');
  }
  return parseStudySeries(data);
}

function isScoutOrLocalizer(s: StudySeriesEntry): boolean {
  const d = s.description.toUpperCase();
  return d.includes('SCOUT') || d.includes('LOCALIZER');
}

/** Modalities not loaded as a scalar stack in this demo (SEG/SR pull PolySeg/contour paths that expect volume stacks). */
const LEFT_SERIES_MODALITY_BLOCKLIST = new Set(['PT', 'SEG', 'SR']);

/** Left viewport: non-PT stacks; scouts/localizers and SEG/SR excluded. */
function nonPtSeriesNoScout(entries: StudySeriesEntry[]): StudySeriesEntry[] {
  return entries.filter(
    (s) =>
      !LEFT_SERIES_MODALITY_BLOCKLIST.has(s.modality) && !isScoutOrLocalizer(s)
  );
}

function ptSeriesNoScout(entries: StudySeriesEntry[]): StudySeriesEntry[] {
  return entries.filter((s) => s.modality === 'PT' && !isScoutOrLocalizer(s));
}

function formatSeriesLabel(s: StudySeriesEntry): string {
  const desc = s.description || '(no description)';
  return `${s.seriesNumber} — ${s.modality} — ${desc}`;
}

function defaultLeftSeries(
  left: StudySeriesEntry[]
): StudySeriesEntry | undefined {
  const ct = left.find((s) => s.modality === 'CT');
  return ct ?? left[0];
}

function defaultPtSeries(pt: StudySeriesEntry[]): StudySeriesEntry | undefined {
  const suv = pt.find((s) => s.description.toUpperCase().includes('SUV'));
  return suv ?? pt[0];
}

/**
 * Order slices along the series scan axis using ImagePositionPatient (requires
 * wadors metadata already cached by createImageIdsAndCacheMetaData).
 */
function sortStackImageIdsByVolumePosition(imageIds: string[]): string[] {
  if (imageIds.length <= 1) {
    return imageIds;
  }
  try {
    const { sortedImageIds } =
      csCoreUtilities.sortImageIdsAndGetSpacing(imageIds);
    return sortedImageIds;
  } catch (err) {
    console.warn(
      'regionSegmentPlus: could not sort stack by IPP; keeping DICOMweb order',
      err
    );
    return imageIds;
  }
}

async function addSegmentationToState(imageIds, segId) {
  const segImages =
    await imageLoader.createAndCacheDerivedLabelmapImages(imageIds);

  segmentation.addSegmentations([
    {
      segmentationId: segId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: segImages.map((it) => it.imageId),
        },
      },
    },
  ]);
}

async function loadStackWithSegmentation({
  viewportId,
  viewport,
  element,
  segmentationId,
  studyInstanceUID,
  seriesInstanceUID,
}: {
  viewportId: string;
  viewport: Types.IStackViewport;
  element: HTMLDivElement;
  segmentationId: string;
  studyInstanceUID: string;
  seriesInstanceUID: string;
}) {
  segmentation.removeSegmentation(segmentationId);

  let imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: studyInstanceUID,
    SeriesInstanceUID: seriesInstanceUID,
    wadoRsRoot: WADO_RS_ROOT,
  });

  if (!imageIds?.length) {
    console.warn('No instances for series', seriesInstanceUID);
    return;
  }

  imageIds = sortStackImageIdsByVolumePosition(imageIds);

  await addSegmentationToState(imageIds, segmentationId);

  const mid = Math.min(Math.floor(imageIds.length / 2), imageIds.length - 1);
  await viewport.setStack(imageIds, Math.max(0, mid));

  cornerstoneTools.utilities.stackContextPrefetch.enable(element);

  await segmentation.addSegmentationRepresentations(viewportId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  segmentation.activeSegmentation.setActiveSegmentation(
    viewportId,
    segmentationId
  );
  segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);

  renderingEngine.renderViewports([viewportIdCt, viewportIdPt]);

  attachStackStatusListeners();
  if (viewportId === viewportIdCt) {
    updateStackStatusLabel(viewportCt, stackStatusCt);
  } else if (viewportId === viewportIdPt) {
    updateStackStatusLabel(viewportPt, stackStatusPt);
  }
}

function replaceSeriesSelectOptions(
  selectId: string,
  series: StudySeriesEntry[],
  selectedSeriesInstanceUID: string
) {
  const sel = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!sel) {
    return;
  }
  sel.replaceChildren();
  for (const s of series) {
    const opt = document.createElement('option');
    opt.value = s.seriesInstanceUID;
    opt.textContent = formatSeriesLabel(s);
    sel.appendChild(opt);
  }
  sel.value = selectedSeriesInstanceUID;
}

async function run() {
  await initDemo({});

  const studySeries = await fetchStudySeries(currentStudyUID);
  const leftSeries = nonPtSeriesNoScout(studySeries);
  const ptSeries = ptSeriesNoScout(studySeries);

  if (!leftSeries.length || !ptSeries.length) {
    throw new Error(
      `Need at least one non-PT (non-scout) and one PT (non-scout) series. Got left: ${leftSeries.length}, PT: ${ptSeries.length}`
    );
  }

  const initialLeft = defaultLeftSeries(leftSeries);
  const initialPt = defaultPtSeries(ptSeries);
  if (!initialLeft || !initialPt) {
    throw new Error(
      'Could not choose default left or PT series for this study'
    );
  }

  cornerstoneTools.addTool(RegionSegmentPlusTool);
  cornerstoneTools.addTool(WindowLevelTool);

  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  addManipulationBindings(toolGroup, { toolMap: regionSegmentPlusToolMap });

  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Shift,
      },
      {
        numTouchPoints: 1,
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });

  renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.setViewports([
    {
      viewportId: viewportIdCt,
      type: ViewportType.STACK,
      element: elementCt,
    },
    {
      viewportId: viewportIdPt,
      type: ViewportType.STACK,
      element: elementPt,
    },
  ]);

  viewportCt = renderingEngine.getViewport(viewportIdCt);
  viewportPt = renderingEngine.getViewport(viewportIdPt);

  toolGroup.addViewport(viewportIdCt, renderingEngineId);
  toolGroup.addViewport(viewportIdPt, renderingEngineId);

  await loadStackWithSegmentation({
    viewportId: viewportIdCt,
    viewport: viewportCt,
    element: elementCt,
    segmentationId: segmentationIdCt,
    studyInstanceUID: currentStudyUID,
    seriesInstanceUID: initialLeft.seriesInstanceUID,
  });

  await loadStackWithSegmentation({
    viewportId: viewportIdPt,
    viewport: viewportPt,
    element: elementPt,
    segmentationId: segmentationIdPt,
    studyInstanceUID: currentStudyUID,
    seriesInstanceUID: initialPt.seriesInstanceUID,
  });

  const toolbar = document.getElementById('demo-toolbar');
  const seriesToolbar = document.createElement('div');
  Object.assign(seriesToolbar.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '8px',
    width: '100%',
  });
  const segmentationToolbar = document.createElement('div');
  Object.assign(segmentationToolbar.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '8px',
    width: '100%',
    flexBasis: '100%',
  });
  toolbar.prepend(segmentationToolbar);
  toolbar.prepend(seriesToolbar);

  addDropdownToToolbar({
    labelText: 'Study',
    id: SELECT_ID_STUDY,
    container: seriesToolbar,
    options: {
      labels: DEMO_STUDIES.map((s) => s.label),
      values: DEMO_STUDIES.map((s) => s.studyInstanceUID),
      defaultValue: currentStudyUID,
    },
    onSelectedValueChange: async (uid) => {
      currentStudyUID = String(uid);
      const nextSeries = await fetchStudySeries(currentStudyUID);
      const nextLeft = nonPtSeriesNoScout(nextSeries);
      const nextPt = ptSeriesNoScout(nextSeries);
      if (!nextLeft.length || !nextPt.length) {
        console.error(
          `Study ${currentStudyUID}: need non-PT (non-scout) and PT (non-scout). Got left ${nextLeft.length}, PT ${nextPt.length}`
        );
        return;
      }
      const left0 = defaultLeftSeries(nextLeft);
      const pt0 = defaultPtSeries(nextPt);
      if (!left0 || !pt0) {
        console.error(
          `Study ${currentStudyUID}: could not resolve default left or PT series`
        );
        return;
      }
      replaceSeriesSelectOptions(
        SELECT_ID_LEFT,
        nextLeft,
        left0.seriesInstanceUID
      );
      replaceSeriesSelectOptions(SELECT_ID_PT, nextPt, pt0.seriesInstanceUID);
      await loadStackWithSegmentation({
        viewportId: viewportIdCt,
        viewport: viewportCt,
        element: elementCt,
        segmentationId: segmentationIdCt,
        studyInstanceUID: currentStudyUID,
        seriesInstanceUID: left0.seriesInstanceUID,
      });
      await loadStackWithSegmentation({
        viewportId: viewportIdPt,
        viewport: viewportPt,
        element: elementPt,
        segmentationId: segmentationIdPt,
        studyInstanceUID: currentStudyUID,
        seriesInstanceUID: pt0.seriesInstanceUID,
      });
    },
  });

  addDropdownToToolbar({
    labelText: 'Left — non-PT (no scout)',
    id: SELECT_ID_LEFT,
    container: seriesToolbar,
    options: {
      labels: leftSeries.map(formatSeriesLabel),
      values: leftSeries.map((s) => s.seriesInstanceUID),
      defaultValue: initialLeft.seriesInstanceUID,
    },
    onSelectedValueChange: (uid) => {
      loadStackWithSegmentation({
        viewportId: viewportIdCt,
        viewport: viewportCt,
        element: elementCt,
        segmentationId: segmentationIdCt,
        studyInstanceUID: currentStudyUID,
        seriesInstanceUID: String(uid),
      });
    },
  });

  addDropdownToToolbar({
    labelText: 'Right — PT',
    id: SELECT_ID_PT,
    container: seriesToolbar,
    options: {
      labels: ptSeries.map(formatSeriesLabel),
      values: ptSeries.map((s) => s.seriesInstanceUID),
      defaultValue: initialPt.seriesInstanceUID,
    },
    onSelectedValueChange: (uid) => {
      loadStackWithSegmentation({
        viewportId: viewportIdPt,
        viewport: viewportPt,
        element: elementPt,
        segmentationId: segmentationIdPt,
        studyInstanceUID: currentStudyUID,
        seriesInstanceUID: String(uid),
      });
    },
  });

  addDropdownToToolbar({
    labelText: 'Intensity / fill range',
    id: SELECT_ID_FILL_STRATEGY,
    container: segmentationToolbar,
    options: {
      labels: FILL_STRATEGY_OPTIONS.map((o) => o.label),
      values: [...FILL_STRATEGY_OPTIONS.map((o) => o.value)],
      defaultValue:
        FILL_STRATEGY_OPTIONS.find((o) => o.value === DEFAULT_FILL_STRATEGY)
          ?.value ?? FILL_STRATEGY_OPTIONS[0].value,
    },
    onSelectedValueChange: (value) => {
      const opt = FILL_STRATEGY_OPTIONS.find((o) => o.value === value);
      console.info('[regionSegmentPlus] intensity / fill strategy', {
        value,
        label: opt?.label,
      });
      toolGroup.setToolConfiguration(RegionSegmentPlusTool.toolName, {
        intensityRangeStrategy: value,
      });
    },
  });

  addCheckboxToToolbar({
    id: 'region-seg-plus-hover-precheck',
    title: 'Hover precheck',
    checked: false,
    container: segmentationToolbar,
    onChange: (checked) => {
      toolGroup.setToolConfiguration(RegionSegmentPlusTool.toolName, {
        hoverPrecheckEnabled: checked,
      });
    },
  });
}

run();
