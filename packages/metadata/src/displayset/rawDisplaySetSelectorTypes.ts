import type { NaturalizedInstance, RuleContext } from './types';

/**
 * Types for the **raw display set selector** - the serializable, data-shaped
 * description of a set of display-set split rules that
 * `createDisplaySetSplitRules` compiles into executable {@link SplitRule}s.
 *
 * The raw form exists so the same rules can be authored once and used on both
 * sides of the wire: a server (e.g. static-dicomweb, building its index) and a
 * client (e.g. OHIF, splitting a loaded series) can read the identical JSON and
 * get identical splits, instead of each re-implementing the rules.
 *
 * Everything here is plain JSON: objects, arrays, strings, numbers, booleans.
 * The behaviour a rule needs that JSON cannot express - "is this instance a
 * video?" - is referenced **by name** and resolved against a registry of
 * built-in (or caller-supplied) functions. That is what makes the compiled
 * predicates *safe functions*: they are assembled from a closed vocabulary, so
 * a selector can be loaded from a config file, an HTTP response, or an
 * application's customization layer without ever evaluating supplied code.
 *
 * @see rawDisplaySetSelector.js for the default selector and the compiler.
 */

/** A named instance classifier, e.g. `'image'`, `'video'`, `'ecg'`, `'wsi'`. */
export type ClassifierName = string;

/** Classifies a single instance. Registered under a {@link ClassifierName}. */
export type InstanceClassifier = (instance: NaturalizedInstance) => boolean;

/**
 * A condition over one instance (plus, for `seriesFact`, the facts this rule's
 * `series` hook derived). Exactly one form per object.
 */
export type RawCondition =
  /** True when the named classifier accepts the instance. */
  | { classifier: ClassifierName }
  /** True when the named series fact (see {@link RawSeriesFact}) is truthy. */
  | { seriesFact: string }
  /** True when the attribute is present (not `undefined` / `null` / `''`). */
  | { attribute: string; exists: true }
  /** True when the attribute is absent (`undefined` / `null` / `''`). */
  | { attribute: string; absent: true }
  /** Loose equality against the attribute's value coerced to a string. */
  | { attribute: string; equals: string | number | boolean }
  | { attribute: string; notEquals: string | number | boolean }
  /** Membership test against the attribute's value coerced to a string. */
  | { attribute: string; in: (string | number | boolean)[] }
  | { attribute: string; notIn: (string | number | boolean)[] }
  /** Numeric comparison; false when the attribute is not a finite number. */
  | { attribute: string; greaterThan: number }
  | { attribute: string; lessThan: number }
  /** All / any / negation of nested conditions. `all: []` is true, `any: []` false. */
  | { all: RawCondition[] }
  | { any: RawCondition[] }
  | { not: RawCondition };

/**
 * A value read off an instance. Used wherever a rule needs a *value* rather
 * than a boolean: `groupBy` parts, `runBy`, and `customAttributes` sources.
 *
 * A bare string is shorthand for `{ attribute: <string> }`.
 */
export type RawValue =
  | string
  | {
      attribute: string;
      /** Coerce to a number (`undefined` when not finite). */
      number?: true;
      /** Yield `true`/`false` for absent/present instead of the value. */
      absent?: true;
      /** Yield `Math.round(value / bucket)` - a deliberately fuzzy bucket. */
      bucket?: number;
    }
  /** Yield the boolean result of a condition. */
  | { condition: RawCondition }
  /**
   * Yield one string built from several values, e.g.
   * `{ join: '&', parts: [{ label: 'rows', attribute: 'Rows', bucket: 64 }] }`
   * produces `rows=8`. Use when several attributes must form a *single*
   * `groupBy` part.
   */
  | {
      join: string;
      parts: (RawValue & { label?: string })[];
    };

/**
 * A fact derived once per rule from the whole series, read back by that rule's
 * `matches` / `groupBy` through `{ seriesFact: <name> }`.
 *
 * Reach for one only when a rule needs something no single instance can answer
 * ("does this series mix b-value and non-b-value frames?").
 */
export type RawSeriesFact = {
  /** Name this fact is read back under. */
  name: string;
  /**
   * Optional precondition evaluated against `instances[0]`. When it fails the
   * fact is `false` and `when` is not evaluated - e.g. gate a DWI fact on
   * `Modality === 'MR'`.
   */
  gate?: RawCondition;
  /**
   * How `when` is applied across the series:
   * - `first` - evaluated against `instances[0]` only (assumes a homogeneous series).
   * - `every` / `some` - true when it holds for all / at least one instance.
   * - `mixed` - true when it holds for at least one instance **and** fails for
   *   at least one, i.e. the series mixes both kinds.
   */
  scope: 'first' | 'every' | 'some' | 'mixed';
  /** The condition itself. */
  when: RawCondition;
  /** Minimum instance count; below it the fact is `false`. */
  minInstances?: number;
};

/**
 * Declarative recipe for a rule's `customAttributes` - the extra attributes
 * spread onto the produced display set.
 */
export type RawCustomAttributes = {
  /** Literal values, copied as-is. */
  set?: Record<string, string | number | boolean | null>;
  /** Attribute name -> value read from `instances[0]`. */
  fromFirstInstance?: Record<string, RawValue>;
  /**
   * Names to copy from the context the split engine passes to
   * `customAttributes`: `isMultiFrame`, `sopClassUids`, `viewportTypes`.
   *
   * Note this is the *engine's* context, not the rule's `series` facts - those
   * are scoped to `matches` / `groupBy` and are not available here. Anything a
   * display set needs from the whole series should be re-derived through
   * `fromFirstInstance` instead.
   */
  fromContext?: ('isMultiFrame' | 'sopClassUids' | 'viewportTypes')[];
  /**
   * Split-option names to copy onto the display set under the same name.
   * Currently `splitNumber` and `descriptionName`.
   */
  fromOptions?: ('splitNumber' | 'descriptionName')[];
  /**
   * Escape hatch: a named recipe from `options.customAttributePresets`. Applied
   * after the declarative fields above, so it can override them.
   */
  preset?: string;
};

/** One rule in a raw selector. Mirrors {@link SplitRule}, in data form. */
export type RawSplitRule = {
  /**
   * Stable identifier, unique within the selector. It namespaces every bucket
   * key the rule produces, so naming rules is what lets the selector be edited
   * without changing other rules' keys.
   */
  id: string;
  /** Allowed viewport types; index 0 is preferred. */
  viewportTypes?: string[];
  /** Facts derived from the whole series and read back via `{ seriesFact }`. */
  series?: RawSeriesFact[];
  /** Which instances this rule claims. Omit for a catch-all rule. */
  matches?: RawCondition;
  /** Bucket recipe; defaults to `['SeriesInstanceUID']`. */
  groupBy?: RawValue[];
  /** Value whose changes start a new run (see {@link SplitRule.runBy}). */
  runBy?: RawValue;
  /**
   * Instance ordering for this rule. `{ attribute, number: true }` sorts
   * ascending by that attribute; `descending` reverses it.
   */
  compareInstances?: { attribute: string; number?: true; descending?: true };
  /** Extra attributes for the produced display sets. */
  customAttributes?: RawCustomAttributes;
};

/** A whole raw selector: an ordered list of rules, first match wins. */
export type RawDisplaySetSelector = RawSplitRule[];

/** Options for {@link createDisplaySetSplitRules}. */
export type CreateDisplaySetSplitRulesOptions = {
  /**
   * Extra (or replacement) named instance classifiers, merged over the built-in
   * `image` / `video` / `ecg` / `wsi` entries. This is the seam an application
   * uses to teach the selector a classification it cannot express as data,
   * without the selector itself stopping being data.
   */
  classifiers?: Record<ClassifierName, InstanceClassifier>;
  /**
   * Named `customAttributes` recipes referenced by
   * {@link RawCustomAttributes.preset}.
   */
  customAttributePresets?: Record<
    string,
    (
      instances: NaturalizedInstance[],
      context: {
        /** The engine-supplied context (`isMultiFrame`, `sopClassUids`, ...). */
        attributes: Record<string, unknown>;
        splitNumber?: number;
        descriptionName?: string;
      }
    ) => Record<string, unknown>
  >;
};

/**
 * Reads a value off an instance for a compiled rule. Exported for tests and for
 * applications building rules that mix raw values with hand-written functions.
 */
export type CompiledValueReader = (
  instance: NaturalizedInstance,
  context: RuleContext
) => unknown;
