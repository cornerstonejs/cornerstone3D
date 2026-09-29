/**
 * The **raw display set selector** and the compiler that turns it into
 * executable split rules.
 *
 * This file is deliberately plain JavaScript and deliberately free of any
 * application framework. It holds two things:
 *
 * 1. {@link rawDisplaySetSelector} - the default display-set split rules as
 *    **pure JSON data**: no functions, no imports of app state.
 * 2. {@link createDisplaySetSplitRules} - the compiler that turns that data into
 *    the *safe functions* (`matches`, `groupBy`, `series`, ...) the split engine
 *    in `groupInstancesBySplitRules` executes.
 *
 * Why the split matters: the rules that decide how a series becomes display sets
 * are needed on **both** sides of the wire. A server building a study index
 * (static-dicomweb) and a viewer splitting a loaded series (OHIF) must agree, or
 * the display sets the server advertises are not the ones the client builds. With
 * the rules as data plus one compiler, both sides read the same selector and get
 * the same splits - nobody redefines anything.
 *
 * The conditions and values a rule is built from are **not** defined here. They
 * are the general safe-function vocabulary in `../safeFunctions`, which knows
 * nothing about display sets and is meant to be shared with anything else that
 * would otherwise hand-write matching code (hanging protocols, for one). This
 * module is that vocabulary's first consumer: it contributes the rule shape
 * (`matches`, `groupBy`, `runBy`, `series` facts, `customAttributes`), the
 * built-in instance classifiers, and the default rules.
 *
 * The compiled predicates are *safe* because that vocabulary is closed: there is
 * no `eval`, no `new Function`, and no other code path from selector data to
 * executed code. A selector can therefore be loaded from a config file, an HTTP
 * response, or an application's customization layer.
 *
 * The compiler is *strict*. Every place in a rule, the forms it accepts and the
 * keys of each form are one table, `splitRuleSchema` (`./splitRuleSchema.ts`),
 * which the compiler reads. An unknown key or an unaccepted form is a compile
 * error that names the rule and the path, never a key that is silently ignored.
 *
 * Deliberately no dependency on any application service. Cornerstone knows
 * nothing about OHIF's `customizationService`, and must not: an application that
 * has one resolves its overrides itself and passes the resulting plain data in.
 * See the "Sharing rules between applications" section of
 * `packages/docs/docs/concepts/cornerstone-metadata/display-sets.md`.
 *
 * @module rawDisplaySetSelector
 */

import { isEcgInstance } from './isEcgInstance';
import { isImageInstance } from './isImageInstance';
import { isVideoInstance } from './isVideoInstance';
import { isWsiInstance } from './isWsiInstance';
import { NO_VIEWPORT_TYPE } from './types';
import { validateSplitRuleSetEntry } from './splitRuleSet';
import { splitRuleSchema } from './splitRuleSchema';
import {
  at,
  compileExpressionAt,
  compileKey,
  createSite,
  invalidAt,
  matchForm,
  readOwn,
  safeFunctionCompilers,
  toFinite,
} from '../safeFunctions';

/**
 * @typedef {import('./rawDisplaySetSelectorTypes').RawCondition} RawCondition
 * @typedef {import('./rawDisplaySetSelectorTypes').RawValue} RawValue
 * @typedef {import('./rawDisplaySetSelectorTypes').RawSeriesFact} RawSeriesFact
 * @typedef {import('./rawDisplaySetSelectorTypes').RawSplitRule} RawSplitRule
 * @typedef {import('./rawDisplaySetSelectorTypes').RawCustomAttributes} RawCustomAttributes
 * @typedef {import('./rawDisplaySetSelectorTypes').RawDisplaySetSelector} RawDisplaySetSelector
 * @typedef {import('./rawDisplaySetSelectorTypes').CreateDisplaySetSplitRulesOptions} CreateDisplaySetSplitRulesOptions
 * @typedef {import('./types').NaturalizedInstance} NaturalizedInstance
 * @typedef {import('./types').RuleContext} RuleContext
 * @typedef {import('./types').SeriesFacts} SeriesFacts
 * @typedef {import('./types').SplitRule} SplitRule
 * @typedef {import('./types').SplitRuleSet} SplitRuleSet
 */

/** Modalities whose multi-slice series are reconstructable into a volume. */
const VOLUME_MODALITIES = ['CT', 'MR', 'PT', 'NM'];

/** Modalities that acquire one image per instance rather than a stack. */
const SINGLE_IMAGE_MODALITIES = ['CR', 'DX', 'MG'];

/**
 * Built-in instance classifiers, referenced from selector data by name
 * (`{ classifier: 'video' }`). These are the small SOP-class/modality
 * heuristics that JSON cannot express; everything else in a rule is data.
 *
 * @type {Record<string, (instance: NaturalizedInstance) => boolean>}
 */
const BUILT_IN_CLASSIFIERS = {
  image: isImageInstance,
  video: isVideoInstance,
  ecg: isEcgInstance,
  wsi: isWsiInstance,
};

/**
 * An image instance that actually carries a raster (`Rows` present). Every
 * image-oriented rule below requires it, so it is factored out here rather than
 * repeated in each rule.
 *
 * @type {RawCondition}
 */
const IS_RENDERABLE_IMAGE = {
  all: [{ classifier: 'image' }, { attribute: 'Rows', exists: true }],
};

/**
 * The default display-set split rules, as data.
 *
 * Semantically identical to the previously hand-written
 * `defaultDisplaySetSplitRules`: same ids, same order, same viewport types, same
 * grouping. The key is the rule id. Rules are evaluated in ascending `priority`
 * and the first match wins per instance, so the priorities are part of the
 * contract.
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
    matches: { classifier: 'video' },
    groupBy: ['SOPInstanceUID'],
  },

  ecg: {
    priority: 2,
    description:
      'ECG / waveform SOP classes. One display set per instance, shown on a ' +
      'waveform viewport rather than an image viewport.',
    viewportTypes: ['ecg'],
    matches: { classifier: 'ecg' },
    groupBy: ['SOPInstanceUID'],
  },

  wholeslide: {
    priority: 3,
    description:
      'VL Whole Slide Microscopy (or modality SM). All pyramid levels of the ' +
      'series form a single whole-slide display set.',
    viewportTypes: ['wholeslide'],
    // All microscopy levels of a series form a single whole-slide display set.
    matches: { classifier: 'wsi' },
    groupBy: ['SeriesInstanceUID'],
  },

  singleImageModality: {
    priority: 4,
    description:
      'CR / DX / MG, which acquire one image per instance. Split within the ' +
      'series by a coarse image-size bucket so differently sized views (e.g. ' +
      'mammography projections) become separate stacks.',
    viewportTypes: ['stack'],
    matches: {
      all: [
        { attribute: 'Modality', in: SINGLE_IMAGE_MODALITIES },
        IS_RENDERABLE_IMAGE,
      ],
    },
    // Split within the series by a coarse size bucket so differently-sized
    // images (e.g. MG views) become separate stacks. `SeriesInstanceUID` keeps
    // the bucket series-scoped (the entry point is per-series, but this stays
    // correct if ever fed multiple series). The `/64` rounding is a deliberately
    // fuzzy bucket and can straddle a boundary (480 -> 8, 544 -> 9).
    groupBy: [
      'SeriesInstanceUID',
      {
        join: '&',
        parts: [
          { label: 'rows', attribute: 'Rows', bucket: 64 },
          { label: 'cols', attribute: 'Columns', bucket: 64 },
        ],
      },
    ],
  },

  multiFrame: {
    priority: 5,
    description:
      'Multi-frame instances that carry a slice location - a cine clip. One ' +
      'display set per instance, flagged isClip with its frame count.',
    viewportTypes: ['stack'],
    // Assumes a homogeneous series: samples instances[0] for NumberOfFrames /
    // SliceLocation. The `SliceLocation` presence guard mirrors OHIF - a
    // multi-frame object without a slice location is not treated as a clip here
    // and falls through to the volume/stack rules below.
    series: [
      {
        name: 'isMultiFrame',
        scope: 'first',
        when: {
          all: [
            { attribute: 'NumberOfFrames', greaterThan: 1 },
            { attribute: 'SliceLocation', exists: true },
          ],
        },
      },
    ],
    matches: {
      all: [{ seriesFact: 'isMultiFrame' }, IS_RENDERABLE_IMAGE],
    },
    groupBy: ['SeriesInstanceUID', 'InstanceNumber'],
    customAttributes: {
      set: { isClip: true },
      // NumberOfFrames is frequently naturalized as a string (e.g. '30'); coerce
      // it so numImageFrames matches its declared `number` type.
      fromFirstInstance: {
        numImageFrames: { attribute: 'NumberOfFrames', number: true },
      },
      fromOptions: ['splitNumber'],
      fromContext: ['isMultiFrame'],
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
    // Gates on instances[0].Modality (assumes a homogeneous-modality series),
    // then scans all instances for the mix of defined/undefined b-values.
    series: [
      {
        name: 'mixedBValue',
        gate: { attribute: 'Modality', equals: 'MR' },
        scope: 'mixed',
        when: { attribute: 'DiffusionBValue', exists: true },
      },
    ],
    matches: {
      all: [{ seriesFact: 'mixedBValue' }, IS_RENDERABLE_IMAGE],
    },
    groupBy: [
      'SeriesInstanceUID',
      { attribute: 'DiffusionBValue', absent: true },
    ],
  },

  volume3d: {
    priority: 7,
    description:
      'Multi-slice CT / MR / PT / NM, which reconstruct into a volume. Defaults ' +
      'to MPR, with 3D and stack also allowed.',
    // Default volumetric series to MPR (volume); 3D is an extra allowed type.
    viewportTypes: ['volume', 'volume3d', 'stack'],
    // Assumes a homogeneous series: samples instances[0].Modality. A
    // heterogeneous series (e.g. a localizer first, then a volume) can be
    // misflagged - add a dedicated split rule (as `mixedDimensionalityBValue`
    // does for DWI) when a specific mix must be separated.
    series: [
      {
        name: 'supportsVolume3d',
        scope: 'first',
        when: { attribute: 'Modality', in: VOLUME_MODALITIES },
        minInstances: 2,
      },
    ],
    matches: {
      all: [{ seriesFact: 'supportsVolume3d' }, IS_RENDERABLE_IMAGE],
    },
    groupBy: ['SeriesInstanceUID'],
  },

  defaultImageRule: {
    priority: 8,
    description:
      'Fallback for any remaining renderable image. Grouped one display set per ' +
      'series.',
    viewportTypes: ['stack', 'volume', 'volume3d'],
    matches: IS_RENDERABLE_IMAGE,
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
    customAttributes: {
      fromContext: ['sopClassUids'],
    },
  },
};

/** What the messages call a selector. */
const DEFINITION = 'raw display set selector';

/**
 * Throws with the offending fragment inlined - a selector is usually authored by
 * hand or shipped as config, so a mistake in it must name itself.
 *
 * Only for the selector as a whole. A mistake inside a rule is reported at its
 * path through the schema (`rule 'id'.matches.all[1]: ...`).
 *
 * @param {string} message
 * @param {unknown} fragment
 * @returns {never}
 */
function invalid(message, fragment) {
  throw new Error(
    `Invalid ${DEFINITION}: ${message}: ${JSON.stringify(fragment)}`
  );
}

/**
 * The compiled field of a rule, or of a nested shape, as its schema entry says.
 *
 * @param {import('../safeFunctions').SchemaForm} form
 * @param {Record<string, unknown>} fragment
 * @param {string} key
 * @param {import('../safeFunctions').SchemaSite} site
 * @returns {any}
 */
function compileField(form, fragment, key, site) {
  const spec = form.keys[key];
  return compileKey(spec, fragment[key], at(site, key, spec));
}

/**
 * Compiles one {@link RawSeriesFact}. The whole list becomes the rule's
 * `series` hook in {@link compileSeriesHook}.
 *
 * @param {unknown} fact
 * @param {import('../safeFunctions').SchemaSite} site
 */
function compileSeriesFact(fact, site) {
  const [, form] = matchForm(splitRuleSchema.seriesFact, fact, site);
  return {
    name: fact.name,
    scope: fact.scope,
    minInstances: fact.minInstances,
    gate:
      fact.gate === undefined
        ? undefined
        : compileField(form, fact, 'gate', site),
    when: compileField(form, fact, 'when', site),
  };
}

/**
 * Turns the compiled series facts of a rule into its `series` hook: one
 * function returning every named fact for that rule.
 *
 * Facts are evaluated against the whole series but read back per instance, so
 * this runs once per rule per split rather than per instance.
 *
 * @param {ReturnType<typeof compileSeriesFact>[]} compiled
 * @returns {(context: { instances: NaturalizedInstance[] }) => SeriesFacts}
 */
function compileSeriesHook(compiled) {
  // Facts never read other facts, so an empty series context is the right
  // argument for the nested condition evaluation.
  const emptyContext = { series: {} };

  return ({ instances }) => {
    /** @type {SeriesFacts} */
    const result = {};

    for (const fact of compiled) {
      result[fact.name] = evaluateSeriesFact(fact, instances, emptyContext);
    }

    return result;
  };
}

/**
 * Evaluates one compiled series fact over a series' instances.
 *
 * @param {{
 *   scope: 'first' | 'every' | 'some' | 'mixed',
 *   minInstances?: number,
 *   gate?: (instance: NaturalizedInstance, context: RuleContext) => boolean,
 *   when: (instance: NaturalizedInstance, context: RuleContext) => boolean,
 * }} fact
 * @param {NaturalizedInstance[]} instances
 * @param {RuleContext} context
 * @returns {boolean}
 */
function evaluateSeriesFact(fact, instances, context) {
  const first = instances[0];
  if (!first) {
    return false;
  }
  if (fact.minInstances !== undefined && instances.length < fact.minInstances) {
    return false;
  }
  if (fact.gate && !fact.gate(first, context)) {
    return false;
  }

  switch (fact.scope) {
    case 'first':
      return Boolean(fact.when(first, context));
    case 'every':
      return instances.every((instance) => fact.when(instance, context));
    case 'some':
      return instances.some((instance) => fact.when(instance, context));
    case 'mixed':
      return (
        instances.some((instance) => fact.when(instance, context)) &&
        instances.some((instance) => !fact.when(instance, context))
      );
    default:
      return false;
  }
}

/**
 * Compiles a rule's `compareInstances` data into a comparator
 * `(a, b, context) => number`.
 *
 * - `{ attribute, number?, descending? }` orders by the numeric value of the
 *   attribute. A missing value on either side returns 0: "no opinion".
 * - `{ expression }` evaluates the expression with the parameters `a`, `b` and
 *   `context`, and no implicit scope. The result is coerced to a number, so a
 *   missing tag gives `NaN`, which the engine also reads as "no opinion".
 *
 * @param {unknown} comparator
 * @param {import('../safeFunctions').SchemaSite} site
 * @returns {NonNullable<SplitRule['compareInstances']>}
 */
function compileComparator(comparator, site) {
  const [form, spec] = matchForm(splitRuleSchema.comparator, comparator, site);

  if (form === 'expression') {
    const evaluate = compileExpressionAt(
      comparator.expression,
      at(site, 'expression'),
      spec.expression
    );
    return (a, b, context) => Number(evaluate(a, b, context));
  }

  const { attribute, descending } = comparator;
  const direction = descending ? -1 : 1;
  return (a, b) => {
    const aValue = toFinite(readOwn(a, attribute));
    const bValue = toFinite(readOwn(b, attribute));
    if (aValue === undefined || bValue === undefined) {
      // Let the engine's acquisition-order tiebreak decide rather than
      // inventing an order from a missing tag.
      return 0;
    }
    return (aValue - bValue) * direction;
  };
}

/**
 * Compiles a {@link RawCustomAttributes} recipe into a rule's
 * `customAttributes` callback.
 *
 * `fromContext` reads the bag the split engine passes as the first argument
 * (`isMultiFrame`, `sopClassUids`, `viewportTypes`). A rule's own `series` facts
 * are deliberately *not* reachable here - the engine does not forward them - so
 * conditions inside a recipe evaluate against an empty series context.
 *
 * @param {unknown} recipe
 * @param {import('../safeFunctions').SchemaSite} site
 * @param {NonNullable<CreateDisplaySetSplitRulesOptions['customAttributePresets']>} presets
 * @returns {NonNullable<SplitRule['customAttributes']>}
 */
function compileCustomAttributes(recipe, site, presets) {
  const [, form] = matchForm(splitRuleSchema.customAttributes, recipe, site);
  const field = (key) =>
    recipe[key] === undefined
      ? undefined
      : compileField(form, recipe, key, site);

  const literals = field('set') ?? {};
  const fromFirstInstance = Object.entries(field('fromFirstInstance') ?? {});
  const contextNames = recipe.fromContext ?? [];
  const optionNames = recipe.fromOptions ?? [];
  const emptyContext = { series: {} };

  let preset;
  if (recipe.preset !== undefined) {
    preset = readOwn(presets, recipe.preset);
    if (typeof preset !== 'function') {
      invalidAt(
        at(site, 'preset'),
        `unknown customAttributes preset "${recipe.preset}"; known: ${Object.keys(presets).join(', ') || '(none)'}`,
        recipe
      );
    }
  }

  return (attributes, options) => {
    const instances = options.instances ?? [];
    const first = instances[0];

    /** @type {Record<string, unknown>} */
    const result = { ...literals };

    for (const [key, read] of fromFirstInstance) {
      result[key] = first === undefined ? undefined : read(first, emptyContext);
    }

    for (const name of contextNames) {
      result[name] = attributes?.[name];
    }

    for (const name of optionNames) {
      result[name] = options[name];
    }

    if (preset) {
      Object.assign(
        result,
        preset(instances, {
          attributes: attributes ?? {},
          splitNumber: options.splitNumber,
          descriptionName: options.descriptionName,
        })
      );
    }

    return result;
  };
}

/**
 * Compiles a raw display set selector into executable split rules.
 *
 * The result is a {@link SplitRuleSet} with the same keys and priorities, ready
 * to hand to `splitImageIdsBySplitRules` / `groupInstancesBySplitRules`, or to
 * merge with another rule set by key. An excluded entry (`priority: null`) is
 * compiled and kept, so a later layer can include it again by giving it a
 * priority. Compilation is eager: a malformed selector throws here, at setup,
 * rather than midway through splitting a study.
 *
 * Compilation is strict, and follows {@link splitRuleSchema}: an unknown field
 * or key anywhere in a rule, or a form a place does not accept, throws with the
 * rule id and the path of the fragment. An actual function passes through as is
 * at every function place (`matches`, a `groupBy` entry, `runBy`,
 * `compareInstances`, `series`, `customAttributes`, and any nested condition or
 * value).
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
 * // A deployment's own selector, e.g. read from JSON on a server or supplied by
 * // an application's customization layer on a client:
 * const custom = createDisplaySetSplitRules({
 *   ...rawDisplaySetSelector,
 *   usClips: {
 *     priority: -1,
 *     matches: { attribute: 'Modality', equals: 'US' },
 *     runBy: { condition: { attribute: 'NumberOfFrames', greaterThan: 1 } },
 *   },
 * });
 * ```
 *
 * @param {RawDisplaySetSelector} [selector=rawDisplaySetSelector] - the rules as data, keyed by rule id.
 * @param {CreateDisplaySetSplitRulesOptions} [options] - named extension points.
 * @returns {SplitRuleSet} compiled rules, keyed by rule id.
 */
export function createDisplaySetSplitRules(
  selector = rawDisplaySetSelector,
  options = {}
) {
  if (!selector || typeof selector !== 'object' || Array.isArray(selector)) {
    invalid('selector must be an object keyed by rule id', selector);
  }

  const classifiers = { ...BUILT_IN_CLASSIFIERS, ...options.classifiers };
  const presets = options.customAttributePresets ?? {};
  const compilers = {
    ...safeFunctionCompilers,
    seriesFact: compileSeriesFact,
    comparator: compileComparator,
    customAttributes: (recipe, site) =>
      compileCustomAttributes(recipe, site, presets),
  };

  /** @type {SplitRuleSet} */
  const compiledSet = {};
  for (const [id, rule] of Object.entries(selector)) {
    validateSplitRuleSetEntry(id, rule);
    const site = createSite(
      classifiers,
      { definition: DEFINITION, path: `rule '${id}'` },
      splitRuleSchema,
      compilers
    );
    const { id: _id, ...compiledRule } = compileRule(id, rule, site);
    compiledSet[id] = { ...compiledRule, priority: rule.priority };
  }
  return compiledSet;
}

/**
 * Compiles one raw rule into a {@link SplitRule}.
 *
 * @param {string} id - the key of the rule in the selector.
 * @param {RawSplitRule} rule
 * @param {import('../safeFunctions').SchemaSite} site
 * @returns {SplitRule}
 */
function compileRule(id, rule, site) {
  const [, form] = matchForm(splitRuleSchema.rule, rule, site);
  const field = (key) => compileField(form, rule, key, site);

  /** @type {SplitRule} */
  const compiled = { id };

  if (rule.viewportTypes !== undefined) {
    compiled.viewportTypes = field('viewportTypes');
  }

  if (rule.series !== undefined) {
    const series = field('series');
    if (typeof series === 'function') {
      compiled.series = series;
    } else if (series.length) {
      compiled.series = compileSeriesHook(series);
    }
  }

  if (rule.matches !== undefined) {
    compiled.matches = field('matches');
  }

  if (rule.groupBy !== undefined) {
    const groupBy = field('groupBy');
    if (groupBy.length) {
      compiled.groupBy = groupBy;
    }
  }

  if (rule.runBy !== undefined) {
    compiled.runBy = field('runBy');
  }

  if (rule.compareInstances !== undefined) {
    compiled.compareInstances = field('compareInstances');
  }

  if (rule.customAttributes !== undefined) {
    compiled.customAttributes = field('customAttributes');
  }

  return compiled;
}
