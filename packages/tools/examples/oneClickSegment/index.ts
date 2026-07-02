import {
  RenderingEngine,
  Enums,
  imageLoader,
  cache,
  metaData,
  type Types,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  validateAndSortVolumeIds,
  setTitleAndDescription,
  createInfoSection,
  addButtonToToolbar,
  addDropdownToToolbar,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { viewportSupportsStackCompatibility } from '../../src/utilities/viewportCapabilities';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  OneClickSegmentTool,
  WindowLevelTool,
  segmentation,
  ToolGroupManager,
  Enums: csToolsEnums,
  synchronizers,
  SynchronizerManager,
} = cornerstoneTools;

const { createImageSliceSynchronizer } = synchronizers;

const { ViewportType, Events: csCoreEvents } = Enums;
const { MouseBindings, KeyboardBindings } = csToolsEnums;

const oneClickToolName = OneClickSegmentTool.toolName;

/**
 * Primary mouse binding = one-click lesion segmentation. `OneClickSegmentTool`
 * needs NO configuration: it derives a one-sided intensity threshold
 * dynamically from the click (a hot lesion is segmented down from its core, so
 * the brightest voxels are never left as holes) and only accepts clicks on a
 * coherent, lesion-scale region. The tool class is registered explicitly
 * before addManipulationBindings — that helper skips addTool for toolMap
 * entries once its module `registered` flag is true (e.g. after opening
 * another example).
 */
const oneClickToolMap = new Map([
  [
    oneClickToolName,
    {
      selected: true,
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
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339',
    label: 'Whole-body PET/CT (871108…960339)',
  },
  {
    studyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    label: 'Whole-body PET/CT (334240…327463)',
  },
  {
    studyInstanceUID:
      '1.3.6.1.4.1.9328.50.17.15423521354819720574322014551955370036',
    label: 'Chest PET/CT (9328)',
  },
] as const;

const SELECT_ID_STUDY = 'one-click-segment-study';
/** Left viewport: non-PT (usually CT) stack series (scouts excluded). */
const SELECT_ID_LEFT = 'one-click-segment-left-series';
/** Right viewport: PT stack series. */
const SELECT_ID_PT = 'one-click-segment-pt-series';

let currentStudyUID: string = DEMO_STUDIES[0].studyInstanceUID;

const imageSliceSync = 'ONE_CLICK_SEGMENT_IMAGE_SLICE_SYNCHRONIZER';
const renderingEngineId = 'oneClickSegmentRenderingEngine';
const viewportIdCt = 'ONE_CLICK_CT_LEFT';
const viewportIdPt = 'ONE_CLICK_PT_RIGHT';
const segmentationIdCt = 'ONE_CLICK_SEGMENT_CT';
const segmentationIdPt = 'ONE_CLICK_SEGMENT_PT';
const toolGroupId = 'ONE_CLICK_SEGMENT_TOOL_GROUP';

type StudySeriesEntry = {
  seriesInstanceUID: string;
  modality: string;
  description: string;
  seriesNumber: number;
};

type SeriesStackValidation = {
  valid: boolean;
  sortedImageIds: string[];
  reason?: string;
};

let toolGroup;
let viewportCt;
let viewportPt;
let renderingEngine;
const seriesValidationCache = new Map<string, Promise<SeriesStackValidation>>();
let escCancelListenerAttached = false;

setTitleAndDescription(
  'One-Click Segment Tool (lesion segmentation)',
  'Single-click lesion segmentation on PET/CT. Hover to scout candidates (the cursor previews whether a click will produce a meaningful, lesion-scale segment), click once to segment, then Shrink/Expand to fine-tune. Nothing to configure. CT (left) and PT (right) stay slice-synchronized in patient space.'
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
  .addInstruction('Hover to scout: the cursor tells you what a click will do. A green plus = a lesion-scale region was confirmed here (one click segments it). A gray dashed circle = still evaluating (or nothing to segment yet). A red no-entry = not segmentable here (flat tissue, noise, or a sprawling non-lesion structure such as chained bone) — clicks there do nothing.')
  .addInstruction('Primary click on a plus: segment the lesion in 3D. The threshold is one-sided and derived from the click, so the hottest core is always included (no interior holes).')
  .addInstruction('Shrink / Expand: step the last segment along its measured growth curve — each press visibly shrinks or grows the region (the previous result is cleared and refilled, so both directions retrace exactly). Esc cancels a long-running fill.')
  .addInstruction('Best tested on PT: hover over a focal uptake (lesion) — plus; hover just off it — blocked. Window/Level (Shift+drag) changes what you see and therefore what a click captures.')
  .addInstruction('Middle mouse / Ctrl+drag: Pan · Right click: Zoom · Wheel / Alt+drag: Stack scroll · Shift+drag: Window/Level')
  .addInstruction('CT (left) and PT (right) are slice-synchronized — scrolling either viewport updates the other to the matching patient position.');

// ==[ Cursor legend ]=========================================================

/**
 * A small inline legend mirroring the three hover cursors, so the meaning of
 * plus / evaluating / blocked is visible without hovering the image.
 */
function appendCursorLegend(container: HTMLElement) {
  const legend = document.createElement('div');
  Object.assign(legend.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '18px',
    alignItems: 'center',
    margin: '4px 0 8px',
    fontSize: '13px',
    fontFamily: 'ui-monospace, monospace',
  });

  const entries: Array<{ svg: string; label: string }> = [
    {
      label: 'segmentable (click to segment)',
      svg: "<circle cx='11' cy='11' r='8' fill='none' stroke='#00b46a' stroke-width='2'/><path d='M11 7v8M7 11h8' stroke='#00b46a' stroke-width='2' stroke-linecap='round'/>",
    },
    {
      label: 'evaluating',
      svg: "<circle cx='11' cy='11' r='8' fill='none' stroke='#8a9099' stroke-width='2' stroke-dasharray='4 3'/>",
    },
    {
      label: 'not a lesion here',
      svg: "<circle cx='11' cy='11' r='8' fill='none' stroke='#ff5a5a' stroke-width='2'/><path d='M5 5l12 12' stroke='#ff5a5a' stroke-width='2' stroke-linecap='round'/>",
    },
  ];

  for (const { svg, label } of entries) {
    const item = document.createElement('span');
    Object.assign(item.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
    });
    item.innerHTML =
      `<svg width='22' height='22' viewBox='0 0 22 22' aria-hidden='true'>${svg}</svg>` +
      `<span>${label}</span>`;
    legend.appendChild(item);
  }

  container.appendChild(legend);
}

// ==[ Study / series loading ]================================================

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

function makeSeriesCacheKey(
  studyInstanceUID: string,
  seriesInstanceUID: string
) {
  return `${studyInstanceUID}::${seriesInstanceUID}`;
}

async function validateAndSortSeriesForStack(
  studyInstanceUID: string,
  seriesInstanceUID: string
): Promise<SeriesStackValidation> {
  const cacheKey = makeSeriesCacheKey(studyInstanceUID, seriesInstanceUID);
  const existing = seriesValidationCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = (async (): Promise<SeriesStackValidation> => {
    const imageIds = await createImageIdsAndCacheMetaData({
      StudyInstanceUID: studyInstanceUID,
      SeriesInstanceUID: seriesInstanceUID,
      wadoRsRoot: WADO_RS_ROOT,
    });
    return validateAndSortVolumeIds(imageIds);
  })();

  seriesValidationCache.set(cacheKey, promise);
  return promise;
}

async function filterValidStackSeries(
  studyInstanceUID: string,
  entries: StudySeriesEntry[],
  laneLabel: string
): Promise<StudySeriesEntry[]> {
  const checks = await Promise.all(
    entries.map(async (entry) => {
      const validation = await validateAndSortSeriesForStack(
        studyInstanceUID,
        entry.seriesInstanceUID
      );
      return { entry, validation };
    })
  );

  const valid = checks
    .filter((it) => it.validation.valid)
    .map((it) => it.entry);
  const rejected = checks.filter((it) => !it.validation.valid);

  rejected.forEach(({ entry, validation }) => {
    console.warn(
      `[oneClickSegment] excluding ${laneLabel} series ${entry.seriesInstanceUID}: ${validation.reason}`
    );
  });

  return valid;
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

// Latest load token per viewport. The study selector and the left/right series
// selectors can all trigger a load for the same viewport concurrently; only the
// most recent one for a given viewport is allowed to mutate state, so a slower
// older load cannot restore stale data after a newer selection has finished.
const viewportLoadTokens = new Map<string, number>();

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
  const loadToken = (viewportLoadTokens.get(viewportId) ?? 0) + 1;
  viewportLoadTokens.set(viewportId, loadToken);
  const isStale = () => viewportLoadTokens.get(viewportId) !== loadToken;

  segmentation.removeSegmentation(segmentationId);

  const validation = await validateAndSortSeriesForStack(
    studyInstanceUID,
    seriesInstanceUID
  );
  const imageIds = validation.sortedImageIds;

  if (!validation.valid || !imageIds?.length) {
    console.warn(
      `[oneClickSegment] refusing to load invalid stack series ${seriesInstanceUID}: ${validation.reason}`
    );
    return;
  }

  if (isStale()) {
    return;
  }
  await addSegmentationToState(imageIds, segmentationId);

  if (isStale()) {
    return;
  }
  const mid = Math.min(Math.floor(imageIds.length / 2), imageIds.length - 1);
  await viewport.setStack(imageIds, Math.max(0, mid));

  if (isStale()) {
    return;
  }
  cornerstoneTools.utilities.stackContextPrefetch.enable(element);

  await segmentation.addSegmentationRepresentations(viewportId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  if (isStale()) {
    return;
  }
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

  cornerstoneTools.addTool(OneClickSegmentTool);
  cornerstoneTools.addTool(WindowLevelTool);

  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  addManipulationBindings(toolGroup, { toolMap: oneClickToolMap });

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

  if (
    !viewportSupportsStackCompatibility(viewportCt) ||
    !viewportSupportsStackCompatibility(viewportPt)
  ) {
    throw new Error('Image slice sync requires stack-compatible viewports');
  }

  createImageSliceSynchronizer(imageSliceSync);
  const sliceSynchronizer = SynchronizerManager.getSynchronizer(imageSliceSync);
  if (sliceSynchronizer) {
    sliceSynchronizer.add({ renderingEngineId, viewportId: viewportIdCt });
    sliceSynchronizer.add({ renderingEngineId, viewportId: viewportIdPt });
  }

  if (!escCancelListenerAttached) {
    document.addEventListener('keydown', (evt) => {
      if (evt.key !== 'Escape') {
        return;
      }
      const toolInstance = toolGroup?.getToolInstance?.(oneClickToolName) as {
        cancelActiveOperation?: () => boolean;
      } | null;
      const cancelled = toolInstance?.cancelActiveOperation?.() === true;
      if (cancelled) {
        evt.preventDefault();
        console.info('[oneClickSegment] cancel requested (Esc)');
      }
    });
    escCancelListenerAttached = true;
  }

  const toolbar = document.getElementById('demo-toolbar');
  appendCursorLegend(toolbar);
  const seriesToolbar = document.createElement('div');
  Object.assign(seriesToolbar.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '8px',
    width: '100%',
  });
  const operationsToolbar = document.createElement('div');
  Object.assign(operationsToolbar.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '8px',
    width: '100%',
    flexBasis: '100%',
  });
  toolbar.append(seriesToolbar);
  toolbar.append(operationsToolbar);

  const initialSeriesPromise = (async () => {
    const studySeries = await fetchStudySeries(currentStudyUID);
    const leftSeries = await filterValidStackSeries(
      currentStudyUID,
      nonPtSeriesNoScout(studySeries),
      'left'
    );
    const ptSeries = await filterValidStackSeries(
      currentStudyUID,
      ptSeriesNoScout(studySeries),
      'right/PT'
    );
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
    return {
      leftSeries,
      ptSeries,
      initialLeft,
      initialPt,
    };
  })();

  // Bumped on every study change so an in-flight handler whose study has been
  // superseded can bail before mutating the dropdowns/viewports.
  let studySelectionGeneration = 0;

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
      const requestedStudyUID = String(uid);
      const myGeneration = ++studySelectionGeneration;
      const isStale = () => myGeneration !== studySelectionGeneration;

      currentStudyUID = requestedStudyUID;
      seriesValidationCache.clear();

      try {
        const nextSeries = await fetchStudySeries(requestedStudyUID);
        if (isStale()) {
          return;
        }
        const nextLeft = await filterValidStackSeries(
          requestedStudyUID,
          nonPtSeriesNoScout(nextSeries),
          'left'
        );
        if (isStale()) {
          return;
        }
        const nextPt = await filterValidStackSeries(
          requestedStudyUID,
          ptSeriesNoScout(nextSeries),
          'right/PT'
        );
        if (isStale()) {
          return;
        }
        if (!nextLeft.length || !nextPt.length) {
          console.error(
            `Study ${requestedStudyUID}: need non-PT (non-scout) and PT (non-scout). Got left ${nextLeft.length}, PT ${nextPt.length}`
          );
          return;
        }
        const left0 = defaultLeftSeries(nextLeft);
        const pt0 = defaultPtSeries(nextPt);
        if (!left0 || !pt0) {
          console.error(
            `Study ${requestedStudyUID}: could not resolve default left or PT series`
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
          studyInstanceUID: requestedStudyUID,
          seriesInstanceUID: left0.seriesInstanceUID,
        });
        if (isStale()) {
          return;
        }
        await loadStackWithSegmentation({
          viewportId: viewportIdPt,
          viewport: viewportPt,
          element: elementPt,
          segmentationId: segmentationIdPt,
          studyInstanceUID: requestedStudyUID,
          seriesInstanceUID: pt0.seriesInstanceUID,
        });
      } catch (err) {
        if (!isStale()) {
          console.error(
            `Study ${requestedStudyUID}: failed to load study series`,
            err
          );
        }
      }
    },
  });

  addDropdownToToolbar({
    labelText: 'Left — non-PT (no scout)',
    id: SELECT_ID_LEFT,
    container: seriesToolbar,
    options: initialSeriesPromise.then(({ leftSeries, initialLeft }) => ({
      labels: leftSeries.map(formatSeriesLabel),
      values: leftSeries.map((s) => s.seriesInstanceUID),
      defaultValue: initialLeft.seriesInstanceUID,
    })),
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
    options: initialSeriesPromise.then(({ ptSeries, initialPt }) => ({
      labels: ptSeries.map(formatSeriesLabel),
      values: ptSeries.map((s) => s.seriesInstanceUID),
      defaultValue: initialPt.seriesInstanceUID,
    })),
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

  addButtonToToolbar({
    title: 'Shrink',
    container: operationsToolbar,
    onClick: () => {
      toolGroup.getToolInstance(oneClickToolName).shrink();
    },
  });

  addButtonToToolbar({
    title: 'Expand',
    container: operationsToolbar,
    onClick: () => {
      toolGroup.getToolInstance(oneClickToolName).expand();
    },
  });

  addButtonToToolbar({
    title: 'Clear segmentation',
    container: operationsToolbar,
    onClick: () => {
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

  const { initialLeft, initialPt } = await initialSeriesPromise;

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
}

run();
