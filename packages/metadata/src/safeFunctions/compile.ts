/**
 * The **safe function compiler**: turns the JSON vocabulary in `types.ts` into
 * executable predicates and value readers, with no `eval` and no
 * `new Function`.
 *
 * The compiler is strict, and reads its rules from `schema.ts`. It does not
 * know the names of the subject: the `readName` of the site gives the reader
 * of each name, and can reject a name. The default reads an own property of
 * the subject, never `Object.prototype`. See
 * `packages/docs/docs/concepts/safe-functions.md`.
 *
 * @module safeFunctions/compile
 */

import { compileExpression } from './expression';
import { compileMatchTest } from './matchTests';
import {
  at,
  conditionShape,
  INSTANCE_EXPRESSION_SCOPE,
  invalidAt,
  isUnsafeKey,
  matchForm,
  readOwn,
  safeFunctionSchema,
  unrecognized,
  valueShape,
} from './schema';
import type {
  ExpressionScope,
  NameReader,
  NameReaderFunction,
  Schema,
  SchemaSite,
  ShapeCompiler,
} from './schema';
import type {
  CompiledPredicate,
  CompiledValue,
  RawCondition,
  RawValue,
  SafeFunctionSubject,
} from './types';
import { hasNoValue } from './values';

export {
  compareFinite,
  hasNoValue,
  isAbsent,
  isEmpty,
  isTrue,
  looseEquals,
} from './values';

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
  /** The reader of a name. Defaults to an own-property read of the subject. */
  readName?: NameReader;
};

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

/** Reads `subject[name]`, and then `[field]` of that, as own properties. */
export const readOwnName: NameReader = (name, _site, field) =>
  field === undefined
    ? (subject) => readOwn(subject, name)
    : (subject) => readOwn(readOwn(subject, name), field);

/** The compilers of the generic shapes, keyed by shape name. */
export const safeFunctionCompilers: Record<string, ShapeCompiler> = {
  condition: (fragment, site) => compileConditionAt(fragment, site),
  matchTest: (fragment, site) => compileMatchTest(fragment, site),
  value: (fragment, site) => compileValueAt(fragment, site),
};

/**
 * Builds the site of a stand-alone compile, for {@link compileCondition} and
 * {@link compileValue}.
 */
export function createSite(
  options: CompileOptions = {},
  schema: Schema = safeFunctionSchema,
  compilers: Record<string, ShapeCompiler> = safeFunctionCompilers
): SchemaSite {
  return {
    path: options.path ?? '',
    definition: options.definition ?? DEFAULT_DEFINITION,
    schema,
    compilers,
    readName: options.readName ?? readOwnName,
    expression: options.expression ?? INSTANCE_EXPRESSION_SCOPE,
    call: options.call,
  };
}

/** The reader of a name at a site. */
export function readNameAt(
  name: string,
  site: SchemaSite,
  field?: string
): NameReaderFunction {
  return (site.readName ?? readOwnName)(name, site, field);
}

/**
 * Compiles an expression with the variables of its place. A syntax error, or
 * a bare identifier where the place has no implicit scope, throws with the
 * path of the place.
 */
export function compileExpressionAt(
  source: string,
  site: SchemaSite,
  scope: ExpressionScope & {
    receivers?: Readonly<Record<string, string>>;
    unavailableReceivers?: Readonly<Record<string, string>>;
  } = site.expression ?? INSTANCE_EXPRESSION_SCOPE
) {
  try {
    return compileExpression(source, {
      params: scope.params,
      implicitScope: scope.implicitScope,
      receivers: scope.receivers,
      unavailableReceivers: scope.unavailableReceivers,
    });
  } catch (error) {
    return invalidAt(site, (error as Error).message);
  }
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
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
    return unrecognized(conditionShape, condition, site);
  }

  const entries = Object.entries(condition).map(([name, test]) => {
    const entrySite = at(site, name);
    if (isUnsafeKey(name)) {
      invalidAt(entrySite, `the name "${name}" is not allowed`, condition);
    }
    return {
      read: readNameAt(name, entrySite),
      test: compileMatchTest(test, entrySite),
    };
  });

  return (subject, context) =>
    entries.every(({ read, test }) =>
      test(read(subject, context), subject, context)
    );
}

/**
 * Compiles a {@link RawCondition} into a safe predicate: a map of name to
 * test, where every entry must hold (see `matchTests.ts` for the tests).
 *
 * An actual function passes through as is.
 *
 * @param condition - the condition as data.
 * @param options - where the condition sits, and the reader of a name.
 * @throws when the condition is not a form the schema accepts.
 */
export function compileCondition<Subject extends SafeFunctionSubject>(
  condition: RawCondition,
  options: CompileOptions = {}
): CompiledPredicate<Subject> {
  return compileConditionAt<Subject>(condition, createSite(options));
}

/** One segment of a parsed template: literal text, or a name and its field. */
export type TemplateSegment =
  | { literal: string }
  | { name: string; field?: string };

/**
 * Parses a `{ template: 'text {Name} {group.field} more' }` text into its
 * literal and placeholder segments. `\{` and `\}` escape a brace. A
 * placeholder is a name, or a name and one field.
 */
export function parseTemplate(
  template: string,
  site: Pick<SchemaSite, 'path' | 'definition'> = {
    path: '',
    definition: DEFAULT_DEFINITION,
  }
): TemplateSegment[] {
  if (typeof template !== 'string') {
    invalidAt(site, 'template must be a string', template);
  }

  const segments: TemplateSegment[] = [];
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
    const placeholder = template.slice(i + 1, end).trim();
    if (!placeholder) {
      invalidAt(site, 'template has an empty "{}" placeholder', template);
    }
    const [name, field, ...rest] = placeholder.split('.');
    if (!name || field === '' || rest.length) {
      invalidAt(
        site,
        `template placeholder "{${placeholder}}" must be a name, or a name and one field`,
        template
      );
    }
    if (literal) {
      segments.push({ literal });
      literal = '';
    }
    segments.push(field === undefined ? { name } : { name, field });
    i = end;
  }

  if (literal) {
    segments.push({ literal });
  }
  return segments;
}

/**
 * Compiles a `{ template: 'text {Name} more' }` value into a reader that
 * substitutes each placeholder with the value of its name. The `readName` of
 * the site gives the reader of each name.
 *
 * Substitution is all it does - there is no arithmetic or expression syntax -
 * so a template is never a route to evaluated code. A name with no value
 * substitutes an empty string.
 */
export function compileTemplate<Subject extends SafeFunctionSubject>(
  template: string,
  site: SchemaSite = createSite()
): CompiledValue<Subject> {
  const parts = parseTemplate(template, site).map((segment) =>
    'literal' in segment
      ? () => segment.literal
      : readNameAt(segment.name, site, segment.field)
  );
  return (subject, context) =>
    parts
      .map((part) => {
        const value = part(subject, context);
        return hasNoValue(value) ? '' : String(value);
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
    return readNameAt(value, site) as CompiledValue<Subject>;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return unrecognized(valueShape, value, site);
  }

  const [form] = matchForm(valueShape, value, site);
  const fields = value as Record<string, unknown>;

  if (form === 'template') {
    return compileTemplate<Subject>(
      fields.template as string,
      at(site, 'template')
    );
  }

  // Not coerced: in value position the expression's own result is the point.
  const evaluate = compileExpressionAt(
    fields.expression as string,
    at(site, 'expression')
  );
  return (subject, context) => evaluate(subject, context);
}

/**
 * Compiles a {@link RawValue} into a safe value reader: a name, a template or
 * an expression.
 *
 * An actual function passes through as is.
 *
 * @param value - the value as data.
 * @param options - where the value sits, and the reader of a name.
 * @throws when the value is not a form the schema accepts.
 */
export function compileValue<Subject extends SafeFunctionSubject>(
  value: RawValue,
  options: CompileOptions = {}
): CompiledValue<Subject> {
  return compileValueAt<Subject>(value, createSite(options));
}
