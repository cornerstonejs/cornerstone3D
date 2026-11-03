---
id: safe-functions
title: Safe Functions
summary: A serializable vocabulary of conditions, tests and values, compiled into predicates without eval, with the DICOM meaning of a missing value — shared by display-set split rules and any other feature that would otherwise hand-write matching code
---

# Safe Functions

A **safe function** is a predicate or a value reader that the compiler builds
from data. It is not JavaScript. There is no `eval`, no `new Function`, and no
other path from a definition to executed code. The compiler tokenizes and parses
an expression, and compiles it to a closure tree. The compiler builds a
condition map from a closed set of operators. Both forms are compatible with a
Content Security Policy.

Because of this property, a definition can move between systems. A host can read
the rules from a configuration file, an HTTP response or the customization layer
of an application. A back end and a browser can share the rules, and neither
side must trust the other to run code.

```js
import { compileCondition } from '@cornerstonejs/metadata';

const isLargeCT = compileCondition({
  Modality: 'CT',
  Rows: { greaterThan: 512 },
});

isLargeCT({ Modality: 'CT', Rows: 1024 }); // true
```

The vocabulary knows nothing about display sets, hanging protocols or the DICOM
dictionary. It describes tests and values over _a subject object_. The consumer
gives the subject, and the consumer gives the reader of each name. The display
set split rules are the first consumer. They read a DICOM keyword from the
instance, and a context name from the
[display set context](./cornerstone-metadata/display-sets.md#the-display-set-context),
and they reject every other name.

## Missing values have the DICOM meaning

DICOM makes a distinction between an absent attribute and an empty attribute.
The safe functions use the DICOM meaning, and not the JavaScript meaning:

| Value                       | Kind   |
| --------------------------- | ------ |
| `undefined`, or no property | absent |
| `null`, `""` or `[]`        | empty  |

An array whose elements all have no value (`[""]`, `[null]`) is also empty, as
DICOM JSON can give an empty value in that form.

"No value" means absent or empty. `@cornerstonejs/metadata` exports the helpers
`isAbsent`, `isEmpty`, `hasNoValue` and `looseEquals`, so a consumer can use
the same meaning. A number is read with
`toFiniteFirst` from `@cornerstonejs/utils`: the finite number of the first
value, and `undefined` for no value, a blank string, or a value that is not a
number.

- An expression tests the kind of a value with the literals `undefined`,
  `null` and `defined`. `!=` is the opposite of `==`:

  | `X`                               | `X == undefined` | `X == null` | `X == defined` | `X != undefined` |
  | --------------------------------- | ---------------- | ----------- | -------------- | ---------------- |
  | absent (`undefined`, no property) | `true`           | `true`      | `false`        | `false`          |
  | `null`                            | `false`          | `true`      | `false`        | `true`           |
  | `""`                              | `false`          | `true`      | `false`        | `true`           |
  | `[]` (also `[""]` and `[null]`)   | `false`          | `true`      | `false`        | `true`           |
  | `"CT"` (a value)                  | `false`          | `false`     | `true`         | `true`           |

  Use `X == undefined` and `X != undefined` to make a distinction between DICOM
  Type 2 (present and empty) and DICOM Type 3 (absent). In a condition map,
  `"X": null` is the same test as `X == null`, and `{ "notNull": true }` is the
  same test as `X == defined`. `defined` is a literal for `==` and `!=` only.

- When `==` compares two values, two values with no value are equal only when
  they are of the same kind. So `Y == Z` is `false` when `Y` is `null` and `Z`
  is absent. Only the literal tests treat the kinds as one.
- `<`, `<=`, `>`, `>=`, `greaterThan`, `greaterThanOrEqual`, `lessThan`,
  `lessThanOrEqual` and `range` give `false` when
  the value has no value, or is not a finite number. A numeric string is a
  number, so `"2" > 1` is `true`. A value with no value never compares as `0`.
- `-`, `*`, `/` and `%` read a numeric string as a number, so `"6" - 1` is `5`.
  When one side has no value or is not a finite number, the result has no
  value: `null * 512` is `undefined`, and not `0`. `+` follows the type of its
  left operand; see [The expression language](#the-expression-language).
- `!`, `&&`, `||` and `?:` read no value as `false`. `&&` and `||` give `true` or
  `false`, so `Rows && Rows > 1000` is `false` when `Rows` is absent.
- `==` is the only equality, and `"1" == 1` is `true`. `===` and `!==` are
  compile errors.
- `==` between a single value and an array holds only when the array has one
  element, equal to the value: `['MR'] == 'MR'`, but
  `['ORIGINAL', 'LOCALIZER'] == 'LOCALIZER'` is `false`. Two arrays are equal
  when they have the same elements in the same order. To test that a value is
  one of a list, use `in`: `Modality in ['MR', 'CT']`, or
  `'LOCALIZER' in ImageType`. Next to `==` or `!=`, an empty array literal is
  a compile error, and so is an array literal of two or more values:
  `Modality == ['MR', 'CT']` fails with a message that names `in`. A
  one-value array literal (`Modality == ['MR']`) still compiles.
- An aggregate inside the argument of another aggregate is a compile error.
  Put the inner aggregate in its own context entry, and read that name.

## Conditions

A condition is a map of name to test. Every entry must hold, so `{}` is `true`.
There is no `all`, `any` or `not`. A consumer gives an "or" a name of its own,
and `false` on a named boolean is its negation.

| Test                    | The entry holds when                               |
| ----------------------- | -------------------------------------------------- |
| a scalar                | shorthand for `includes`: the value is or holds it |
| an array of scalars     | shorthand for `includes`: a value is in the array  |
| `null`                  | the value has no value                             |
| an object, one operator | the operator holds                                 |
| a function              | `test(value, subject, context)` is true            |

The shorthand is `includes` in both forms. `"ImageType": "LOCALIZER"` holds
for `'LOCALIZER'` and for `['ORIGINAL', 'LOCALIZER']`. `"Modality": ["MR", "CT"]`
holds for `'MR'`, and `"ImageType": ["LOCALIZER"]` holds for
`['ORIGINAL', 'LOCALIZER']`. For a whole-value test, use `equals`:
`{ "equals": ["ORIGINAL", "LOCALIZER"] }` holds only for that array, in that
order.

### Operators

The operators have the names of the OHIF hanging protocol constraints. The
operand is the bare value: `{ "greaterThan": 1 }`.

| Operator                            | Operand                       | The entry holds when                                                          |
| ----------------------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| `equals`                            | scalar, array or `null`       | the whole value, with `==`; an array operand equals an array value in order   |
| `doesNotEqual`                      | scalar, array or `null`       | `equals` does not hold; a value with no value passes                          |
| `notNull`                           | boolean                       | `true`: the value has a value; `false`: the value has no value                |
| `includes`                          | scalar or array of scalars    | the value has the element, or one of the elements; a single value is an array |
| `doesNotInclude`                    | scalar or array of scalars    | `includes` does not hold                                                      |
| `greaterThan`, `lessThan`           | finite number                 | the value is a finite number, and `>` or `<` the operand                      |
| `greaterThanOrEqual`                | finite number                 | the value is a finite number, and `>=` the operand                            |
| `lessThanOrEqual`                   | finite number                 | the value is a finite number, and `<=` the operand                            |
| `range`                             | two finite numbers, any order | the value is a finite number in `[min, max]`                                  |
| `contains`, `containsI`             | string or array of strings    | one element of the value holds one of the strings (`I`: without case)         |
| `doesNotContain`, `doesNotContainI` | string or array of strings    | the `contains` form does not hold                                             |
| `containsAll`                       | scalar or array of scalars    | the value has every element                                                   |
| `startsWith`, `endsWith`            | string or array of strings    | one element of the value starts or ends with one of the strings               |

A text test on no value fails, and its `doesNot...` form holds.

:::note Operators that differ from `validator.js`
Since OHIF/Viewers#6386, the OHIF hanging protocols give most operators the
meanings in the table above. These differences remain (the full list is
`RL-READ-4` of the rule language specification):

- An operand of the wrong kind (`greaterThan: '4'`, `startsWith: 0`) is a
  compile error here. `validator.js` reads it as text or as a number.
- `"X": null` and `{ "equals": null }` mean "no value" here. In
  `validator.js`, the operand `null` skips the constraint.
- `containsAll` accepts a scalar operand and a single value here.
- The operand wrappers `{ "value": x }` and `[x]` are accepted by
  `validator.js`. Here, they are compile errors.
  :::

## Values

A value is used where a definition needs a value and not a boolean.

| Form                                         | Gives                                             |
| -------------------------------------------- | ------------------------------------------------- |
| `'SeriesInstanceUID'`                        | the value of the name                             |
| `{ template: 'US series {InstanceNumber}' }` | a string; each `{name}` gives the value of a name |
| `{ expression: 'Rows * Columns' }`           | the result of the expression, not converted       |
| a function                                   | passes through as is                              |

A template substitutes and does nothing else. It has no arithmetic and no
expression syntax, so a template can never become a route to evaluated code.
`\{` escapes a literal brace. A placeholder with no value gives an empty
string. A placeholder can be a path with one field: `{timeClusters.first}`.

:::note A template can read every attribute
A template, and a template literal in an expression, can read any attribute
of the subject. That is the purpose of a template. Thus a definition decides
which text a host shows. When the subject is a naturalized DICOM instance, the
patient identifiers are on the subject next to the acquisition tags. A host
that gives these definitions to its UI must review them as content, like any
other configuration that decides the text of a screen.
:::

## The expression language

A small, safe subset of JavaScript expressions. A hand-written tokenizer and a
recursive-descent parser read it (`safeFunctions/expression`).

```js
"Modality in ['CR', 'DX', 'MG']";
'DiffusionBValue == null';
"lower(BodyPartExamined) == 'breast'";
"Rows > 2000 ? 'large' : 'small'";
'`${SeriesDescription} (${Modality})`';
```

- **Literals**: numbers (also `1e3` and `2.5E-3`), quoted strings, template
  literals with `${}`, arrays, `true`, `false`, `null` and `undefined`.
- **Operators**: `+ - * / %`, `< <= > >=`, `== !=`, `&& || !`, ternaries, and
  `in` for membership. The comparisons and the equality use the rules of
  [Missing values have the DICOM meaning](#missing-values-have-the-dicom-meaning).
  `- * / %` work on numbers only: `'6' - 1` is `5`, a value that is not a number
  gives `undefined`, and a text literal operand (`Rows - 'x'`) is a compile
  error. `+` follows the type of its left operand:
  - Text on the left joins, `''` included: `'2' + 3` is `'23'`, and
    `'' + Rows` is `'512'`. No value on the right joins as `''`.
  - No value on the left gives `undefined`, so arithmetic on a missing
    attribute stays "no value". Write `'' + B + 5` to join.
  - Any other left operand adds as a number: `3 + '2'` is `5`, and
    `0 + '2' + 3` is `5`. No value on the right gives `undefined`, and a number
    plus text that is not a number (`Rows + 'x'`) warns once and gives
    `undefined`.

  A template literal or `{ "template": "{Rows}x{Columns}" }` also builds text.

- **Identifiers**: the compiler resolves a name against the parameters first,
  and then against the fields of the _implicit scope_. The implicit scope is
  the first argument unless the place gives a different one.
- **Member access**: the parser rejects `__proto__`, `prototype` and
  `constructor`, so an expression cannot get to the prototype chain.
- **Helpers**: `defined`, `includes`, `contains`, `startsWith`, `endsWith`,
  `lower`, `abs`, `min`, `max`, `round`, `floor`, `ceil`, `Number` and
  `String`. Nothing else can be called: `alert(1)` and `a.toString()` are
  syntax errors. `includes`, `contains`, `startsWith`, `endsWith` and the
  operator `in` give the same results as the operators of the same names:
  `includes(ImageType, 'LOCALIZER')` tests whole elements, and
  `contains(SeriesDescription, 'T1')` tests text. The number
  helpers give `undefined` for a value that is not a finite number, and never
  `NaN`.
- **Aggregates**: an aggregate names its receiver, for example
  `series.instances.max(x)`. The place gives the receivers that it accepts
  (the `receivers` option), and the list of each one. `min(x)`, `max(x)`,
  `sum(x)`, `count(x)` and `count()` run over that list. A subject whose
  argument has no value does not count, and `count(x)` also skips `false`.
  `sum` of no subject is `0`. `min` and `max` of no subject are `undefined`. A
  bare one-argument `max(x)`, or a receiver that the place does not accept, is
  a compile error. The parser accepts no other method call.

A malformed expression throws an `ExpressionSyntaxError` **at compile time**,
with the source in the message. A runtime error gives one warning, and the
expression gives `undefined`.

`options.implicitScope` tells where a bare identifier that is not a parameter
is read:

| `implicitScope`        | A bare identifier such as `SliceLocation` reads                                     |
| ---------------------- | ----------------------------------------------------------------------------------- |
| omitted, or `true`     | the field of the first argument                                                     |
| a parameter name (`b`) | the field of that argument                                                          |
| `false`                | nothing; it is a compile-time `ExpressionSyntaxError` unless it is a parameter name |

In the argument of an aggregate, a bare identifier always reads the element.

```js
const countLarge = compileExpression('series.instances.count(Rows > 512)', {
  params: ['instances'],
  implicitScope: false,
  receivers: { series: 'instances' },
});
```

## The schema: one table, strict keys

The forms above are one internal table, the **schema**. The compiler selects
the form of a fragment from it, checks the keys against it, and builds its
error messages from it. A consumer, for example a hanging protocol, does not
change the table. It wraps `compileCondition`, `compileValue`,
`compileTemplate` and `compileExpression` in the fields of its own rules, and
gives the reader of each name (`readName`). The display set split rules are
the worked example: see
[the schema of a rule](./cornerstone-metadata/display-sets.md#the-schema-of-a-rule).

The compiler is **strict**, because a key that the compiler ignores changes
the meaning of a definition with no trace:

- **An unknown key or operator is a compile error**, anywhere. The message lists
  the allowed keys.
- **A form that the place does not accept is a compile error**. The message
  lists the accepted forms and the call signature of the place.
- **An operand of the wrong kind is a compile error**: `greaterThan` must be a
  finite number, `range` must be two finite numbers.
- **A second operator in one test is a compile error.**

`compileCondition` and `compileValue` take the path, the name of the definition
for the messages, the expression scope and the reader of a name:

```js
compileCondition(
  { Rows: { greaterThan: 512 } },
  {
    path: 'protocol.match',
    definition: 'hanging protocol',
    readName: (name) => (subject) => subject.instance?.[name],
  }
);
```

## Names belong to the consumer

The expression compiler does not check names against a dictionary. It is
generic, and it does not know the subject. A consumer that knows its names
checks each name. `collectReads` gives each identifier that an expression
reads, with the field of a path and whether the read is in an aggregate:

```js
import { collectReads, parseExpressionSource } from '@cornerstonejs/metadata';

collectReads(
  parseExpressionSource(
    'round(sweepStart - timeClusters.first) + series.instances.max(Rows)'
  ),
  { aggregates: true }
);
// [
//   { name: 'sweepStart', inAggregate: false },
//   { name: 'timeClusters', field: 'first', inAggregate: false },
//   { name: 'Rows', inAggregate: true },
// ]
```

The display set split rules use `collectReads` and `resolveHexFromKeyword`.
A name that is not a DICOM keyword and not a context name is a compile error
there. A private tag, a vendor attribute and a synthetic attribute need a
declaration in the context. An earlier version of the compiler did not check
names, because of these attributes; the declaration now handles them.

The default reader of a name reads an **own property** of the subject. A name
such as `constructor` or `toString` reads the own value of the subject, usually
`undefined`, and never a member of `Object.prototype`.

## Code in a definition

An actual function is accepted wherever a condition, a test or a value is
expected. The function passes through as is. That is how an application in
code gives the compiler a test that data cannot state. A definition that holds
a function is no longer JSON, so it cannot
move between systems. When a definition must be shared, prefer a named entry of
the consumer, for example a code entry of the display set context.

## Failure is eager, and names itself

The compiler checks the whole definition first, and throws with the path of the
fragment:

```text
Invalid safe function definition: Modality: unknown operator 'equal'; allowed: equals, doesNotEqual, notNull, ...
Invalid safe function definition: Rows: the operand of greaterThan must be a finite number: {"greaterThan":"x"}
'===' is not allowed; use '==', the one equality of the rule language in expression: Modality === 'CT'
```

A consumer gives the path and its own name. So a message from a display set
rule is
`Invalid display set rules: rule 'r'.matches.BodyPartExamind: unknown name 'BodyPartExamind': ...`.

Compile one time, at setup. Then a bad definition fails at startup, and not
during the work that it describes.

## Where this goes next

Hanging protocols are the next consumer. OHIF protocol matching has its own
vocabulary of comparators and validators. So a deployment that needs "CT with
more than 512 rows" writes the test twice, in two syntaxes, with two sets of
edge cases. One vocabulary and one compiler remove that duplication.

OHIF uses the same compiler for its split rules. A JSONC customization file,
which can hold no function, declares the rules as data, and code supplies only
the named code entries of the context.
