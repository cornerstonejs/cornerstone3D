/**
 * The **display set context**: the named values that the display set split
 * rules read, in addition to the DICOM keywords of the instance.
 *
 * Each name in a rule is one of two kinds:
 *
 * - A **tag keyword** is a keyword of the DICOM dictionary of dcmjs, for
 *   example `Modality`. The value comes from the instance.
 * - A **context name** starts with a lowercase letter, and a context entry
 *   defines it. The global context (`displaySetContext`) defines a name for
 *   every rule, and the `context` of a rule defines or replaces a name for that
 *   rule only.
 *
 * Every other name is a compile error that names the rule, the place and the
 * name. A context entry cannot have the name of a tag keyword, so a context
 * never hides a value of the instance. An attribute that the dictionary does
 * not hold is available only through a declaration.
 *
 * An entry has one of five forms: a fixed value; a string, which is an
 * expression; a declaration `{ attribute, vr?, vm? }`; a template
 * `{ template }`; or a group `{ function, args? }`, which is one call of a
 * series function. In code, an entry can also be a function
 * `(instance, values) => value`, and the `function` of a group can be a
 * function `(instances, { args }) => value`.
 *
 * No entry declares a scope. The scope comes from the entry: a declaration, a
 * code function, and an entry that reads an instance value outside of `min`,
 * `max`, `sum` or `count` have the instance scope; every other entry has the
 * series scope, and is computed one time for each series.
 *
 * @module displayset/displaySetContext
 */

import { asArray, logging } from '@cornerstonejs/utils';
import {
  at,
  collectReads,
  compileExpressionAt,
  FORBIDDEN_PROPERTIES,
  hasNoValue,
  invalidAt,
  isUnsafeKey,
  matchForm,
  parseExpressionSource,
  parseTemplate,
  readOwn,
} from '../safeFunctions';
import type {
  CompiledExpression,
  ExpressionRead,
  SchemaSite,
  TemplateSegment,
} from '../safeFunctions';
import { resolveHexFromKeyword } from '../utilities/Tags';
import { isEcgInstance } from './isEcgInstance';
import { isImageInstance } from './isImageInstance';
import { isVideoInstance } from './isVideoInstance';
import { isWsiInstance } from './isWsiInstance';
import { instanceKey } from './seriesFunctions';
import { ATTRIBUTE_ONLY_NAMES, splitRuleSchema } from './splitRuleSchema';
import type {
  NaturalizedInstance,
  SeriesContext,
  SeriesFacts,
  SeriesFieldScope,
  SeriesFunction,
  SeriesFunctionDefinition,
} from './types';

const log = logging.metadataLog.getLogger('displayset', 'displaySetContext');

/** The values of the context, as a code entry reads them: `values.sliceIndex`. */
export type ContextValues = Readonly<Record<string, unknown>>;

/** A code entry with the instance scope. */
export type InstanceContextFunction = (
  instance: NaturalizedInstance,
  values: ContextValues
) => unknown;

/** A group entry: one call of a series function. */
export type ContextGroupEntry = {
  function: string | SeriesFunction | SeriesFunctionDefinition;
  args?: Record<string, unknown>;
};

/** One entry of a display set context. See the module documentation. */
export type ContextEntry =
  | number
  | boolean
  | null
  | unknown[]
  | string
  | { attribute: string; vr?: string; vm?: string }
  | { template: string }
  | ContextGroupEntry
  | InstanceContextFunction;

/** A map of context names to entries: `displaySetContext`, or a rule `context`. */
export type DisplaySetContext = Readonly<Record<string, ContextEntry>>;

/** The series fact under which a split keeps the values of the context. */
export const DISPLAY_SET_CONTEXT_FACT = 'displaySetContext';

/**
 * The default display set context. The default rules, the example modules and
 * a site's own rules read these names.
 *
 * - `timeClusters` and `planeGeometry` are groups; their aliases give names to
 *   the result fields. A rule changes an argument (`timeClustersMaxGap`) or
 *   selects another group (`"timeClusters": "longTimeClusters"`) in its
 *   `context`, and every alias follows.
 * - `isImage`, `isVideo`, `isEcg`, `isWsi` and `isStackImage` are code
 *   entries: SOP class heuristics that data cannot state.
 * - `imageId` declares the synthetic attribute that the series functions read.
 */
export const defaultDisplaySetContext: DisplaySetContext = Object.freeze({
  timeClustersMaxGap: 30,
  timeClusters: {
    function: 'timeClusters',
    args: { maxGap: 'timeClustersMaxGap' },
  },
  longTimeClusters: { function: 'timeClusters', args: { maxGap: 60 } },
  sweepCount: 'timeClusters.clusters',
  sweepStart: 'timeClusters.start',
  acquisitionSeconds: 'timeClusters.time',
  sweepOffset: 'round(sweepStart - timeClusters.first)',

  planeGeometryTolerance: 0.1,
  planeGeometry: {
    function: 'planeGeometry',
    args: { tolerance: 'planeGeometryTolerance' },
  },
  sliceSpacing: 'planeGeometry.spacing',
  sliceIndex: 'planeGeometry.index',
  sliceDistance: 'planeGeometry.distance',

  seriesInstanceCount: 'count()',
  isMultiFrame: 'NumberOfFrames > 1',

  imageId: { attribute: 'imageId' },

  isImage: (instance: NaturalizedInstance) => isImageInstance(instance),
  isVideo: (instance: NaturalizedInstance) => isVideoInstance(instance),
  isEcg: (instance: NaturalizedInstance) => isEcgInstance(instance),
  isWsi: (instance: NaturalizedInstance) => isWsiInstance(instance),
  /** An image for a stack viewport: not a video, a waveform or a whole slide. */
  isStackImage: (instance: NaturalizedInstance) =>
    isImageInstance(instance) &&
    !isVideoInstance(instance) &&
    !isEcgInstance(instance) &&
    !isWsiInstance(instance),
});

const CONTEXT_NAME = /^[a-z][A-Za-z0-9_]*$/;
const HEX_TAG = /^[0-9A-Fa-f]{8}$/;

/** True when the name is a keyword of the DICOM dictionary of dcmjs. */
export function isTagKeyword(name: string): boolean {
  return resolveHexFromKeyword(name) !== undefined;
}

type Scope = SeriesFieldScope;

const EXPRESSION_SCOPE = Object.freeze({
  params: Object.freeze(['#values', '#instances']),
  implicitScope: '#values',
  over: '#instances',
});

/** One argument of a group: a fixed value, or an expression. */
type GroupArgument = {
  name: string;
  fixed?: unknown;
  evaluate?: CompiledExpression;
  reads: ExpressionRead[];
};

/** One parsed entry of one layer (the global context, or a rule context). */
type Definition = {
  name: string;
  /** The rule of a rule entry; undefined for a global entry. */
  ruleId?: string;
  site: SchemaSite;
  /** Equal for two entries with the same data, for the cache key. */
  identity: string;
  kind: 'fixed' | 'declaration' | 'expression' | 'template' | 'group' | 'code';
  reads: ExpressionRead[];
  value?: unknown;
  attribute?: string;
  evaluate?: CompiledExpression;
  /** An expression that is one bare name: a candidate alias of a group. */
  aliasOf?: string;
  segments?: TemplateSegment[];
  compute?: SeriesFunction;
  fields?: Readonly<Record<string, Scope>>;
  args?: GroupArgument[];
  fn?: InstanceContextFunction;
};

/** What a name in an entry or a rule reads. */
type Dependency =
  | { kind: 'keyword' }
  | { kind: 'attribute' }
  | { kind: 'entry'; bound: Bound };

/** Extra values of a place: the attribute-only names of `attributes`. */
type Extras = Readonly<Record<string, unknown>>;

/**
 * One entry bound into the context of one rule: its scope, its dependencies,
 * and its cache key. Rules whose replacements do not reach an entry share one
 * bound entry, and so one computation for each series.
 */
type Bound = {
  key: string;
  name: string;
  scope: Scope;
  /** Set when the value is the result of a series function. */
  group?: { fields?: Readonly<Record<string, Scope>> };
  deps: Map<string, Dependency>;
  /** The names that the rule replaces and that this entry reads. */
  closure: ReadonlySet<string>;
  /** For a code entry: the layer that resolves the names it reads at run time. */
  layer?: ContextLayer;
  compute: (
    runtime: ContextRuntime,
    instance: NaturalizedInstance | undefined
  ) => unknown;
};

/** The reader of one name at one place of a rule. */
export type ContextReader = (
  runtime: ContextRuntime,
  instance: NaturalizedInstance | undefined,
  extras?: Extras
) => unknown;

let functionCount = 0;
const functionIds = new WeakMap<object, string>();

/** A text that is equal for two entries with the same data. */
function identityOf(raw: unknown): string {
  return JSON.stringify(raw, (_key, value) => {
    if (typeof value !== 'function') {
      return value;
    }
    let id = functionIds.get(value);
    if (!id) {
      id = `#function${++functionCount}`;
      functionIds.set(value, id);
    }
    return id;
  });
}

function hasOwn(object: object | undefined, key: string): boolean {
  return !!object && Object.prototype.hasOwnProperty.call(object, key);
}

/** The message for a name that is not a tag keyword and not a context name. */
function unknownName(name: string, place: string): string {
  let hint: string;
  if (HEX_TAG.test(name)) {
    hint = `a hex tag needs a declaration in the context, e.g. "myValue": { "attribute": "${name}" }`;
  } else if (/^[a-z]/.test(name)) {
    hint = 'no context entry has this name';
  } else {
    hint = `it is not a keyword of the DICOM dictionary; a private, vendor or synthetic attribute needs a declaration, e.g. "myValue": { "attribute": "${name}" }`;
  }
  const fixedText =
    place === 'attributes'
      ? `; fixed text is { "template": ${JSON.stringify(name)} }`
      : '';
  return `unknown name '${name}': ${hint}${fixedText}`;
}

/** Throws for a context name that the rules do not allow. */
function checkContextName(name: string, site: SchemaSite): void {
  if (isUnsafeKey(name) || FORBIDDEN_PROPERTIES.has(name)) {
    invalidAt(site, `the context name "${name}" is not allowed`);
  }
  if (isTagKeyword(name)) {
    invalidAt(
      site,
      `the context name '${name}' is a DICOM keyword; a context cannot hide a value of the instance`
    );
  }
  if (!CONTEXT_NAME.test(name)) {
    invalidAt(
      site,
      `the context name '${name}' must start with a lowercase letter, and hold only letters, digits and _`
    );
  }
  if ((ATTRIBUTE_ONLY_NAMES as readonly string[]).includes(name)) {
    invalidAt(
      site,
      `'${name}' is a value of the display set, and cannot be a context name`
    );
  }
}

/** Parses one expression at a site: the compiled function and its reads. */
function parseExpression(
  source: string,
  site: SchemaSite
): { evaluate: CompiledExpression; reads: ExpressionRead[]; single?: string } {
  const evaluate = compileExpressionAt(source, site, EXPRESSION_SCOPE);
  const ast = parseExpressionSource(source);
  return {
    evaluate,
    reads: collectReads(ast, { aggregates: true }),
    single: ast.type === 'identifier' ? ast.name : undefined,
  };
}

function isFixedValue(raw: unknown): boolean {
  return (
    raw === null ||
    typeof raw === 'boolean' ||
    (typeof raw === 'number' && Number.isFinite(raw)) ||
    Array.isArray(raw)
  );
}

/**
 * The values of the display set context for one split: the instances of the
 * series, and one cache for each compiled rule set. A split keeps it as the
 * series fact {@link DISPLAY_SET_CONTEXT_FACT}, so every rule of the split, and
 * a later sort of a display set, reads the same values.
 */
export class DisplaySetContextValues {
  private readonly runtimes = new WeakMap<ContextProgram, ContextRuntime>();

  constructor(readonly instances: readonly NaturalizedInstance[]) {}

  /** The cache of one compiled rule set. */
  runtime(program: ContextProgram): ContextRuntime {
    let runtime = this.runtimes.get(program);
    if (!runtime) {
      runtime = new ContextRuntime(this.instances);
      this.runtimes.set(program, runtime);
    }
    return runtime;
  }
}

/**
 * The values of one compiled rule set for one split. A value is computed at
 * the first read, and kept: a series value once for the series, an instance
 * value once for each instance.
 */
export class ContextRuntime {
  private readonly seriesValues = new Map<string, unknown>();
  private readonly instanceValues = new Map<
    NaturalizedInstance,
    Map<string, unknown>
  >();
  private readonly views = new Map<NaturalizedInstance, Map<string, unknown>>();
  private readonly envs = new Map<
    string,
    Map<NaturalizedInstance | undefined, object>
  >();
  private readonly instanceEnvs = new Map<string, object[]>();

  constructor(readonly instances: readonly NaturalizedInstance[]) {}

  /** The value of a bound entry: for the series, or for one instance. */
  value(bound: Bound, instance: NaturalizedInstance | undefined): unknown {
    if (bound.scope === 'series') {
      if (!this.seriesValues.has(bound.key)) {
        this.seriesValues.set(bound.key, bound.compute(this, undefined));
      }
      return this.seriesValues.get(bound.key);
    }
    if (!instance) {
      return undefined;
    }
    let values = this.instanceValues.get(instance);
    if (!values) {
      values = new Map();
      this.instanceValues.set(instance, values);
    }
    if (!values.has(bound.key)) {
      values.set(bound.key, bound.compute(this, instance));
    }
    return values.get(bound.key);
  }

  /**
   * The result of a group as one instance sees it: a series field as is, and
   * an instance field as the value of that instance.
   */
  groupView(bound: Bound, instance: NaturalizedInstance | undefined): unknown {
    const result = this.value(bound, instance);
    const fields = bound.group?.fields;
    if (!instance || !fields || !result || typeof result !== 'object') {
      return result;
    }
    let views = this.views.get(instance);
    if (!views) {
      views = new Map();
      this.views.set(instance, views);
    }
    if (!views.has(bound.key)) {
      const key = instanceKey(instance);
      const view: Record<string, unknown> = Object.create(null);
      for (const [field, scope] of Object.entries(fields)) {
        const value = readOwn(result, field);
        view[field] =
          scope === 'instance'
            ? key === undefined
              ? undefined
              : readOwn(value, key)
            : value;
      }
      views.set(bound.key, view);
    }
    return views.get(bound.key);
  }

  /** The value of a dependency, read by `name`. */
  read(
    name: string,
    dependency: Dependency | undefined,
    instance: NaturalizedInstance | undefined,
    extras?: Extras
  ): unknown {
    if (!dependency) {
      return undefined;
    }
    switch (dependency.kind) {
      case 'keyword':
        return instance ? readOwn(instance, name) : undefined;
      case 'attribute':
        return readOwn(extras, name);
      case 'entry':
        return dependency.bound.group
          ? this.groupView(dependency.bound, instance)
          : this.value(dependency.bound, instance);
    }
  }

  /**
   * The names that an entry reads, as the implicit scope of its expression:
   * for the series, or for one instance.
   */
  env(
    bound: Pick<Bound, 'key' | 'deps' | 'layer'>,
    instance: NaturalizedInstance | undefined,
    extras?: Extras
  ): object {
    const cacheable = !extras;
    let byInstance = cacheable ? this.envs.get(bound.key) : undefined;
    const cached = byInstance?.get(instance);
    if (cached) {
      return cached;
    }
    const env = new Proxy(Object.create(null), {
      has: () => true,
      get: (_target, name) => {
        if (typeof name !== 'string') {
          return undefined;
        }
        const dependency =
          bound.deps.get(name) ?? bound.layer?.dynamicDependency(name);
        return this.read(name, dependency, instance, extras);
      },
    });
    if (cacheable) {
      if (!byInstance) {
        byInstance = new Map();
        this.envs.set(bound.key, byInstance);
      }
      byInstance.set(instance, env);
    }
    return env;
  }

  /** The instance environments of an entry, for the aggregates. */
  envsOf(
    bound: Pick<Bound, 'key' | 'deps' | 'layer'>,
    instances: readonly NaturalizedInstance[] = this.instances,
    extras?: Extras
  ): object[] {
    if (extras || instances !== this.instances) {
      return instances.map((instance) => this.env(bound, instance, extras));
    }
    let envs = this.instanceEnvs.get(bound.key);
    if (!envs) {
      envs = instances.map((instance) => this.env(bound, instance));
      this.instanceEnvs.set(bound.key, envs);
    }
    return envs;
  }
}

/**
 * The context of one rule: the global entries, and the entries of the rule
 * `context`, which replace or add names for this rule only.
 */
export class ContextLayer {
  readonly memo = new Map<Definition, Bound>();
  private readonly dynamic = new Map<string, Dependency | undefined>();

  constructor(
    readonly program: ContextProgram,
    readonly ruleId: string | undefined,
    readonly local: ReadonlyMap<string, Definition>
  ) {}

  /**
   * The entry that a name gives, read from `from`. An entry of the rule that
   * reads its own name gets the global entry.
   */
  resolve(name: string, from?: Definition): Definition | undefined {
    if (from && from.ruleId !== undefined && from.name === name) {
      return this.program.global.get(name);
    }
    return this.local.get(name) ?? this.program.global.get(name);
  }

  /** A dependency of a code entry, resolved at the first read. */
  dynamicDependency(name: string): Dependency | undefined {
    if (!this.dynamic.has(name)) {
      let dependency: Dependency | undefined;
      if (isTagKeyword(name)) {
        dependency = { kind: 'keyword' };
      } else {
        const definition = this.resolve(name);
        if (definition) {
          dependency = {
            kind: 'entry',
            bound: this.program.bind(definition, this, []),
          };
        } else if ((ATTRIBUTE_ONLY_NAMES as readonly string[]).includes(name)) {
          dependency = { kind: 'attribute' };
        }
      }
      this.dynamic.set(name, dependency);
    }
    return this.dynamic.get(name);
  }
}

/** Options of {@link ContextProgram}. */
export type ContextProgramOptions = {
  seriesFunctions: Readonly<
    Record<string, SeriesFunction | SeriesFunctionDefinition>
  >;
  /** The site of the global context, for the messages. */
  site: SchemaSite;
};

/**
 * One compiled display set context: the global entries, the bound entries
 * of every rule, and the `series` hook that gives a split its values.
 */
export class ContextProgram {
  readonly global = new Map<string, Definition>();
  private readonly bounds = new Map<string, Bound>();
  private readonly seriesFunctions: ContextProgramOptions['seriesFunctions'];
  private readonly empty: ContextLayer;

  constructor(context: unknown, options: ContextProgramOptions) {
    this.seriesFunctions = options.seriesFunctions;
    for (const definition of this.parseLayer(
      context,
      options.site,
      undefined
    )) {
      this.global.set(definition.name, definition);
    }
    this.empty = new ContextLayer(this, undefined, new Map());
    // Every global entry compiles, also an entry that no rule reads.
    for (const definition of this.global.values()) {
      this.bind(definition, this.empty, []);
    }
  }

  /**
   * The `series` hook of every compiled rule: the first rule of a split adds
   * the values of the context, and the other rules read them.
   */
  readonly seriesHook = ({ instances, series }: SeriesContext): SeriesFacts =>
    hasOwn(series, DISPLAY_SET_CONTEXT_FACT)
      ? {}
      : { [DISPLAY_SET_CONTEXT_FACT]: new DisplaySetContextValues(instances) };

  /** The runtime of a call, from the series facts of its context. */
  runtimeFrom(
    context: unknown,
    fallback: NaturalizedInstance | readonly NaturalizedInstance[]
  ): ContextRuntime {
    const values = readOwn(
      readOwn(context, 'series'),
      DISPLAY_SET_CONTEXT_FACT
    );
    const split =
      values instanceof DisplaySetContextValues
        ? values
        : new DisplaySetContextValues(
            fallback ? (asArray(fallback) as NaturalizedInstance[]) : []
          );
    return split.runtime(this);
  }

  /** The context of one rule, with its `context` block. */
  layer(ruleId: string, context: unknown, site: SchemaSite): ContextLayer {
    if (context === undefined) {
      return this.empty;
    }
    const local = new Map<string, Definition>();
    for (const definition of this.parseLayer(context, site, ruleId)) {
      local.set(definition.name, definition);
      log.debug(
        this.global.has(definition.name)
          ? `rule '${ruleId}': the context entry '${definition.name}' replaces the global entry for this rule`
          : `rule '${ruleId}': the context entry '${definition.name}' defines a new name for this rule`
      );
    }
    const layer = new ContextLayer(this, ruleId, local);
    for (const definition of local.values()) {
      this.bind(definition, layer, []);
    }
    return layer;
  }

  /**
   * The reader of a name at a place of a rule: a tag keyword, a context name,
   * or (in `attributes` only) a value of the display set. A field reads a
   * result field of a group.
   */
  readerAt(
    layer: ContextLayer,
    name: string,
    site: SchemaSite,
    options: { field?: string; place?: string } = {}
  ): ContextReader {
    const place = options.place ?? '';
    const dependency = this.dependencyOf(
      { name, field: options.field, inAggregate: false },
      undefined,
      layer,
      [],
      site,
      place
    );
    const { field } = options;
    return (runtime, instance, extras) => {
      const value = runtime.read(name, dependency, instance, extras);
      return field === undefined ? value : readOwn(value, field);
    };
  }

  /**
   * An expression of `attributes`, read over the instances of a display set.
   * A tag keyword reads the first instance, and the aggregates run over the
   * instances of the display set.
   */
  attributeExpression(
    layer: ContextLayer,
    source: string,
    site: SchemaSite
  ): (
    runtime: ContextRuntime,
    instances: readonly NaturalizedInstance[],
    extras: Extras
  ) => unknown {
    const { evaluate, reads } = parseExpression(source, site);
    const deps = new Map<string, Dependency>();
    for (const read of reads) {
      deps.set(
        read.name,
        this.dependencyOf(read, undefined, layer, [], site, 'attributes')
      );
    }
    const scope = { key: `#attribute:${site.path}`, deps };
    return (runtime, instances, extras) =>
      evaluate(
        runtime.env(scope, instances[0], extras),
        runtime.envsOf(scope, instances, extras)
      );
  }

  /**
   * Binds one entry into the context of a rule: resolves its names, infers
   * its scope, finds its cache key, and builds its computation. A loop of
   * entries is a compile error.
   */
  bind(
    definition: Definition,
    layer: ContextLayer,
    stack: Definition[]
  ): Bound {
    const memo = layer.memo.get(definition);
    if (memo) {
      return memo;
    }
    const loopStart = stack.indexOf(definition);
    if (loopStart !== -1) {
      const loop = [...stack.slice(loopStart), definition]
        .map(({ name }) => name)
        .join(' -> ');
      return invalidAt(
        definition.site,
        `the context entries form a loop: ${loop}`
      );
    }
    stack.push(definition);
    try {
      const deps = new Map<string, Dependency>();
      const closure = new Set<string>();
      if (definition.ruleId !== undefined) {
        closure.add(definition.name);
      }
      if (definition.kind === 'code') {
        // A code entry can read any name: every replacement can reach it.
        layer.local.forEach((_entry, name) => closure.add(name));
      }
      let scope: Scope =
        definition.kind === 'declaration' || definition.kind === 'code'
          ? 'instance'
          : 'series';

      for (const read of definition.reads) {
        const dependency = this.dependencyOf(
          read,
          definition,
          layer,
          stack,
          definition.site,
          'context'
        );
        deps.set(read.name, dependency);
        if (dependency.kind === 'entry') {
          dependency.bound.closure.forEach((name) => closure.add(name));
        }
        if (!read.inAggregate && readsInstance(read, dependency)) {
          scope = 'instance';
        }
      }

      if (definition.kind === 'group') {
        for (const argument of definition.args) {
          const instanceRead = argument.reads.find(
            (read) =>
              !read.inAggregate && readsInstance(read, deps.get(read.name))
          );
          if (instanceRead) {
            invalidAt(
              at(at(definition.site, 'args'), argument.name),
              `the argument must have one value for the series, but '${instanceRead.name}' has one value for each instance`
            );
          }
        }
        scope = 'series';
      }

      const replaced = [...closure].sort();
      const key = replaced.length
        ? `${definition.name}{${replaced
            .map((name) => `${name}=${layer.local.get(name)?.identity}`)
            .join(',')}}`
        : definition.name;

      let bound = this.bounds.get(key);
      if (!bound) {
        bound = this.createBound(definition, layer, key, scope, deps, closure);
        this.bounds.set(key, bound);
      }
      layer.memo.set(definition, bound);
      return bound;
    } finally {
      stack.pop();
    }
  }

  private dependencyOf(
    read: ExpressionRead,
    from: Definition | undefined,
    layer: ContextLayer,
    stack: Definition[],
    site: SchemaSite,
    place: string
  ): Dependency {
    const { name, field } = read;
    if (isTagKeyword(name)) {
      return { kind: 'keyword' };
    }
    const definition = layer.resolve(name, from);
    if (!definition) {
      if ((ATTRIBUTE_ONLY_NAMES as readonly string[]).includes(name)) {
        if (place === 'attributes') {
          return { kind: 'attribute' };
        }
        return invalidAt(
          site,
          `'${name}' is a value of the display set, and only attributes can read it`
        );
      }
      if (from && from.ruleId !== undefined && from.name === name) {
        return invalidAt(
          site,
          `the rule entry '${name}' reads its own name, but the global context has no entry '${name}'`
        );
      }
      return invalidAt(site, unknownName(name, place));
    }
    const bound = this.bind(definition, layer, stack);
    if (field !== undefined) {
      if (!bound.group) {
        return invalidAt(
          site,
          `'${name}' is not a group, so '${name}.${field}' reads nothing`
        );
      }
      const { fields } = bound.group;
      if (fields && !hasOwn(fields, field)) {
        return invalidAt(
          site,
          `the group '${name}' has no field '${field}'; fields: ${Object.keys(fields).join(', ')}`
        );
      }
    }
    return { kind: 'entry', bound };
  }

  private createBound(
    definition: Definition,
    layer: ContextLayer,
    key: string,
    scope: Scope,
    deps: Map<string, Dependency>,
    closure: ReadonlySet<string>
  ): Bound {
    const bound: Bound = {
      key,
      name: definition.name,
      scope,
      deps,
      closure,
      compute: () => undefined,
    };

    switch (definition.kind) {
      case 'fixed': {
        const { value } = definition;
        bound.compute = () => value;
        break;
      }
      case 'declaration': {
        const { attribute } = definition;
        bound.compute = (_runtime, instance) => readOwn(instance, attribute);
        break;
      }
      case 'code': {
        const { fn } = definition;
        bound.layer = layer;
        bound.compute = (runtime, instance) =>
          instance
            ? fn(instance, runtime.env(bound, instance) as ContextValues)
            : undefined;
        break;
      }
      case 'expression': {
        const target =
          definition.aliasOf !== undefined
            ? deps.get(definition.aliasOf)
            : undefined;
        if (target?.kind === 'entry' && target.bound.group) {
          // An alias of a group is the group: same result, same fields.
          const group = target.bound;
          bound.group = group.group;
          bound.scope = 'series';
          bound.compute = (runtime) => runtime.value(group, undefined);
          break;
        }
        const { evaluate } = definition;
        bound.compute = (runtime, instance) =>
          evaluate(runtime.env(bound, instance), runtime.envsOf(bound));
        break;
      }
      case 'template': {
        const parts = definition.segments.map((segment) =>
          'literal' in segment
            ? () => segment.literal
            : (runtime: ContextRuntime, instance?: NaturalizedInstance) => {
                const value = runtime.read(
                  segment.name,
                  deps.get(segment.name),
                  instance
                );
                return segment.field === undefined
                  ? value
                  : readOwn(value, segment.field);
              }
        );
        bound.compute = (runtime, instance) =>
          parts
            .map((part) => {
              const value = part(runtime, instance);
              return hasNoValue(value) ? '' : String(value);
            })
            .join('');
        break;
      }
      case 'group': {
        const { compute, args } = definition;
        bound.group = { fields: definition.fields };
        bound.compute = (runtime) => {
          const values: Record<string, unknown> = {};
          for (const argument of args) {
            values[argument.name] = argument.evaluate
              ? argument.evaluate(
                  runtime.env(bound, undefined),
                  runtime.envsOf(bound)
                )
              : argument.fixed;
          }
          return compute(runtime.instances as NaturalizedInstance[], {
            args: Object.freeze(values),
          });
        };
        break;
      }
    }
    return bound;
  }

  /** Parses the entries of one layer, and checks each name and form. */
  private parseLayer(
    context: unknown,
    site: SchemaSite,
    ruleId: string | undefined
  ): Definition[] {
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      return invalidAt(
        site,
        'expected an object of context entries, keyed by context name',
        context
      );
    }
    return Object.entries(context).map(([name, raw]) => {
      const entrySite = at(site, name);
      checkContextName(name, entrySite);
      return this.parseEntry(name, raw, entrySite, ruleId);
    });
  }

  private parseEntry(
    name: string,
    raw: unknown,
    site: SchemaSite,
    ruleId: string | undefined
  ): Definition {
    const base = { name, ruleId, site, identity: identityOf(raw) };

    if (typeof raw === 'function') {
      return {
        ...base,
        kind: 'code',
        reads: [],
        fn: raw as InstanceContextFunction,
      };
    }
    if (isFixedValue(raw)) {
      return { ...base, kind: 'fixed', reads: [], value: raw };
    }
    if (typeof raw === 'string') {
      const { evaluate, reads, single } = parseExpression(raw, site);
      return { ...base, kind: 'expression', reads, evaluate, aliasOf: single };
    }
    if (!raw || typeof raw !== 'object') {
      return invalidAt(
        site,
        'expected a fixed value (a number, a boolean, null or an array), an expression string, { attribute }, { template }, { function, args? }, or a function',
        raw
      );
    }

    const [form] = matchForm(splitRuleSchema.contextEntry, raw, site);
    const fields = raw as Record<string, unknown>;

    if (form === 'declaration') {
      if (!fields.attribute) {
        return invalidAt(at(site, 'attribute'), 'expected a non-empty string');
      }
      return {
        ...base,
        kind: 'declaration',
        reads: [],
        attribute: fields.attribute as string,
      };
    }

    if (form === 'template') {
      const segments = parseTemplate(
        fields.template as string,
        at(site, 'template')
      );
      const reads = segments.flatMap((segment) =>
        'literal' in segment
          ? []
          : [{ name: segment.name, field: segment.field, inAggregate: false }]
      );
      return { ...base, kind: 'template', reads, segments };
    }

    const { compute, fields: resultFields } = this.seriesFunctionOf(
      fields.function,
      at(site, 'function')
    );
    const args = this.parseArguments(fields.args, at(site, 'args'));
    return {
      ...base,
      kind: 'group',
      reads: args.flatMap((argument) => argument.reads),
      compute,
      fields: resultFields,
      args,
    };
  }

  private seriesFunctionOf(
    value: unknown,
    site: SchemaSite
  ): SeriesFunctionDefinition {
    if (typeof value === 'function') {
      return { compute: value as SeriesFunction };
    }
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as SeriesFunctionDefinition).compute === 'function'
    ) {
      return value as SeriesFunctionDefinition;
    }
    if (typeof value === 'string') {
      const registered = readOwn(this.seriesFunctions, value);
      if (typeof registered === 'function') {
        return { compute: registered as SeriesFunction };
      }
      if (registered && typeof registered === 'object') {
        return registered as SeriesFunctionDefinition;
      }
    }
    return invalidAt(
      site,
      `unknown series function ${JSON.stringify(value)}; known: ${Object.keys(this.seriesFunctions).join(', ') || '(none)'}`
    );
  }

  private parseArguments(args: unknown, site: SchemaSite): GroupArgument[] {
    if (args === undefined) {
      return [];
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return invalidAt(site, 'expected an object of arguments', args);
    }
    return Object.entries(args).map(([name, raw]) => {
      const argumentSite = at(site, name);
      if (isUnsafeKey(name)) {
        invalidAt(argumentSite, `the argument name "${name}" is not allowed`);
      }
      if (isFixedValue(raw)) {
        return { name, fixed: raw, reads: [] };
      }
      if (typeof raw === 'string') {
        const { evaluate, reads } = parseExpression(raw, argumentSite);
        return { name, evaluate, reads };
      }
      return invalidAt(
        argumentSite,
        'an argument is a fixed value (a number, a boolean, null or an array) or an expression string',
        raw
      );
    });
  }
}

/** True when a read gives one value for each instance. */
function readsInstance(
  read: ExpressionRead,
  dependency: Dependency | undefined
): boolean {
  if (!dependency) {
    return false;
  }
  switch (dependency.kind) {
    case 'keyword':
      return true;
    case 'attribute':
      return false;
    case 'entry': {
      const { bound } = dependency;
      if (read.field !== undefined) {
        return bound.group?.fields?.[read.field] === 'instance';
      }
      return bound.scope === 'instance';
    }
  }
}
