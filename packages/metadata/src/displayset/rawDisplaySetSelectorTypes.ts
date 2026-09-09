import type { NaturalizedInstance, RuleContext } from './types';
import type {
  Classifier,
  ClassifierName,
  RawCondition,
  RawValue,
} from '../safeFunctions';

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
 * The conditions and values a rule is built from are **not** defined here: they
 * are the general {@link RawCondition} / {@link RawValue} safe-function
 * vocabulary from `../safeFunctions`, which knows nothing about display sets.
 * What this module adds is the rule shape that vocabulary is wrapped in -
 * `matches`, `groupBy`, `runBy`, `series` facts, `customAttributes`.
 *
 * @see ../safeFunctions for the condition/value vocabulary and its compiler.
 * @see rawDisplaySetSelector.js for the default selector and the rule compiler.
 */

export type { ClassifierName, RawCondition, RawValue };

/** Classifies a single instance. Registered under a {@link ClassifierName}. */
export type InstanceClassifier = Classifier<NaturalizedInstance>;

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
  /**
   * Human-readable explanation of what this rule is for. Part of the rule data
   * rather than a code comment so a UI that lets a user inspect or toggle rules
   * can read it from the selector itself instead of maintaining its own copy.
   */
  description?: string;
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
