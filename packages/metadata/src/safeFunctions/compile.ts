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
 * Deliberately free of any domain knowledge — no display sets, no DICOM, no
 * application services. A consumer supplies the subject type, the named
 * classifiers, and whatever rule shape wraps these conditions and values.
 *
 * @module safeFunctions/compile
 */

import { compileExpression } from './expression';
import type {
  ClassifierRegistry,
  CompiledPredicate,
  CompiledValue,
  RawCondition,
  RawValue,
  SafeFunctionSubject,
} from './types';

/**
 * Parameter names bound to a compiled expression's positional arguments.
 *
 * Compiled functions are called `(subject, context)`. `instance` is the name
 * the first parameter answers to because the display-set rules that drove this
 * language pass a naturalized instance; bare identifiers resolve against that
 * first argument regardless of what it is called, so an expression only needs
 * the name to reach the whole object (`instance.ViewCodeSequence`) rather than
 * one of its fields.
 */
const EXPRESSION_PARAMS = ['instance', 'context'];

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
  const numeric = Array.isArray(value) ? value[0] : value;
  if (typeof numeric === 'boolean') {
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
  const single = Array.isArray(value) ? value[0] : value;
  return String(single) === String(literal);
}

/**
 * Throws with the offending fragment inlined - a definition is usually authored
 * by hand or shipped as config, so a mistake in it must name itself.
 */
export function invalid(message: string, fragment: unknown): never {
  throw new Error(
    `Invalid safe function definition: ${message}: ${JSON.stringify(fragment)}`
  );
}

/**
 * Compiles the `{ attribute, <operator> }` family of conditions.
 */
function compileAttributeCondition<Subject extends SafeFunctionSubject>(
  condition: RawCondition & { attribute: string }
): CompiledPredicate<Subject> {
  const { attribute } = condition;

  if ('exists' in condition && condition.exists === true) {
    return (subject) => !isAbsent(subject[attribute]);
  }
  if ('absent' in condition && condition.absent === true) {
    return (subject) => isAbsent(subject[attribute]);
  }
  if ('equals' in condition) {
    return (subject) => looseEquals(subject[attribute], condition.equals);
  }
  if ('notEquals' in condition) {
    return (subject) => !looseEquals(subject[attribute], condition.notEquals);
  }
  if ('in' in condition) {
    // Compare as strings so the set works for both '1' and 1.
    const allowed = new Set(condition.in.map((value) => String(value)));
    return (subject) => {
      const value = subject[attribute];
      if (isAbsent(value)) {
        return false;
      }
      const single = Array.isArray(value) ? value[0] : value;
      return allowed.has(String(single));
    };
  }
  if ('notIn' in condition) {
    const denied = new Set(condition.notIn.map((value) => String(value)));
    return (subject) => {
      const value = subject[attribute];
      if (isAbsent(value)) {
        return true;
      }
      const single = Array.isArray(value) ? value[0] : value;
      return !denied.has(String(single));
    };
  }
  if ('contains' in condition || 'containsAny' in condition) {
    const needles = (
      'contains' in condition ? [condition.contains] : condition.containsAny
    ).map((needle) =>
      condition.ignoreCase ? String(needle).toLowerCase() : String(needle)
    );
    return (subject) => {
      const value = subject[attribute];
      if (isAbsent(value)) {
        return false;
      }
      const haystackRaw = String(
        Array.isArray(value) ? value.join(' ') : value
      );
      const haystack = condition.ignoreCase
        ? haystackRaw.toLowerCase()
        : haystackRaw;
      return needles.some((needle) => haystack.includes(needle));
    };
  }
  if ('greaterThan' in condition) {
    const bound = condition.greaterThan;
    return (subject) => {
      const value = toFinite(subject[attribute]);
      return value !== undefined && value > bound;
    };
  }
  if ('lessThan' in condition) {
    const bound = condition.lessThan;
    return (subject) => {
      const value = toFinite(subject[attribute]);
      return value !== undefined && value < bound;
    };
  }

  return invalid(`no operator for attribute "${attribute}"`, condition);
}

/**
 * Compiles a {@link RawCondition} into a safe predicate.
 *
 * @param condition - the condition as data.
 * @param classifiers - named classifiers the condition may reference.
 */
export function compileCondition<Subject extends SafeFunctionSubject>(
  condition: RawCondition,
  classifiers: ClassifierRegistry<Subject> = {}
): CompiledPredicate<Subject> {
  // A string condition is an expression. Coerced to a boolean, because a
  // condition's contract is boolean however the expression happens to end.
  if (typeof condition === 'string') {
    const evaluate = compileExpression(condition, {
      params: EXPRESSION_PARAMS,
    });
    return (subject, context) => Boolean(evaluate(subject, context));
  }

  if (!condition || typeof condition !== 'object') {
    invalid('condition must be a string expression or an object', condition);
  }

  if ('expression' in condition) {
    return compileCondition<Subject>(condition.expression, classifiers);
  }

  if ('all' in condition) {
    const parts = condition.all.map((part) =>
      compileCondition<Subject>(part, classifiers)
    );
    return (subject, context) => parts.every((part) => part(subject, context));
  }

  if ('any' in condition) {
    const parts = condition.any.map((part) =>
      compileCondition<Subject>(part, classifiers)
    );
    return (subject, context) => parts.some((part) => part(subject, context));
  }

  if ('not' in condition) {
    const inner = compileCondition<Subject>(condition.not, classifiers);
    return (subject, context) => !inner(subject, context);
  }

  if ('classifier' in condition) {
    const classifier = classifiers[condition.classifier];
    if (typeof classifier !== 'function') {
      invalid(`unknown classifier "${condition.classifier}"`, condition);
    }
    return (subject) => classifier(subject);
  }

  if ('seriesFact' in condition) {
    const { seriesFact } = condition;
    return (_subject, context) => Boolean(context?.series?.[seriesFact]);
  }

  if ('attribute' in condition) {
    return compileAttributeCondition<Subject>(condition);
  }

  return invalid('unrecognized condition', condition);
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
  template: string
): (subject: Subject) => string {
  if (typeof template !== 'string') {
    invalid('template must be a string', template);
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
      invalid('template has an unclosed "{"', template);
    }
    const attribute = template.slice(i + 1, end).trim();
    if (!attribute) {
      invalid('template has an empty "{}" placeholder', template);
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
        const value = subject[segment.attribute];
        return isAbsent(value) ? '' : String(value);
      })
      .join('');
}

/**
 * Compiles a {@link RawValue} into a safe value reader.
 *
 * @param value - the value as data.
 * @param classifiers - named classifiers a nested condition may reference.
 */
export function compileValue<Subject extends SafeFunctionSubject>(
  value: RawValue,
  classifiers: ClassifierRegistry<Subject> = {}
): CompiledValue<Subject> {
  if (typeof value === 'string') {
    return (subject) => subject[value];
  }

  if (!value || typeof value !== 'object') {
    invalid('value must be a string or an object', value);
  }

  if ('expression' in value) {
    // Not coerced: in value position the expression's own result is the point.
    const evaluate = compileExpression(value.expression, {
      params: EXPRESSION_PARAMS,
    });
    return (subject, context) => evaluate(subject, context);
  }

  if ('condition' in value) {
    return compileCondition<Subject>(value.condition, classifiers);
  }

  if ('template' in value) {
    return compileTemplate<Subject>(value.template);
  }

  if ('join' in value) {
    const { join } = value;
    if (!Array.isArray(value.parts) || !value.parts.length) {
      invalid('join requires a non-empty parts array', value);
    }
    const parts = value.parts.map((part) => ({
      label: part.label,
      read: compileValue<Subject>(part, classifiers),
    }));
    return (subject, context) =>
      parts
        .map(({ label, read }) => {
          const read_ = read(subject, context);
          return label === undefined ? String(read_) : `${label}=${read_}`;
        })
        .join(join);
  }

  if ('attribute' in value) {
    const { attribute, bucket } = value;
    if (value.absent === true) {
      return (subject) => isAbsent(subject[attribute]);
    }
    if (bucket !== undefined) {
      if (!Number.isFinite(bucket) || bucket === 0) {
        invalid('bucket must be a non-zero finite number', value);
      }
      return (subject) => {
        const numeric = toFinite(subject[attribute]);
        return numeric === undefined ? undefined : Math.round(numeric / bucket);
      };
    }
    if (value.number === true) {
      return (subject) => toFinite(subject[attribute]);
    }
    return (subject) => subject[attribute];
  }

  return invalid('unrecognized value', value);
}
