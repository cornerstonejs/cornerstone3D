/**
 * The compiler of the display set rules: it turns rule data into the
 * `SplitRule` hooks that the split engine in `groupInstancesBySplitRules`
 * runs. The engine and the hooks do not change; only the data that compiles
 * onto them is this module.
 *
 * One compile path handles the JSON form and the code form. At every function
 * place an actual function passes through as is, so an extension can mix code
 * with data in one rule.
 *
 * @module displayset/compileSplitRules
 */

import { asArrayFirst, toFiniteFirst } from '@cornerstonejs/utils';
import {
  at,
  compileConditionAt,
  createSite,
  hasNoValue,
  invalidAt,
  isUnsafeKey,
  matchForm,
  parseTemplate,
  readOwn,
  safeFunctionCompilers,
  unrecognized,
} from '../safeFunctions';
import type { NameReaderFunction, SchemaSite } from '../safeFunctions';
import {
  ContextProgram,
  displaySetContextFor,
  isFixedValue,
} from './displaySetContext';
import { chainComparators } from './groupInstancesBySplitRules';
import type {
  ContextLayer,
  ContextReader,
  ContextRuntime,
  ContextValues,
} from './displaySetContext';
import { getMetadataContextProgram } from './metadataContext';
import { validateSplitRuleSetEntry } from './splitRuleSet';
import { splitRuleSchema } from './splitRuleSchema';
import type {
  CreateDisplaySetSplitRulesOptions,
  DisplaySetRules,
} from './displaySetRulesTypes';
import type {
  NaturalizedInstance,
  RuleContext,
  SplitRule,
  SplitRuleSet,
} from './types';

/** What the messages call the rules as data. */
const DEFINITION = 'display set rules';

type Comparator = NonNullable<SplitRule['compareInstances']>;

/** The compile of one rule: the site, the context, the registries. */
type RuleCompile = {
  site: SchemaSite;
  program: ContextProgram;
  layer: ContextLayer;
  sortFunctions: NonNullable<
    CreateDisplaySetSplitRulesOptions['sortFunctions']
  >;
};

/** A reader of a name for a per-instance hook `(instance, context)`. */
function instanceReader(
  compile: RuleCompile,
  name: string,
  site: SchemaSite,
  place: 'matches' | 'groupBy',
  field?: string
): (instance: NaturalizedInstance, context?: RuleContext) => unknown {
  const read = compile.program.readerAt(compile.layer, name, site, {
    field,
    place,
  });
  const { program } = compile;
  return (instance, context) =>
    read(program.runtimeFrom(context, instance), instance);
}

/** A `groupBy` entry: a name, or a function. */
function compileName(
  value: unknown,
  site: SchemaSite,
  compile: RuleCompile
): (instance: NaturalizedInstance, context: RuleContext) => unknown {
  if (typeof value === 'function') {
    return value as (
      instance: NaturalizedInstance,
      context: RuleContext
    ) => unknown;
  }
  if (typeof value !== 'string') {
    return unrecognized(splitRuleSchema.name, value, site);
  }
  return instanceReader(compile, value, site, 'groupBy');
}

/**
 * The order of two values of a `sortBy` name: numeric when both are finite
 * numbers, else by text. An instance with no value sorts after every instance
 * with a value, so the order is transitive; two instances with no value are
 * "no opinion" (0).
 */
function compareSortValues(a: unknown, b: unknown): number {
  const x = toFiniteFirst(a);
  const y = toFiniteFirst(b);
  if (x !== undefined && y !== undefined) {
    return x - y;
  }
  if (hasNoValue(a) || hasNoValue(b)) {
    return Number(hasNoValue(a)) - Number(hasNoValue(b));
  }
  const aText = String(asArrayFirst(a));
  const bText = String(asArrayFirst(b));
  return aText < bText ? -1 : aText > bText ? 1 : 0;
}

/** One `sortBy` entry: a name (ascending), `{ sortFunction }`, or a function. */
function compileSortKey(
  value: unknown,
  site: SchemaSite,
  compile: RuleCompile
): Comparator {
  if (typeof value === 'function') {
    return value as Comparator;
  }
  if (typeof value === 'string') {
    const read = compile.program.readerAt(compile.layer, value, site, {
      place: 'sortBy',
    });
    const { program } = compile;
    return (a, b, context) => {
      const runtime = program.runtimeFrom(context, [a, b]);
      return compareSortValues(read(runtime, a), read(runtime, b));
    };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return unrecognized(splitRuleSchema.sortKey, value, site);
  }
  matchForm(splitRuleSchema.sortKey, value, site);
  const name = (value as { sortFunction: string }).sortFunction;
  const sortFunction = readOwn(compile.sortFunctions, name);
  if (typeof sortFunction !== 'function') {
    return invalidAt(
      at(site, 'sortFunction'),
      `unknown sort function "${name}"; known: ${Object.keys(compile.sortFunctions).join(', ') || '(none)'}`
    );
  }
  return sortFunction as Comparator;
}

/** The reader of one attribute value, over the instances of a display set. */
type AttributeReader = (
  runtime: ContextRuntime,
  instances: readonly NaturalizedInstance[],
  extras: Readonly<Record<string, unknown>>
) => unknown;

function compileAttributeValue(
  value: unknown,
  site: SchemaSite,
  compile: RuleCompile
): AttributeReader {
  const { program, layer } = compile;
  if (typeof value === 'function') {
    const scope = { key: `#attribute:${site.path}`, deps: new Map(), layer };
    return (runtime, instances, extras) =>
      (value as (instances: unknown, values: ContextValues) => unknown)(
        instances,
        runtime.env(scope, instances[0], extras) as ContextValues
      );
  }
  if (isFixedValue(value, false)) {
    return () => value;
  }
  if (typeof value === 'string') {
    const read = program.readerAt(layer, value, site, { place: 'attributes' });
    return (runtime, instances, extras) => read(runtime, instances[0], extras);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return unrecognized(splitRuleSchema.attributeValue, value, site);
  }
  const [form] = matchForm(splitRuleSchema.attributeValue, value, site);
  const fields = value as { template?: string; expression?: string };
  if (form === 'expression') {
    return program.attributeExpression(
      layer,
      fields.expression,
      at(site, 'expression')
    );
  }
  const templateSite = at(site, 'template');
  const parts: ContextReader[] = parseTemplate(
    fields.template,
    templateSite
  ).map((segment) =>
    'literal' in segment
      ? () => segment.literal
      : program.readerAt(layer, segment.name, templateSite, {
          field: segment.field,
          place: 'attributes',
        })
  );
  return (runtime, instances, extras) =>
    parts
      .map((part) => {
        const text = part(runtime, instances[0], extras);
        return hasNoValue(text) ? '' : String(text);
      })
      .join('');
}

/** `attributes`: a record of attribute values, or a whole `customAttributes` hook. */
function compileAttributes(
  attributes: unknown,
  site: SchemaSite,
  compile: RuleCompile
): NonNullable<SplitRule['customAttributes']> {
  if (typeof attributes === 'function') {
    return attributes as NonNullable<SplitRule['customAttributes']>;
  }
  if (
    !attributes ||
    typeof attributes !== 'object' ||
    Array.isArray(attributes)
  ) {
    return invalidAt(
      site,
      'expected an object of attribute values, keyed by attribute name, or a function (attributes, options) => Record<string, unknown>',
      attributes
    );
  }
  const readers = Object.entries(attributes).map(([key, value]) => {
    const valueSite = at(site, key);
    if (isUnsafeKey(key)) {
      invalidAt(valueSite, `the key "${key}" is not allowed`);
    }
    return [key, compileAttributeValue(value, valueSite, compile)] as const;
  });
  const { program } = compile;
  return (engine, options) => {
    const instances = options.instances ?? [];
    // The runtime of one display set, for the displaySet.<name> reads.
    const runtime = program.runtimeFrom(
      {
        series: options.series,
        displaySet: displaySetContextFor(options.series, instances),
      },
      instances
    );
    const extras = {
      splitNumber: options.splitNumber,
      sopClassUids: engine?.sopClassUids,
    };
    const result: Record<string, unknown> = {};
    for (const [key, read] of readers) {
      result[key] = instances.length
        ? read(runtime, instances, extras)
        : undefined;
    }
    return result;
  };
}

function compileList<T>(
  value: unknown,
  site: SchemaSite,
  compileEntry: (entry: unknown, site: SchemaSite) => T
): T[] {
  if (!Array.isArray(value)) {
    return invalidAt(site, 'expected an array', value);
  }
  return value.map((entry, index) => compileEntry(entry, at(site, index)));
}

/** Compiles one rule in data form into a {@link SplitRule}. */
function compileRule(
  id: string,
  rule: Record<string, unknown>,
  site: SchemaSite,
  program: ContextProgram,
  sortFunctions: RuleCompile['sortFunctions']
): SplitRule {
  matchForm(splitRuleSchema.rule, rule, site);
  const layer = program.layer(id, rule.context, at(site, 'context'));
  const compile: RuleCompile = { site, program, layer, sortFunctions };

  const compiled: SplitRule = { id, series: program.seriesHook };

  if (rule.groupId !== undefined) {
    compiled.groupId = rule.groupId as string;
  }
  if (rule.viewportTypes !== undefined) {
    compiled.viewportTypes = rule.viewportTypes as string[];
  }
  if (rule.handler !== undefined) {
    compiled.handler = rule.handler as string;
  }

  if (rule.matches !== undefined) {
    const matchesSite = {
      ...at(site, 'matches'),
      readName: (name: string, nameSite: SchemaSite, field?: string) =>
        instanceReader(
          compile,
          name,
          nameSite,
          'matches',
          field
        ) as NameReaderFunction,
    };
    compiled.matches = compileConditionAt(rule.matches, matchesSite);
  }

  if (rule.groupBy !== undefined) {
    const groupBy = compileList(rule.groupBy, at(site, 'groupBy'), (entry, s) =>
      compileName(entry, s, compile)
    );
    if (groupBy.length) {
      compiled.groupBy = groupBy;
    }
  }

  if (rule.sortBy !== undefined) {
    const comparators = compileList(
      rule.sortBy,
      at(site, 'sortBy'),
      (entry, s) => compileSortKey(entry, s, compile)
    );
    if (comparators.length) {
      compiled.compareInstances = chainComparators(comparators);
    }
  }

  if (rule.attributes !== undefined) {
    compiled.customAttributes = compileAttributes(
      rule.attributes,
      at(site, 'attributes'),
      compile
    );
  }

  return compiled;
}

/**
 * Compiles a set of display set rules into executable split rules.
 *
 * The result is a {@link SplitRuleSet} with the same keys and priorities, ready
 * to hand to `splitImageIdsBySplitRules` / `groupInstancesBySplitRules`, or to
 * merge with another rule set by key. An excluded entry (`priority: null`) is
 * compiled and kept, so a later layer can include it again by giving it a
 * priority. Compilation is eager: a malformed rule set throws here, at setup,
 * rather than midway through splitting a study.
 *
 * The rules read the names of {@link defaultMetadataContext}, with the
 * entries of `options.context` over them. Every name is checked: an
 * unknown name, a loop of context entries, an unknown field or form, throws
 * with the rule id and the path of the fragment.
 */
export function compileDisplaySetSplitRules(
  rules: DisplaySetRules,
  options: CreateDisplaySetSplitRulesOptions = {}
): SplitRuleSet {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
    throw new Error(
      `Invalid ${DEFINITION}: the rules must be an object keyed by rule id: ${JSON.stringify(rules)}`
    );
  }

  // The shared cache: the code tests read the same compile of the same
  // context object.
  const program = getMetadataContextProgram(options.context, {
    seriesFunctions: options.seriesFunctions,
    deniedNames: options.deniedNames,
    definition: DEFINITION,
  });
  const sortFunctions = options.sortFunctions ?? {};

  const compiledSet: SplitRuleSet = {};
  for (const [id, rule] of Object.entries(rules)) {
    validateSplitRuleSetEntry(id, rule);
    const site = createSite(
      { definition: DEFINITION, path: `rule '${id}'` },
      splitRuleSchema,
      safeFunctionCompilers
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...compiledRule } = compileRule(
      id,
      rule as Record<string, unknown>,
      site,
      program,
      sortFunctions
    );
    compiledSet[id] = { ...compiledRule, priority: rule.priority };
  }
  return compiledSet;
}
