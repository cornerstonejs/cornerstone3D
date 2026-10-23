import type {
  NaturalizedInstance,
  RuleContext,
  SeriesFunction,
  SeriesFunctionDefinition,
  SplitRule,
} from './types';
import type { RawCondition, RawMatchTest } from '../safeFunctions';
import type {
  ContextEntry,
  ContextValues,
  DisplaySetContext,
} from './displaySetContext';

/**
 * Types for the **display set rules** - the serializable, data-shaped
 * description of a set of display-set split rules that
 * `createDisplaySetSplitRules` compiles into executable {@link SplitRule}s.
 *
 * The raw form exists so the same rules can be authored once and used on both
 * sides of the wire: a server (e.g. static-dicomweb, building its index) and a
 * client (e.g. OHIF, splitting a loaded series) can read the identical JSON and
 * get identical splits, instead of each re-implementing the rules.
 *
 * Every name in a rule is a DICOM keyword of the dcmjs dictionary, or a
 * context name of the display set context (see `displaySetContext.ts`). The
 * compile rejects every other name.
 *
 * These types follow `splitRuleSchema` (`splitRuleSchema.ts`), the table the
 * compiler reads. A key that is not in that table is a compile error, and an
 * actual function is accepted at every function place.
 *
 * @see displaySetContext.ts for the context and its default entries.
 * @see displaySetRules.js for the default rules.
 */

export type {
  ContextEntry,
  ContextValues,
  DisplaySetContext,
  RawCondition,
  RawMatchTest,
};

/** A name: a DICOM keyword, or a context name. */
export type RawName = string;

/** A per-instance hook in code, called `(instance, context)`. */
export type InstanceHook = (
  instance: NaturalizedInstance,
  context: RuleContext
) => unknown;

/**
 * One entry of `sortBy`: a name, in ascending order (numeric when both values
 * are finite numbers, else by text, and a missing value is "no opinion"); a
 * named sort function of `options.sortFunctions`; or an actual comparator.
 */
export type RawSortKey =
  | RawName
  | { sortFunction: string }
  | NonNullable<SplitRule['compareInstances']>;

/**
 * One value of `attributes`:
 *
 * - a name. A DICOM keyword reads the first instance of the sorted display
 *   set. `splitNumber` and `sopClassUids` are values of the display set.
 * - a fixed number, boolean or `null`.
 * - `{ template }`: text; `{ "template": "SCOUT" }` is fixed text.
 * - `{ expression }`: an expression over the display set.
 *   `displaySet.instances.max(x)` (and `min`, `sum`, `count`) runs over its
 *   instances, `series.instances.max(x)` over the series, and a DICOM keyword
 *   reads its first instance.
 * - in code, a function `(instances, values) => value`.
 */
export type RawAttributeValue =
  | RawName
  | number
  | boolean
  | null
  | { template: string }
  | { expression: string }
  | ((instances: NaturalizedInstance[], values: ContextValues) => unknown);

/** One rule of the display set rules. Mirrors {@link SplitRuleSetEntry}, in data form. */
export type RawSplitRule = {
  /**
   * The rule id. Optional, because the key of the rule in the rule set is the id.
   * When present it must equal that key. The id namespaces every bucket key the
   * rule produces, so the rule set can be edited without changing other rules'
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
   * can read it from the rules themselves instead of maintaining its own copy.
   */
  description?: string;
  /** Allowed viewport types; index 0 is preferred. */
  viewportTypes?: string[];
  /**
   * Context entries for this rule only. An entry replaces the global entry of
   * the same name, also inside the global entries that the rule reads, or it
   * defines a new name that only this rule reads.
   */
  context?: DisplaySetContext;
  /**
   * Which instances this rule claims: a map of name to test, and every entry
   * must hold. Omit for a catch-all rule. In code, a function
   * `(instance, context) => boolean`.
   */
  matches?: RawCondition;
  /** Names whose values form the group key; defaults to `['SeriesInstanceUID']`. */
  groupBy?: (RawName | InstanceHook)[];
  /** The instance order of the display sets. See {@link RawSortKey}. */
  sortBy?: RawSortKey[];
  /**
   * Attributes of the produced display sets, keyed by attribute name, or in
   * code a whole `customAttributes` hook.
   */
  attributes?:
    | Record<string, RawAttributeValue>
    | NonNullable<SplitRule['customAttributes']>;
};

/**
 * A whole rule set as data: rules keyed by rule id, the data form of a
 * `SplitRuleSet`. Rules are tried in ascending priority; first match wins.
 */
export type DisplaySetRules = Record<string, RawSplitRule>;

/** Options for {@link createDisplaySetSplitRules}. */
export type CreateDisplaySetSplitRulesOptions = {
  /**
   * Global context entries, over the entries of `defaultDisplaySetContext`.
   * An entry replaces the default entry of the same name. OHIF reads it from
   * the `displaySetContext` customization of `useMetadataDisplaySet`.
   */
  displaySetContext?: Record<string, ContextEntry>;
  /**
   * Extra (or replacement) series functions, over the built-in
   * `planeGeometry` / `timeClusters`, for a group entry
   * `{ function, args? }`. A definition `{ compute, fields }` declares the
   * result fields; a bare function has fields that are not checked.
   */
  seriesFunctions?: Record<string, SeriesFunction | SeriesFunctionDefinition>;
  /**
   * Names that no rule can read (`RL-SCOPE-9`), for example `PatientName`. A
   * rule that names one is a compile error, and a code entry of the context
   * that reads one through its `values` gets `undefined`.
   */
  deniedNames?: readonly string[];
  /** Named comparators for a `sortBy` entry `{ sortFunction: name }`. */
  sortFunctions?: Record<string, NonNullable<SplitRule['compareInstances']>>;
};
