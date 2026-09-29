/**
 * The **safe function compiler**: turns the JSON vocabulary in `types.ts` into
 * executable predicates and value readers.
 *
 * The compiled functions are *safe* because they are assembled from a closed
 * vocabulary rather than evaluated from source: there is no `eval`, no
 * `new Function`, and no other code path from definition data to executed code.
 * A definition can therefore be loaded from a config file, an HTTP response, or
 * an application's customization layer. The worst a malformed one can do is
 * throw here, at compile time, naming the offending fragment.
 *
 * The compiler is **strict**, and it reads its rules from the schema in
 * `schema.ts` ({@link conditionShape}, {@link valueShape}): an unknown key, a
 * form the place does not accept, a missing required key or a second operator
 * is a compile error that names the path of the fragment. An actual function
 * passes through as is wherever a condition or a value is expected.
 *
 * Every attribute, fact and classifier is read as an own property only, so a
 * name such as `constructor` or `toString` never reaches `Object.prototype`.
 *
 * Deliberately free of any domain knowledge — no display sets, no DICOM, no
 * application services. A consumer supplies the subject type, the named
 * classifiers, and whatever rule shape wraps these conditions and values.
 *
 * @module safeFunctions/compile
 */

import { asArrayFirst } from '@cornerstonejs/utils';
import { compileExpression } from './expression';
import {
  at,
  compileKey,
  conditionShape,
  INSTANCE_EXPRESSION_SCOPE,
  invalidAt,
  matchForm,
  readOwn,
  safeFunctionSchema,
  unrecognized,
  valueShape,
} from './schema';
import type {
  ExpressionScope,
  Schema,
  SchemaSite,
  ShapeCompiler,
} from './schema';
import type {
  ClassifierRegistry,
  CompiledPredicate,
  CompiledValue,
  RawCondition,
  RawValue,
  SafeFunctionSubject,
} from './types';

/**
 * Where a condition or a value is compiled. Every field is optional; the
 * defaults compile a stand-alone definition called `(instance, context)`.
 */
export type CompileOptions = {
  /** Path of the definition, for messages, e.g. `rule 'r'.matches`. */
  path?: string;
  /** What is being compiled, for messages. Defaults to `safe function definition`. */
  definition?: string;
  /**
   * The expression variables of the place. Defaults to
   * {@link INSTANCE_EXPRESSION_SCOPE}: called `(instance, context)`, bare
   * identifiers read the attributes of `instance`.
   */
  expression?: ExpressionScope;
  /** The call signature of the place, for messages. */
  call?: string;
};

/**
 * True when a value counts as absent. Naturalized DICOM delivers an empty
 * element as `null` or `''` as readily as `undefined`, and a condition asking
 * "does this have a b-value?" means all three.
 */
export function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * Finite numeric value of an attribute, or `undefined`.
 *
 * Deliberately not a bare `Number(...)`: that maps `null`, `''` and whitespace
 * to `0`, which would make an absent attribute compare as a real zero.
 */
export function toFinite(value: unknown): number | undefined {
  if (isAbsent(value)) {
    return undefined;
  }
  const numeric = asArrayFirst(value);
  if (
    typeof numeric === 'boolean' ||
    (typeof numeric === 'string' && numeric.trim() === '')
  ) {
    return undefined;
  }
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Compares an attribute value against a literal from the definition.
 *
 * Compares as strings so `'30'` (an IS naturalized as a string) matches `30`
 * from JSON. Multi-valued attributes compare on their first value, which is
 * what the single-valued attributes these conditions target (Modality,
 * SOPClassUID) degrade to when a source delivers them as a one-element array.
 */
export function looseEquals(value: unknown, literal: unknown): boolean {
  if (isAbsent(value)) {
    return false;
  }
  const single = asArrayFirst(value);
  return String(single) === String(literal);
}

const DEFAULT_DEFINITION = 'safe function definition';

/**
 * Throws with the offending fragment inlined - a definition is usually authored
 * by hand or shipped as config, so a mistake in it must name itself.
 */
export function invalid(message: string, fragment: unknown): never {
  return invalidAt(
    { path: '', definition: DEFAULT_DEFINITION },
    message,
    fragment
  );
}

/** The compilers of the generic shapes, keyed by shape name. */
export const safeFunctionCompilers: Record<string, ShapeCompiler> = {
  condition: (fragment, site) => compileConditionAt(fragment, site),
  value: (fragment, site) => compileValueAt(fragment, site),
};

/**
 * Builds the site of a stand-alone compile, for {@link compileCondition} and
 * {@link compileValue}.
 */
export function createSite(
  classifiers: Record<string, unknown> = {},
  options: CompileOptions = {},
  schema: Schema = safeFunctionSchema,
  compilers: Record<string, ShapeCompiler> = safeFunctionCompilers
): SchemaSite {
  return {
    path: options.path ?? '',
    definition: options.definition ?? DEFAULT_DEFINITION,
    schema,
    compilers,
    classifiers,
    expression: options.expression ?? INSTANCE_EXPRESSION_SCOPE,
    call: options.call,
  };
}

/**
 * Compiles an expression with the variables of its place. A syntax error, or
 * a bare identifier where the place has no implicit scope, throws with the
 * path of the place.
 */
export function compileExpressionAt(
  source: string,
  site: SchemaSite,
  scope: ExpressionScope = site.expression ?? INSTANCE_EXPRESSION_SCOPE
) {
  try {
    return compileExpression(source, {
      params: scope.params,
      implicitScope: scope.implicitScope,
    });
  } catch (error) {
    return invalidAt(site, (error as Error).message);
  }
}

/**
 * Compiles the `{ attribute, <operator> }` family of conditions. The keys are
 * already checked against the schema: exactly one operator is present.
 */
function compileAttributeCondition<Subject extends SafeFunctionSubject>(
  condition: Record<string, unknown>
): CompiledPredicate<Subject> {
  const attribute = condition.attribute as string;
  const read = (subject: Subject) => readOwn(subject, attribute);

  if (condition.exists !== undefined) {
    return (subject) => !isAbsent(read(subject));
  }
  if (condition.absent !== undefined) {
    return (subject) => isAbsent(read(subject));
  }
  if (condition.equals !== undefined) {
    const { equals } = condition;
    return (subject) => looseEquals(read(subject), equals);
  }
  if (condition.notEquals !== undefined) {
    const { notEquals } = condition;
    return (subject) => !looseEquals(read(subject), notEquals);
  }
  if (condition.in !== undefined) {
    // Compare as strings so the set works for both '1' and 1.
    const allowed = new Set(
      (condition.in as unknown[]).map((value) => String(value))
    );
    return (subject) => {
      const value = read(subject);
      if (isAbsent(value)) {
        return false;
      }
      return allowed.has(String(asArrayFirst(value)));
    };
  }
  if (condition.notIn !== undefined) {
    const denied = new Set(
      (condition.notIn as unknown[]).map((value) => String(value))
    );
    return (subject) => {
      const value = read(subject);
      if (isAbsent(value)) {
        return true;
      }
      return !denied.has(String(asArrayFirst(value)));
    };
  }
  if (condition.contains !== undefined || condition.containsAny !== undefined) {
    const ignoreCase = condition.ignoreCase === true;
    const needles = (
      condition.contains !== undefined
        ? [condition.contains]
        : (condition.containsAny as unknown[])
    ).map((needle) =>
      ignoreCase ? String(needle).toLowerCase() : String(needle)
    );
    return (subject) => {
      const value = read(subject);
      if (isAbsent(value)) {
        return false;
      }
      const haystackRaw = String(
        Array.isArray(value) ? value.join(' ') : value
      );
      const haystack = ignoreCase ? haystackRaw.toLowerCase() : haystackRaw;
      return needles.some((needle) => haystack.includes(needle));
    };
  }
  if (condition.greaterThan !== undefined) {
    const bound = condition.greaterThan as number;
    return (subject) => {
      const value = toFinite(read(subject));
      return value !== undefined && value > bound;
    };
  }
  const bound = condition.lessThan as number;
  return (subject) => {
    const value = toFinite(read(subject));
    return value !== undefined && value < bound;
  };
}

/**
 * Compiles a condition at a site. See {@link compileCondition}.
 */
export function compileConditionAt<Subject extends SafeFunctionSubject>(
  condition: unknown,
  site: SchemaSite
): CompiledPredicate<Subject> {
  if (typeof condition === 'function') {
    return condition as CompiledPredicate<Subject>;
  }

  // A string condition is an expression. Coerced to a boolean, because a
  // condition's contract is boolean however the expression happens to end.
  if (typeof condition === 'string') {
    const evaluate = compileExpressionAt(condition, site);
    return (subject, context) => Boolean(evaluate(subject, context));
  }

  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
    return unrecognized(conditionShape, condition, site);
  }

  const [form, spec] = matchForm(conditionShape, condition, site);
  const fields = condition as Record<string, unknown>;
  const nested = (key: string) =>
    compileKey(spec.keys[key], fields[key], at(site, key, spec.keys[key]));

  switch (form) {
    case 'expression':
      return compileConditionAt<Subject>(
        fields.expression,
        at(site, 'expression')
      );

    case 'all': {
      const parts = nested('all') as CompiledPredicate<Subject>[];
      return (subject, context) =>
        parts.every((part) => part(subject, context));
    }

    case 'any': {
      const parts = nested('any') as CompiledPredicate<Subject>[];
      return (subject, context) => parts.some((part) => part(subject, context));
    }

    case 'not': {
      const inner = nested('not') as CompiledPredicate<Subject>;
      return (subject, context) => !inner(subject, context);
    }

    case 'classifier': {
      const classifier = readOwn(site.classifiers, fields.classifier as string);
      if (typeof classifier !== 'function') {
        return invalidAt(
          site,
          `unknown classifier "${fields.classifier}"; known: ${Object.keys(site.classifiers).join(', ') || '(none)'}`,
          condition
        );
      }
      return (subject) => Boolean(classifier(subject));
    }

    case 'seriesFact': {
      const name = fields.seriesFact as string;
      return (_subject, context) => Boolean(readOwn(context?.series, name));
    }

    case 'attribute':
      return compileAttributeCondition<Subject>(fields);
  }

  return unrecognized(conditionShape, condition, site);
}

/**
 * Compiles a {@link RawCondition} into a safe predicate.
 *
 * An actual function passes through as is.
 *
 * @param condition - the condition as data.
 * @param classifiers - named classifiers the condition may reference.
 * @param options - where the condition sits, for the expression variables and
 *   the messages.
 * @throws when the condition is not a form the schema accepts.
 */
export function compileCondition<Subject extends SafeFunctionSubject>(
  condition: RawCondition,
  classifiers: ClassifierRegistry<Subject> = {},
  options: CompileOptions = {}
): CompiledPredicate<Subject> {
  return compileConditionAt<Subject>(
    condition,
    createSite(classifiers, options)
  );
}

/**
 * Compiles a `{ template: 'text {Attribute} more' }` value into a reader that
 * substitutes each `{AttributeName}` with the subject's value.
 *
 * Parsed once into literal/placeholder segments rather than re-scanned per
 * subject. Substitution is all it does - there is no arithmetic or expression
 * syntax - so a template is never a route to evaluated code. `\{` escapes a
 * literal brace; an absent attribute substitutes an empty string.
 */
export function compileTemplate<Subject extends SafeFunctionSubject>(
  template: string,
  site: Pick<SchemaSite, 'path' | 'definition'> = {
    path: '',
    definition: DEFAULT_DEFINITION,
  }
): (subject: Subject) => string {
  if (typeof template !== 'string') {
    invalidAt(site, 'template must be a string', template);
  }

  const segments: ({ literal: string } | { attribute: string })[] = [];
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
      invalidAt(site, 'template has an unclosed "{"', template);
    }
    const attribute = template.slice(i + 1, end).trim();
    if (!attribute) {
      invalidAt(site, 'template has an empty "{}" placeholder', template);
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

  return (subject) =>
    segments
      .map((segment) => {
        if ('literal' in segment) {
          return segment.literal;
        }
        const value = readOwn(subject, segment.attribute);
        return isAbsent(value) ? '' : String(value);
      })
      .join('');
}

/**
 * Compiles a value at a site. See {@link compileValue}.
 */
export function compileValueAt<Subject extends SafeFunctionSubject>(
  value: unknown,
  site: SchemaSite
): CompiledValue<Subject> {
  if (typeof value === 'function') {
    return value as CompiledValue<Subject>;
  }

  if (typeof value === 'string') {
    return (subject) => readOwn(subject, value);
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return unrecognized(valueShape, value, site);
  }

  const [form, spec] = matchForm(valueShape, value, site);
  const fields = value as Record<string, unknown>;

  switch (form) {
    case 'expression': {
      // Not coerced: in value position the expression's own result is the point.
      const evaluate = compileExpressionAt(
        fields.expression as string,
        at(site, 'expression')
      );
      return (subject, context) => evaluate(subject, context);
    }

    case 'condition':
      return compileKey(
        spec.keys.condition,
        fields.condition,
        at(site, 'condition', spec.keys.condition)
      ) as CompiledValue<Subject>;

    case 'template':
      return compileTemplate<Subject>(
        fields.template as string,
        at(site, 'template')
      );

    case 'join': {
      const { join, parts } = fields as { join: string; parts: unknown };
      if (!Array.isArray(parts) || !parts.length) {
        return invalidAt(site, 'join requires a non-empty parts array', value);
      }
      const readers = compileKey(
        spec.keys.parts,
        parts,
        at(site, 'parts', spec.keys.parts)
      ) as CompiledValue<Subject>[];
      const labels = parts.map((part) => readOwn(part, 'label'));
      return (subject, context) =>
        readers
          .map((read, index) => {
            const result = read(subject, context);
            const label = labels[index];
            return label === undefined ? String(result) : `${label}=${result}`;
          })
          .join(join);
    }

    case 'attribute': {
      const attribute = fields.attribute as string;
      const bucket = fields.bucket as number | undefined;
      if (fields.absent === true) {
        return (subject) => isAbsent(readOwn(subject, attribute));
      }
      if (bucket !== undefined) {
        if (bucket === 0) {
          return invalidAt(
            site,
            'bucket must be a non-zero finite number',
            value
          );
        }
        return (subject) => {
          const numeric = toFinite(readOwn(subject, attribute));
          return numeric === undefined
            ? undefined
            : Math.round(numeric / bucket);
        };
      }
      if (fields.number === true) {
        return (subject) => toFinite(readOwn(subject, attribute));
      }
      return (subject) => readOwn(subject, attribute);
    }
  }

  return unrecognized(valueShape, value, site);
}

/**
 * Compiles a {@link RawValue} into a safe value reader.
 *
 * An actual function passes through as is.
 *
 * @param value - the value as data.
 * @param classifiers - named classifiers a nested condition may reference.
 * @param options - where the value sits, for the expression variables and the
 *   messages.
 * @throws when the value is not a form the schema accepts.
 */
export function compileValue<Subject extends SafeFunctionSubject>(
  value: RawValue,
  classifiers: ClassifierRegistry<Subject> = {},
  options: CompileOptions = {}
): CompiledValue<Subject> {
  return compileValueAt<Subject>(value, createSite(classifiers, options));
}
