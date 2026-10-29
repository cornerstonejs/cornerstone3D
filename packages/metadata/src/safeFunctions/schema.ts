/**
 * The **schema** of a safe function definition: a table of the places where
 * data becomes a function, and of the forms each place accepts.
 *
 * The table is the single source of truth: the compiler reads the forms, the
 * keys and the error messages from it, and restates no key list by hand. The
 * module is generic ({@link conditionShape}, {@link matchTestShape},
 * {@link valueShape}). A consumer adds its own shapes and compilers, and
 * reuses {@link compileKey} to walk its table. See "The schema: one table,
 * strict keys" in `packages/docs/docs/concepts/safe-functions.md`.
 *
 * @module safeFunctions/schema
 */

/**
 * The variables of an expression at one place: the names bound to the call
 * arguments, and where a bare identifier that is not one of those names is
 * read.
 */
export type ExpressionScope = {
  /** Names bound to the positional arguments, e.g. `['a', 'b', 'context']`. */
  readonly params: readonly string[];
  /**
   * The parameter whose attributes a bare identifier reads - a wildcard "any
   * attribute of `instance`", so `Modality` means `instance.Modality`. `false`
   * means none: a bare identifier that is not a parameter is a compile error.
   */
  readonly implicitScope: string | false;
};

/**
 * Leaf kinds: data that is checked and kept as is, not compiled.
 *
 * - `string`, `number` (finite), `boolean`, `true` (only `true`).
 * - `scalar`: a string, a finite number or a boolean.
 * - `literal`: anything, kept as is (the "compile as is" wildcard behaviour).
 * - `priority`: a finite number, or `null`.
 * - `expression`: the source text of an expression (a string). The form that
 *   holds it compiles it with the scope of the place.
 */
export type SchemaLeafKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'true'
  | 'scalar'
  | 'literal'
  | 'priority'
  | 'expression';

/** What one key of a form holds. */
export type SchemaKey = {
  /**
   * A {@link SchemaLeafKind}, the name of a shape in the schema (`condition`,
   * `value`, ...) whose compiler builds the key's function, or `record` for a
   * nested object described by {@link SchemaKey.keys}.
   */
  readonly kind: string;
  /** The key holds an array of `kind`. */
  readonly list?: boolean;
  /** The key holds an object of `kind` values, keyed by any name. */
  readonly record?: boolean;
  /** The key may be left out. */
  readonly optional?: boolean;
  /** The allowed values of a `string` kind. */
  readonly oneOf?: readonly string[];
  /**
   * For `kind: 'record'`: the keys of the nested object. The key `'*'` allows
   * any key, and its {@link SchemaKey} says what each value holds - `literal`
   * keeps the value as is, a shape name compiles each value with that shape.
   */
  readonly keys?: Readonly<Record<string, SchemaKey>>;
  /**
   * Keys that an object form of the shape accepts at this place in addition to
   * its own keys.
   */
  readonly extraKeys?: Readonly<Record<string, SchemaKey>>;
  /**
   * `operator`: an attribute test. A form with operator keys must have exactly
   * one of them. `modifier`: an option of the operators listed in `with`.
   */
  readonly role?: 'operator' | 'modifier';
  /** For a modifier: the operators it applies to. */
  readonly with?: readonly string[];
  /**
   * The whole value of this key may be an actual function, which passes
   * through as is (a whole `matches`, a whole `attributes`).
   */
  readonly function?: boolean;
  /**
   * For a place that becomes a function: how the compiled function is called
   * and what it returns, e.g. `(instance, context) => boolean`. For a list, it
   * describes each entry. Shown in the error messages of the place.
   */
  readonly call?: string;
  /** The variables of an expression at this place (inherited by nested forms). */
  readonly expression?: ExpressionScope;
  /** Human-readable explanation. */
  readonly description?: string;
};

/** One accepted object form of a shape. */
export type SchemaForm = {
  /**
   * The key whose presence selects this form, e.g. `attribute`. A shape whose
   * only form has no `selectBy` accepts any object as that form.
   */
  readonly selectBy?: string;
  /** Every key the form allows. */
  readonly keys: Readonly<Record<string, SchemaKey>>;
  /**
   * The variables of this form's `expression` key, when the form fixes them
   * rather than inheriting the scope of the place.
   */
  readonly expression?: ExpressionScope;
  /** Human-readable explanation. */
  readonly description?: string;
};

/** Everything a place of one kind (a condition, a value, ...) accepts. */
export type SchemaShape = {
  /** The name used in messages, e.g. `condition`. */
  readonly name: string;
  /** What a bare string means here, if a string is accepted. */
  readonly string?: 'expression' | 'attribute';
  /** An actual function is accepted, and passes through as is. */
  readonly function?: boolean;
  /** The accepted object forms, in the order they are tried. */
  readonly forms: Readonly<Record<string, SchemaForm>>;
  /** The word used for a key in messages. Defaults to `key`. */
  readonly keyNoun?: string;
};

/** A table of shapes, keyed by the shape name a {@link SchemaKey.kind} uses. */
export type Schema = Readonly<Record<string, SchemaShape>>;

/** A reader of one name, compiled for a place. */
export type NameReaderFunction = (
  subject: unknown,
  context?: unknown
) => unknown;

/**
 * Gives the reader of a name at a site. `field` is the property of a path
 * (`timeClusters.start`). Throws a compile error for an unknown name.
 */
export type NameReader = (
  name: string,
  site: SchemaSite,
  field?: string
) => NameReaderFunction;

/** Compiles one fragment of a shape at a site. */
export type ShapeCompiler = (fragment: unknown, site: SchemaSite) => unknown;

/**
 * Where a fragment is being compiled: its path, the schema and compilers, and
 * the context the place gives it (the expression scope, the call signature).
 */
export type SchemaSite = {
  /** Path of the fragment, for messages, e.g. `rule 'r'.matches.Modality`. */
  readonly path: string;
  /** What is being compiled, for messages. */
  readonly definition: string;
  readonly schema: Schema;
  readonly compilers: Readonly<Record<string, ShapeCompiler>>;
  /**
   * Gives the reader of a name, or throws a compile error for a name that the
   * place does not know. Defaults to an own-property read of the subject.
   */
  readonly readName?: NameReader;
  /** The expression variables of the place. */
  readonly expression?: ExpressionScope;
  /** The call signature of the place. */
  readonly call?: string;
  /** Extra keys the place allows on this fragment (see {@link SchemaKey.extraKeys}). */
  readonly extraKeys?: Readonly<Record<string, SchemaKey>>;
};

/**
 * The expression scope of a condition or a value when the caller gives none:
 * called `(instance, context)`, bare identifiers read the attributes of the
 * first argument.
 */
export const INSTANCE_EXPRESSION_SCOPE: ExpressionScope = Object.freeze({
  params: Object.freeze(['instance', 'context']),
  implicitScope: 'instance',
});

/**
 * True when the object has the key as an own property. A definition names
 * attributes; a name like `constructor` or `toString` must read the own value
 * of the subject (so usually `undefined`), never a member of
 * `Object.prototype`.
 */
export function hasOwn(object: unknown, key: string): boolean {
  return (
    object != null &&
    (typeof object === 'object' || typeof object === 'function') &&
    Object.prototype.hasOwnProperty.call(object, key)
  );
}

/** Reads an own property only. See {@link hasOwn}. */
export function readOwn(object: unknown, key: string): unknown {
  return hasOwn(object, key)
    ? (object as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Freezes a JSON-like value and every object or array in it, and returns the
 * value. A value that is already frozen is not visited again.
 */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

/**
 * Is `key` a key that a plain object cannot store? `result['__proto__'] = v`
 * replaces the prototype of `result` instead of adding an entry, so a
 * definition keyed by `__proto__` (a real own key after `JSON.parse`) would
 * silently lose that entry. A compiler rejects such a key, so that the
 * definition fails with an error rather than lose an entry.
 */
export function isUnsafeKey(key: string): boolean {
  return key === '__proto__';
}

function stringify(fragment: unknown): string {
  if (typeof fragment === 'function') {
    return '<function>';
  }
  try {
    return JSON.stringify(fragment) ?? String(fragment);
  } catch {
    return String(fragment);
  }
}

/**
 * Throws a compile error at a site: `Invalid <definition>: <path>: <message>`,
 * with the fragment appended when one is given.
 */
/**
 * An error of the rule data: a compile error, or a loop of context entries
 * that a code entry makes at run time. It names the definition and the path.
 * A compiled expression does not catch it, so it reaches the caller.
 */
export class RuleCompileError extends Error {
  constructor(
    readonly definition: string,
    readonly path: string,
    message: string
  ) {
    super(message);
    this.name = 'RuleCompileError';
  }
}

export function invalidAt(
  site: Pick<SchemaSite, 'path' | 'definition'>,
  message: string,
  ...fragment: unknown[]
): never {
  const where = site.path ? `${site.path}: ` : '';
  const what = fragment.length ? `: ${stringify(fragment[0])}` : '';
  throw new RuleCompileError(
    site.definition,
    site.path,
    `Invalid ${site.definition}: ${where}${message}${what}`
  );
}

/**
 * `; did you mean 'notNull'?` when a candidate equals the name with case
 * ignored, else an empty string. Names are case sensitive, so the message
 * names the correct one.
 */
export function didYouMean(
  name: string,
  candidates: Iterable<string | undefined>
): string {
  const lower = name.toLowerCase();
  for (const candidate of candidates) {
    if (candidate && candidate !== name && candidate.toLowerCase() === lower) {
      return `; did you mean '${candidate}'?`;
    }
  }
  return '';
}

/** The site of a nested key or list entry. Drops the place-only extras. */
export function at(
  site: SchemaSite,
  key: string | number,
  spec?: SchemaKey
): SchemaSite {
  const path =
    typeof key === 'number'
      ? `${site.path}[${key}]`
      : site.path
        ? `${site.path}.${key}`
        : key;
  return {
    ...site,
    path,
    extraKeys: undefined,
    expression: spec?.expression ?? site.expression,
    call: spec?.call ?? site.call,
  };
}

const LEAF_KINDS = new Set<string>([
  'string',
  'number',
  'boolean',
  'true',
  'scalar',
  'literal',
  'priority',
  'expression',
]);

/** True when `kind` is a {@link SchemaLeafKind}. */
export function isLeafKind(kind: string): kind is SchemaLeafKind {
  return LEAF_KINDS.has(kind);
}

const LEAF_CHECKS: Record<SchemaLeafKind, [string, (v: unknown) => boolean]> = {
  string: ['a string', (v) => typeof v === 'string'],
  expression: ['an expression string', (v) => typeof v === 'string'],
  number: [
    'a finite number',
    (v) => typeof v === 'number' && Number.isFinite(v),
  ],
  boolean: ['a boolean', (v) => typeof v === 'boolean'],
  true: ['true', (v) => v === true],
  scalar: [
    'a string, a finite number or a boolean',
    (v) =>
      typeof v === 'string' ||
      typeof v === 'boolean' ||
      (typeof v === 'number' && Number.isFinite(v)),
  ],
  literal: ['any value', () => true],
  priority: [
    'a finite number, or null',
    (v) => v === null || (typeof v === 'number' && Number.isFinite(v)),
  ],
};

function checkLeaf(
  spec: SchemaKey,
  value: unknown,
  site: SchemaSite,
  label = 'value'
): void {
  const [expected, test] = LEAF_CHECKS[spec.kind as SchemaLeafKind];
  if (!test(value)) {
    invalidAt(site, `expected ${expected}`, value);
  }
  if (spec.oneOf && !spec.oneOf.includes(value as string)) {
    invalidAt(
      site,
      `unknown ${label} ${stringify(value)}; allowed: ${spec.oneOf.join(', ')}`
    );
  }
}

/** Short text for one form, e.g. `{ attribute, number?, descending? }`. */
export function describeForm(
  form: SchemaForm,
  scope?: ExpressionScope
): string {
  const names: string[] = [];
  const operators: string[] = [];
  for (const [key, spec] of Object.entries(form.keys)) {
    if (spec.role === 'operator') {
      operators.push(key);
      continue;
    }
    if (key === '*') {
      names.push('<any key>');
      continue;
    }
    names.push(spec.optional || spec.role === 'modifier' ? `${key}?` : key);
  }
  if (operators.length) {
    // Just after the selecting key: `{ attribute, <one of ...>, ignoreCase? }`.
    names.splice(1, 0, `<one of ${operators.join(' | ')}>`);
  }
  const text = `{ ${names.join(', ')} }`;
  const expressionScope =
    form.expression ?? ('expression' in form.keys ? scope : undefined);
  return expressionScope
    ? `${text} called with (${expressionScope.params.join(', ')})`
    : text;
}

/**
 * Text that lists every form a shape accepts at a site, e.g.
 * `{ attribute, number?, descending? }, { expression } called with (a, b,
 * context), or a function (a, b, context) => number`.
 */
export function describeShape(shape: SchemaShape, site?: SchemaSite): string {
  const scope = site?.expression;
  const parts: string[] = [];
  if (shape.string === 'expression') {
    parts.push(
      scope
        ? `an expression string called with (${scope.params.join(', ')})`
        : 'an expression string'
    );
  } else if (shape.string === 'attribute') {
    parts.push('a name (a DICOM keyword or a context name)');
  }
  for (const form of Object.values(shape.forms)) {
    parts.push(describeForm(form, scope));
  }
  if (shape.function) {
    parts.push(site?.call ? `a function ${site.call}` : 'a function');
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return `${parts.slice(0, -1).join(', ')}, or ${parts[parts.length - 1]}`;
}

/** Throws the "not a form this place accepts" error. */
export function unrecognized(
  shape: SchemaShape,
  fragment: unknown,
  site: SchemaSite
): never {
  return invalidAt(
    site,
    `unrecognized ${shape.name}; expected ${describeShape(shape, site)}`,
    fragment
  );
}

/**
 * Selects the form of an object fragment: the first form whose `selectBy` key
 * the fragment has, else the form without a `selectBy`. Throws when there is
 * none.
 */
export function selectForm(
  shape: SchemaShape,
  fragment: unknown,
  site: SchemaSite
): [string, SchemaForm] {
  if (fragment && typeof fragment === 'object' && !Array.isArray(fragment)) {
    let fallback: [string, SchemaForm] | undefined;
    for (const entry of Object.entries(shape.forms)) {
      const { selectBy } = entry[1];
      if (selectBy === undefined) {
        fallback ??= entry;
      } else if (Object.prototype.hasOwnProperty.call(fragment, selectBy)) {
        return entry;
      }
    }
    if (fallback) {
      return fallback;
    }
  }
  return unrecognized(shape, fragment, site);
}

/**
 * Checks the keys of an object fragment against a form: no unknown key, every
 * required key present, exactly one operator, modifiers only with their
 * operators, and leaf values of the right kind. Keys that hold a shape or a
 * record are checked when {@link compileKey} compiles them.
 */
export function checkForm(
  form: SchemaForm,
  fragment: Record<string, unknown>,
  site: SchemaSite,
  keyNoun = 'key'
): void {
  const allowed: Record<string, SchemaKey> = {
    ...form.keys,
    ...site.extraKeys,
  };
  const wildcard = allowed['*'];

  for (const key of Object.keys(fragment)) {
    if (!Object.prototype.hasOwnProperty.call(allowed, key) && !wildcard) {
      invalidAt(
        site,
        `unknown ${keyNoun} '${key}'${didYouMean(key, Object.keys(allowed))}; allowed: ${Object.keys(allowed).join(', ')}`
      );
    }
  }

  const operators: string[] = [];
  let hasOperatorKeys = false;
  for (const [key, spec] of Object.entries(allowed)) {
    if (key === '*') {
      continue;
    }
    if (spec.role === 'operator') {
      hasOperatorKeys = true;
    }
    const present =
      Object.prototype.hasOwnProperty.call(fragment, key) &&
      fragment[key] !== undefined;
    if (!present) {
      if (!spec.optional && !spec.role) {
        invalidAt(site, `missing ${keyNoun} '${key}'`, fragment);
      }
      continue;
    }
    if (spec.role === 'operator') {
      operators.push(key);
    }
    if (isLeafKind(spec.kind)) {
      const keySite = at(site, key, spec);
      if (spec.list) {
        const list = fragment[key];
        if (!Array.isArray(list)) {
          invalidAt(keySite, 'expected an array', list);
        }
        list.forEach((entry, index) =>
          checkLeaf(spec, entry, at(keySite, index), key)
        );
      } else {
        checkLeaf(spec, fragment[key], keySite, key);
      }
    }
  }

  if (hasOperatorKeys) {
    const all = Object.entries(allowed)
      .filter(([, spec]) => spec.role === 'operator')
      .map(([key]) => key);
    const subject = form.selectBy
      ? `${form.selectBy} ${stringify(fragment[form.selectBy])}`
      : 'this form';
    if (!operators.length) {
      invalidAt(
        site,
        `no operator for ${subject}; expected exactly one of: ${all.join(', ')}`,
        fragment
      );
    }
    if (operators.length > 1) {
      invalidAt(
        site,
        `more than one operator for ${subject} (${operators.join(', ')}); expected exactly one of: ${all.join(', ')}`,
        fragment
      );
    }
  }

  for (const [key, spec] of Object.entries(allowed)) {
    if (
      spec.role === 'modifier' &&
      fragment[key] !== undefined &&
      spec.with &&
      !spec.with.some((operator) => operators.includes(operator))
    ) {
      invalidAt(
        site,
        `'${key}' applies only with ${spec.with.join(', ')}`,
        fragment
      );
    }
  }
}

/**
 * Compiles the value of one key as its {@link SchemaKey} says: a leaf is
 * checked and kept as is, a list is compiled entry by entry, a `record` key by
 * key (with `'*'` wildcards), and a shape by the compiler registered for it.
 * An actual function passes through as is where the key or the shape accepts
 * one.
 */
export function compileKey(
  spec: SchemaKey,
  value: unknown,
  site: SchemaSite
): unknown {
  if (spec.function && typeof value === 'function') {
    return value;
  }

  if (spec.list) {
    if (!Array.isArray(value)) {
      if (isLeafKind(spec.kind)) {
        return invalidAt(site, 'expected an array', value);
      }
      const shape = site.schema[spec.kind];
      const entries = shape ? describeShape(shape, site) : spec.kind;
      return invalidAt(
        site,
        spec.function
          ? `expected an array of (${entries}), or a function${site.call ? ` ${site.call}` : ''}`
          : `expected an array of (${entries})`,
        value
      );
    }
    const entrySpec = { ...spec, list: false, function: false };
    return value.map((entry, index) =>
      compileKey(entrySpec, entry, at(site, index))
    );
  }

  if (isLeafKind(spec.kind)) {
    checkLeaf(spec, value, site);
    return value;
  }

  if (spec.kind === 'record') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return invalidAt(site, 'expected an object', value);
    }
    const keys = spec.keys ?? {};
    checkForm({ keys }, value as Record<string, unknown>, site);
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (isUnsafeKey(key)) {
        return invalidAt(
          at(site, key),
          `the key "${key}" is not allowed`,
          value
        );
      }
      const entrySpec = Object.prototype.hasOwnProperty.call(keys, key)
        ? keys[key]
        : keys['*'];
      result[key] = compileKey(entrySpec, entry, at(site, key, entrySpec));
    }
    return result;
  }

  const shape = site.schema[spec.kind];
  const compiler = site.compilers[spec.kind];
  if (!shape || !compiler) {
    return invalidAt(site, `the schema has no compiler for '${spec.kind}'`);
  }
  if (shape.function && typeof value === 'function') {
    return value;
  }
  return compiler(value, { ...site, extraKeys: spec.extraKeys });
}

/**
 * Checks an object fragment against the form of a shape it selects, and
 * returns the form name. The shared first step of every shape compiler.
 */
export function matchForm(
  shape: SchemaShape,
  fragment: unknown,
  site: SchemaSite
): [string, SchemaForm] {
  const [name, form] = selectForm(shape, fragment, site);
  checkForm(form, fragment as Record<string, unknown>, site, shape.keyNoun);
  return [name, form];
}

/**
 * The operators of a test in a condition map, with the names of the OHIF
 * hanging protocol constraints. Each operator has one meaning in the rule
 * language; see `matchTests.ts` for the meaning and the operand of each.
 */
export const MATCH_OPERATOR_NAMES = Object.freeze([
  'equals',
  'doesNotEqual',
  'notNull',
  'includes',
  'doesNotInclude',
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'range',
  'contains',
  'containsI',
  'doesNotContain',
  'doesNotContainI',
  'containsAll',
  'startsWith',
  'endsWith',
] as const);

/**
 * The object form of a test in a condition map: exactly one operator, e.g.
 * `{ "greaterThan": 1 }`. A scalar, an array and `null` are the other forms of
 * a test; the compiler handles them before it reads this shape.
 */
export const matchTestShape: SchemaShape = {
  name: 'test',
  function: true,
  keyNoun: 'operator',
  forms: {
    operator: {
      keys: Object.fromEntries(
        MATCH_OPERATOR_NAMES.map((name) => [
          name,
          { kind: 'literal', role: 'operator' },
        ])
      ),
      description: 'One operator and its operand.',
    },
  },
};

/**
 * The conditions: a map of name to test, where every entry must hold. The map
 * compiles to `(subject, context) => boolean`. An actual function passes
 * through as is.
 */
export const conditionShape: SchemaShape = {
  name: 'condition',
  function: true,
  forms: {
    map: {
      keys: { '*': { kind: 'matchTest' } },
      description:
        'A map of name to test. Every entry must hold. `{}` is true.',
    },
  },
};

/**
 * The values: readers over one subject that compile to
 * `(subject, context) => value`. A bare string is a name.
 */
export const valueShape: SchemaShape = {
  name: 'value',
  string: 'attribute',
  function: true,
  forms: {
    template: {
      selectBy: 'template',
      keys: { template: { kind: 'string' } },
      description: 'A string with `{name}` placeholders.',
    },
    expression: {
      selectBy: 'expression',
      keys: { expression: { kind: 'expression' } },
      description: 'An expression; the result is the value, not coerced.',
    },
  },
};

/** The generic safe function schema: conditions, tests and values. */
export const safeFunctionSchema: Schema = {
  condition: conditionShape,
  matchTest: matchTestShape,
  value: valueShape,
};
