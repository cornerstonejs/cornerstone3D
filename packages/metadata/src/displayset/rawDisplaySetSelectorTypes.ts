import type {
  NaturalizedInstance,
  RuleContext,
  SeriesFunction,
  SplitRule,
} from './types';
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
 * These types follow `splitRuleSchema` (`splitRuleSchema.ts`), the table the
 * compiler reads. A key that is not in that table is a compile error, and an
 * actual function is accepted at every function place.
 *
 * @see ../safeFunctions for the condition/value vocabulary and its compiler.
 * @see rawDisplaySetSelector.js for the default selector and the rule compiler.
 */

export type { ClassifierName, RawCondition, RawValue };

/** Classifies a single instance. Registered under a {@link ClassifierName}. */
export type InstanceClassifier = Classifier<NaturalizedInstance>;

/**
 * A fact derived once from the whole series, and added to the series context
 * that every rule reads: as `{ seriesFact: <name> }` in a condition, or as
 * `context.series.<name>` in an expression.
 *
 * Reach for one only when a rule needs something no single instance can answer
 * ("does this series mix b-value and non-b-value frames?", "what is the slice
 * spacing?").
 *
 * The first rule, in priority order, that computes a name wins. A later rule
 * that declares the same name reads the earlier value, and does not compute
 * it. So a rule declares every fact it reads, and the fact is computed once.
 * Within one rule, the facts run in list order, and a fact reads the earlier
 * ones.
 */
export type RawSeriesFact =
  | RawBooleanSeriesFact
  | RawExpressionSeriesFact
  | RawFunctionSeriesFact;

/**
 * A value computed by an expression, called `(instances, series)` once per
 * split. `instances` is the whole series and `series` holds the facts so far.
 * There is no implicit scope: a bare name reads an attribute only inside an
 * aggregate, e.g. `{ name: 'firstNumber', expression: 'minOf(instances, InstanceNumber)' }`.
 */
export type RawExpressionSeriesFact = {
  name: string;
  expression: string;
};

/**
 * A value from a named series function: a built-in one (`planeGeometry`,
 * `timeClusters`), or one from
 * {@link CreateDisplaySetSplitRulesOptions.seriesFunctions}. An unknown name
 * is a compile error.
 */
export type RawFunctionSeriesFact = {
  name: string;
  function: string;
  /** Arguments for the function, copied as is. */
  args?: Record<string, unknown>;
};

/** A boolean: a condition applied across the series as `scope` says. */
export type RawBooleanSeriesFact = {
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
  /**
   * Attribute name -> value read from `instances[0]`. An expression reads the
   * series context as `context.series`, when the host passes it as
   * `options.series`.
   */
  fromFirstInstance?: Record<string, RawValue>;
  /**
   * Names to copy from the context the split engine passes to
   * `customAttributes`: `isMultiFrame`, `sopClassUids`, `viewportTypes`.
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

/** One rule in a raw selector. Mirrors {@link SplitRuleSetEntry}, in data form. */
export type RawSplitRule = {
  /**
   * The rule id. Optional, because the rule's key in the selector is the id.
   * When present it must equal that key. The id namespaces every bucket key the
   * rule produces, so the selector can be edited without changing other rules'
   * keys.
   */
  id?: string;
  /**
   * The group of rules this rule belongs to (see `SplitRule.groupId`).
   * Defaults to the rule id.
   */
  groupId?: string;
  /**
   * Evaluation order: ascending, first match wins; `null` excludes the rule.
   * See `SplitRuleSetEntry.priority`.
   */
  priority: number | null;
  /**
   * Human-readable explanation of what this rule is for. Part of the rule data
   * rather than a code comment so a UI that lets a user inspect or toggle rules
   * can read it from the selector itself instead of maintaining its own copy.
   */
  description?: string;
  /** Allowed viewport types; index 0 is preferred. */
  viewportTypes?: string[];
  /**
   * Facts derived from the whole series, added to the shared series context
   * (see {@link RawSeriesFact}). An actual function replaces the whole list: it
   * is the rule's `series` hook.
   */
  series?: RawSeriesFact[] | NonNullable<SplitRule['series']>;
  /**
   * Which instances this rule claims, compiled to
   * `(instance, context) => boolean`. Omit for a catch-all rule.
   */
  matches?: RawCondition;
  /**
   * Bucket recipe; defaults to `['SeriesInstanceUID']`. Each entry compiles to
   * `(instance, context) => value`.
   */
  groupBy?: RawValue[];
  /**
   * Value whose changes start a new run (see {@link SplitRule.runBy}), compiled
   * to `(instance, context) => value`.
   */
  runBy?: RawValue;
  /** Instance ordering for this rule. See {@link RawComparator}. */
  compareInstances?: RawComparator;
  /**
   * Extra attributes for the produced display sets: a recipe, or an actual
   * `customAttributes` callback.
   */
  customAttributes?:
    | RawCustomAttributes
    | NonNullable<SplitRule['customAttributes']>;
};

/**
 * A rule's `compareInstances`, compiled to `(a, b, context) => number`. A
 * result of 0 or `NaN` is "no opinion": the next comparator decides.
 */
export type RawComparator =
  /**
   * Ascending by the numeric value of the attribute; `descending` reverses. A
   * missing value on either side is "no opinion". (`number` is accepted for
   * symmetry with values; the comparison is always numeric.)
   */
  | { attribute: string; number?: boolean; descending?: boolean }
  /**
   * An expression called with `(a, b, context)`, e.g.
   * `'a.SliceLocation - b.SliceLocation'`. There is no implicit scope: a bare
   * identifier that is not `a`, `b` or `context` is a compile error. The result
   * is coerced to a number.
   */
  | { expression: string }
  /** An actual comparator, which passes through as is. */
  | NonNullable<SplitRule['compareInstances']>;

/**
 * A whole raw selector: rules keyed by rule id, the data form of a
 * `SplitRuleSet`. Rules are tried in ascending priority; first match wins.
 */
export type RawDisplaySetSelector = Record<string, RawSplitRule>;

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
   * Extra (or replacement) named series functions, merged over the built-in
   * `planeGeometry` / `timeClusters` entries, for a series fact
   * `{ name, function, args? }`. The seam an application uses to teach the
   * selector a summary of the series that it cannot express as data.
   */
  seriesFunctions?: Record<string, SeriesFunction>;
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
