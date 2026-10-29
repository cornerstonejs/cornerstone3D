/**
 * The default display-set split rules as pure JSON data: no functions, and no
 * imports of application state. A server that indexes a study and a viewer
 * that splits a series compile the same data, so both get the same splits.
 *
 * Each name in a rule is a DICOM keyword or a context name of
 * `displaySetContext.ts`. {@link createDisplaySetSplitRules} compiles the data
 * strictly. See "Sharing rules between applications" in
 * `packages/docs/docs/concepts/cornerstone-metadata/display-sets.md`.
 *
 * @module displaySetRules
 */

import { compileDisplaySetSplitRules } from './compileSplitRules';

/**
 * @typedef {import('./displaySetRulesTypes').DisplaySetRules} DisplaySetRules
 * @typedef {import('./displaySetRulesTypes').CreateDisplaySetSplitRulesOptions} CreateDisplaySetSplitRulesOptions
 * @typedef {import('./types').SplitRuleSet} SplitRuleSet
 */

/** Modalities whose multi-slice series are reconstructable into a volume. */
const VOLUME_MODALITIES = ['CT', 'MR', 'PT', 'NM'];

/** Modalities whose multi-frame instances are cine clips. */
const CINE_MODALITIES = ['US', 'XA', 'RF', 'ES', 'XC'];

/** Multi-frame SOP classes of cine modalities that hold a volume, not a clip. */
const VOLUME_MULTIFRAME_SOP_CLASSES = [
  '1.2.840.10008.5.1.4.1.1.6.2', // Enhanced US Volume
  '1.2.840.10008.5.1.4.1.1.13.1.1', // X-Ray 3D Angiographic
  '1.2.840.10008.5.1.4.1.1.13.1.2', // X-Ray 3D Craniofacial
];

/** A list as the source text of an expression array literal. */
const quotedList = (values) => `[${values.map((v) => `'${v}'`).join(', ')}]`;

/** Modalities that acquire one image per instance rather than a stack. */
const SINGLE_IMAGE_MODALITIES = ['CR', 'DX', 'MG'];

/** Modalities whose series can mix localizer images with a volume. */
const LOCALIZER_MODALITIES = ['CT', 'MR', 'PT'];

/**
 * The `groupBy` of a rule that makes one display set for each instance. The
 * groups are the groups of `SOPInstanceUID` alone, but the split key holds
 * `InstanceNumber`, and runs of digits in a split key compare by value, so
 * the display sets come out in `InstanceNumber` order.
 */
const INSTANCE_NUMBER_ORDER = [
  'SeriesInstanceUID',
  'InstanceNumber',
  'SOPInstanceUID',
];

/**
 * An image instance that actually carries a raster (`Rows` has a value). The
 * volume rules require it.
 */
const RENDERABLE_IMAGE = { isImage: true, Rows: { notNull: true } };

/**
 * One display set for each revision chain of a series (each document, when it
 * has no predecessor). The active instance sorts last, and every instance of
 * the chain stays in the display set.
 */
const REVISION_CHAIN = {
  groupBy: ['SeriesInstanceUID', 'revisionChainUid'],
  sortBy: ['isActiveRevision', 'InstanceNumber'],
  attributes: { activeSopInstanceUid: 'revisionChainUid' },
};

/**
 * A rule for one kind of non-image object: the instances of its SOP class
 * list, one display set for each series, built by the handler of the host.
 */
const objectRule = (priority, kind, handler, description) => ({
  priority,
  description,
  handler,
  matches: { [kind]: true },
  groupBy: ['SeriesInstanceUID'],
});

/**
 * The default display-set split rules, as data.
 *
 * The key is the rule id. Rules are evaluated in ascending `priority` and the
 * first match wins per instance, so the priorities are part of the contract.
 *
 * The defaults use the priorities `10, 20, 30, ...` (steps of 10), and the
 * catch-all `unsupported` runs last, at `Number.MAX_SAFE_INTEGER`. The steps
 * leave room for a new default rule with an integer priority. A rule with a
 * priority below `0` runs before all of them. A rule with a priority between
 * two defaults that is not a multiple of 10 (for example `85`) runs between
 * them, and no later default takes that number. A rule with a priority above
 * `DEFAULT_SPLIT_RULE_PRIORITY_LIMIT` (10000) runs after every other default
 * rule, and still before `unsupported`, so it sees the instances that no other
 * default claims.
 *
 * A rule with `handler` makes display sets that the host builds with its own
 * code for that kind of object. The image rules name no handler.
 *
 * @type {DisplaySetRules}
 */
export const displaySetRules = {
  video: {
    priority: 10,
    description:
      'A video-only SOP class, or a video transfer syntax, or (with no known ' +
      'transfer syntax) a long multi-frame secondary capture. One display set ' +
      'per instance, shown on a video viewport.',
    handler: 'video',
    matches: { isVideo: true },
    groupBy: ['SOPInstanceUID'],
  },

  ecg: {
    priority: 20,
    description:
      'ECG / waveform SOP classes. One display set per instance, shown on a ' +
      'waveform viewport rather than an image viewport.',
    handler: 'ecg',
    matches: { isEcg: true },
    groupBy: ['SOPInstanceUID'],
  },

  wholeslide: {
    priority: 30,
    description:
      'VL Whole Slide Microscopy (or modality SM). All pyramid levels of the ' +
      'series form a single whole-slide display set.',
    handler: 'wholeSlide',
    matches: { isWsi: true },
    groupBy: ['SeriesInstanceUID'],
  },

  singleImageModality: {
    priority: 40,
    description:
      'CR / DX / MG, which acquire one image per instance. One display set ' +
      'per instance, so each view of a mammography series is its own display ' +
      'set.',
    matches: { Modality: SINGLE_IMAGE_MODALITIES, isImage: true },
    groupBy: INSTANCE_NUMBER_ORDER,
  },

  multiFrame: {
    priority: 50,
    description:
      'Multi-frame image instances, one display set per instance. A cine clip ' +
      '(a slice location, or a US, XA, RF, ES or XC multi-frame that is not a ' +
      'volume) is flagged isClip. Another multi-frame instance, such as an ' +
      'enhanced CT, is not a clip.',
    context: {
      // US, XA and other cine clips have no SliceLocation.
      isCineClip:
        `SliceLocation != null || (Modality in ${quotedList(CINE_MODALITIES)}` +
        ` && !(SOPClassUID in ${quotedList(VOLUME_MULTIFRAME_SOP_CLASSES)}))`,
    },
    matches: { isImage: true, isMultiFrame: true },
    // One display set for each instance: much code expects one instance in a
    // multi-frame display set.
    groupBy: INSTANCE_NUMBER_ORDER,
    attributes: {
      isClip: 'isCineClip',
      // NumberOfFrames is frequently naturalized as a string (e.g. '30').
      numImageFrames: { expression: 'Number(NumberOfFrames)' },
    },
  },

  localizer: {
    priority: 60,
    description:
      'CT / MR / PT series that mix localizer (scout) images with other ' +
      'images. The localizer images become one display set, marked ' +
      'isLocalizer, so the other images can form a volume. A series of ' +
      'localizers only, or with no localizer, is not changed.',
    context: {
      isLocalizer: "includes(ImageType, 'LOCALIZER')",
      // A series value: the series has localizer images and other images.
      mixesLocalizer:
        'series.instances.count(isLocalizer) > 0 && ' +
        'series.instances.count(isLocalizer) < series.instances.count()',
    },
    matches: {
      Modality: LOCALIZER_MODALITIES,
      isLocalizer: true,
      mixesLocalizer: true,
      ...RENDERABLE_IMAGE,
    },
    groupBy: ['SeriesInstanceUID'],
    attributes: { isLocalizer: true },
  },

  mixedDimensionalityBValue: {
    priority: 70,
    description:
      'Diffusion MR that mixes 4D b-value frames with trailing frames that have ' +
      'none. The undefined-b-value frames are not part of the 4D set, so they ' +
      'split off - otherwise 4D rendering is applied to the 3D portion.',
    context: {
      // A series value: some instances of the series have a b-value, and
      // some have none.
      isMixedBValue:
        'series.instances.count(DiffusionBValue) > 0 && ' +
        'series.instances.count(DiffusionBValue) < series.instances.count()',
      hasNoBValue: 'DiffusionBValue == null',
    },
    matches: { Modality: 'MR', isMixedBValue: true, ...RENDERABLE_IMAGE },
    groupBy: ['SeriesInstanceUID', 'hasNoBValue'],
  },

  volume3d: {
    priority: 80,
    description:
      'Multi-slice CT / MR / PT / NM, which reconstruct into a volume.',
    matches: {
      Modality: VOLUME_MODALITIES,
      seriesInstanceCount: { greaterThan: 1 },
      ...RENDERABLE_IMAGE,
    },
    groupBy: ['SeriesInstanceUID'],
  },

  defaultImageRule: {
    priority: 90,
    description:
      'Fallback for any remaining image SOP class, also with no Rows in the ' +
      'metadata. Grouped one display set per series.',
    matches: { isImage: true },
  },

  segmentation: objectRule(
    100,
    'isSegmentation',
    'segmentation',
    'Segmentations (segmentationSopClassUids). One display set per series.'
  ),

  rtStructureSet: objectRule(
    110,
    'isRtStructureSet',
    'rtStructureSet',
    'RT structure sets (rtStructureSetSopClassUids). One display set per series.'
  ),

  parametricMap: objectRule(
    120,
    'isParametricMap',
    'parametricMap',
    'Parametric maps (parametricMapSopClassUids). One display set per series.'
  ),

  structuredReport: {
    ...objectRule(
      130,
      'isStructuredReport',
      'structuredReport',
      'Structured reports (structuredReportSopClassUids), also Comprehensive ' +
        '3D SR. One display set per series. Manufacturer and ' +
        'ManufacturerModelName name the writer of the SR.'
    ),
    attributes: {
      Manufacturer: 'Manufacturer',
      ManufacturerModelName: 'ManufacturerModelName',
    },
  },

  encapsulatedDocument: {
    ...objectRule(
      140,
      'isEncapsulatedDocument',
      'encapsulatedDocument',
      'Encapsulated documents (encapsulatedDocumentSopClassUids). One ' +
        'display set per revision chain (PredecessorDocumentsSequence) of ' +
        'the series; activeSopInstanceUid names the current revision.'
    ),
    ...REVISION_CHAIN,
  },

  bulkAnnotation: objectRule(
    150,
    'isBulkAnnotation',
    'bulkAnnotation',
    'Microscopy bulk annotations (bulkAnnotationSopClassUids). One display ' +
      'set per series.'
  ),

  chart: {
    ...objectRule(
      160,
      'isChart',
      'chart',
      'Charts (chartSopClassUids, empty by default: a host adds its chart ' +
        'SOP class). One display set per revision chain of the series; ' +
        'activeSopInstanceUid names the current revision.'
    ),
    ...REVISION_CHAIN,
  },

  /**
   * Gives an application a way to list and identify each object that it cannot
   * render. A rule that supports one of these formats takes a lower priority.
   */
  unsupported: {
    priority: Number.MAX_SAFE_INTEGER,
    description:
      'Catch-all for objects that no other rule claims (presentation states, ' +
      'other non-image objects). Produces one display set for each series, ' +
      'marked isDisplayable: false, so the objects are surfaced rather than ' +
      'silently dropped. Runs last.',
    handler: 'unsupported',
    // No `matches`: claims whatever is left.
    groupBy: ['SeriesInstanceUID'],
  },
};

/**
 * Compiles the display set rules into a `SplitRuleSet` with the same keys and
 * priorities, for `splitImageIdsBySplitRules` / `groupInstancesBySplitRules`.
 * A malformed rule set throws here, at setup, and not during a split.
 *
 * ```js
 * const rules = createDisplaySetSplitRules(displaySetRules); // = compiledDisplaySetRules
 * ```
 *
 * See "Extending the display set rules" in
 * `packages/docs/docs/concepts/cornerstone-metadata/display-sets.md`.
 *
 * @param {DisplaySetRules} [rules=displaySetRules] - the rules as data, keyed by rule id.
 * @param {CreateDisplaySetSplitRulesOptions} [options] - the global context, and named extension points.
 * @returns {SplitRuleSet} compiled rules, keyed by rule id.
 */
export function createDisplaySetSplitRules(
  rules = displaySetRules,
  options = {}
) {
  return compileDisplaySetSplitRules(rules, options);
}
