/**
 * The **split rule schema**: one table of every place in a raw display set
 * split rule, of what each place holds, and - for a place that becomes a
 * function - of how the compiled function is called and what it returns.
 *
 * `createDisplaySetSplitRules` reads this table. It selects the form of each
 * fragment from it, checks the keys against it, takes the expression variables
 * of each place from it, and builds its error messages from it. So the table is
 * not documentation next to the compiler: a key that is not in the table does
 * not compile.
 *
 * The rules the table enforces:
 *
 * - An unknown key, anywhere in a rule, is a compile error. The message names
 *   the rule id, the path of the key, and the allowed keys.
 * - A form the place does not accept is a compile error. The message lists the
 *   accepted forms and the call signature of the place.
 * - `'*'` as a key allows any key. Its entry says what each value is: `literal`
 *   keeps the value as is (`customAttributes.set.*`), a shape compiles each
 *   value with that shape (`customAttributes.fromFirstInstance.*`).
 * - An actual function passes through as is at every function place, and
 *   wherever a nested condition or value is expected.
 *
 * The condition and value shapes are the generic ones from `../safeFunctions`.
 * This module adds the rule itself, the series fact, the comparator and the
 * `customAttributes` recipe.
 *
 * @module displayset/splitRuleSchema
 */

import {
  conditionShape,
  INSTANCE_EXPRESSION_SCOPE,
  valueShape,
} from '../safeFunctions';
import type {
  ExpressionScope,
  Schema,
  SchemaKey,
  SchemaShape,
} from '../safeFunctions';

/**
 * The expression variables of a comparator: called `(a, b, context)`, and no
 * implicit scope, so a bare identifier that is not `a`, `b` or `context` is a
 * compile error.
 */
export const COMPARATOR_EXPRESSION_SCOPE: ExpressionScope = Object.freeze({
  params: Object.freeze(['a', 'b', 'context']),
  implicitScope: false as const,
});

/**
 * The expression variables of a series fact `{ name, expression }`: called
 * `(instances, series)` once per split, and no implicit scope. `instances` is
 * the whole series, and `series` holds the facts computed so far. A bare name
 * reads an attribute only inside an aggregate, e.g.
 * `minOf(instances, InstanceNumber)`.
 */
export const SERIES_EXPRESSION_SCOPE: ExpressionScope = Object.freeze({
  params: Object.freeze(['instances', 'series']),
  implicitScope: false as const,
});

/** How a series fact's `when` is applied across the series. */
export const SERIES_FACT_SCOPES = Object.freeze([
  'first',
  'every',
  'some',
  'mixed',
] as const);

/** The names `customAttributes.fromContext` can copy. */
export const CUSTOM_ATTRIBUTE_CONTEXT_NAMES = Object.freeze([
  'isMultiFrame',
  'sopClassUids',
  'viewportTypes',
] as const);

/** The names `customAttributes.fromOptions` can copy. */
export const CUSTOM_ATTRIBUTE_OPTION_NAMES = Object.freeze([
  'splitNumber',
  'descriptionName',
] as const);

const PER_INSTANCE_CONDITION: SchemaKey = {
  kind: 'condition',
  call: '(instance, context) => boolean',
  expression: INSTANCE_EXPRESSION_SCOPE,
};

const PER_INSTANCE_VALUE: SchemaKey = {
  kind: 'value',
  call: '(instance, context) => value',
  expression: INSTANCE_EXPRESSION_SCOPE,
};

/** One raw split rule. */
const ruleShape: SchemaShape = {
  name: 'rule',
  keyNoun: 'field',
  forms: {
    rule: {
      keys: {
        id: {
          kind: 'string',
          optional: true,
          description:
            'The rule id. Optional: the key of the rule in the selector is the id. When present it must equal that key.',
        },
        groupId: {
          kind: 'string',
          optional: true,
          description:
            'The group of rules this rule belongs to, for a reader that must recognize display sets from several related rules (for example every mammography rule). Defaults to the rule id.',
        },
        priority: {
          kind: 'priority',
          description:
            'Evaluation order: ascending, first match wins. null excludes the rule.',
        },
        description: {
          kind: 'string',
          optional: true,
          description: 'Human-readable explanation. Not compiled.',
        },
        viewportTypes: {
          kind: 'string',
          list: true,
          optional: true,
          description: 'Allowed viewport types; index 0 is preferred.',
        },
        series: {
          kind: 'seriesFact',
          list: true,
          optional: true,
          function: true,
          call: '({ instances, series }) => facts',
          description:
            'Facts derived once from the whole series, shared by every rule as context.series; the first rule that computes a name wins. A function replaces the whole list.',
        },
        matches: {
          ...PER_INSTANCE_CONDITION,
          optional: true,
          description:
            'Which instances this rule claims. Omit for a catch-all rule.',
        },
        groupBy: {
          ...PER_INSTANCE_VALUE,
          list: true,
          optional: true,
          description:
            'Bucket recipe: instances whose entries are all equal form one group. Defaults to SeriesInstanceUID.',
        },
        runBy: {
          ...PER_INSTANCE_VALUE,
          optional: true,
          description: 'A change of this value starts a new run.',
        },
        compareInstances: {
          kind: 'comparator',
          optional: true,
          call: '(a, b, context) => number',
          description:
            'Instance order. A result of 0 or NaN is "no opinion": the next comparator decides.',
        },
        customAttributes: {
          kind: 'customAttributes',
          optional: true,
          function: true,
          call: '(attributes, options) => Record<string, unknown>',
          description: 'Extra attributes for the produced display sets.',
        },
      },
    },
  },
};

/** The `name` of every series fact form. */
const SERIES_FACT_NAME: SchemaKey = {
  kind: 'string',
  description:
    'The name the fact is read back under, as context.series.<name>. An earlier fact of the same name wins.',
};

/** One entry of a rule's `series` list. */
const seriesFactShape: SchemaShape = {
  name: 'series fact',
  forms: {
    expression: {
      selectBy: 'expression',
      keys: {
        name: SERIES_FACT_NAME,
        expression: { kind: 'expression' },
      },
      expression: SERIES_EXPRESSION_SCOPE,
      description:
        'A value computed once from the whole series, e.g. minOf(instances, InstanceNumber). Reads the earlier facts as series.<name>.',
    },
    function: {
      selectBy: 'function',
      keys: {
        name: SERIES_FACT_NAME,
        function: {
          kind: 'string',
          description:
            'A named series function: built in (planeGeometry, timeClusters), or from options.seriesFunctions.',
        },
        args: {
          kind: 'record',
          optional: true,
          keys: { '*': { kind: 'literal' } },
          description: 'Arguments for the series function, copied as is.',
        },
      },
      description:
        'A value from a named series function, for a summary the expression language cannot compute.',
    },
    seriesFact: {
      selectBy: 'scope',
      description:
        'A boolean: a condition applied across the series as scope says.',
      keys: {
        name: SERIES_FACT_NAME,
        scope: {
          kind: 'string',
          oneOf: SERIES_FACT_SCOPES,
          description:
            'first: instances[0] only; every / some: all / one instance; mixed: at least one passes and one fails.',
        },
        when: {
          ...PER_INSTANCE_CONDITION,
          description:
            'Evaluated for each instance of the series, as scope says. context.series holds the facts computed so far.',
        },
        gate: {
          ...PER_INSTANCE_CONDITION,
          optional: true,
          description:
            'Evaluated for instances[0]. When it fails, the fact is false.',
        },
        minInstances: {
          kind: 'number',
          optional: true,
          description: 'Below this instance count, the fact is false.',
        },
      },
    },
  },
};

/** A rule's `compareInstances`. */
const comparatorShape: SchemaShape = {
  name: 'comparator',
  function: true,
  forms: {
    attribute: {
      selectBy: 'attribute',
      keys: {
        attribute: { kind: 'string' },
        number: { kind: 'boolean', optional: true },
        descending: { kind: 'boolean', optional: true },
      },
      description:
        'Ascending by the numeric value of the attribute (descending reverses). A missing value is "no opinion".',
    },
    expression: {
      selectBy: 'expression',
      keys: { expression: { kind: 'expression' } },
      expression: COMPARATOR_EXPRESSION_SCOPE,
      description:
        'An expression over a, b and context, e.g. a.SliceLocation - b.SliceLocation. A bare attribute name is a compile error.',
    },
  },
};

/** A rule's `customAttributes`, as data. */
const customAttributesShape: SchemaShape = {
  name: 'customAttributes recipe',
  function: true,
  forms: {
    recipe: {
      keys: {
        set: {
          kind: 'record',
          optional: true,
          keys: { '*': { kind: 'literal' } },
          description: 'Literal values, copied as is.',
        },
        fromFirstInstance: {
          kind: 'record',
          optional: true,
          keys: {
            '*': {
              kind: 'value',
              call: '(firstInstance, context) => value',
              expression: INSTANCE_EXPRESSION_SCOPE,
            },
          },
          description:
            'Attribute name -> value read from the first instance of the group.',
        },
        fromContext: {
          kind: 'string',
          list: true,
          optional: true,
          oneOf: CUSTOM_ATTRIBUTE_CONTEXT_NAMES,
          description: 'Names copied from the context of the split engine.',
        },
        fromOptions: {
          kind: 'string',
          list: true,
          optional: true,
          oneOf: CUSTOM_ATTRIBUTE_OPTION_NAMES,
          description: 'Split option names copied under the same name.',
        },
        preset: {
          kind: 'string',
          optional: true,
          description:
            'A named recipe from options.customAttributePresets, applied last.',
        },
      },
    },
  },
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) {
      deepFreeze(entry);
    }
  }
  return value;
}

/**
 * The schema of a raw split rule, keyed by shape name. `rule` is the rule
 * itself; the other entries are the shapes its fields hold. Frozen: the
 * compiler reads it, so a change to it would change what compiles.
 */
export const splitRuleSchema = deepFreeze({
  rule: ruleShape,
  seriesFact: seriesFactShape,
  comparator: comparatorShape,
  customAttributes: customAttributesShape,
  condition: conditionShape,
  value: valueShape,
}) satisfies Schema;
