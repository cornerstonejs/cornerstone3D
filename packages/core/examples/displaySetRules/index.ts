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
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  initDemo,
  setTitleAndDescription,
  createImageIdsAndCacheMetaData,
  splitDisplaySetsFromImageIds,
  setCtTransferFunctionForVolumeActor,
  getLocalUrl,
  addManipulationBindings,
  applyCustomizationUpdate,
  hasUpdateCommand,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, OrientationAxis } = Enums;
const { ToolGroupManager, LengthTool } = cornerstoneTools;

const renderingEngineId = 'displaySetRulesRenderingEngine';

/**
 * Two tool groups because the bindings differ: a 3D viewport rotates on the
 * primary button where a 2D one scrolls frames. Both come from
 * `addManipulationBindings`, so this example has the same controls as every
 * other one rather than a set of its own.
 */
const toolGroupId2d = 'displaySetRulesTools2d';
const toolGroupId3d = 'displaySetRulesTools3d';
const wadoRsRoot =
  getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';

/**
 * The local DICOMweb back end. `?useLocal=true` (or `useLocal=<port>`, plus
 * `useProtocol=https`) points the whole example at it; a source series carrying
 * `wadoRsRoot: LOCAL_ROOT` reads from it either way, for data that only exists
 * locally.
 */
const LOCAL_ROOT = getLocalUrl() || 'http://localhost:5000/dicomweb';

setTitleAndDescription(
  'Display Set Rules — editing the raw selector',
  'The standard display-set split rules are data (rawDisplaySetSelector), not ' +
    'code, so they can be inspected, toggled and extended at runtime — and the ' +
    'same selector can be used by a server. Untick a rule to see what the ' +
    'series splits into without it, add your own rule as JSON, or load a rule ' +
    'set the server hosts. Every rule shown is read from the selector itself, ' +
    'including its explanation. Each display set that comes out gets its own ' +
    'viewport: a 2x2 MPR + 3D layout when the display set is volume-capable, ' +
    'otherwise a single viewport of its requested type. Every viewport carries ' +
    'the standard bindings — wheel or Alt+left-drag to navigate frames, ' +
    'right-drag to zoom, middle-drag to pan — with the length tool promoted to ' +
    'a plain left drag, so a split can be measured across as well as looked at.'
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
  /** Overrides the example-wide root, for a series hosted somewhere else. */
  wadoRsRoot?: string;
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
  {
    // CMMD patient D2-0140 (TCIA, CC BY 4.0, DOI 10.7937/tcia.eqde-4b16). All
    // four screening views arrive as one series, which is what makes it worth
    // having here: the standard `singleImageModality` rule splits MG on a coarse
    // image-size bucket, and these four are identically sized, so out of the box
    // the study is a single four-image stack. Local-only data.
    label: 'MG — screening mammogram, 4 views in one series (local)',
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1239.1759.598888059044635576254843278173',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1239.1759.115060983843511037348481244160',
    wadoRsRoot: LOCAL_ROOT,
  },
];

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

/** Mammography view codes seen in the sample data, by SNOMED code value. */
const MAMMO_VIEW_BY_CODE: Record<string, string> = {
  '399162004': 'CC',
  '399368009': 'MLO',
};

/** First item of a DICOM sequence, whether naturalized as an array or an item. */
function firstItem(sequence: unknown): Record<string, unknown> | undefined {
  const item = Array.isArray(sequence) ? sequence[0] : sequence;
  return item && typeof item === 'object'
    ? (item as Record<string, unknown>)
    : undefined;
}

const DEMO_CUSTOM_ATTRIBUTE_PRESETS = {
  /**
   * Mammography view identity — `RCC` / `RMLO` / `LCC` / `LMLO`, plus the parts
   * it is built from, so a hanging protocol can match on either.
   *
   * A preset rather than data because the view lives in `ViewCodeSequence`: raw
   * selector attributes are a flat lookup on the instance, so no `{ attribute }`
   * reaches inside a sequence. `ViewPosition` would be readable as data, but the
   * sample study (like plenty of real MG) does not send it.
   */
  mammoView: (instances: NaturalizedInstance[]) => {
    const instance = instances[0];
    const viewCode = firstItem(instance?.ViewCodeSequence);
    const codeValue = viewCode?.CodeValue;
    const view =
      MAMMO_VIEW_BY_CODE[String(codeValue)] ??
      (viewCode?.CodeMeaning as string) ??
      String(instance?.ViewPosition ?? 'unknown');
    const laterality = String(instance?.ImageLaterality ?? '');

    return {
      imageLaterality: laterality,
      mammoView: view,
      viewCode: codeValue
        ? `${String(viewCode.CodingSchemeDesignator)}:${String(codeValue)}`
        : undefined,
      descriptionName: `${laterality}${view}`,
    };
  },

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
  'Mammo: one series into RCC / RMLO / LCC / LMLO': JSON.stringify(
    {
      id: 'mammoViewSplit',
      description:
        'Mammography: a screening exam that arrives as a single series still ' +
        'holds four distinct views. Split it by laterality and view so each ' +
        'becomes its own display set — the standard singleImageModality rule ' +
        'only splits MG on a coarse image-size bucket, which is identical ' +
        'across the four.',
      viewportTypes: ['stack'],
      matches: {
        all: [
          { attribute: 'Modality', equals: 'MG' },
          { attribute: 'Rows', exists: true },
        ],
      },
      // ViewPosition first for the vendors that send it; PatientOrientation is
      // the fallback that distinguishes CC from MLO when they do not
      // (RCC P\L, RMLO P\FL, LCC A\R, LMLO A\FR). Both are flat attributes, so
      // this rule needs nothing registered to run.
      groupBy: [
        'SeriesInstanceUID',
        'ImageLaterality',
        'ViewPosition',
        'PatientOrientation',
      ],
      customAttributes: {
        fromFirstInstance: {
          imageLaterality: 'ImageLaterality',
          patientOrientation: 'PatientOrientation',
        },
      },
    },
    null,
    2
  ),
  'Mammo: the same split, views named (preset)': JSON.stringify(
    {
      id: 'mammoViewSplit',
      description:
        'As above, but each display set is also labelled with its view — ' +
        'mammoView "CC"/"MLO", descriptionName "RCC"/"RMLO"/"LCC"/"LMLO" — ' +
        'read out of ViewCodeSequence by the named preset. A hanging protocol ' +
        'can then select a viewport by view rather than by position.',
      viewportTypes: ['stack'],
      matches: {
        all: [
          { attribute: 'Modality', equals: 'MG' },
          { attribute: 'Rows', exists: true },
        ],
      },
      groupBy: [
        'SeriesInstanceUID',
        'ImageLaterality',
        'ViewPosition',
        'PatientOrientation',
      ],
      customAttributes: { preset: 'mammoView' },
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

/**
 * Where a server-hosted selector is fetched from. Free text rather than a list
 * of known files: which rule sets a deployment serves is a property of that
 * deployment, not of this example, and a hard-coded list only ever describes
 * one site's data.
 *
 * A bare path resolves against the current series' DICOMweb root; an absolute
 * URL or a rooted path is used as given.
 */
const serverPathInput = document.createElement('input');
serverPathInput.type = 'text';
serverPathInput.size = 32;
serverPathInput.placeholder = 'path/to/displaySets.json';
// Prefilled, not auto-loaded: these are MG rules, and the example opens on a CT
// series. Pick the MG study, then press Load.
serverPathInput.value = 'mg/displaySets.json';
serverPathInput.onkeydown = (event) => {
  if (event.key === 'Enter') {
    void loadServerSelector(serverPathInput.value.trim());
  }
};

const serverLoadButton = document.createElement('button');
serverLoadButton.textContent = 'Load';
serverLoadButton.onclick = () =>
  void loadServerSelector(serverPathInput.value.trim());

const serverGroup = document.createElement('span');
serverGroup.style.display = 'flex';
serverGroup.style.gap = '4px';
serverGroup.append(serverPathInput, serverLoadButton);
sourceRow.appendChild(labelled('Server-side rule set', serverGroup));

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

const sourcePickerRow = document.createElement('div');
sourcePickerRow.style.display = 'flex';
sourcePickerRow.style.gap = '8px';
sourcePickerRow.style.alignItems = 'center';
sourcePickerRow.style.flexWrap = 'wrap';
sourcePickerRow.style.margin = '6px 0';
rulesPanel.appendChild(sourcePickerRow);

const sampleSelect = document.createElement('select');
for (const label of Object.keys(SAMPLE_SNIPPETS)) {
  const option = document.createElement('option');
  option.value = label;
  option.textContent = label;
  sampleSelect.appendChild(option);
}
sampleSelect.onchange = () => {
  editor.value = SAMPLE_SNIPPETS[sampleSelect.value];
};
sourcePickerRow.appendChild(sampleSelect);

/**
 * Opens a selector JSON file from disk into the editor.
 *
 * Loaded into the editor rather than applied straight away: a rule set being
 * developed locally is the one most likely to need a look — and an edit —
 * before it is compiled, and the editor is already where the errors are
 * reported.
 */
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'application/json,.json';
fileInput.style.fontSize = '0.85em';
fileInput.onchange = async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }
  try {
    editor.value = await file.text();
    setStatus(`Loaded ${file.name} into the editor — review, then "Add rule".`);
  } catch (error) {
    setStatus(
      `Could not read ${file.name}: ${
        error instanceof Error ? error.message : error
      }`,
      true
    );
  }
  // Cleared so re-picking the same file after editing it on disk still fires.
  fileInput.value = '';
};
sourcePickerRow.appendChild(labelled('Open a local rule file', fileInput));

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
 * with a `rules` array plus metadata (`name`, `notes`, `requires`).
 *
 * A bare path is resolved against the DICOMweb root the current series reads
 * from, which is the point of the raw form: the back end that indexed the study
 * can serve the very rules it indexed it with.
 */
async function loadServerSelector(path: string) {
  if (!path) {
    setStatus('Enter a path or URL to a selector JSON file first.', true);
    return;
  }

  const root = currentSeries.wadoRsRoot ?? wadoRsRoot;
  const url = /^(https?:)?\/\//.test(path)
    ? path
    : `${root}/${path.replace(/^\/+/, '')}`;
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

/**
 * Where a planar stack opens. Mid-stack for a reconstructed series, but the
 * first image whenever the stack is short enough to be a set of distinct views
 * (a four-view mammogram, a handful of ultrasound stills) rather than slices
 * through one thing — opening those in the middle looks like the split dropped
 * the earlier images.
 */
function initialImageIndex(count: number): number {
  return count > 8 ? Math.floor(count / 2) : 0;
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
        initialImageIdIndex: initialImageIndex(imageIds.length),
      });
  }
}

/**
 * Frame navigation for one cell: previous / next buttons and a readout.
 *
 * The buttons exist alongside the wheel binding rather than instead of it. The
 * wheel only scrolls the viewport the pointer is over, and this example stacks
 * cells down a scrolling page, so a wheel turn is as likely to move the page as
 * the images — leaving "did the split give me one image or four?" genuinely
 * ambiguous. The readout answers it outright.
 */
function addFrameControls(
  parent: HTMLElement,
  element: HTMLDivElement,
  viewportId: string
) {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '6px';
  row.style.alignItems = 'center';
  row.style.marginTop = '4px';
  row.style.fontSize = '0.85em';
  parent.appendChild(row);

  const readout = document.createElement('span');
  readout.style.color = '#7f8c8d';

  const buttons = (['◀', '▶'] as const).map((label, position) => {
    const delta = position === 0 ? -1 : 1;
    const button = document.createElement('button');
    button.textContent = label;
    button.onclick = () => {
      const viewport = renderingEngine.getViewport(viewportId);
      if (!viewport) {
        return;
      }
      try {
        utilities.scroll(viewport, { delta });
      } catch (error) {
        // scroll() throws on a disabled or empty viewport; say so rather than
        // leaving a button that looks broken.
        setStatus(
          `Could not scroll ${viewportId}: ${
            error instanceof Error ? error.message : error
          }`,
          true
        );
      }
    };
    row.appendChild(button);
    return button;
  });

  row.appendChild(readout);

  /**
   * Reads the frame state back off the viewport rather than off the display
   * set, so the readout reports what is actually mounted — if a rule produced
   * four imageIds and only one reached the viewport, this is where that shows.
   *
   * Driven by IMAGE_RENDERED rather than STACK_NEW_IMAGE because it should
   * track what the viewport is *showing*. A stack whose index advances but
   * whose image never renders is exactly the case worth seeing as a stuck
   * readout, and a readout fed by the index would hide it.
   */
  const refresh = () => {
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as Types.IStackViewport;
    const count = viewport?.getImageIds?.().length ?? 0;
    const index = viewport?.getCurrentImageIdIndex?.() ?? 0;

    for (const button of buttons) {
      button.disabled = count < 2;
    }

    if (count === 0) {
      readout.textContent = 'no images mounted';
      return;
    }
    readout.textContent =
      count === 1
        ? 'single image — nothing to scroll'
        : `image ${index + 1} / ${count}`;
  };

  element.addEventListener(Enums.Events.IMAGE_RENDERED, refresh);
  refresh();
}

/**
 * The tool group a viewport type belongs to, or undefined when it has none.
 *
 * ECG is deliberately absent: waveform viewports are driven by their own tools
 * (see the `ecg` example), not by the manipulation bindings, so adding one here
 * would attach bindings that cannot act on it.
 */
function toolGroupIdFor(viewportType: Enums.ViewportType): string | undefined {
  if (viewportType === ViewportType.VOLUME_3D) {
    return toolGroupId3d;
  }
  if (viewportType === ViewportType.ECG) {
    return undefined;
  }
  return toolGroupId2d;
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
    disableViewport(viewportId);
  }

  renderingEngine.enableElement({
    viewportId,
    type: viewportType,
    element,
    defaultOptions: orientation ? { orientation } : undefined,
  });
  activeViewportIds.push(viewportId);

  // Added before the data is set so the annotation layer exists for the first
  // render rather than only after the next one.
  const toolGroupId = toolGroupIdFor(viewportType);
  if (toolGroupId) {
    ToolGroupManager.getToolGroup(toolGroupId)?.addViewport(
      viewportId,
      renderingEngineId
    );
  }

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
  // A rule may name what it produced (the mammo rules label their display sets
  // RCC / LCC / RMLO / LMLO). Lead with that when present: which view a cell is
  // showing is the thing being checked, and a display set id does not say.
  const descriptionName = (displaySet as { descriptionName?: string })
    .descriptionName;
  title.textContent = descriptionName || displaySet.displaySetId;
  header.appendChild(title);

  if (descriptionName) {
    const id = document.createElement('span');
    id.style.color = '#7f8c8d';
    id.style.fontSize = '0.8em';
    id.textContent = displaySet.displaySetId;
    header.appendChild(id);
  }

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
      const viewportId = `dsr-${index}-0`;
      const viewportType = HINT_TO_VIEWPORT_TYPE[layout] ?? ViewportType.STACK;
      await mountViewport(
        displaySet,
        element,
        viewportId,
        viewportType,
        layout === 'volume' ? OrientationAxis.AXIAL : undefined
      );

      if (viewportType === ViewportType.STACK) {
        addFrameControls(body, element, viewportId);
      }
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

/**
 * Disables a viewport and takes it out of its tool group.
 *
 * The tool group must be told as well: this example tears down and rebuilds
 * every viewport on each re-split, and a tool group that keeps a disabled
 * viewport goes on addressing an element that is no longer rendering.
 */
function disableViewport(viewportId: string) {
  for (const toolGroupId of [toolGroupId2d, toolGroupId3d]) {
    ToolGroupManager.getToolGroup(toolGroupId)?.removeViewports(
      renderingEngineId,
      viewportId
    );
  }
  renderingEngine.disableElement(viewportId);
}

/** Tears down every viewport and rebuilds one cell per display set. */
async function renderGrid() {
  for (const viewportId of activeViewportIds) {
    if (renderingEngine.getViewport(viewportId)) {
      disableViewport(viewportId);
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

  const root = currentSeries.wadoRsRoot ?? wadoRsRoot;

  try {
    seriesImageIds = await createImageIdsAndCacheMetaData({
      StudyInstanceUID: currentSeries.StudyInstanceUID,
      SeriesInstanceUID: currentSeries.SeriesInstanceUID,
      wadoRsRoot: root,
    });
  } catch (error) {
    // A series may be hosted somewhere this browser cannot reach — the local
    // back end most obviously. Say which root failed rather than leaving the
    // example on the previous series' display sets with no explanation.
    seriesImageIds = [];
    displaySets = [];
    await renderGrid();
    setStatus(
      `Could not load ${currentSeries.label} from ${root}: ${
        error instanceof Error ? error.message : error
      }`,
      true
    );
    return;
  }

  await resplit();
  setStatus(
    `${currentSeries.label}: ${displaySets.length} display set(s) from ${seriesImageIds.length} imageId(s).`
  );
}

// ======== Run ======== //

/**
 * The example's controls, all of them registered by `addManipulationBindings`:
 * pan, zoom, frame navigation, and the length tool.
 *
 * The helper binds Length behind Shift+Ctrl by default — deliberately obscure,
 * so an example whose subject is something else keeps its primary button. Here
 * the display sets are the subject and measuring across them is the point, so
 * its `toolMap` promotes Length to the selected primary-button tool.
 */
function createToolGroups() {
  addManipulationBindings(ToolGroupManager.createToolGroup(toolGroupId2d), {
    toolMap: new Map([[LengthTool.toolName, { selected: true }]]),
  });

  addManipulationBindings(ToolGroupManager.createToolGroup(toolGroupId3d), {
    is3DViewport: true,
  });
}

async function run() {
  await initDemo();

  renderingEngine = new RenderingEngine(renderingEngineId);
  createToolGroups();

  renderRules();
  await loadSeries();
}

run();
