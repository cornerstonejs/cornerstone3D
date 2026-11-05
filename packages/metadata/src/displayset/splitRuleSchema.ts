/**
 * The **split rule schema**: one table of every place in a raw display set
 * split rule, of what each place holds, and of how the compiled function of a
 * function place is called and what it returns.
 *
 * `createDisplaySetSplitRules` checks the fields, selects the form of each
 * fragment, and builds its error messages from this table, so a key that is
 * not in the table does not compile. The names in a rule are not in this
 * table: `displaySetContext.ts` checks them. See "The schema of a rule" in
 * `packages/docs/docs/concepts/cornerstone-metadata/display-sets.md`.
 *
 * @module displayset/splitRuleSchema
 */

import {
  conditionShape,
  deepFreeze,
  matchTestShape,
  valueShape,
} from '../safeFunctions';
import type { Schema, SchemaShape } from '../safeFunctions';

/** The names that only `attributes` can read: values of the display set. */
export const ATTRIBUTE_ONLY_NAMES = Object.freeze([
  'splitNumber',
  'sopClassUids',
] as const);

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
            'The rule id. Optional: the key of the rule in the rule set is the id. When present it must equal that key.',
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
          description:
            'Viewport types for the host. CS3D copies them to the display set unchanged, and does not read them.',
        },
        handler: {
          kind: 'string',
          optional: true,
          description:
            'The generic handler name of the display sets, e.g. segmentation. Any string; the host decides what an unknown name does.',
        },
        context: {
          kind: 'contextEntry',
          record: true,
          optional: true,
          description:
            'Context entries for this rule only. An entry replaces the global entry of the same name, also inside the global entries that the rule reads, or defines a new name.',
        },
        matches: {
          kind: 'condition',
          optional: true,
          function: true,
          call: '(instance, context) => boolean',
          description:
            'Which instances this rule claims: a map of name to test, and every entry must hold. Omit for a catch-all rule.',
        },
        groupBy: {
          kind: 'name',
          list: true,
          optional: true,
          call: '(instance, context) => value',
          description:
            'Names (or functions) whose values must all be equal for two instances to form one group. Defaults to SeriesInstanceUID.',
        },
        sortBy: {
          kind: 'sortKey',
          list: true,
          optional: true,
          call: '(a, b, context) => number',
          description:
            'The order of the instances in a display set: names in ascending order, named sort functions, or functions. A result of 0 or NaN is "no opinion": the next entry decides.',
        },
        attributes: {
          kind: 'attributeValue',
          record: true,
          optional: true,
          function: true,
          call: '(attributes, options) => Record<string, unknown>',
          description:
            'Attributes of the produced display sets, keyed by attribute name.',
        },
      },
    },
  },
};

/** One entry of the `context` option, or of the `context` of a rule. */
const contextEntryShape: SchemaShape = {
  name: 'context entry',
  string: 'expression',
  function: true,
  forms: {
    declaration: {
      selectBy: 'attribute',
      keys: {
        attribute: { kind: 'string' },
        vr: { kind: 'string', optional: true },
        vm: { kind: 'string', optional: true },
      },
      description:
        'Reads one attribute of the instance that the DICOM dictionary does not hold: a private tag as 8-digit hex, a vendor attribute, or a synthetic attribute such as imageId. vr and vm are recorded only.',
    },
    template: {
      selectBy: 'template',
      keys: { template: { kind: 'string' } },
      description: 'Text: each {name} gives the value of a name or a path.',
    },
    group: {
      selectBy: 'function',
      keys: {
        function: {
          kind: 'literal',
          description:
            'The name of a series function (planeGeometry, timeClusters, or one of options.seriesFunctions), or in code a function.',
        },
        args: {
          kind: 'literal',
          optional: true,
          description:
            'The arguments of the series function. Each value is a fixed value, or an expression with one value for the series.',
        },
      },
      description:
        'One call of a series function over the series. A rule reads a result field by path, e.g. timeClusters.start. In sortBy and attributes, displaySet.<name> runs it over the display set.',
    },
  },
};

/** An entry of `sortBy` that is not a name. */
const sortKeyShape: SchemaShape = {
  name: 'sort entry',
  string: 'attribute',
  function: true,
  forms: {
    sortFunction: {
      selectBy: 'sortFunction',
      keys: {
        sortFunction: {
          kind: 'string',
          description: 'The name of a sort function in options.sortFunctions.',
        },
      },
      description: 'A named sort function, called (a, b, context) => number.',
    },
  },
};

/** One value of `attributes`. */
const attributeValueShape: SchemaShape = {
  ...valueShape,
  name: 'attribute value',
  forms: {
    template: valueShape.forms.template,
    expression: {
      ...valueShape.forms.expression,
      description:
        'An expression over the display set: displaySet.instances.max(x) (and min, sum, count) runs over its instances, series.instances.max(x) over the series, and a DICOM keyword reads its first instance.',
    },
  },
};

/** A name: a DICOM keyword or a context name, or in code a function. */
const nameShape: SchemaShape = {
  name: 'name',
  string: 'attribute',
  function: true,
  forms: {},
};

/**
 * The schema of a raw split rule, keyed by shape name. `rule` is the rule
 * itself; the other entries are the shapes its fields hold. Frozen: the
 * compiler reads it, so a change to it would change what compiles.
 */
export const splitRuleSchema = deepFreeze({
  rule: ruleShape,
  contextEntry: contextEntryShape,
  condition: conditionShape,
  matchTest: matchTestShape,
  name: nameShape,
  sortKey: sortKeyShape,
  attributeValue: attributeValueShape,
}) satisfies Schema;
