/**
 * The **display set context**: the named values that the display set split
 * rules read, in addition to the DICOM keywords of the instance.
 *
 * A context name starts with a lowercase letter. The global context defines a
 * name for every rule, and the `context` of a rule defines or replaces a name
 * for that rule only. An entry is a fixed value, an expression, a declaration,
 * a template or a group; the compile infers its instance or series scope. See
 * "The display set context" in
 * `packages/docs/docs/concepts/cornerstone-metadata/display-sets.md`.
 *
 * @module displayset/displaySetContext
 */

import { asArray, logging } from '@cornerstonejs/utils';
import {
  at,
  collectReads,
  didYouMean,
  compileExpressionAt,
  FORBIDDEN_PROPERTIES,
  hasNoValue,
  hasOwn,
  invalidAt,
  isUnsafeKey,
  matchForm,
  parseExpressionSource,
  parseTemplate,
  readOwn,
  RuleCompileError,
} from '../safeFunctions';
import type {
  CompiledExpression,
  ExpressionNode,
  ExpressionRead,
  SchemaSite,
  TemplateSegment,
} from '../safeFunctions';
import { keywordIgnoringCase, resolveHexFromKeyword } from '../utilities/Tags';
import { sortInstancesCopy } from './sortInstances';
import { instanceKey } from './seriesFunctions';
import {
  bulkAnnotationSopClassUids,
  chartSopClassUids,
  ecgSopClassUids,
  encapsulatedDocumentSopClassUids,
  imageSopClassUids,
  longVideoMinFrames,
  longVideoSopClassUids,
  parametricMapSopClassUids,
  rtStructureSetSopClassUids,
  segmentationSopClassUids,
  structuredReportSopClassUids,
  videoSopClassUids,
  videoTransferSyntaxUids,
  wholeSlideSopClassUids,
} from './sopClassUidLists';
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

/**
 * A group entry: one call of a series function. It runs over the series; in
 * `sortBy` and `attributes`, `displaySet.<name>` runs it over the display set.
 */
export type ContextGroupEntry = {
  function: string | SeriesFunction | SeriesFunctionDefinition;
  args?: Record<string, unknown>;
};

/** One entry of a display set context. See the module documentation. */
export type ContextEntry =
  | number
  | boolean
  | null
  | readonly unknown[]
  | string
  | { attribute: string; vr?: string; vm?: string }
  | { template: string }
  | ContextGroupEntry
  | InstanceContextFunction;

/** A map of context names to entries: the `context` option, or a rule `context`. */
export type DisplaySetContext = Readonly<Record<string, ContextEntry>>;

/** The series fact under which a split keeps the values of the context. */
export const DISPLAY_SET_CONTEXT_FACT = 'displaySetContext';

/**
 * The default metadata context. The default rules, the example modules and a
 * site's own rules read these names. Every entry is data, so a host or a
 * server applies the same JSON overlay to it.
 *
 * - `timeClusters` and `planeGeometry` are groups; their aliases give names to
 *   the result fields. A rule changes an argument (`timeClustersMaxGap`) or
 *   selects another group (`"timeClusters": "longTimeClusters"`) in its
 *   `context`, and every alias follows.
 * - The `*SopClassUids` and `*TransferSyntaxUids` entries are the lists of
 *   `sopClassUidLists.ts`, under the same names. `isImage`, `isVideo`,
 *   `isEcg`, `isWsi` and one `is*` entry for each other kind of object test
 *   the lists; `isImageInstance` and the other code tests give the same result.
 * - `imageId` declares the synthetic attribute that the series functions read.
 */
export const defaultMetadataContext: DisplaySetContext = {
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

  // Revision chains of PredecessorDocumentsSequence, inside one series.
  revisionChains: { function: 'revisionChains' },
  revisionChainUid: 'revisionChains.active',
  isActiveRevision: 'SOPInstanceUID == revisionChainUid',

  seriesInstanceCount: 'series.instances.count()',
  isMultiFrame: 'NumberOfFrames > 1',

  imageId: { attribute: 'imageId' },

  imageSopClassUids,
  videoSopClassUids,
  videoTransferSyntaxUids,
  longVideoSopClassUids,
  longVideoMinFrames,
  ecgSopClassUids,
  wholeSlideSopClassUids,
  segmentationSopClassUids,
  rtStructureSetSopClassUids,
  parametricMapSopClassUids,
  structuredReportSopClassUids,
  encapsulatedDocumentSopClassUids,
  bulkAnnotationSopClassUids,
  chartSopClassUids,

  isImage: 'SOPClassUID in imageSopClassUids',
  transferSyntaxKnown:
    'AvailableTransferSyntaxUID != null || TransferSyntaxUID != null',
  // The same three steps as isVideoInstance. The guess skips grayscale.
  isVideo:
    'SOPClassUID in videoSopClassUids || ' +
    'AvailableTransferSyntaxUID in videoTransferSyntaxUids || ' +
    'TransferSyntaxUID in videoTransferSyntaxUids || ' +
    '(!transferSyntaxKnown && SOPClassUID in longVideoSopClassUids && ' +
    'NumberOfFrames >= longVideoMinFrames && ' +
    "!startsWith(PhotometricInterpretation, 'MONOCHROME'))",
  isEcg: 'SOPClassUID in ecgSopClassUids',
  isWsi: "SOPClassUID in wholeSlideSopClassUids || Modality == 'SM'",
  isSegmentation: 'SOPClassUID in segmentationSopClassUids',
  isRtStructureSet: 'SOPClassUID in rtStructureSetSopClassUids',
  isParametricMap: 'SOPClassUID in parametricMapSopClassUids',
  isStructuredReport: 'SOPClassUID in structuredReportSopClassUids',
  isEncapsulatedDocument: 'SOPClassUID in encapsulatedDocumentSopClassUids',
  isBulkAnnotation: 'SOPClassUID in bulkAnnotationSopClassUids',
  isChart: 'SOPClassUID in chartSopClassUids',
};

const CONTEXT_NAME = /^[a-z][A-Za-z0-9_]*$/;
/** The literals of the expression language: no context entry can have these names. */
const RESERVED_LITERALS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'defined',
]);
const HEX_TAG = /^[0-9A-Fa-f]{8}$/;

/** True when the name is a keyword of the DICOM dictionary of dcmjs. */
export function isTagKeyword(name: string): boolean {
  return resolveHexFromKeyword(name) !== undefined;
}

type Scope = SeriesFieldScope;

const DISPLAY_SETS_RESERVED =
  'displaySets aggregates are not available yet; see https://github.com/cornerstonejs/cornerstone3D/issues/3000';

/** The expression of a context entry: `series.instances.*(...)` only. */
const EXPRESSION_SCOPE = Object.freeze({
  params: Object.freeze(['#values', '#instances']),
  implicitScope: '#values',
  receivers: Object.freeze({ series: '#instances' }),
  unavailableReceivers: Object.freeze({
    displaySet:
      'displaySet.instances aggregates are available only in the { "expression" } form of attributes',
    displaySets: DISPLAY_SETS_RESERVED,
  }),
});

/** The expression of `attributes`: also `displaySet.instances.*(...)`. */
const ATTRIBUTE_EXPRESSION_SCOPE = Object.freeze({
  params: Object.freeze(['#values', '#instances', '#displaySetInstances']),
  implicitScope: '#values',
  receivers: Object.freeze({
    series: '#instances',
    displaySet: '#displaySetInstances',
  }),
  unavailableReceivers: Object.freeze({ displaySets: DISPLAY_SETS_RESERVED }),
});

/** The receivers of the aggregates: no context entry can have these names. */
const RESERVED_RECEIVERS = new Set(['series', 'displaySet', 'displaySets']);

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
  /** The VR and the VM of a declaration, recorded for a later JSON Schema. */
  vr?: string;
  vm?: string;
  evaluate?: CompiledExpression;
  /** An expression that is one bare name: a candidate alias of a group. */
  aliasOf?: string;
  segments?: TemplateSegment[];
  compute?: SeriesFunction;
  fields?: Readonly<Record<string, Scope>>;
  args?: GroupArgument[];
  fn?: InstanceContextFunction;
};

/**
 * What a name in an entry or a rule reads. `displaySet` is the `displaySet.`
 * prefix of `sortBy` and `attributes`: its fields read over the display set.
 */
type Dependency =
  | { kind: 'keyword' }
  | { kind: 'attribute' }
  | { kind: 'entry'; bound: Bound }
  | { kind: 'series'; inner: Dependency }
  | { kind: 'displaySet'; fields: Map<string, Dependency> };

/** The places where a bare name reads the series, and `displaySet.` the display set. */
const DISPLAY_SET_PLACES = new Set(['sortBy', 'attributes']);

const DISPLAY_SET_PREFIX_ONLY =
  "the 'displaySet.' prefix is valid only in sortBy and attributes";

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
  /** The rule of a rule entry; undefined for a global entry. */
  ruleId?: string;
  /**
   * True when the value can differ for each display set: a group, a code
   * entry, or an entry that reads one.
   */
  perDisplaySet: boolean;
  /** For a code entry: the layer that resolves the names it reads at run time. */
  layer?: ContextLayer;
  /** For a code entry: its definition, so that a read of its own name gets the global entry. */
  definition?: Definition;
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

/** The message for a name that is not a tag keyword and not a context name. */
function unknownName(
  name: string,
  place: string,
  candidates: Iterable<string>
): string {
  const suggestion = didYouMean(name, [
    keywordIgnoringCase(name),
    ...candidates,
  ]);
  if (suggestion) {
    return `unknown name '${name}'${suggestion}`;
  }
  let hint: string;
  if (HEX_TAG.test(name)) {
    hint = `a hex tag needs a declaration in the context, e.g. "myValue": { "attribute": "${name}" }`;
  } else if (RESERVED_LITERALS.has(name)) {
    hint = `'${name}' is a literal; write X == ${name} in a context entry`;
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
  if (RESERVED_LITERALS.has(name) || RESERVED_RECEIVERS.has(name)) {
    invalidAt(
      site,
      `'${name}' is reserved by the expression language, and cannot be a context name`
    );
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
  site: SchemaSite,
  scope:
    | typeof EXPRESSION_SCOPE
    | typeof ATTRIBUTE_EXPRESSION_SCOPE = EXPRESSION_SCOPE
): {
  evaluate: CompiledExpression;
  reads: ExpressionRead[];
  single?: string;
  ast: ExpressionNode;
} {
  const evaluate = compileExpressionAt(source, site, scope);
  const ast = parseExpressionSource(source);
  return {
    evaluate,
    reads: collectReads(ast, { aggregates: true }),
    single: ast.type === 'identifier' ? ast.name : undefined,
    ast,
  };
}

/**
 * The field names that an expression reads below a value: the property of
 * each member access, and the text of each literal string index. A computed
 * index gives `undefined`. A numeric literal index reads an element or an
 * item, and gives nothing.
 */
function propertyReads(node: ExpressionNode): Array<string | undefined> {
  const found: Array<string | undefined> = [];
  const walk = (current: ExpressionNode): void => {
    switch (current.type) {
      case 'member':
        found.push(current.property);
        walk(current.object);
        return;
      case 'index':
        if (current.index.type !== 'literal') {
          found.push(undefined);
        } else if (typeof current.index.value === 'string') {
          found.push(current.index.value);
        }
        walk(current.object);
        walk(current.index);
        return;
      case 'call':
        current.args.forEach(walk);
        return;
      case 'unary':
        walk(current.argument);
        return;
      case 'binary':
      case 'logical':
        walk(current.left);
        walk(current.right);
        return;
      case 'conditional':
        walk(current.test);
        walk(current.consequent);
        walk(current.alternate);
        return;
      case 'array':
        current.elements.forEach(walk);
        return;
      case 'template':
        current.parts.forEach(
          (part) => part.kind === 'expr' && walk(part.node)
        );
        return;
    }
  };
  walk(node);
  return found;
}

/**
 * True for a fixed value: `null`, a boolean, a finite number, or (where
 * `arrays` is true) an array.
 */
export function isFixedValue(raw: unknown, arrays = true): boolean {
  return (
    raw === null ||
    typeof raw === 'boolean' ||
    (typeof raw === 'number' && Number.isFinite(raw)) ||
    (arrays && Array.isArray(raw))
  );
}

/**
 * A fixed array as a copy that the compile owns: one stable array for each
 * compile, so a membership test can cache its `Set`, and a later change of the
 * input does not reach the compiled rules.
 */
function copyFixedValue(raw: unknown): unknown {
  return Array.isArray(raw) ? [...raw] : raw;
}

/** The text of a loop of entries, e.g. `a -> b -> a`. */
function loopText(entries: { name: string; ruleId?: string }[]): string {
  return entries
    .map(({ name, ruleId }) =>
      ruleId === undefined ? name : `${name} (rule '${ruleId}')`
    )
    .join(' -> ');
}

/**
 * The series facts for a new order of `instances`. When an instance is not in
 * the instances of the display set context of the facts (the series got new
 * instances after the split), the values are computed again over the old and
 * the new instances. Otherwise the facts are returned as they are.
 */
export function withInstances(
  series: SeriesFacts,
  instances: readonly NaturalizedInstance[]
): SeriesFacts {
  const values = readOwn(series, DISPLAY_SET_CONTEXT_FACT);
  if (!(values instanceof DisplaySetContextValues)) {
    return series;
  }
  // By key, not by object: a host can naturalize the instances again.
  const keyOf = (instance: NaturalizedInstance) =>
    instanceKey(instance) ?? instance;
  const known = new Set(values.instances.map(keyOf));
  const added = instances.filter((instance) => !known.has(keyOf(instance)));
  if (!added.length) {
    return series;
  }
  return {
    ...series,
    // The default order, as a new split of the same series gives.
    [DISPLAY_SET_CONTEXT_FACT]: new DisplaySetContextValues(
      sortInstancesCopy([...values.instances, ...added])
    ),
  };
}

/**
 * The values of the display set context for one list of instances, and one
 * cache for each compiled rule set.
 *
 * A split keeps the values of the series as the series fact
 * {@link DISPLAY_SET_CONTEXT_FACT}, so every rule of the split reads the same
 * values. In `sortBy` and `attributes`, a bare name also reads the values of
 * the split, and a `displaySet.<name>` reads the values of one display set
 * ({@link displaySetContextFor}): a series function such as `planeGeometry`
 * runs over the instances of the display set, and `series.instances.*(...)`
 * still runs over the series.
 */
export class DisplaySetContextValues {
  private readonly runtimes = new WeakMap<ContextProgram, ContextRuntime>();

  /**
   * @param instances - the instances that a series function runs over: the
   *   series, or one display set.
   * @param seriesInstances - the instances of `series.instances.*(...)`.
   *   Defaults to `instances`.
   * @param split - for one display set: the values of the split, which keep
   *   the series values that are the same for every display set.
   */
  constructor(
    readonly instances: readonly NaturalizedInstance[],
    readonly seriesInstances: readonly NaturalizedInstance[] = instances,
    private readonly split?: DisplaySetContextValues
  ) {}

  /** The cache of one compiled rule set. */
  runtime(program: ContextProgram): ContextRuntime {
    let runtime = this.runtimes.get(program);
    if (!runtime) {
      runtime = new ContextRuntime(
        this.instances,
        this.seriesInstances,
        this.split?.runtime(program)
      );
      this.runtimes.set(program, runtime);
    }
    return runtime;
  }
}

/**
 * The context values of one display set: a series function runs over
 * `instances`, and `series.instances.*(...)` over the instances of the split
 * that `series` holds. The split computes each value that does not read a
 * series function (an aggregate of `series.instances`, for example), so the
 * value is computed one time for each split. Without a split in `series`, the
 * values cover `instances` only.
 */
export function displaySetContextFor(
  series: SeriesFacts | undefined,
  instances: readonly NaturalizedInstance[]
): DisplaySetContextValues {
  const values = readOwn(series, DISPLAY_SET_CONTEXT_FACT);
  return values instanceof DisplaySetContextValues
    ? new DisplaySetContextValues(instances, values.seriesInstances, values)
    : new DisplaySetContextValues(instances);
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
  /** The entries that are in progress, in the order of the reads. */
  private readonly inProgress: {
    bound: Bound;
    instance: NaturalizedInstance | undefined;
  }[] = [];

  /**
   * @param instances - the instances that a series function runs over.
   * @param seriesInstances - the instances of `series.instances.*(...)`.
   * @param split - for the runtime of one display set: the runtime of the
   *   split, which computes and keeps each series value that is the same for
   *   every display set. So such a value is computed one time for each split.
   */
  constructor(
    readonly instances: readonly NaturalizedInstance[],
    readonly seriesInstances: readonly NaturalizedInstance[] = instances,
    private readonly split?: ContextRuntime
  ) {}

  /** The runtime of the split: a bare name in `sortBy` and `attributes` reads it. */
  get seriesRuntime(): ContextRuntime {
    return this.split ?? this;
  }

  /** The value of a bound entry: for the series, or for one instance. */
  value(bound: Bound, instance: NaturalizedInstance | undefined): unknown {
    if (bound.scope === 'series') {
      if (this.split && !bound.perDisplaySet) {
        return this.split.value(bound, undefined);
      }
      if (!this.seriesValues.has(bound.key)) {
        this.seriesValues.set(bound.key, this.compute(bound, undefined));
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
      values.set(bound.key, this.compute(bound, instance));
    }
    return values.get(bound.key);
  }

  /**
   * Computes one entry, and records it as in progress. A read of an entry
   * that is already in progress, for the same instance and at the same level
   * (the bound entry: global, or the replacement of a rule), is a loop. Only a
   * loop through a code entry gets here; the compile rejects a loop of data
   * entries.
   */
  private compute(
    bound: Bound,
    instance: NaturalizedInstance | undefined
  ): unknown {
    const start = this.inProgress.findIndex(
      (entry) => entry.bound === bound && entry.instance === instance
    );
    if (start !== -1) {
      const loop = [
        ...this.inProgress.slice(start).map((entry) => entry.bound),
        bound,
      ];
      throw new RuleCompileError(
        'display set rules',
        bound.name,
        `Invalid display set rules: the context entries form a loop: ${loopText(loop)}`
      );
    }
    this.inProgress.push({ bound, instance });
    try {
      return bound.compute(this, instance);
    } finally {
      this.inProgress.pop();
    }
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
      case 'series':
        return this.seriesRuntime.read(
          name,
          dependency.inner,
          instance,
          extras
        );
      case 'displaySet': {
        const fields: Record<string, unknown> = Object.create(null);
        dependency.fields.forEach((field, fieldName) => {
          fields[fieldName] = this.read(fieldName, field, instance, extras);
        });
        return fields;
      }
    }
  }

  /**
   * The names that an entry reads, as the implicit scope of its expression:
   * for the series, or for one instance.
   */
  env(
    bound: Pick<Bound, 'key' | 'deps' | 'layer' | 'definition'>,
    instance: NaturalizedInstance | undefined,
    extras?: Extras,
    fresh = false
  ): object {
    const cacheable = !extras && !fresh;
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
          bound.deps.get(name) ??
          bound.layer?.dynamicDependency(name, bound.definition);
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

  /**
   * The instance environments of an entry, for the aggregates. The
   * environments of the series instances come from the split when they are
   * the same for every display set.
   */
  envsOf(
    bound: Pick<
      Bound,
      'key' | 'deps' | 'layer' | 'definition' | 'perDisplaySet'
    >,
    instances: readonly NaturalizedInstance[] = this.seriesInstances,
    extras?: Extras
  ): object[] {
    if (extras || instances !== this.seriesInstances) {
      return instances.map((instance) => this.env(bound, instance, extras));
    }
    if (this.split && !bound.perDisplaySet) {
      return this.split.envsOf(bound, this.split.seriesInstances);
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
  private readonly dynamic = new Map<
    Definition | undefined,
    Map<string, Dependency | undefined>
  >();

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

  /**
   * A dependency of a code entry, resolved at the first read. `from` is the
   * code entry, so that a rule entry that reads its own name gets the global
   * entry. A name on the deny list of the host reads nothing.
   */
  dynamicDependency(name: string, from?: Definition): Dependency | undefined {
    let byName = this.dynamic.get(from);
    if (!byName) {
      byName = new Map();
      this.dynamic.set(from, byName);
    }
    if (!byName.has(name)) {
      let dependency: Dependency | undefined;
      if (this.program.isDenied(name)) {
        log.warn(
          `a code entry of the context read '${name}', which is on the deny list of the host; the read gives undefined`
        );
      } else if (isTagKeyword(name)) {
        dependency = { kind: 'keyword' };
      } else {
        const definition = this.resolve(name, from);
        if (definition) {
          dependency = {
            kind: 'entry',
            bound: this.program.bind(definition, this, []),
          };
        } else if ((ATTRIBUTE_ONLY_NAMES as readonly string[]).includes(name)) {
          dependency = { kind: 'attribute' };
        }
      }
      byName.set(name, dependency);
    }
    return byName.get(name);
  }
}

/** Options of {@link ContextProgram}. */
export type ContextProgramOptions = {
  seriesFunctions: Readonly<
    Record<string, SeriesFunction | SeriesFunctionDefinition>
  >;
  /** The site of the global context, for the messages. */
  site: SchemaSite;
  /** Names that no rule and no code entry can read (`RL-SCOPE-9`). */
  deniedNames?: readonly string[];
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
  private readonly denied: ReadonlySet<string>;
  /** The hex tags of the denied keywords, so a declaration cannot read one. */
  private readonly deniedTags: ReadonlySet<string>;
  private fallbackLogged = false;

  constructor(context: unknown, options: ContextProgramOptions) {
    this.seriesFunctions = options.seriesFunctions;
    this.denied = new Set(options.deniedNames ?? []);
    this.deniedTags = new Set(
      [...this.denied].map(resolveHexFromKeyword).filter(Boolean)
    );
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

  /** True when the host denies the name. */
  isDenied(name: string): boolean {
    return this.denied.has(name);
  }

  /**
   * Parses one expression, and applies the deny list to the reads below a
   * name. The name check sees only the first name of a path, so a field of a
   * sequence item (`OtherPatientIDsSequence[0].PatientID`) is checked here. A
   * computed field name cannot be checked, so it is a compile error when the
   * host has a deny list.
   */
  private parseExpression(
    source: string,
    site: SchemaSite,
    scope?: typeof EXPRESSION_SCOPE | typeof ATTRIBUTE_EXPRESSION_SCOPE
  ): ReturnType<typeof parseExpression> {
    const parsed = parseExpression(source, site, scope);
    if (this.denied.size) {
      for (const property of propertyReads(parsed.ast)) {
        if (property === undefined) {
          invalidAt(
            site,
            'a computed field name is not allowed when the host has a deny list; use a literal index, e.g. ViewCodeSequence[0].CodeValue'
          );
        }
        if (this.denied.has(property)) {
          invalidAt(
            site,
            `the name '${property}' is on the deny list of the host, so no rule can read it`
          );
        }
      }
    }
    return parsed;
  }

  /**
   * The runtime of a call, from its context. A context with `displaySet` (a
   * sort or the attributes of one display set) gives the runtime of that
   * display set. Else the series facts give the runtime of the split. A direct
   * call of a hook with no split context computes the values over the
   * instances of the call alone (one instance, or the pair of a comparator):
   * so a series value such as `seriesInstanceCount` is for those instances
   * only.
   */
  runtimeFrom(
    context: unknown,
    fallback: NaturalizedInstance | readonly NaturalizedInstance[]
  ): ContextRuntime {
    const displaySet = readOwn(context, 'displaySet');
    if (displaySet instanceof DisplaySetContextValues) {
      return displaySet.runtime(this);
    }
    const values = readOwn(
      readOwn(context, 'series'),
      DISPLAY_SET_CONTEXT_FACT
    );
    if (values instanceof DisplaySetContextValues) {
      return values.runtime(this);
    }
    if (!this.fallbackLogged) {
      this.fallbackLogged = true;
      log.debug(
        'a split rule hook was called with no split context; its context values cover only the instances of the call'
      );
    }
    return new DisplaySetContextValues(
      fallback ? (asArray(fallback) as NaturalizedInstance[]) : []
    ).runtime(this);
  }

  /**
   * The value of the global entry `name` for one instance, with no split: the
   * runtime covers that instance only. A series-scope entry is an error.
   */
  instanceValue(name: string, instance: NaturalizedInstance): unknown {
    const definition = this.global.get(name);
    if (!definition) {
      throw new Error(`the metadata context has no entry '${name}'`);
    }
    const bound = this.bind(definition, this.empty, []);
    if (bound.scope !== 'instance') {
      throw new Error(
        `the context entry '${name}' has the series scope, so one instance cannot give its value`
      );
    }
    return new DisplaySetContextValues([instance])
      .runtime(this)
      .read(name, { kind: 'entry', bound }, instance);
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
   *
   * In `sortBy` and `attributes`, a bare name reads the value of the series,
   * and `displaySet.<name>` (or `displaySet.<name>.<field>`) reads the value
   * over the instances of the display set. Every other place rejects the
   * prefix.
   */
  readerAt(
    layer: ContextLayer,
    name: string,
    site: SchemaSite,
    options: { field?: string; place?: string } = {}
  ): ContextReader {
    const place = options.place ?? '';
    let { field } = options;
    let target = name;
    const prefixed = name === 'displaySet' || name.startsWith('displaySet.');
    if (prefixed) {
      if (!DISPLAY_SET_PLACES.has(place)) {
        invalidAt(site, DISPLAY_SET_PREFIX_ONLY);
      }
      const path = name.split('.').slice(1);
      if (field !== undefined) {
        path.push(field);
      }
      if (!path.length || path.length > 2 || path.some((part) => !part)) {
        invalidAt(
          site,
          `'${name}' must be displaySet.<name> or displaySet.<name>.<field>, e.g. displaySet.sliceSpacing`
        );
      }
      [target, field] = path;
    }
    let dependency = this.dependencyOf(
      { name: target, field, inAggregate: false },
      undefined,
      layer,
      [],
      site,
      place
    );
    if (!prefixed && DISPLAY_SET_PLACES.has(place)) {
      dependency = { kind: 'series', inner: dependency };
    }
    return (runtime, instance, extras) => {
      const value = runtime.read(target, dependency, instance, extras);
      return field === undefined ? value : readOwn(value, field);
    };
  }

  /**
   * An expression of `attributes`, read over the instances of a display set.
   * A tag keyword reads the first instance. `series.instances.*(...)` runs
   * over the instances of the series, and `displaySet.instances.*(...)` over
   * the instances of the display set. A bare context name reads the series,
   * and `displaySet.<name>` the display set.
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
    const { evaluate, reads } = this.parseExpression(
      source,
      site,
      ATTRIBUTE_EXPRESSION_SCOPE
    );
    const deps = new Map<string, Dependency>();
    const displaySetFields = new Map<string, Dependency>();
    for (const read of reads) {
      if (read.name === 'displaySet') {
        if (read.field === undefined) {
          invalidAt(
            site,
            "'displaySet' needs a name, e.g. displaySet.sliceSpacing"
          );
        }
        displaySetFields.set(
          read.field,
          this.dependencyOf(
            { name: read.field, inAggregate: read.inAggregate },
            undefined,
            layer,
            [],
            site,
            'attributes'
          )
        );
        continue;
      }
      const dependency = this.dependencyOf(
        read,
        undefined,
        layer,
        [],
        site,
        'attributes'
      );
      deps.set(read.name, { kind: 'series', inner: dependency });
    }
    if (displaySetFields.size) {
      deps.set('displaySet', { kind: 'displaySet', fields: displaySetFields });
    }
    const perDisplaySet =
      displaySetFields.size > 0 ||
      [...deps.values()].some(
        (dependency) =>
          dependency.kind === 'series' && dependency.inner.kind === 'attribute'
      );
    const scope = { key: `#attribute:${site.path}`, deps, perDisplaySet };
    return (runtime, instances, extras) =>
      evaluate(
        runtime.env(scope, instances[0], extras),
        // With no attribute-only name, the series environments need no extras.
        perDisplaySet
          ? runtime.envsOf(scope, runtime.seriesInstances, extras)
          : runtime.envsOf(scope),
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
      // `@` keeps a rule entry apart from the global entry of the same name.
      const level = definition.ruleId === undefined ? '' : '@';
      const key = replaced.length
        ? `${level}${definition.name}{${replaced
            .map((name) => `${name}=${layer.local.get(name)?.identity}`)
            .join(',')}}`
        : `${level}${definition.name}`;

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
    if (this.denied.has(name)) {
      return invalidAt(
        site,
        `the name '${name}' is on the deny list of the host, so no rule can read it`
      );
    }
    if (name === 'displaySet') {
      return invalidAt(site, DISPLAY_SET_PREFIX_ONLY);
    }
    if (isTagKeyword(name)) {
      if (field !== undefined) {
        return invalidAt(
          site,
          `'${name}' is a DICOM keyword and has no field '${field}'; read an item of a sequence with an index, e.g. ${name}[0].${field}`
        );
      }
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
      return invalidAt(
        site,
        unknownName(name, place, [
          ...layer.local.keys(),
          ...this.global.keys(),
          ...ATTRIBUTE_ONLY_NAMES,
        ])
      );
    }
    const bound = this.bind(definition, layer, stack);
    if (read.indexed && bound.group) {
      return invalidAt(
        site,
        `read a field of the group '${name}' by path, e.g. ${name}.${Object.keys(bound.group.fields ?? {})[0] ?? 'field'}`
      );
    }
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
          `the group '${name}' has no field '${field}'${didYouMean(field, Object.keys(fields))}; fields: ${Object.keys(fields).join(', ')}`
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
      ruleId: definition.ruleId,
      // A code entry resolves its names at run time, so it can read anything.
      perDisplaySet:
        definition.kind === 'code' ||
        definition.kind === 'group' ||
        [...deps.values()].some(
          (dependency) =>
            dependency.kind === 'entry' && dependency.bound.perDisplaySet
        ),
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
        bound.definition = definition;
        // A new values wrapper for each call.
        bound.compute = (runtime, instance) =>
          instance
            ? fn(
                instance,
                runtime.env(bound, instance, undefined, true) as ContextValues
              )
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
          // In the runtime of a display set, `instances` are the display set.
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
      if (this.denied.has(name)) {
        invalidAt(
          entrySite,
          `the context name '${name}' is on the deny list of the host`
        );
      }
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
      return { ...base, kind: 'fixed', reads: [], value: copyFixedValue(raw) };
    }
    if (typeof raw === 'string') {
      const { evaluate, reads, single } = this.parseExpression(raw, site);
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
      const attribute = String(fields.attribute);
      if (
        this.denied.has(attribute) ||
        this.deniedTags.has(attribute.replace(/^x/i, '').toUpperCase())
      ) {
        return invalidAt(
          at(site, 'attribute'),
          `the attribute '${attribute}' is on the deny list of the host, so no rule can read it`
        );
      }

      return {
        ...base,
        kind: 'declaration',
        reads: [],
        attribute: fields.attribute as string,
        vr: fields.vr as string | undefined,
        vm: fields.vm as string | undefined,
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

    const definition = this.seriesFunctionOf(
      fields.function,
      at(site, 'function')
    );
    const args = this.parseArguments(fields.args, at(site, 'args'));
    return {
      ...base,
      kind: 'group',
      reads: args.flatMap((argument) => argument.reads),
      compute: definition.compute,
      fields: definition.fields,
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
        return { name, fixed: copyFixedValue(raw), reads: [] };
      }
      if (typeof raw === 'string') {
        const { evaluate, reads } = this.parseExpression(raw, argumentSite);
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
    case 'displaySet':
      return false;
    case 'series':
      return readsInstance(read, dependency.inner);
    case 'entry': {
      const { bound } = dependency;
      if (read.field !== undefined) {
        return bound.group?.fields?.[read.field] === 'instance';
      }
      return bound.scope === 'instance';
    }
  }
}
