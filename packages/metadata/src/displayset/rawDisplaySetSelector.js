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
 * The compiled predicates are *safe* because they are assembled from a closed
 * vocabulary (see `rawDisplaySetSelectorTypes.ts`) rather than evaluated from
 * source: there is no `eval`, no `new Function`, and no other code path from
 * selector data to executed code. A selector can therefore be loaded from a
 * config file, an HTTP response, or an application's customization layer.
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
 * grouping. Rules are evaluated in order and the first match wins per instance,
 * so ordering is part of the contract.
 *
 * @type {RawDisplaySetSelector}
 */
export const rawDisplaySetSelector = [
  {
    id: 'video',
    description:
      'Instances encoded with a video transfer syntax, or a dedicated video SOP ' +
      'class, or a long multi-frame secondary capture. One display set per ' +
      'instance, shown on a video viewport.',
    viewportTypes: ['video'],
    matches: { classifier: 'video' },
    groupBy: ['SOPInstanceUID'],
  },

  {
    id: 'ecg',
    description:
      'ECG / waveform SOP classes. One display set per instance, shown on a ' +
      'waveform viewport rather than an image viewport.',
    viewportTypes: ['ecg'],
    matches: { classifier: 'ecg' },
    groupBy: ['SOPInstanceUID'],
  },

  {
    id: 'wholeslide',
    description:
      'VL Whole Slide Microscopy (or modality SM). All pyramid levels of the ' +
      'series form a single whole-slide display set.',
    viewportTypes: ['wholeslide'],
    // All microscopy levels of a series form a single whole-slide display set.
    matches: { classifier: 'wsi' },
    groupBy: ['SeriesInstanceUID'],
  },

  {
    id: 'singleImageModality',
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

  {
    id: 'multiFrame',
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
  {
    id: 'mixedDimensionalityBValue',
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

  {
    id: 'volume3d',
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

  {
    id: 'defaultImageRule',
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
  {
    id: 'unsupported',
    description:
      'Catch-all for objects nothing can render (SEG, RTSTRUCT, RTDOSE, SR, ' +
      'PDF, presentation states, or an image whose Rows have not loaded). ' +
      'Produces a display set marked isDisplayable: false so the object is ' +
      'surfaced rather than silently dropped. Must stay last.',
    viewportTypes: [NO_VIEWPORT_TYPE],
    // No `matches`: claims whatever is left.
    groupBy: ['SeriesInstanceUID', 'SOPInstanceUID'],
    customAttributes: {
      fromContext: ['sopClassUids'],
    },
  },
];

/**
 * True when a naturalized attribute value counts as absent. Naturalized DICOM
 * delivers an empty element as `null` or `''` as readily as `undefined`, and a
 * rule asking "does this instance have a b-value?" means all three.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isAbsent(value) {
  return value === undefined || value === null || value === '';
}

/**
 * Finite numeric value of a naturalized attribute, or `undefined`.
 *
 * Deliberately not a bare `Number(...)`: that maps `null`, `''` and whitespace to
 * `0`, which would make an absent attribute compare as a real zero.
 *
 * @param {unknown} value
 * @returns {number | undefined}
 */
function toFinite(value) {
  if (isAbsent(value)) {
    return undefined;
  }
  const numeric = Array.isArray(value) ? value[0] : value;
  if (typeof numeric === 'boolean') {
    return undefined;
  }
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Compares an attribute value against a literal from the selector.
 *
 * Compares as strings so `'30'` (an IS naturalized as a string) matches `30`
 * from JSON. Multi-valued attributes compare on their first value, which is what
 * the single-valued attributes these conditions target (Modality, SOPClassUID)
 * degrade to when a source delivers them as a one-element array.
 *
 * @param {unknown} value
 * @param {unknown} literal
 * @returns {boolean}
 */
function looseEquals(value, literal) {
  if (isAbsent(value)) {
    return false;
  }
  const single = Array.isArray(value) ? value[0] : value;
  return String(single) === String(literal);
}

/**
 * Throws with the offending fragment inlined - a selector is usually authored by
 * hand or shipped as config, so a mistake in it must name itself.
 *
 * @param {string} message
 * @param {unknown} fragment
 * @returns {never}
 */
function invalid(message, fragment) {
  throw new Error(
    `Invalid raw display set selector: ${message}: ${JSON.stringify(fragment)}`
  );
}

/**
 * Compiles a {@link RawCondition} into a safe predicate.
 *
 * @param {RawCondition} condition
 * @param {Record<string, (instance: NaturalizedInstance) => boolean>} classifiers
 * @returns {(instance: NaturalizedInstance, context: RuleContext) => boolean}
 */
function compileCondition(condition, classifiers) {
  if (!condition || typeof condition !== 'object') {
    invalid('condition must be an object', condition);
  }

  if ('all' in condition) {
    const parts = condition.all.map((part) =>
      compileCondition(part, classifiers)
    );
    return (instance, context) =>
      parts.every((part) => part(instance, context));
  }

  if ('any' in condition) {
    const parts = condition.any.map((part) =>
      compileCondition(part, classifiers)
    );
    return (instance, context) => parts.some((part) => part(instance, context));
  }

  if ('not' in condition) {
    const inner = compileCondition(condition.not, classifiers);
    return (instance, context) => !inner(instance, context);
  }

  if ('classifier' in condition) {
    const classifier = classifiers[condition.classifier];
    if (typeof classifier !== 'function') {
      invalid(`unknown classifier "${condition.classifier}"`, condition);
    }
    return (instance) => classifier(instance);
  }

  if ('seriesFact' in condition) {
    const { seriesFact } = condition;
    return (_instance, context) => Boolean(context?.series?.[seriesFact]);
  }

  if ('attribute' in condition) {
    return compileAttributeCondition(condition);
  }

  return invalid('unrecognized condition', condition);
}

/**
 * Compiles the `{ attribute, <operator> }` family of conditions.
 *
 * @param {RawCondition & { attribute: string }} condition
 * @returns {(instance: NaturalizedInstance) => boolean}
 */
function compileAttributeCondition(condition) {
  const { attribute } = condition;

  if (condition.exists === true) {
    return (instance) => !isAbsent(instance[attribute]);
  }
  if (condition.absent === true) {
    return (instance) => isAbsent(instance[attribute]);
  }
  if ('equals' in condition) {
    return (instance) => looseEquals(instance[attribute], condition.equals);
  }
  if ('notEquals' in condition) {
    return (instance) => !looseEquals(instance[attribute], condition.notEquals);
  }
  if ('in' in condition) {
    // Compare as strings so the set works for both '1' and 1.
    const allowed = new Set(condition.in.map((value) => String(value)));
    return (instance) => {
      const value = instance[attribute];
      if (isAbsent(value)) {
        return false;
      }
      const single = Array.isArray(value) ? value[0] : value;
      return allowed.has(String(single));
    };
  }
  if ('notIn' in condition) {
    const denied = new Set(condition.notIn.map((value) => String(value)));
    return (instance) => {
      const value = instance[attribute];
      if (isAbsent(value)) {
        return true;
      }
      const single = Array.isArray(value) ? value[0] : value;
      return !denied.has(String(single));
    };
  }
  if ('contains' in condition || 'containsAny' in condition) {
    const needles = (
      'contains' in condition ? [condition.contains] : condition.containsAny
    ).map((needle) =>
      condition.ignoreCase ? String(needle).toLowerCase() : String(needle)
    );
    return (instance) => {
      const value = instance[attribute];
      if (isAbsent(value)) {
        return false;
      }
      const haystackRaw = String(
        Array.isArray(value) ? value.join(' ') : value
      );
      const haystack = condition.ignoreCase
        ? haystackRaw.toLowerCase()
        : haystackRaw;
      return needles.some((needle) => haystack.includes(needle));
    };
  }
  if ('greaterThan' in condition) {
    const bound = condition.greaterThan;
    return (instance) => {
      const value = toFinite(instance[attribute]);
      return value !== undefined && value > bound;
    };
  }
  if ('lessThan' in condition) {
    const bound = condition.lessThan;
    return (instance) => {
      const value = toFinite(instance[attribute]);
      return value !== undefined && value < bound;
    };
  }

  return invalid(`no operator for attribute "${attribute}"`, condition);
}

/**
 * Compiles a `{ template: 'text {Attribute} more' }` value into a reader that
 * substitutes each `{AttributeName}` with the instance's value.
 *
 * Parsed once into literal/placeholder segments rather than re-scanned per
 * instance. Substitution is all it does - there is no arithmetic or expression
 * syntax - so a template is never a route to evaluated code. `\{` escapes a
 * literal brace; an absent attribute substitutes an empty string.
 *
 * @param {string} template
 * @returns {(instance: NaturalizedInstance) => string}
 */
function compileTemplate(template) {
  if (typeof template !== 'string') {
    invalid('template must be a string', template);
  }

  /** @type {({ literal: string } | { attribute: string })[]} */
  const segments = [];
  let literal = '';

  for (let i = 0; i < template.length; i++) {
    const char = template[i];

    if (char === '\\' && (template[i + 1] === '{' || template[i + 1] === '}')) {
      literal += template[i + 1];
      i++;
      continue;
    }

    if (char !== '{') {
      literal += char;
      continue;
    }

    const end = template.indexOf('}', i + 1);
    if (end === -1) {
      invalid('template has an unclosed "{"', template);
    }
    const attribute = template.slice(i + 1, end).trim();
    if (!attribute) {
      invalid('template has an empty "{}" placeholder', template);
    }
    if (literal) {
      segments.push({ literal });
      literal = '';
    }
    segments.push({ attribute });
    i = end;
  }

  if (literal) {
    segments.push({ literal });
  }

  return (instance) =>
    segments
      .map((segment) => {
        if ('literal' in segment) {
          return segment.literal;
        }
        const value = instance[segment.attribute];
        return isAbsent(value) ? '' : String(value);
      })
      .join('');
}

/**
 * Compiles a {@link RawValue} into a safe value reader.
 *
 * @param {RawValue} value
 * @param {Record<string, (instance: NaturalizedInstance) => boolean>} classifiers
 * @returns {(instance: NaturalizedInstance, context: RuleContext) => unknown}
 */
function compileValue(value, classifiers) {
  if (typeof value === 'string') {
    return (instance) => instance[value];
  }

  if (!value || typeof value !== 'object') {
    invalid('value must be a string or an object', value);
  }

  if ('condition' in value) {
    return compileCondition(value.condition, classifiers);
  }

  if ('template' in value) {
    return compileTemplate(value.template);
  }

  if ('join' in value) {
    const { join } = value;
    if (!Array.isArray(value.parts) || !value.parts.length) {
      invalid('join requires a non-empty parts array', value);
    }
    const parts = value.parts.map((part) => ({
      label: part.label,
      read: compileValue(part, classifiers),
    }));
    return (instance, context) =>
      parts
        .map(({ label, read }) => {
          const read_ = read(instance, context);
          return label === undefined ? String(read_) : `${label}=${read_}`;
        })
        .join(join);
  }

  if ('attribute' in value) {
    const { attribute, bucket } = value;
    if (value.absent === true) {
      return (instance) => isAbsent(instance[attribute]);
    }
    if (bucket !== undefined) {
      if (!Number.isFinite(bucket) || bucket === 0) {
        invalid('bucket must be a non-zero finite number', value);
      }
      return (instance) => {
        const numeric = toFinite(instance[attribute]);
        return numeric === undefined ? undefined : Math.round(numeric / bucket);
      };
    }
    if (value.number === true) {
      return (instance) => toFinite(instance[attribute]);
    }
    return (instance) => instance[attribute];
  }

  return invalid('unrecognized value', value);
}

/**
 * Compiles a rule's {@link RawSeriesFact} list into its `series` hook: one
 * function returning every named fact for that rule.
 *
 * Facts are evaluated against the whole series but read back per instance, so
 * this runs once per rule per split rather than per instance.
 *
 * @param {RawSeriesFact[]} facts
 * @param {Record<string, (instance: NaturalizedInstance) => boolean>} classifiers
 * @returns {(context: { instances: NaturalizedInstance[] }) => SeriesFacts}
 */
function compileSeriesFacts(facts, classifiers) {
  const compiled = facts.map((fact) => {
    if (!fact?.name) {
      invalid('series fact requires a name', fact);
    }
    if (!['first', 'every', 'some', 'mixed'].includes(fact.scope)) {
      invalid(`series fact "${fact.name}" has an unknown scope`, fact);
    }
    return {
      name: fact.name,
      scope: fact.scope,
      minInstances: fact.minInstances,
      gate: fact.gate ? compileCondition(fact.gate, classifiers) : undefined,
      when: compileCondition(fact.when, classifiers),
    };
  });

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
      return fact.when(first, context);
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
 * Compiles a {@link RawCustomAttributes} recipe into a rule's
 * `customAttributes` callback.
 *
 * `fromContext` reads the bag the split engine passes as the first argument
 * (`isMultiFrame`, `sopClassUids`, `viewportTypes`). A rule's own `series` facts
 * are deliberately *not* reachable here - the engine does not forward them - so
 * conditions inside a recipe evaluate against an empty series context.
 *
 * @param {RawCustomAttributes} recipe
 * @param {Record<string, (instance: NaturalizedInstance) => boolean>} classifiers
 * @param {NonNullable<CreateDisplaySetSplitRulesOptions['customAttributePresets']>} presets
 * @returns {NonNullable<SplitRule['customAttributes']>}
 */
function compileCustomAttributes(recipe, classifiers, presets) {
  const literals = recipe.set ?? {};
  const fromFirstInstance = Object.entries(recipe.fromFirstInstance ?? {}).map(
    ([key, value]) => ({ key, read: compileValue(value, classifiers) })
  );
  const contextNames = recipe.fromContext ?? [];
  const optionNames = recipe.fromOptions ?? [];
  const emptyContext = { series: {} };

  let preset;
  if (recipe.preset !== undefined) {
    preset = presets[recipe.preset];
    if (typeof preset !== 'function') {
      invalid(`unknown customAttributes preset "${recipe.preset}"`, recipe);
    }
  }

  return (attributes, options) => {
    const instances = options.instances ?? [];
    const first = instances[0];

    /** @type {Record<string, unknown>} */
    const result = { ...literals };

    for (const { key, read } of fromFirstInstance) {
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
 * The result is a plain `SplitRule[]`, ready to hand to
 * `splitImageIdsBySplitRules` / `groupInstancesBySplitRules`. Compilation is
 * eager: a malformed selector throws here, at setup, rather than midway through
 * splitting a study.
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
 * const custom = createDisplaySetSplitRules([
 *   { id: 'usClips', matches: { attribute: 'Modality', equals: 'US' },
 *     runBy: { condition: { attribute: 'NumberOfFrames', greaterThan: 1 } } },
 *   ...rawDisplaySetSelector,
 * ]);
 * ```
 *
 * @param {RawDisplaySetSelector} [selector=rawDisplaySetSelector] - the rules as data.
 * @param {CreateDisplaySetSplitRulesOptions} [options] - named extension points.
 * @returns {SplitRule[]} compiled rules, in selector order.
 */
export function createDisplaySetSplitRules(
  selector = rawDisplaySetSelector,
  options = {}
) {
  if (!Array.isArray(selector)) {
    invalid('selector must be an array of rules', selector);
  }

  const classifiers = { ...BUILT_IN_CLASSIFIERS, ...options.classifiers };
  const presets = options.customAttributePresets ?? {};

  return selector.map((rule) => {
    if (!rule || typeof rule !== 'object') {
      invalid('rule must be an object', rule);
    }
    if (!rule.id) {
      // Ids namespace bucket keys, so an unnamed rule would make its display
      // sets' identities depend on its position in the selector.
      invalid('rule requires an id', rule);
    }

    /** @type {SplitRule} */
    const compiled = { id: rule.id };

    if (rule.viewportTypes) {
      compiled.viewportTypes = rule.viewportTypes;
    }

    if (rule.series?.length) {
      compiled.series = compileSeriesFacts(rule.series, classifiers);
    }

    if (rule.matches) {
      compiled.matches = compileCondition(rule.matches, classifiers);
    }

    if (rule.groupBy?.length) {
      compiled.groupBy = rule.groupBy.map((part) =>
        compileValue(part, classifiers)
      );
    }

    if (rule.runBy) {
      compiled.runBy = compileValue(rule.runBy, classifiers);
    }

    if (rule.compareInstances) {
      const { attribute, descending } = rule.compareInstances;
      const direction = descending ? -1 : 1;
      compiled.compareInstances = (a, b) => {
        const aValue = toFinite(a[attribute]);
        const bValue = toFinite(b[attribute]);
        if (aValue === undefined || bValue === undefined) {
          // Let the engine's acquisition-order tiebreak decide rather than
          // inventing an order from a missing tag.
          return 0;
        }
        return (aValue - bValue) * direction;
      };
    }

    if (rule.customAttributes) {
      compiled.customAttributes = compileCustomAttributes(
        rule.customAttributes,
        classifiers,
        presets
      );
    }

    return compiled;
  });
}
