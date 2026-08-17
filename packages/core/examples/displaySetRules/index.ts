import {
  RenderingEngine,
  Enums,
  utilities,
  type Types,
} from '@cornerstonejs/core';
import {
  createDisplaySetSplitRules,
  rawDisplaySetSelector,
  type IDisplaySet,
  type NaturalizedInstance,
  type RawSplitRule,
  type SplitRule,
} from '@cornerstonejs/metadata';
import {
  initDemo,
  setTitleAndDescription,
  createImageIdsAndCacheMetaData,
  splitDisplaySetsFromImageIds,
  setCtTransferFunctionForVolumeActor,
  getLocalUrl,
  applyCustomizationUpdate,
  hasUpdateCommand,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = 'displaySetRulesRenderingEngine';
const wadoRsRoot =
  getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';

setTitleAndDescription(
  'Display Set Rules — editing the raw selector',
  'The standard display-set split rules are data (rawDisplaySetSelector), not ' +
    'code, so they can be inspected, toggled and extended at runtime — and the ' +
    'same selector can be used by a server. Untick a rule to see what the ' +
    'series splits into without it, add your own rule as JSON, or load a rule ' +
    'set the server hosts. Every rule shown is read from the selector itself, ' +
    'including its explanation. Each display set that comes out gets its own ' +
    'viewport: a 2x2 MPR + 3D layout when the display set is volume-capable, ' +
    'otherwise a single viewport of its requested type.'
);

/** A display set is volume-capable when a rule allowed a volume viewport for it. */
function isVolumeCapable(displaySet: IDisplaySet): boolean {
  return displaySet.viewportTypes.includes('volume');
}

/** The 2x2 MPR + 3D layout, as [label, viewport type, orientation] slots. */
const MPR_3D_SLOTS: [string, Enums.ViewportType, Enums.OrientationAxis?][] = [
  ['Axial', ViewportType.ORTHOGRAPHIC, OrientationAxis.AXIAL],
  ['Sagittal', ViewportType.ORTHOGRAPHIC, OrientationAxis.SAGITTAL],
  ['Coronal', ViewportType.ORTHOGRAPHIC, OrientationAxis.CORONAL],
  ['3D', ViewportType.VOLUME_3D, undefined],
];

const HINT_TO_VIEWPORT_TYPE: Record<string, Enums.ViewportType> = {
  stack: ViewportType.STACK,
  volume: ViewportType.ORTHOGRAPHIC,
  volume3d: ViewportType.VOLUME_3D,
  video: ViewportType.VIDEO,
  ecg: ViewportType.ECG,
  wholeslide: ViewportType.WHOLE_SLIDE,
};

const MPR_3D_LAYOUT = '2x2 MPR + 3D';

// ======== Source series ======== //

type SourceSeries = {
  label: string;
  StudyInstanceUID: string;
  SeriesInstanceUID: string;
};

const SOURCE_SERIES: SourceSeries[] = [
  {
    label: 'CT — volumetric (MPR + 3D)',
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
  },
  {
    label: 'US — mixed still images + video',
    StudyInstanceUID: '2.25.96975534054447904995905761963464388233',
    SeriesInstanceUID: '2.25.15054212212536476297201250326674987992',
  },
  {
    label: 'ECG — 12-lead waveform',
    StudyInstanceUID: '1.3.76.13.65829.2.20130125082826.1072139.2',
    SeriesInstanceUID: '1.3.6.1.4.1.20029.40.20130125105919.5407.1',
  },
];

/**
 * Rule sets the **server** hosts, as paths under the DICOMweb root. A selector is
 * JSON, so a deployment can serve the same file its back end splits with — the
 * point of the raw form. Missing files are reported, not fatal.
 */
const SERVER_SELECTOR_EXAMPLES: Record<string, string> = {
  '(none — use the standard rules)': '',
  'UCalgary cardiac MR / US': 'ucalgary/displaySets.json',
};

// ======== Named safe functions ======== //

/**
 * The safe functions a selector may reference **by name**. A selector stays pure
 * JSON; anything it cannot express as data — geometry, free-form heuristics — is
 * named here and resolved at compile time. This is the only way a function enters
 * the pipeline, which is what makes a pasted or fetched selector safe to compile.
 */
const DEMO_CLASSIFIERS = {
  /** A localizer / scout / survey series, by description. */
  localizer: (instance: NaturalizedInstance) =>
    /localizer|scout|survey/i.test(String(instance.SeriesDescription ?? '')),
};

const DEMO_CUSTOM_ATTRIBUTE_PRESETS = {
  /**
   * Cardiac base-to-apex ordering — the UCalgary `sortVector`. Needs the
   * ImagePositionPatient z coordinate and the PatientPosition sign convention, so
   * it cannot be expressed as data: exactly the case named presets exist for.
   */
  ucalgaryCardiacSort: (instances: NaturalizedInstance[]) => {
    const instance = instances[0];
    const z = (instance?.ImagePositionPatient as number[] | undefined)?.[2];
    const headFirst = !String(instance?.PatientPosition ?? 'HFS').startsWith(
      'FF'
    );
    const baseToApex = z === undefined ? 0 : headFirst ? -Number(z) : Number(z);
    return { sortVector: [1, baseToApex] };
  },
};

const SAMPLE_SNIPPETS: Record<string, string> = {
  'A single new rule (localizers first)': JSON.stringify(
    {
      id: 'localizer',
      description:
        'Split scout / localizer images off into their own stack so they do ' +
        'not join the volume.',
      viewportTypes: ['stack'],
      matches: { classifier: 'localizer' },
      groupBy: ['SeriesInstanceUID'],
    },
    null,
    2
  ),
  'Split ultrasound per instance (UCalgary)': JSON.stringify(
    {
      id: 'ucalgaryUsSplit',
      description:
        'Ultrasound: InstanceNumber acts as a series number at this site, so ' +
        'each instance becomes its own display set.',
      viewportTypes: ['stack'],
      matches: { attribute: 'Modality', equals: 'US' },
      groupBy: ['SeriesInstanceUID', 'InstanceNumber'],
      customAttributes: {
        set: { isUS: true },
        fromFirstInstance: {
          descriptionName: { template: 'US series {InstanceNumber}' },
        },
        fromOptions: ['splitNumber'],
      },
    },
    null,
    2
  ),
  'Runs: interleaved US singles and clips': JSON.stringify(
    {
      id: 'usInterleaved',
      description:
        'One display set per run of same-kind instances, so img img clip img ' +
        'becomes three display sets instead of two.',
      viewportTypes: ['stack'],
      matches: { attribute: 'Modality', equals: 'US' },
      runBy: { condition: { attribute: 'NumberOfFrames', greaterThan: 1 } },
    },
    null,
    2
  ),
  'Customization merge command ($filter by id)': JSON.stringify(
    { $filter: { id: 'volume3d', $merge: { viewportTypes: ['stack'] } } },
    null,
    2
  ),
};

// ======== State ======== //

/** Rule ids the user unticked. Ids come from the selector, never hard-coded. */
const disabledRuleIds = new Set<string>();
/** Rules the user added or the server supplied, ahead of the standard ones. */
let addedRules: RawSplitRule[] = [];
/** Customization merge commands applied on top, in order. */
const mergeCommands: unknown[] = [];

let renderingEngine: RenderingEngine;
let currentSeries = SOURCE_SERIES[0];
let seriesImageIds: string[] = [];
let displaySets: IDisplaySet[] = [];
/** Every viewport this example has enabled, so they can be torn down on re-split. */
let activeViewportIds: string[] = [];
/** Chosen layout per displaySetId; absent means the automatic default. */
const layoutByDisplaySetId = new Map<string, string>();

// ======== Layout ======== //

const content = document.getElementById('content');

const page = document.createElement('div');
page.style.display = 'flex';
page.style.gap = '16px';
page.style.alignItems = 'flex-start';
page.style.flexWrap = 'wrap';
content.appendChild(page);

const rulesPanel = document.createElement('div');
rulesPanel.style.flex = '0 1 540px';
rulesPanel.style.minWidth = '380px';
page.appendChild(rulesPanel);

const gridPanel = document.createElement('div');
gridPanel.style.flex = '1 1 720px';
gridPanel.style.minWidth = '420px';
page.appendChild(gridPanel);

const statusLine = document.createElement('div');
statusLine.style.margin = '8px 0';
statusLine.style.minHeight = '1.2em';
rulesPanel.appendChild(statusLine);

function setStatus(message: string, isError = false) {
  statusLine.style.color = isError ? '#e74c3c' : '#f1c40f';
  statusLine.textContent = message;
}

// ======== The selector, assembled from user state ======== //

/**
 * The selector as data: user/server rules first, then the standard ones minus the
 * unticked ids, then any customization merge commands on top.
 *
 * The `unsupported` catch-all is never dropped — removing it would make the split
 * silently discard everything no other rule claims, which is the failure mode it
 * exists to prevent. Its checkbox is disabled for the same reason.
 */
function buildSelector(): RawSplitRule[] {
  const standard = rawDisplaySetSelector.filter(
    (rule) => !disabledRuleIds.has(rule.id)
  );

  let selector: RawSplitRule[] = [...addedRules, ...standard];

  // Applied the way OHIF's customization service merges a customization over an
  // extension default: same command vocabulary, same order.
  for (const command of mergeCommands) {
    selector = applyCustomizationUpdate(selector, command);
  }

  return selector;
}

function compileSelector(): SplitRule[] {
  return createDisplaySetSplitRules(buildSelector(), {
    classifiers: DEMO_CLASSIFIERS,
    customAttributePresets: DEMO_CUSTOM_ATTRIBUTE_PRESETS,
  });
}

// ======== Rule list ======== //

/** Human-readable groupBy, derived from the rule data rather than duplicated. */
function describeGroupBy(rule: RawSplitRule): string {
  if (!rule.groupBy?.length) {
    return 'SeriesInstanceUID (default)';
  }
  return rule.groupBy
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if ('join' in part) {
        return part.parts
          .map((sub) => ('attribute' in sub ? sub.attribute : 'value'))
          .join('+');
      }
      if ('attribute' in part) {
        return part.absent ? `${part.attribute}?` : part.attribute;
      }
      return 'value';
    })
    .join(' / ');
}

function ruleRow(rule: RawSplitRule, origin: 'standard' | 'added') {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.style.padding = '6px 0';
  row.style.borderBottom = '1px solid #333';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = !disabledRuleIds.has(rule.id);
  checkbox.style.marginTop = '3px';
  const isCatchAll = !rule.matches;
  checkbox.disabled = isCatchAll;
  checkbox.title = isCatchAll
    ? 'The catch-all cannot be disabled: without it, unmatched objects are dropped.'
    : `Toggle the "${rule.id}" rule`;
  checkbox.onchange = () => {
    if (checkbox.checked) {
      disabledRuleIds.delete(rule.id);
    } else {
      disabledRuleIds.add(rule.id);
    }
    void resplit();
  };
  row.appendChild(checkbox);

  const text = document.createElement('div');

  const title = document.createElement('div');
  const idLabel = document.createElement('strong');
  idLabel.textContent = rule.id;
  title.appendChild(idLabel);

  // Everything below is read off the rule data itself.
  const meta: string[] = [];
  if (rule.viewportTypes?.length) {
    meta.push(`viewports: ${rule.viewportTypes.join(', ')}`);
  }
  meta.push(`groupBy: ${describeGroupBy(rule)}`);
  if (rule.series?.length) {
    meta.push(`series facts: ${rule.series.map((f) => f.name).join(', ')}`);
  }
  if (origin === 'added') {
    meta.push('added');
  }
  const metaEl = document.createElement('span');
  metaEl.style.color = '#7f8c8d';
  metaEl.textContent = ` — ${meta.join(' · ')}`;
  title.appendChild(metaEl);
  text.appendChild(title);

  const description = document.createElement('div');
  description.style.color = '#bdc3c7';
  description.style.fontSize = '0.9em';
  description.textContent = rule.description ?? '(no description in the rule)';
  text.appendChild(description);

  row.appendChild(text);
  return row;
}

function renderRules() {
  rulesList.replaceChildren();
  for (const rule of addedRules) {
    rulesList.appendChild(ruleRow(rule, 'added'));
  }
  for (const rule of rawDisplaySetSelector) {
    rulesList.appendChild(ruleRow(rule, 'standard'));
  }
}

// ======== Controls ======== //

const sourceRow = document.createElement('div');
sourceRow.style.display = 'flex';
sourceRow.style.gap = '8px';
sourceRow.style.flexWrap = 'wrap';
rulesPanel.appendChild(sourceRow);

function labelled(labelText: string, control: HTMLElement) {
  const wrapper = document.createElement('label');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.fontSize = '0.85em';
  wrapper.style.color = '#bdc3c7';
  wrapper.textContent = labelText;
  wrapper.appendChild(control);
  return wrapper;
}

const seriesSelect = document.createElement('select');
for (const series of SOURCE_SERIES) {
  const option = document.createElement('option');
  option.value = series.SeriesInstanceUID;
  option.textContent = series.label;
  seriesSelect.appendChild(option);
}
seriesSelect.onchange = () => {
  currentSeries =
    SOURCE_SERIES.find((s) => s.SeriesInstanceUID === seriesSelect.value) ??
    SOURCE_SERIES[0];
  void loadSeries();
};
sourceRow.appendChild(labelled('Series', seriesSelect));

const serverSelect = document.createElement('select');
for (const label of Object.keys(SERVER_SELECTOR_EXAMPLES)) {
  const option = document.createElement('option');
  option.value = label;
  option.textContent = label;
  serverSelect.appendChild(option);
}
serverSelect.onchange = () => void loadServerSelector(serverSelect.value);
sourceRow.appendChild(labelled('Server-side rule set', serverSelect));

const rulesHeader = document.createElement('h4');
rulesHeader.textContent = 'Split rules (in order, first match wins)';
rulesHeader.style.margin = '12px 0 4px';
rulesPanel.appendChild(rulesHeader);

const rulesList = document.createElement('div');
rulesPanel.appendChild(rulesList);

const editorHeader = document.createElement('h4');
editorHeader.textContent = 'Add a rule (JSON)';
editorHeader.style.margin = '12px 0 4px';
rulesPanel.appendChild(editorHeader);

const editorHint = document.createElement('div');
editorHint.style.color = '#bdc3c7';
editorHint.style.fontSize = '0.9em';
editorHint.innerText =
  'Paste one rule, an array of rules, or a customization merge command ' +
  '($set / $push / $merge / $filter). Named safe functions available here: ' +
  `classifiers ${Object.keys(DEMO_CLASSIFIERS)
    .map((name) => `"${name}"`)
    .join(', ')}; presets ${Object.keys(DEMO_CUSTOM_ATTRIBUTE_PRESETS)
    .map((name) => `"${name}"`)
    .join(', ')}.`;
rulesPanel.appendChild(editorHint);

const sampleSelect = document.createElement('select');
sampleSelect.style.margin = '6px 0';
for (const label of Object.keys(SAMPLE_SNIPPETS)) {
  const option = document.createElement('option');
  option.value = label;
  option.textContent = label;
  sampleSelect.appendChild(option);
}
sampleSelect.onchange = () => {
  editor.value = SAMPLE_SNIPPETS[sampleSelect.value];
};
rulesPanel.appendChild(sampleSelect);

const editor = document.createElement('textarea');
editor.style.width = '100%';
editor.style.height = '180px';
editor.style.fontFamily = 'monospace';
editor.spellcheck = false;
editor.value = SAMPLE_SNIPPETS[Object.keys(SAMPLE_SNIPPETS)[0]];
rulesPanel.appendChild(editor);

const buttonRow = document.createElement('div');
buttonRow.style.display = 'flex';
buttonRow.style.gap = '8px';
buttonRow.style.marginTop = '6px';
buttonRow.style.flexWrap = 'wrap';
rulesPanel.appendChild(buttonRow);

function addButton(label: string, onClick: () => void) {
  const button = document.createElement('button');
  button.textContent = label;
  button.onclick = onClick;
  buttonRow.appendChild(button);
  return button;
}

/**
 * Adds rules (or applies a merge command) and re-splits.
 *
 * Compiles eagerly and rolls back on failure, so a bad selector is rejected here
 * — with the offending fragment named — instead of leaving the UI in a state that
 * cannot split.
 */
function applyParsedSelector(parsed: unknown, source: string): boolean {
  const previousAdded = [...addedRules];
  const previousCommandCount = mergeCommands.length;

  if (hasUpdateCommand(parsed)) {
    mergeCommands.push(parsed);
  } else {
    const rules = (Array.isArray(parsed) ? parsed : [parsed]) as RawSplitRule[];
    addedRules = [...addedRules, ...rules];
  }

  try {
    compileSelector();
  } catch (error) {
    addedRules = previousAdded;
    mergeCommands.length = previousCommandCount;
    setStatus(
      `${source} rejected: ${error instanceof Error ? error.message : error}`,
      true
    );
    return false;
  }

  renderRules();
  return true;
}

addButton('Add rule', () => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(editor.value);
  } catch (error) {
    setStatus(
      `Not valid JSON: ${error instanceof Error ? error.message : error}`,
      true
    );
    return;
  }

  if (applyParsedSelector(parsed, 'Rule')) {
    setStatus('Rule added.');
    void resplit();
  }
});

addButton('Reset', () => {
  addedRules = [];
  mergeCommands.length = 0;
  disabledRuleIds.clear();
  layoutByDisplaySetId.clear();
  serverSelect.value = Object.keys(SERVER_SELECTOR_EXAMPLES)[0];
  renderRules();
  setStatus('Back to the standard rules.');
  void resplit();
});

addButton('Copy selector JSON', async () => {
  const json = JSON.stringify(buildSelector(), null, 2);
  try {
    await navigator.clipboard.writeText(json);
    setStatus('Selector JSON copied — this is what a server would read.');
  } catch {
    console.log(json);
    setStatus('Clipboard unavailable; selector JSON logged to the console.');
  }
});

/**
 * Loads a rule set the server hosts. Accepts a bare selector array or a document
 * with a `rules` array plus metadata (`name`, `notes`, `requires`) — the shape
 * `z:/dicom/ucalgary/displaySets.json` uses.
 */
async function loadServerSelector(label: string) {
  const path = SERVER_SELECTOR_EXAMPLES[label];
  if (!path) {
    return;
  }

  const url = `${wadoRsRoot}/${path}`;
  setStatus(`Fetching ${url}…`);

  let document_: unknown;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    document_ = await response.json();
  } catch (error) {
    setStatus(
      `Could not fetch ${url}: ${
        error instanceof Error ? error.message : error
      }. Serve it from the DICOMweb root, or paste it below.`,
      true
    );
    return;
  }

  const doc = document_ as {
    name?: string;
    rules?: unknown;
    requires?: { customAttributePresets?: string[] };
  };
  const rules = Array.isArray(document_) ? document_ : doc.rules;

  if (!Array.isArray(rules)) {
    setStatus(
      `${url} is neither a selector array nor a document with a "rules" array.`,
      true
    );
    return;
  }

  // A selector may name safe functions; if the host has not registered them,
  // say so by name rather than letting compilation fail obscurely.
  const missing = (doc.requires?.customAttributePresets ?? []).filter(
    (name) => !(name in DEMO_CUSTOM_ATTRIBUTE_PRESETS)
  );
  if (missing.length) {
    setStatus(
      `${url} requires customAttributePresets not registered here: ${missing.join(
        ', '
      )}.`,
      true
    );
    return;
  }

  if (applyParsedSelector(rules, url)) {
    setStatus(
      `Loaded ${doc.name ?? url} — ${rules.length} rule(s) ahead of the standard ones.`
    );
    void resplit();
  }
}

// ======== Viewports: one per display set ======== //

/** Layout options for a display set: MPR+3D when volume-capable, else its types. */
function layoutOptionsFor(displaySet: IDisplaySet): string[] {
  const options = isVolumeCapable(displaySet) ? [MPR_3D_LAYOUT] : [];
  return [...options, ...displaySet.viewportTypes];
}

function defaultLayoutFor(displaySet: IDisplaySet): string {
  // Volume-capable display sets default to 2x2 MPR + 3D; everything else shows
  // the single viewport type the rule asked for.
  return isVolumeCapable(displaySet)
    ? MPR_3D_LAYOUT
    : displaySet.preferredViewportType;
}

function registerDisplaySetData(displaySet: IDisplaySet, layout: string) {
  const imageIds = [...displaySet.imageIds];
  const provider = utilities.genericViewportDisplaySetMetadataProvider;
  const { displaySetId } = displaySet;

  if (
    layout === MPR_3D_LAYOUT ||
    layout === 'volume' ||
    layout === 'volume3d'
  ) {
    // One volume shared by every MPR/3D viewport of this display set.
    provider.add(displaySetId, {
      imageIds,
      volumeId: `cornerstoneStreamingImageVolume:${displaySetId}`,
    });
    return;
  }

  switch (layout) {
    case 'video':
      provider.add(displaySetId, { kind: 'video', sourceDataId: imageIds[0] });
      break;
    case 'ecg':
      provider.add(displaySetId, { kind: 'ecg', sourceDataId: imageIds[0] });
      break;
    default:
      provider.add(displaySetId, {
        imageIds,
        kind: 'planar',
        initialImageIdIndex: Math.floor(imageIds.length / 2),
      });
  }
}

/** Enables one viewport and mounts the display set on it. */
async function mountViewport(
  displaySet: IDisplaySet,
  element: HTMLDivElement,
  viewportId: string,
  viewportType: Enums.ViewportType,
  orientation?: Enums.OrientationAxis
) {
  if (renderingEngine.getViewport(viewportId)) {
    renderingEngine.disableElement(viewportId);
  }

  renderingEngine.enableElement({
    viewportId,
    type: viewportType,
    element,
    defaultOptions: orientation ? { orientation } : undefined,
  });
  activeViewportIds.push(viewportId);

  const viewport = renderingEngine.getViewport(viewportId);
  const options =
    viewportType === ViewportType.ORTHOGRAPHIC
      ? { callback: setCtTransferFunctionForVolumeActor }
      : undefined;

  await viewport.setDisplaySets({
    displaySetId: displaySet.displaySetId,
    options,
  });

  if (viewportType === ViewportType.VOLUME_3D) {
    (viewport as Types.IVolumeViewport).setProperties({ preset: 'CT-Bone' });
  }
  if (viewportType === ViewportType.VIDEO) {
    (viewport as Types.IVideoViewport).play();
  }

  viewport.render();
}

function viewportElement(size: number) {
  const element = document.createElement('div');
  element.style.width = `${size}px`;
  element.style.height = `${size}px`;
  element.style.background = '#000';
  element.oncontextmenu = (event) => event.preventDefault();
  return element;
}

/** Builds and mounts one cell: the display set's header plus its viewport(s). */
async function buildCell(displaySet: IDisplaySet, index: number) {
  const cell = document.createElement('div');
  cell.style.border = '1px solid #444';
  cell.style.padding = '8px';
  cell.style.marginBottom = '12px';
  gridPanel.appendChild(cell);

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.gap = '8px';
  header.style.alignItems = 'baseline';
  header.style.flexWrap = 'wrap';
  cell.appendChild(header);

  const title = document.createElement('strong');
  title.textContent = displaySet.displaySetId;
  header.appendChild(title);

  const details = document.createElement('span');
  details.style.color = '#7f8c8d';
  details.style.fontSize = '0.9em';
  const detailParts = [
    `${displaySet.instances.length} instance(s)`,
    `${displaySet.imageIds.length} imageId(s)`,
    `allowed: ${displaySet.viewportTypes.join(', ')}`,
  ];
  if (displaySet.sopClassUids?.length) {
    detailParts.push(`SOP: ${displaySet.sopClassUids.join(', ')}`);
  }
  details.textContent = detailParts.join(' · ');
  header.appendChild(details);

  const body = document.createElement('div');
  body.style.marginTop = '6px';
  cell.appendChild(body);

  if (!displaySet.isDisplayable) {
    // The catch-all produced this: surfaced, but nothing can render it.
    const notice = document.createElement('div');
    notice.style.color = '#e67e22';
    notice.textContent =
      'Not displayable — no rule claimed this object, so it has no viewport ' +
      'type. It is still listed rather than silently dropped.';
    body.appendChild(notice);
    return;
  }

  const layout =
    layoutByDisplaySetId.get(displaySet.displaySetId) ??
    defaultLayoutFor(displaySet);

  const options = layoutOptionsFor(displaySet);
  if (options.length > 1) {
    const layoutSelect = document.createElement('select');
    for (const option of options) {
      const element = document.createElement('option');
      element.value = option;
      element.textContent = option;
      element.selected = option === layout;
      layoutSelect.appendChild(element);
    }
    layoutSelect.onchange = () => {
      layoutByDisplaySetId.set(displaySet.displaySetId, layoutSelect.value);
      void renderGrid();
    };
    header.appendChild(layoutSelect);
  }

  registerDisplaySetData(displaySet, layout);

  try {
    if (layout === MPR_3D_LAYOUT) {
      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(2, 220px)';
      grid.style.gap = '4px';
      body.appendChild(grid);

      for (const [slotIndex, slot] of MPR_3D_SLOTS.entries()) {
        const [label, viewportType, orientation] = slot;
        const wrapper = document.createElement('div');
        const element = viewportElement(220);
        wrapper.appendChild(element);
        const caption = document.createElement('div');
        caption.style.fontSize = '0.8em';
        caption.style.color = '#7f8c8d';
        caption.textContent = label;
        wrapper.appendChild(caption);
        grid.appendChild(wrapper);

        // Mounted sequentially so four volume viewports don't all contend.
        await mountViewport(
          displaySet,
          element,
          `dsr-${index}-${slotIndex}`,
          viewportType,
          orientation
        );
      }
    } else {
      const element = viewportElement(320);
      body.appendChild(element);
      await mountViewport(
        displaySet,
        element,
        `dsr-${index}-0`,
        HINT_TO_VIEWPORT_TYPE[layout] ?? ViewportType.STACK,
        layout === 'volume' ? OrientationAxis.AXIAL : undefined
      );
    }
  } catch (error) {
    const failure = document.createElement('div');
    failure.style.color = '#e74c3c';
    failure.textContent = `Failed to mount: ${
      error instanceof Error ? error.message : error
    }`;
    body.appendChild(failure);
    console.error(
      `[displaySetRules] mount failed for ${displaySet.displaySetId}`,
      error
    );
  }
}

/** Tears down every viewport and rebuilds one cell per display set. */
async function renderGrid() {
  for (const viewportId of activeViewportIds) {
    if (renderingEngine.getViewport(viewportId)) {
      renderingEngine.disableElement(viewportId);
    }
  }
  activeViewportIds = [];
  gridPanel.replaceChildren();

  const header = document.createElement('h4');
  header.textContent = `Display sets (${displaySets.length})`;
  header.style.margin = '4px 0';
  gridPanel.appendChild(header);

  if (!displaySets.length) {
    const empty = document.createElement('div');
    empty.textContent =
      'No display sets — every rule that could claim these instances is off.';
    gridPanel.appendChild(empty);
    return;
  }

  for (const [index, displaySet] of displaySets.entries()) {
    await buildCell(displaySet, index);
  }
}

/** Re-splits the loaded series with the current selector. No refetch needed. */
async function resplit() {
  if (!seriesImageIds.length) {
    return;
  }

  try {
    displaySets = splitDisplaySetsFromImageIds(
      seriesImageIds,
      compileSelector()
    );
  } catch (error) {
    setStatus(
      `Split failed: ${error instanceof Error ? error.message : error}`,
      true
    );
    return;
  }

  await renderGrid();
}

async function loadSeries() {
  setStatus(`Loading ${currentSeries.label}…`);
  layoutByDisplaySetId.clear();
  seriesImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: currentSeries.StudyInstanceUID,
    SeriesInstanceUID: currentSeries.SeriesInstanceUID,
    wadoRsRoot,
  });
  await resplit();
  setStatus(
    `${currentSeries.label}: ${displaySets.length} display set(s) from ${seriesImageIds.length} imageId(s).`
  );
}

// ======== Run ======== //

async function run() {
  await initDemo();

  renderingEngine = new RenderingEngine(renderingEngineId);

  renderRules();
  await loadSeries();
}

run();
