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
import { NO_VIEWPORT_TYPE } from './types';

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

/**
 * An image instance that actually carries a raster (`Rows` has a value). Every
 * image-oriented rule below requires it, so it is factored out here rather than
 * repeated in each rule.
 */
const RENDERABLE_IMAGE = { isImage: true, Rows: { notNull: true } };

/**
 * The default display-set split rules, as data.
 *
 * The key is the rule id. Rules are evaluated in ascending `priority` and the
 * first match wins per instance, so the priorities are part of the contract.
 *
 * The defaults use the priorities `1..n`, and the catch-all `unsupported` runs
 * last, at `Number.MAX_SAFE_INTEGER`. A rule with a priority below `0` runs
 * before all of them. A rule with a priority above
 * `DEFAULT_SPLIT_RULE_PRIORITY_LIMIT` (10000) runs after every other default
 * rule, and still before `unsupported`, so it sees the instances that no other
 * default claims.
 *
 * @type {DisplaySetRules}
 */
export const displaySetRules = {
  video: {
    priority: 1,
    description:
      'Instances encoded with a video transfer syntax, or a dedicated video SOP ' +
      'class, or a long multi-frame secondary capture. One display set per ' +
      'instance, shown on a video viewport.',
    viewportTypes: ['video'],
    matches: { isVideo: true },
    groupBy: ['SOPInstanceUID'],
  },

  ecg: {
    priority: 2,
    description:
      'ECG / waveform SOP classes. One display set per instance, shown on a ' +
      'waveform viewport rather than an image viewport.',
    viewportTypes: ['ecg'],
    matches: { isEcg: true },
    groupBy: ['SOPInstanceUID'],
  },

  wholeslide: {
    priority: 3,
    description:
      'VL Whole Slide Microscopy (or modality SM). All pyramid levels of the ' +
      'series form a single whole-slide display set.',
    viewportTypes: ['wholeslide'],
    matches: { isWsi: true },
    groupBy: ['SeriesInstanceUID'],
  },

  singleImageModality: {
    priority: 4,
    description:
      'CR / DX / MG, which acquire one image per instance. Split within the ' +
      'series by a coarse image-size bucket so differently sized views (e.g. ' +
      'mammography projections) become separate stacks.',
    viewportTypes: ['stack'],
    // The `/64` rounding is a deliberately fuzzy bucket and can straddle a
    // boundary (480 -> 8, 544 -> 9).
    context: {
      rowsBucket: 'round(Rows / 64)',
      columnsBucket: 'round(Columns / 64)',
      imageSizeBucket: { template: 'rows={rowsBucket}&cols={columnsBucket}' },
    },
    matches: { Modality: SINGLE_IMAGE_MODALITIES, ...RENDERABLE_IMAGE },
    groupBy: ['SeriesInstanceUID', 'imageSizeBucket'],
  },

  multiFrame: {
    priority: 5,
    description:
      'Multi-frame cine clips: a multi-frame instance with a slice location, ' +
      'or a US, XA, RF, ES or XC multi-frame that is not a volume. One display ' +
      'set per InstanceNumber, flagged isClip with its frame count. Other ' +
      'multi-frame instances, such as an enhanced CT, go to the volume rules.',
    viewportTypes: ['stack'],
    context: {
      // US, XA and other cine clips have no SliceLocation.
      isCineClip:
        `SliceLocation != null || (Modality in ${quotedList(CINE_MODALITIES)}` +
        ` && !(SOPClassUID in ${quotedList(VOLUME_MULTIFRAME_SOP_CLASSES)}))`,
    },
    matches: {
      ...RENDERABLE_IMAGE,
      isMultiFrame: true,
      isCineClip: true,
    },
    // DICOM: the instances of one series with the same InstanceNumber are one
    // object, so they are one display set.
    groupBy: ['SeriesInstanceUID', 'InstanceNumber'],
    attributes: {
      isClip: true,
      // NumberOfFrames is frequently naturalized as a string (e.g. '30').
      numImageFrames: { expression: 'Number(NumberOfFrames)' },
    },
  },

  mixedDimensionalityBValue: {
    priority: 6,
    description:
      'Diffusion MR that mixes 4D b-value frames with trailing frames that have ' +
      'none. The undefined-b-value frames are not part of the 4D set, so they ' +
      'split off - otherwise 4D rendering is applied to the 3D portion.',
    // Both subgroups are multi-slice MR; default them to MPR (volume) like any
    // volumetric MR series. This rule matches before `volume3d`, so listing
    // stack first here would regress the defined-b-value subgroup to a stack.
    viewportTypes: ['volume', 'volume3d', 'stack'],
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
    priority: 7,
    description:
      'Multi-slice CT / MR / PT / NM, which reconstruct into a volume. Defaults ' +
      'to MPR, with 3D and stack also allowed.',
    // Default volumetric series to MPR (volume); 3D is an extra allowed type.
    viewportTypes: ['volume', 'volume3d', 'stack'],
    matches: {
      Modality: VOLUME_MODALITIES,
      seriesInstanceCount: { greaterThan: 1 },
      ...RENDERABLE_IMAGE,
    },
    groupBy: ['SeriesInstanceUID'],
  },

  defaultImageRule: {
    priority: 8,
    description:
      'Fallback for any remaining renderable image. Grouped one display set per ' +
      'series.',
    viewportTypes: ['stack', 'volume', 'volume3d'],
    matches: RENDERABLE_IMAGE,
  },

  /**
   * Gives an application a way to list and identify each object that it cannot
   * render. A rule that supports one of these formats takes a lower priority.
   */
  unsupported: {
    priority: Number.MAX_SAFE_INTEGER,
    description:
      'Catch-all for objects nothing can render (SEG, RTSTRUCT, RTDOSE, SR, ' +
      'PDF, presentation states, or an image whose Rows have not loaded). ' +
      'Produces one display set for each series, marked isDisplayable: false, ' +
      'so the objects are surfaced rather than silently dropped. Runs last.',
    viewportTypes: [NO_VIEWPORT_TYPE],
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
