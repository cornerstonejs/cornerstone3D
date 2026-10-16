/**
 * The **raw display set selector**: the default display-set split rules as
 * **pure JSON data** - no functions, no imports of app state.
 *
 * Why the data form matters: the rules that decide how a series becomes display
 * sets are needed on **both** sides of the wire. A server building a study index
 * (static-dicomweb) and a viewer splitting a loaded series (OHIF) must agree, or
 * the display sets the server advertises are not the ones the client builds. With
 * the rules as data plus one compiler, both sides read the same selector and get
 * the same splits - nobody redefines anything.
 *
 * Each name in a rule is a DICOM keyword (`Modality`) or a context name
 * (`isImage`, `seriesInstanceCount`) of the display set context in
 * `displaySetContext.ts`. The values that only code can give - the SOP class
 * heuristics - are code entries of that context, so the rules stay data.
 *
 * {@link createDisplaySetSplitRules} compiles a selector (see
 * `compileSplitRules.ts`). The compiler is *strict*: an unknown key, an unknown
 * name or an unaccepted form is a compile error that names the rule and the
 * path, never a key that is silently ignored.
 *
 * Deliberately no dependency on any application service. Cornerstone knows
 * nothing about OHIF's `customizationService`, and must not: an application that
 * has one resolves its overrides itself and passes the resulting plain data in.
 * See the "Sharing rules between applications" section of
 * `packages/docs/docs/concepts/cornerstone-metadata/display-sets.md`.
 *
 * @module rawDisplaySetSelector
 */

import { compileDisplaySetSplitRules } from './compileSplitRules';
import { NO_VIEWPORT_TYPE } from './types';

/**
 * @typedef {import('./rawDisplaySetSelectorTypes').RawDisplaySetSelector} RawDisplaySetSelector
 * @typedef {import('./rawDisplaySetSelectorTypes').CreateDisplaySetSplitRulesOptions} CreateDisplaySetSplitRulesOptions
 * @typedef {import('./types').SplitRuleSet} SplitRuleSet
 */

/** Modalities whose multi-slice series are reconstructable into a volume. */
const VOLUME_MODALITIES = ['CT', 'MR', 'PT', 'NM'];

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
 * The defaults use the priorities `1..n`. A rule with a priority below `0` runs
 * before all of them. `unsupported` is a catch-all, so a rule that must see
 * the instances no other default claims needs a priority between
 * `defaultImageRule` and `unsupported` (for example `8.5`); a rule above
 * `unsupported` only sees instances when `unsupported` is excluded
 * (`priority: null`).
 *
 * @type {RawDisplaySetSelector}
 */
export const rawDisplaySetSelector = {
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
      'Multi-frame instances that carry a slice location - a cine clip. One ' +
      'display set per instance, flagged isClip with its frame count.',
    viewportTypes: ['stack'],
    // The `SliceLocation` test mirrors OHIF: a multi-frame object without a
    // slice location is not treated as a clip here, and falls through to the
    // volume/stack rules below.
    matches: {
      ...RENDERABLE_IMAGE,
      isMultiFrame: true,
      SliceLocation: { notNull: true },
    },
    groupBy: ['SeriesInstanceUID', 'InstanceNumber'],
    attributes: {
      isClip: true,
      // NumberOfFrames is frequently naturalized as a string (e.g. '30').
      numImageFrames: { expression: 'Number(NumberOfFrames)' },
      splitNumber: 'splitNumber',
      isMultiFrame: 'isMultiFrame',
    },
  },

  /**
   * This rule splits off images containing an undefined bValue from the
   * 4d b-value containing images, since the undefined versions are not
   * part of the 4d data set.  That prevents applying incorrect 4d rendering
   * to the 3d portion.
   */
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
        'count(DiffusionBValue) > 0 && count(DiffusionBValue) < count()',
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
   * Final catch-all. Every rule above requires a renderable image, so without
   * this one a SEG, RTSTRUCT, RTDOSE, SR, presentation state - or an image whose
   * `Rows` has not loaded yet - would match nothing and be **silently dropped**,
   * producing no display set and so no trace that the object exists.
   *
   * Instead it produces a display set marked `isDisplayable: false` (via the
   * `none` viewport type) with empty `imageIds` and its `sopClassUids` recorded,
   * so an application can list the series and say what it is rather than losing
   * it. An application that supports one of these formats adds its own rule
   * *before* this one, with real viewport types.
   *
   * Grouped per instance, not per series: each of these objects is a document in
   * its own right (one SEG, one SR), so merging a series' worth of them into a
   * single display set would conflate unrelated content.
   */
  unsupported: {
    priority: 9,
    description:
      'Catch-all for objects nothing can render (SEG, RTSTRUCT, RTDOSE, SR, ' +
      'PDF, presentation states, or an image whose Rows have not loaded). ' +
      'Produces a display set marked isDisplayable: false so the object is ' +
      'surfaced rather than silently dropped. Must keep the highest priority.',
    viewportTypes: [NO_VIEWPORT_TYPE],
    // No `matches`: claims whatever is left.
    groupBy: ['SeriesInstanceUID', 'SOPInstanceUID'],
    attributes: { sopClassUids: 'sopClassUids' },
  },
};

/**
 * Compiles a raw display set selector into executable split rules.
 *
 * The result is a `SplitRuleSet` with the same keys and priorities, ready to
 * hand to `splitImageIdsBySplitRules` / `groupInstancesBySplitRules`, or to
 * merge with another rule set by key. Compilation is eager: a malformed
 * selector throws here, at setup, rather than midway through splitting a study.
 *
 * ```js
 * import {
 *   createDisplaySetSplitRules,
 *   rawDisplaySetSelector,
 * } from '@cornerstonejs/metadata';
 *
 * // The defaults, compiled (this is exactly `defaultDisplaySetSplitRules`):
 * const rules = createDisplaySetSplitRules(rawDisplaySetSelector);
 *
 * // A deployment's own selector and context, e.g. read from JSON on a server
 * // or supplied by an application's customization layer on a client:
 * const custom = createDisplaySetSplitRules(
 *   {
 *     ...rawDisplaySetSelector,
 *     dxCrSingleImages: {
 *       priority: -1,
 *       viewportTypes: ['stack'],
 *       matches: { Modality: ['DX', 'CR'], isStackImage: true, isSmallSeries: true },
 *       groupBy: ['SeriesInstanceUID', 'SOPInstanceUID'],
 *     },
 *   },
 *   {
 *     displaySetContext: {
 *       dxCrMaxImages: 9,
 *       isSmallSeries: 'seriesInstanceCount <= dxCrMaxImages',
 *     },
 *   }
 * );
 * ```
 *
 * @param {RawDisplaySetSelector} [selector=rawDisplaySetSelector] - the rules as data, keyed by rule id.
 * @param {CreateDisplaySetSplitRulesOptions} [options] - the global context, and named extension points.
 * @returns {SplitRuleSet} compiled rules, keyed by rule id.
 */
export function createDisplaySetSplitRules(
  selector = rawDisplaySetSelector,
  options = {}
) {
  return compileDisplaySetSplitRules(selector, options);
}
