---
id: rule-language
title: Rule language
summary: One declarative language for conditions, values and sort orders over DICOM metadata, that display set split rules, hanging protocols and other rule consumers share, and that a caller extends with its own scopes, named attributes and functions
---

# Rule language

**Prefix:** `RL`
**Status:** Draft. The user requirements are under review. The implementation
requirements are the recommended approach, and they can change.
**Source:** the review discussion on
[cornerstonejs/cornerstone3D#2861](https://github.com/cornerstonejs/cornerstone3D/pull/2861).
**Affects:** `@cornerstonejs/metadata`. Consumers: the display set split rules
in `@cornerstonejs/metadata`, and the hanging protocols of OHIF.

## Scope

This specification describes one rule language. The rule language has three
parts:

- a **condition**, which tests one subject and gives `true` or `false`,
- a **value**, which reads one value from one subject,
- a **sort order**, which compares two subjects.

The rule language is not specific to display sets, and it does not know the
names of any scope other than the subject. A **consumer** wraps the rule
language in the fields of its own rules, and declares the scopes and the lists
that its rules can read. The first consumer is the display set split rule. The
second consumer is the hanging protocol. Each consumer gets the same meaning for
the same text.

The specification has two requirement sections:

- **User requirements** (`RL-READ`, `RL-SHARE`, `RL-EXT`, `RL-SCOPE`,
  `RL-CODE`, `RL-SAFE`, `RL-ERR`) state what a rule author, a reviewer, an
  assistant or a host developer must be able to do or to determine.
- **Implementation requirements** (`RL-PKG`, `RL-API`, `RL-REG`, `RL-ENV`,
  `RL-COND`, `RL-VAL`, `RL-SORT`, `RL-EXPR`, `RL-FN`, `RL-CONS`, `RL-TEST`)
  state the recommended approach.

Change rule:

- A user requirement changes in two cases only: the requirement describes the
  behaviour wrongly, or the intended user-facing behaviour itself changes. An
  implementation that is inconvenient is never a reason to change a user
  requirement.
- An implementation requirement changes freely when a better approach appears.

Out of scope:

- The engine of the display set split (claims, split keys, priorities). The
  engine stays as it is. This specification changes only the language that
  compiles onto the hooks of the engine.
- The scoring and the layout of a hanging protocol. A hanging protocol uses the
  rule language only to test a study, a display set or an instance.
- The grammar of the expression language. The grammar stays as it is, except
  for the additions in `RL-EXPR`.

## Definitions

**Subject.** The object that a condition or a value tests or reads. For a split
rule, the subject is one naturalized DICOM instance. For a hanging protocol, the
subject is a study, a display set or an instance.

**Attribute.** A named value of an object, for example the DICOM keyword
`Modality`, or the display set attribute `numImageFrames`.

**Scope.** A named object, other than the subject, that a rule can read. The
consumer declares each scope: its name, the attribute names that a strict access
can read, and the attribute names that no access can read. The rule language
itself declares no scope. The scopes of the split rule consumer are:

| Scope       | What it holds                                                               | Example attributes                             | Who supplies it                     |
| ----------- | --------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------- |
| _(subject)_ | the attributes of the instance                                              | `Modality`, `ImageLaterality`                  | the data                            |
| `context`   | values that hold for the whole split, and that do not come from the subject | `rightOnLeft`, `isRightOnLeft`                 | the host, or a computed scope value |
| `group`     | values of the one display set that a rule is building                       | `splitNumber`, `instanceCount`, `viewsPresent` | the consumer, or a scope attribute  |

**Allow list.** The attribute names of a scope (or of the subject) that a
strict access can read. The allow list `"*"` allows every name.

**Deny list.** The attribute names of a scope (or of the subject) that no
access can read, strict or optional. `__proto__`, `prototype` and `constructor`
are on every deny list.

**Strict access.** A read that the compile checks against the allow list and
the deny list: a bare name, a map key, `scope.name`, `{ "scope": "name" }`, and
`{scope.name}` in a template.

**Optional access.** A read in an expression with `?.` (`scope?.name`), or a
read with a `?` suffix on the name in data (`"name?"`). The compile does not
check the allow list. The deny list still applies.

**List.** A named list of subjects that a consumer binds, for example `series`
(all of the instances of the series).

**Named attribute.** A function that the caller supplies under a name. A
subject named attribute reads the subject. A scope named attribute computes one
attribute of a scope.

**Named sort function.** A comparator that the caller supplies under a name.

**Registry.** The named attributes and the named sort functions that one
compile call gets.

**Environment.** The scopes and the lists that one call of a compiled function
gets.

**Consumer.** Code that defines a kind of rule (split rule, hanging protocol),
declares its scopes and lists, and compiles the conditions, values and sort
orders of that rule with the rule language.

**Host.** The application that calls a consumer, for example OHIF or a server
that builds a study index.

**Function place.** A place in a rule that becomes a function after the
compile.

## User requirements

### Readable rules (RL-READ)

- **RL-READ-1** The rule author writes a condition as a map. The keys are
  attribute names, and sibling keys must all hold. The author does not need
  `all`, `attribute` or `equals` for the common case.
- **RL-READ-2** The author writes the common tests without an operator: a
  scalar means "equals", an array means "one of", and `null` means "absent".
- **RL-READ-3** A bare string means an attribute name (or a named attribute)
  at every place. A bare string is never an expression.
- **RL-READ-4** The author uses the operator names of the OHIF hanging
  protocol constraints (`equals`, `includes`, `contains`, `containsI`,
  `greaterThan`, `range`, `notNull`, and the others), with the same meaning.
- **RL-READ-5** The author writes a test over a whole list of subjects (for
  example "the first instance is MR", "some instances are a localizer", "the
  series has fewer than 10 instances") inside the condition that uses the test,
  with no name and no back-reference.
- **RL-READ-6** The reviewer reads a rule and sees every named attribute that
  the rule uses, at the place where the rule uses it.

### One language for each consumer (RL-SHARE)

- **RL-SHARE-1** The same condition text, on the same subject and the same
  environment, gives the same result in a split rule and in a hanging protocol.
- **RL-SHARE-2** The host registers a named attribute once, and both a split
  rule and a hanging protocol can use the named attribute.
- **RL-SHARE-3** A new consumer (for example a rule for a worklist filter)
  declares its own scopes and lists, and uses the rule language without a change
  to the rule language, and without an import of the display set code.
- **RL-SHARE-4** The documentation describes the rule language once. The
  documentation of a consumer describes only the fields of its rules, and its
  scopes and lists.

### Extension by the caller (RL-EXT)

- **RL-EXT-1** The host supplies named attributes and named sort functions to
  the compile, and a rule uses each one by name.
- **RL-EXT-2** A rule uses a named attribute at every place that accepts an
  attribute name: a condition key, a value, a grouping entry, a display set
  attribute, and an expression.
- **RL-EXT-3** A named attribute can read the subject and the environment. So a
  named attribute can compute a value over a whole series or a whole display
  set, and not only over one instance.
- **RL-EXT-4** The author cannot see a difference between a named attribute of
  the host and a built-in named attribute. The syntax is the same.
- **RL-EXT-5** Each consumer supplies its own subjects. A host that shares one
  named attribute between two consumers knows which subject the function gets
  from each consumer.

### Subject and scopes (RL-SCOPE)

- **RL-SCOPE-1** The reader of a rule sees from the text which object each name
  reads. A bare name reads the subject. A name under a scope name reads that
  scope. The same attribute name in two scopes is two different values.
- **RL-SCOPE-2** The consumer, and not the rule language, names the scopes and
  the lists. The host can add attribute names to a scope of a consumer.
- **RL-SCOPE-3** The host supplies scope values when it starts a split or a
  match, for example `rightOnLeft: false` from a user preference. A change of a
  scope value needs no change to the rules.
- **RL-SCOPE-4** A rule tests a scope value in a condition. So one rule set
  holds branches: one set of rules for `rightOnLeft` not equal to `false`, and
  another set for `rightOnLeft` equal to `false`.
- **RL-SCOPE-5** A deployment defines computed scope values from other values of
  the same scope, as data or as a function. The compile computes each one once
  for each scope object, and not once for each subject.
- **RL-SCOPE-6** A rule reads a scope only at the places where the consumer
  makes that scope available. A read of a scope at another place (for example
  `group` in `matches` of a split rule) is a compile error that names the place.
- **RL-SCOPE-7** A strict access to a name that is not on the allow list is a
  compile error that names the scope, the attribute and the allowed names. So a
  misspelt name fails at compile time.
- **RL-SCOPE-8** An optional access reads any value that the host supplied,
  also a name that the allow list does not hold. A missing value reads
  `undefined`. The author writes an optional access as `scope?.name` in an
  expression, and as `"name?"` in data. So an author can use a host value that
  the consumer did not declare, and the reader sees from the `?` that the
  compile did not check the name.
- **RL-SCOPE-9** No access reads a name on the deny list, strict or optional.
  The deny list lets a host keep a value (for example a patient identifier) out
  of every rule.

### Code for the complex cases (RL-CODE)

- **RL-CODE-1** An extension can put an actual function at every function
  place of a rule, in place of the data for that place.
- **RL-CODE-2** An extension can mix a function at one place with data at the
  other places of the same rule.
- **RL-CODE-3** An extension can write a whole rule as code, with the hooks of
  the consumer, and put that rule in the same rule set as data rules.
- **RL-CODE-4** The author can write an expression at every condition place,
  every value place and every sort place, for a case that the map form cannot
  state.
- **RL-CODE-5** An expression can call a named attribute.

### Safe data (RL-SAFE)

- **RL-SAFE-1** A rule that the host reads from JSON (a configuration file, an
  HTTP response, a URL customization) cannot run code that the host did not
  supply.
- **RL-SAFE-2** A misspelt key does not change the meaning of a rule without a
  trace. An unknown key is an error.

### Errors that name themselves (RL-ERR)

- **RL-ERR-1** A rule that does not compile gives an error that names the
  consumer, the rule, the path in the rule, and the accepted forms at that
  path.
- **RL-ERR-2** An unknown named attribute gives an error that names the
  attribute and the names that the registry knows.
- **RL-ERR-3** The compile finds every error of the rule data before the
  consumer uses the rule. The only checks at run time are the deny list checks
  of `RL-ENV-6`.

## Implementation requirements

### Package layout (RL-PKG)

- **RL-PKG-1** The rule language is in `@cornerstonejs/metadata`, in
  `packages/metadata/src/rules/`. The present `safeFunctions/` module becomes
  `rules/`. For one minor release, `safeFunctions` re-exports the new names
  with a deprecation note.
- **RL-PKG-2** No file in `rules/` imports from `displayset/`, or from any
  other consumer. No file in `rules/` holds the name of a consumer scope or
  list (`context`, `group`, `series`, ...). A unit test reads the imports of
  `rules/` and fails on such an import.
- **RL-PKG-3** The split rule consumer is in `packages/metadata/src/displayset/`.
  It holds only the rule fields, the scope and list declarations, the mapping
  onto the `SplitRule` hooks, and the default rules.
- **RL-PKG-4** The hanging protocol consumer is in OHIF
  (`HangingProtocolService`), or in a later CS3D package. Either location uses
  only the public API of `RL-API`.

Layout:

```text
packages/metadata/src/
  rules/                      generic, knows no consumer and no scope name
    registry.ts               createRuleRegistry
    environment.ts            createRuleScope, scope and deny checks
    condition.ts              compileCondition (map form, operators, lists)
    value.ts                  compileValue
    comparator.ts             compileComparator
    fields.ts                 compileRuleFields (consumer field table)
    expression/               tokenizer, parser, compiler (+ ?. access)
    schema/                   internal tables, not exported
    index.ts
  displayset/                 consumer 1: declares context, group, series
    compileDisplaySetRules.ts
    defaultDisplaySetRules.ts
    ...engine files, unchanged
```

### Public API (RL-API)

This is the resolution of the conflict between "keep the schema plumbing
internal" and "another consumer must reuse the language". The package exports
compile functions, the declaration types and one small field table. The
package does not export the schema tables, `SchemaKey`, `matchForm` or
`describeShape`.

- **RL-API-1** `@cornerstonejs/metadata` exports these names, and no other
  name of the rule language:

  ```ts
  createRuleRegistry(definition: RuleRegistryDefinition, base?: RuleRegistry): RuleRegistry;
  createRuleScope(name: string, values: Record<string, unknown>, options: RuleScopeOptions): RuleScopeObject;
  compileScopeValues(record: unknown, options: RuleCompileOptions & { scope: string }): ScopeValueDefinitions;

  compileCondition(fragment: unknown, options: RuleCompileOptions): CompiledCondition;
  compileValue(fragment: unknown, options: RuleCompileOptions): CompiledValue;
  compileComparator(fragment: unknown, options: RuleCompileOptions): CompiledComparator;

  compileRuleFields<T>(rule: unknown, fields: RuleFieldTable, options: RuleCompileOptions): T;

  class RuleCompileError extends Error {
    readonly definition: string; // e.g. 'display set split rule'
    readonly path: string;       // e.g. "rule 'dwiByBValue'.matches.DiffusionBValue"
  }
  ```

- **RL-API-2** The compiled forms have fixed call signatures. The second
  argument is the environment: one entry for each scope and each list that the
  consumer makes available at that place.

  ```ts
  /** e.g. { context: {...}, group: {...}, series: [...] } */
  type RuleEnvironment = Readonly<
    Record<string, RuleScopeObject | readonly unknown[]>
  >;

  type CompiledCondition = (subject: unknown, env: RuleEnvironment) => boolean;
  type CompiledValue = (subject: unknown, env: RuleEnvironment) => unknown;
  type CompiledComparator = (
    a: unknown,
    b: unknown,
    env: RuleEnvironment
  ) => number;
  ```

- **RL-API-3** `RuleCompileOptions` declares the subject, the scopes and the
  lists. The rule language has no default scope and no default list.

  ```ts
  type AccessDeclaration = {
    /** Names that a strict access can read. '*' allows every name. */
    allow: readonly string[] | '*';
    /** Names that no access can read. __proto__, prototype, constructor are always added. */
    deny?: readonly string[];
  };

  type RuleCompileOptions = {
    registry: RuleRegistry;
    /** The subject: its expression parameter name, and its access lists. */
    subject: AccessDeclaration & {
      param: string; // e.g. 'instance', 'displaySet'
      read?: (subject: unknown, name: string) => unknown;
      /**
       * A lowercase bare name that the registry does not hold: 'registryOnly'
       * makes it a compile error, 'subject' (default) reads the subject.
       */
      lowercase?: 'registryOnly' | 'subject';
    };
    /** Every scope that the consumer declares, available or not at this place. */
    scopes?: Record<string, AccessDeclaration>;
    /** The scope names available at this place; a subset of `scopes`. */
    available?: readonly string[];
    /** The list names that the consumer binds at this place. */
    lists?: readonly string[];
    /** For the messages. */
    definition?: string;
    path?: string;
  };
  ```

- **RL-API-4** `RuleFieldTable` describes the fields of a consumer rule. Each
  field is one of: `'condition'`, `'value'`, `'comparator'`, a list of one of
  these, a record of one of these, a leaf (`'string'`, `'number'`,
  `'priority'`, `'literal'`), or `'function'` (code only). A field can also be
  `optional`, and gives `available` (the scope names at that field) and `lists`.
  `compileRuleFields` rejects an unknown field, compiles each field, and
  returns the compiled object. The table is the only schema that a consumer
  writes.

### Registry (RL-REG)

- **RL-REG-1** A registry holds subject named attributes, scope named
  attributes keyed by scope name, and named sort functions:

  ```ts
  type RuleRegistryDefinition = {
    /** Read the subject; used as a bare name. */
    attributes?: Record<string, NamedAttribute>;
    /** Compute one attribute of a scope; used as scope.name. Keyed by scope name. */
    scopeAttributes?: Record<string, Record<string, NamedScopeAttribute>>;
    sortFunctions?: Record<string, NamedSortFunction>;
  };
  type NamedAttribute = (subject: unknown, env: RuleEnvironment) => unknown;
  type NamedScopeAttribute = (
    scope: RuleScopeObject,
    env: RuleEnvironment
  ) => unknown;
  type NamedSortFunction = (
    a: unknown,
    b: unknown,
    env: RuleEnvironment
  ) => number;
  ```

  The registry does not know if a scope name exists. The compile checks that
  each key of `scopeAttributes` is a scope of the consumer, and ignores the
  scopes of another consumer.

- **RL-REG-2** A subject named attribute or a sort function has a name that
  starts with a lowercase letter (`/^[a-z][A-Za-z0-9]*$/`). DICOM keywords start
  with an uppercase letter, so a registered name never shadows a DICOM keyword.
  `createRuleRegistry` throws for another name.
- **RL-REG-3** A subject named attribute or a sort function is not a reserved
  key (`all`, `any`, `not`, `expression`), and is not the name of a scope or a
  list of the consumer. The compile throws for such a name.
- **RL-REG-4** A bare name resolves in this order: the subject named attributes
  of the registry, then the subject through `subject.read`. A display set
  attribute such as `numImageFrames` is lowercase too, so the hanging protocol
  consumer gives the subject the allow list `"*"`. The split rule consumer gives
  an allow list that rejects a lowercase name that the registry does not hold
  (`RL-CONS-1`), because a naturalized instance has no lowercase attribute.
- **RL-REG-5** `createRuleRegistry(definition, base)` returns a new frozen
  registry with the entries of `base` and then the entries of `definition`. The
  built-in subject named attributes (`isImage`, `isVideo`, `isEcg`, `isWsi`) are
  the default `base`.
- **RL-REG-6** The compile calls each registry function only with the
  signature of its map (`RL-REG-1`). No other signature exists. A host function
  with a different signature gets an adapter at registration (see example 6).
- **RL-REG-7** The names of the scope named attributes of a scope are added to
  the allow list of that scope. The compile throws when such a name is on the
  deny list of that scope.

### Environment and access (RL-ENV)

- **RL-ENV-1** `createRuleScope(name, values, options)` builds one scope object:

  ```ts
  type RuleScopeOptions = {
    registry: RuleRegistry;
    declaration: AccessDeclaration;
    /** Data-defined computed values of this scope, from compileScopeValues. */
    computed?: ScopeValueDefinitions;
    /** A scope object from an earlier call, whose computed values are reused. */
    base?: RuleScopeObject;
    /** The environment that a computed value can read (other scopes, lists). */
    env?: RuleEnvironment;
  };
  ```

  The steps:
  1. It copies the host values. A value whose name is on the deny list is
     dropped, so it is never in the scope object.
  2. It computes each computed value in declaration order: first the
     `computed` definitions (data), then the scope named attributes of the
     registry for this scope (code). A later value can read an earlier value. A
     computed value cannot replace a host value; the name collision throws.
  3. It freezes the result.

  The consumer builds each scope at the moment the scope exists. The split rule
  consumer builds `context` once for each split, and `group` once for each group.

- **RL-ENV-2** In a condition map, a key that is a scope name available at the
  place holds a map. The entries of that map read the scope, and use the tests
  of `RL-COND-2` and `RL-COND-3`. A list quantifier and a subject name are not
  allowed inside them.

  ```jsonc
  { "context": { "rightOnLeft": { "doesNotEqual": false } } }
  { "group": { "instanceCount": { "greaterThan": 1 } } }
  ```

  A map key is a strict access. A map key with a `?` suffix is an optional
  access (`RL-ENV-8`):

  ```jsonc
  { "context": { "siteCode?": "B2" } }
  ```

- **RL-ENV-3** Each declared scope name and each list name is reserved at every
  place of the consumer, also where the scope is not available. So `group` at a
  place without the group scope is a compile error, and never a read of a
  subject attribute named `group` (`RL-SCOPE-6`). The error names the place and
  the available scopes.
- **RL-ENV-4** A strict access compiles only when the name is on the allow list
  of its object (or the allow list is `"*"`), and is not on the deny list. A
  strict access with a computed index (`context[name]`) compiles only when the
  allow list is `"*"`, and the deny list check runs at run time.
- **RL-ENV-5** An optional access (`scope?.name`, `scope?.[expr]`,
  `instance?.name`) compiles without the allow list check. The deny list check
  runs at compile time for a static name, and at run time for a computed index.
  An optional access to an object that is `undefined` or `null` reads
  `undefined`. An optional access to a scope that is not available at the place
  is still a compile error (`RL-ENV-3`): `?.` relaxes the allow list, and not
  the availability.
- **RL-ENV-6** A run time deny list check that fails reads `undefined`, and
  logs one warning for each compiled function. It does not throw. Only a
  computed index can reach this check.
- **RL-ENV-7** `compileScopeValues(record, { scope })` compiles a record of
  computed values of one scope from data. Each entry is a value (`RL-VAL-1`)
  whose subject is the scope object, so a bare name in it reads the scope, and
  never an instance. The subject access lists of that compile are the
  declaration of the scope.

  ```jsonc
  "contextValues": {
    // host value rightOnLeft: true, false or absent; absent means true
    "isRightOnLeft": { "expression": "rightOnLeft !== false" },
    "defaultOrientation": { "expression": "isRightOnLeft ? 'R' : 'L'" }
  }
  ```

  A computed value cannot have the name of a host value (`RL-ENV-1`). So the
  computed value is `isRightOnLeft`, and not `rightOnLeft`. One name holds one
  value. The names of the computed values are added to the allow list of the
  scope.

- **RL-ENV-8** In data, a `?` suffix on a name makes the access optional, with
  the rules of `RL-ENV-5`. The suffix is allowed on:
  - a key of a scope map (`{ "context": { "siteCode?": "B2" } }`),
  - a subject key of a condition map (`{ "VendorFlag?": "Y" }`),
  - the name of a scope value (`{ "context": "siteCode?" }`),
  - a bare subject value, and the `attribute` of a value
    (`"VendorFlag?"`, `{ "attribute": "VendorFlag?", "as": "number" }`),
  - a template placeholder (`{context.siteCode?}`, the same as
    `{context?.siteCode}`).

  The compile strips one trailing `?` and reads the rest as the name. A name
  that holds `?` at another position is a compile error. No DICOM keyword and
  no registered name holds `?` (`RL-REG-2`), so the suffix is never part of a
  real name. For the subject, the suffix also relaxes the `lowercase:
'registryOnly'` check of the split consumer, so `"vendorFlag?"` reads the
  subject. The suffix never relaxes the deny list, and never makes an
  unavailable scope available (`RL-ENV-3`). A reserved key, a list key and a
  scope key take no suffix.

### Conditions (RL-COND)

- **RL-COND-1** A condition is one of these forms:

  | Form                               | Meaning                                                 |
  | ---------------------------------- | ------------------------------------------------------- |
  | map `{ Name: test, ... }`          | every entry holds                                       |
  | `{ all: [c, ...] }`                | every condition holds; `all: []` is `true`              |
  | `{ any: [c, ...] }`                | one condition holds; `any: []` is `false`               |
  | `{ not: c }`                       | the condition does not hold                             |
  | `{ expression: "..." }`            | the expression, coerced to a boolean                    |
  | `{ <list>: quantifiers }`          | a test over a list available at the place (`RL-COND-4`) |
  | `{ <scope>: { name: test, ... } }` | a test of a scope available at the place (`RL-ENV-2`)   |
  | a function                         | passes through (`RL-FN-1`)                              |

  The reserved keys, the list keys and the scope keys can appear in one map
  with subject keys. All of the keys of the map must hold.

- **RL-COND-2** The test of one map entry is one of:

  | Test             | Meaning                                                                                                 |
  | ---------------- | ------------------------------------------------------------------------------------------------------- |
  | scalar           | equals; a number and a numeric string are equal (`3` and `"3"`); a one-element array equals its element |
  | array of scalars | equals one of the elements                                                                              |
  | `null`           | the value is absent: `undefined`, `null` or `""`                                                        |
  | object           | exactly one operator of `RL-COND-3`                                                                     |

- **RL-COND-3** The operators are the names of
  `HangingProtocolService/lib/validator.js`: `equals`, `doesNotEqual`,
  `includes`, `doesNotInclude`, `contains`, `doesNotContain`, `containsI`,
  `doesNotContainI`, `containsAll`, `startsWith`, `endsWith`, `greaterThan`,
  `lessThan`, `range`, `notNull`. The operand is the bare value
  (`{ "greaterThan": 1 }`). The hanging protocol consumer also accepts the
  present form `{ "greaterThan": { "value": 1 } }`. Each operator has the
  semantics of `validator.js`. A shared table test (`RL-TEST-2`) holds the
  semantics for arrays and for numeric strings.
- **RL-COND-4** A list key holds quantifiers. The keys are `first`, `some`,
  `every`, `mixed` and `count`. All of the quantifiers of one list key must
  hold:

  | Quantifier                      | Holds when                                                                                 |
  | ------------------------------- | ------------------------------------------------------------------------------------------ |
  | `first: c`                      | the list is not empty, and `c` holds for element 0                                         |
  | `some: c`                       | `c` holds for one element                                                                  |
  | `every: c`                      | the list is not empty, and `c` holds for each element                                      |
  | `mixed: c`                      | `c` holds for one element and fails for another                                            |
  | `count: { min?, max?, where? }` | the number of elements for which `where` holds (default: every element) is in `[min, max]` |

- **RL-COND-5** A quantifier block evaluates once for each list instance and
  each compiled condition, and not once for each subject. A scope test
  evaluates once for each scope object. The compiled condition keeps the last
  result with the list array or the scope object as the key.

### Values (RL-VAL)

- **RL-VAL-1** A value is one of these forms:

  | Form                                                           | Result                                               |
  | -------------------------------------------------------------- | ---------------------------------------------------- |
  | `"Name"`                                                       | the subject attribute or the subject named attribute |
  | `{ attribute: "Name", as?: "number" \| "string", bucket?: n }` | the value, converted; `bucket` rounds `value / n`    |
  | `{ <scope>: "name" }`                                          | the scope attribute; strict access (`RL-ENV-4`)      |
  | `{ template: "text {Name} {scope.name} {scope?.name}" }`       | a string; an absent value gives `""`                 |
  | `{ condition: c }`                                             | the boolean result of the condition                  |
  | `{ expression: "..." }`                                        | the result of the expression, not coerced            |
  | a function                                                     | passes through (`RL-FN-1`)                           |

- **RL-VAL-2** A template placeholder follows the access rules of an
  expression: `{scope.name}` is strict, and `{scope?.name}` is optional.
- **RL-VAL-3** `as: "number"` gives `undefined` for an absent or a non-numeric
  value, and never `0`.

### Sort orders (RL-SORT)

- **RL-SORT-1** A sort order is a list of comparators. The next comparator
  decides when a comparator gives `0` or `NaN`.
- **RL-SORT-2** A comparator is one of these forms:

  | Form                                       | Order                                                                                                              |
  | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
  | `"Name"` (uppercase first letter)          | ascending by the attribute: numeric when both values are finite numbers, else by string; an absent value gives `0` |
  | `"name"` (lowercase first letter)          | the named sort function                                                                                            |
  | `{ attribute: "Name", descending?: true }` | as above, and reversed                                                                                             |
  | `{ expression: "..." }`                    | the expression with the parameters `a`, `b`, the available scopes and lists, and no implicit subject               |
  | a function                                 | passes through (`RL-FN-1`)                                                                                         |

### Expressions (RL-EXPR)

- **RL-EXPR-1** The grammar of the expression language stays as it is
  (`rules/expression/`), with one addition: the optional member access `?.name`
  and the optional index access `?.[expr]` (`RL-ENV-5`).
- **RL-EXPR-2** The parameters of an expression come from the declaration of
  the place, and the expression language holds no parameter name:
  - the subject parameter (`subject.param`, for example `instance`), which is
    also the implicit scope of a bare name,
  - one parameter for each scope available at the place, with the scope name,
  - one parameter for each list available at the place, with the list name.

  A comparator expression gets `a` and `b` in place of the subject parameter,
  and has no implicit scope.

- **RL-EXPR-3** The compile checks each member chain that starts at a
  parameter: `context.rightOnLeft` is a strict access to the `context` scope
  (`RL-ENV-4`), `context?.rightOnLeft` is an optional access (`RL-ENV-5`). A bare
  name is a strict access to the subject.
- **RL-EXPR-4** An expression can call a subject named attribute. `name()`
  calls it on the subject. `name(x)` calls it on `x`. The compile resolves the
  callee against the helper functions and then against the registry. An
  unknown callee is a compile error. A scope named attribute is a value of its
  scope (`context.defaultFlip`), and is not called.
- **RL-EXPR-5** The aggregates (`some`, `every`, `count`, `minOf`, `maxOf`,
  `sumOf`) take a list parameter (`count(series, DiffusionBValue != null)`), or
  a list attribute of a scope (`count(group.instances, ...)`).
- **RL-EXPR-6** An expression cannot call a named sort function. A sort
  function is available only at a sort place.

### Functions (RL-FN)

- **RL-FN-1** At every function place, an actual function passes through the
  compile as it is. A function place is: a whole condition, a nested
  condition, a map entry test (`(value, subject, env) => boolean`), a value, a
  comparator, and every consumer field of kind `'function'`.
- **RL-FN-2** JSON cannot hold a function. So a rule from JSON can run only the
  functions of the registry and of the rule language (`RL-SAFE-1`). Only host
  code puts a function into a rule.
- **RL-FN-3** A consumer accepts a whole rule as code. `compileRuleFields`
  sees that each field is already compiled, and keeps each field as it is.
  So a code rule and a data rule can sit in the same rule set, and a `$merge`
  of data onto a code rule replaces only the merged fields.
- **RL-FN-4** A function gets the whole environment. The allow lists and the
  deny lists apply to the rule data only. A host that must keep a value from
  host code keeps the value out of the scope (`RL-ENV-1` step 1).

### Consumers (RL-CONS)

- **RL-CONS-1** The split rule consumer declares:

  ```ts
  const SPLIT_ACCESS = {
    subject: {
      param: 'instance',
      // Uppercase DICOM keywords, private tags as hex, and the registry names.
      allow: '*',
      lowercase: 'registryOnly', // a lowercase bare name must be in the registry
      deny: hostDeny.subject, // e.g. PatientName, PatientID
    },
    scopes: {
      context: { allow: hostContextNames ?? '*', deny: hostDeny.context },
      group: {
        allow: [
          'instances',
          'instanceCount',
          'splitNumber',
          'splitKey',
          'ruleId',
          'groupId',
        ],
      },
    },
  };

  const SPLIT_RULE_FIELDS: RuleFieldTable = {
    priority: 'priority',
    description: { kind: 'string', optional: true },
    groupId: { kind: 'string', optional: true },
    viewportTypes: { kind: 'string', list: true, optional: true },
    // Per instance, before any group exists.
    matches: {
      kind: 'condition',
      optional: true,
      available: ['context'],
      lists: ['series'],
    },
    groupBy: {
      kind: 'value',
      list: true,
      optional: true,
      available: ['context'],
    },
    splitOnChange: { kind: 'value', optional: true, available: ['context'] },
    sortBy: {
      kind: 'comparator',
      list: true,
      optional: true,
      available: ['context'],
    },
    // Once for each group.
    attributes: {
      kind: 'value',
      record: true,
      optional: true,
      available: ['context', 'group'],
      lists: ['series'],
    },
  };
  ```

  `lowercase: 'registryOnly'` is the one subject option of the split consumer:
  it makes a lowercase bare name that the registry does not hold a compile
  error (`RL-REG-4`).

  The host supplies the context values with each split (OHIF: the mode or the
  user preferences, and the `useMetadataDisplaySet.contextValues` customization
  for computed values), and can add context names and deny names. A change of a
  context value has the same effect as a change of the rule set in the OHIF
  display set splitting specification (`SP-DET`): the display sets of the study
  split again.

- **RL-CONS-2** The split rule consumer maps the compiled fields onto the
  `SplitRule` hooks:

  | Rule field                     | `SplitRule` hook                                                                                                                                                                                                                  |
  | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `matches`                      | `matches(instance, ctx)`; the consumer passes `env = { context, series }`                                                                                                                                                         |
  | quantifier blocks in `matches` | `series({ instances })`, which computes each block once and stores the result under a generated key                                                                                                                               |
  | `context` tests in `matches`   | the same `matches`; a scope test does not depend on the instance, so it evaluates once for each `context` object (`RL-COND-5`)                                                                                                    |
  | `groupBy`                      | `groupBy`                                                                                                                                                                                                                         |
  | `splitOnChange`                | `runBy`                                                                                                                                                                                                                           |
  | `sortBy`                       | `compareInstances`, which chains the comparators                                                                                                                                                                                  |
  | `attributes`                   | `customAttributes(attributes, options)`: subject = `options.instances[0]`; `env = { context, group, series }`, with `group = createRuleScope('group', { instances, instanceCount, splitNumber, splitKey, ruleId, groupId }, ...)` |

- **RL-CONS-3** The display set factory always sets `splitKey`, `splitRuleId`,
  `splitGroupId`, `splitNumber`, `sopClassUids` and `isMultiFrame`. A rule does
  not ask for them, and `attributes` cannot overwrite them.
- **RL-CONS-4** The hanging protocol consumer declares:

  ```ts
  const HP_ACCESS = {
    subject: {
      param: 'displaySet',
      allow: '*',
      read: readDisplaySetOrInstance,
    },
    scopes: {
      context: { allow: hostContextNames ?? '*', deny: hostDeny.context },
    },
  };
  // matchingRules: available ['context'], lists ['instances']
  ```

  `readDisplaySetOrInstance` reads the own attribute of the display set, and
  then the attribute of `displaySet.instance`. The context values are the same
  host values as the split context, so a protocol and a split rule see one
  `rightOnLeft`. Its registry holds the callbacks of
  `HangingProtocolService.addCustomAttribute`, with the adapter of example 6.

- **RL-CONS-5** The present split rule format (`RawDisplaySetSelector`,
  `createDisplaySetSplitRules`) stays for one minor release. It translates each
  old rule to the new fields, and it logs one deprecation warning for each rule
  set.

### Tests (RL-TEST)

- **RL-TEST-1** A scenario fixture test exists for each of these: a DWI series
  with three gradient directions for each b-value; a CT series with a scout and
  an axial volume; an interleaved US series of single images and clips; a
  four-view MG series with `ViewCodeSequence` and no `ViewPosition`.
- **RL-TEST-2** One table of `(condition, subject, environment, expected)` rows
  runs through the split rule consumer and through the hanging protocol
  consumer, and both give the expected result for each row (`RL-SHARE-1`). The
  table covers arrays, numeric strings, `null`, `""` and each operator.
- **RL-TEST-3** An access table test covers, for a declared scope: a strict
  access to an allowed name, a disallowed name and a denied name; an optional
  access (`?.` in an expression, and the `?` suffix in a map key and a value)
  to an undeclared name and a denied name; a computed index under `"*"` and
  under a name list; a `?` at a position other than the end; and a scope that
  is not available at the place.
- **RL-TEST-4** The error tests check the rule id, the path and the error
  class. The error tests do not check the full message text.

## Examples

Each example gives the rule data, and then the function calls that the compile
makes from the data. The compiled code is a readable equivalent. The real
compile gives closures with the same behaviour. In the compiled code, `env` is
the environment of the call (`RL-API-2`). Inside a `SplitRule` hook, the
consumer builds `env` from the hook arguments (`{ context, series }`, plus
`group` in `customAttributes`). `read`, `looseEquals`,
`isAbsent`, `toFinite`, `text` and `compareAttribute` are the internal helpers
of the rule language.

All of the examples use this host registry:

```ts
import { createRuleRegistry } from '@cornerstonejs/metadata';

const registry = createRuleRegistry({
  attributes: {
    // OHIF: the stack SOP class handler owns the instance.
    isStackImage: (instance) => isStackImageInstance(instance),
    // Reads ViewCodeSequence; accepts an instance or a display set.
    mammoView: (subject) => readMammoView(subject.instance ?? subject),
    viewCode: (subject) => readViewCode(subject.instance ?? subject),
  },
  scopeAttributes: {
    context: {
      // Computed once for each context object from the host value rightOnLeft.
      defaultFlip: (context) => context.rightOnLeft === false,
    },
    group: {
      // Over the whole display set: "LCC,LMLO,RCC,RMLO".
      viewsPresent: (group) =>
        [...new Set(group.instances.map(readMammoView))].sort().join(','),
    },
  },
  sortFunctions: {
    // The OHIF instanceSortingCriteria.sortFunctions signature.
    byInstanceNumberDescending: (a, b) => b.InstanceNumber - a.InstanceNumber,
  },
});
```

The registry names the scopes `context` and `group` because the split consumer
declares them. The rule language does not know these names.

### Example 1: split rule, data only (DWI by b-value)

```jsonc
"dwiByBValue": {
  "priority": -1,
  "viewportTypes": ["stack"],
  "matches": {
    "series": { "first": { "Modality": "MR" } },
    "isStackImage": true,
    "DiffusionBValue": { "notNull": true }
  },
  "groupBy": [
    "SeriesInstanceUID",
    { "attribute": "DiffusionBValue", "as": "number" },
    "DiffusionGradientOrientation"
  ],
  "sortBy": ["SliceLocation"],
  "attributes": {
    "SeriesDescription": { "template": "{SeriesDescription} b={DiffusionBValue}" }
  }
}
```

Compiled:

```js
// series hook: once for each series
series: ({ instances }) => ({
  q0: instances.length > 0 && looseEquals(read(instances[0], 'Modality'), 'MR'),
}),

matches: (instance, ctx) =>
  ctx.series.q0 === true &&
  registry.attributes.isStackImage(instance, env) === true &&
  !isAbsent(read(instance, 'DiffusionBValue')),

groupBy: [
  (i) => read(i, 'SeriesInstanceUID'),
  (i) => toFinite(read(i, 'DiffusionBValue')),
  (i) => read(i, 'DiffusionGradientOrientation'),
],

compareInstances: (a, b) =>
  compareAttribute(read(a, 'SliceLocation'), read(b, 'SliceLocation')),

customAttributes: (_attrs, { instances }) => {
  const first = instances[0];
  return {
    SeriesDescription:
      `${text(read(first, 'SeriesDescription'))} b=${text(read(first, 'DiffusionBValue'))}`,
  };
},
```

### Example 2: split rule with a group attribute (mammography)

```jsonc
"mammoByView": {
  "priority": -1,
  "groupId": "mammography",
  "viewportTypes": ["stack"],
  "matches": { "Modality": "MG", "Rows": { "notNull": true } },
  "groupBy": ["SeriesInstanceUID", "ImageLaterality", "mammoView"],
  "sortBy": ["byInstanceNumberDescending"],
  "attributes": {
    "mammoView": "mammoView",
    "viewCode": { "attribute": "viewCode" },
    "viewsPresent": { "group": "viewsPresent" },
    "descriptionName": { "template": "{ImageLaterality}{mammoView}" }
  }
}
```

`mammoView` (bare) reads the subject: one instance. `{ "group": "viewsPresent" }`
reads the group: the whole display set. The text shows the difference
(`RL-SCOPE-1`).

Compiled:

```js
matches: (instance) =>
  looseEquals(read(instance, 'Modality'), 'MG') && !isAbsent(read(instance, 'Rows')),

groupBy: [
  (i) => read(i, 'SeriesInstanceUID'),
  (i) => read(i, 'ImageLaterality'),
  (i, env) => registry.attributes.mammoView(i, env),
],

compareInstances: (a, b, env) =>
  registry.sortFunctions.byInstanceNumberDescending(a, b, env),

customAttributes: (_attrs, { instances, splitNumber }) => {
  const first = instances[0];
  const group = createRuleScope('group',
    { instances, instanceCount: instances.length, splitNumber /* , ... */ },
    { registry, declaration: SPLIT_ACCESS.scopes.group });
  // group.viewsPresent is computed here, once for the group (RL-ENV-1 step 2)
  const env = { context, group, series };
  return {
    mammoView: registry.attributes.mammoView(first, env),
    viewCode: registry.attributes.viewCode(first, env),
    viewsPresent: group.viewsPresent,
    descriptionName:
      `${text(read(first, 'ImageLaterality'))}${text(registry.attributes.mammoView(first, env))}`,
  };
},
```

### Example 3: split rule with an expression, and a list count (small DX / CR series)

```jsonc
"dxCrSingleImages": {
  "priority": 3.5,
  "viewportTypes": ["stack"],
  "matches": {
    "series": { "count": { "max": 9 } },
    "Modality": ["DX", "CR"],
    "expression": "isStackImage() && !(NumberOfFrames > 1)"
  },
  "groupBy": ["SeriesInstanceUID", "SOPInstanceUID"]
}
```

Compiled:

```js
series: ({ instances }) => ({ q0: instances.length <= 9 }),

matches: (instance, ctx) =>
  ctx.series.q0 === true &&
  ['DX', 'CR'].some((v) => looseEquals(read(instance, 'Modality'), v)) &&
  Boolean(expression0(instance, env)),
// expression0 has the parameters (instance, context, series), from the
// declaration of `matches`. `isStackImage()` calls
// registry.attributes.isStackImage(instance, env) (RL-EXPR-4).
```

### Example 4: split rule that mixes code with data (an extension)

```ts
customizationService.setCustomizations({
  useMetadataDisplaySet: {
    splitRules: {
      $merge: {
        petByFrameReference: {
          priority: -1,
          viewportTypes: ['volume', 'stack'],
          matches: { Modality: 'PT', isStackImage: true }, // data
          groupBy: [
            'SeriesInstanceUID',
            // code: a value that data cannot state
            (instance) => frameOfReferenceGroup(instance),
          ],
          sortBy: [(a, b) => comparePetSlices(a, b)], // code
          attributes: { label: 'PET' }, // data: a literal
        },
      },
    },
  },
});
```

Compiled: `matches` and `attributes` compile from data. The `groupBy[1]`
function and the comparator pass through as they are (`RL-FN-1`). A later
`$merge` of `{ "priority": 2 }` from a JSON URL module changes only the
priority, and keeps the two functions (`RL-FN-3`).

### Example 5: hanging protocol, the same language on a display set

```jsonc
"displaySetSelectors": {
  "leftCC": {
    "seriesMatchingRules": [
      {
        "weight": 10,
        "required": true,
        "matches": { "Modality": "MG", "splitGroupId": "mammography", "mammoView": "CC" }
      },
      { "weight": 5, "matches": { "ImageLaterality": "L" } },
      { "weight": 1, "matches": { "instances": { "count": { "min": 1, "max": 1 } } } }
    ]
  }
}
```

Compiled by the hanging protocol consumer (subject = display set):

```js
// rule 0
(displaySet, env) =>
  looseEquals(read(displaySet, 'Modality'), 'MG') &&             // displaySet.instance.Modality
  looseEquals(read(displaySet, 'splitGroupId'), 'mammography') && // own attribute, lowercase
  looseEquals(registry.attributes.mammoView(displaySet, env), 'CC'),

// rule 2: env.instances = displaySet.instances
(displaySet, env) => {
  const n = env.instances.length;
  return n >= 1 && n <= 1;
},
```

`mammoView` is the same registry entry as in example 2 (`RL-SHARE-2`). The
function gets an instance from the split consumer and a display set from the
hanging protocol consumer, and handles both (`RL-EXT-5`). `splitGroupId` is
not in the registry, and the subject allow list is `"*"`, so the consumer reads
the subject (`RL-REG-4`).

### Example 6: an OHIF custom attribute in the registry

```ts
const hpRegistry = createRuleRegistry(
  {
    attributes: Object.fromEntries(
      Object.entries(
        hangingProtocolService.customAttributeRetrievalCallbacks
      ).map(([id, entry]) => [
        id,
        // adapter: (metadata, extraData) => (subject, env)
        (subject, env) => entry.callback.call(entry, subject, env.context),
      ])
    ),
  },
  registry
);
```

```jsonc
{ "weight": 3, "matches": { "timepointType": "baseline" } }
```

Compiled:

```js
(study, env) =>
  looseEquals(hpRegistry.attributes.timepointType(study, env), 'baseline');
```

### Example 7: branches on a scope value (rightOnLeft)

The host supplies the context value `rightOnLeft` from a user preference. The
deployment adds a computed context value as data:

```jsonc
"useMetadataDisplaySet": {
  "contextValues": {
    // Absent or true: right breast on the left of the screen.
    "isRightOnLeft": { "expression": "rightOnLeft !== false" }
  }
}
```

Two rules use the two branches. Only one of the two rules can claim an
instance, because only one `context` test holds in one split:

```jsonc
"mgRightOnLeft": {
  "priority": -2,
  "groupId": "mammography",
  "viewportTypes": ["stack"],
  "matches": {
    "context": { "rightOnLeft": { "doesNotEqual": false } },
    "Modality": "MG"
  },
  "groupBy": ["SeriesInstanceUID", "ImageLaterality", "mammoView"],
  "attributes": {
    "flipHorizontal": { "condition": { "ImageLaterality": "L" } },
    "orientationSource": { "context": "isRightOnLeft" }
  }
},
"mgLeftOnRight": {
  "priority": -2,
  "groupId": "mammography",
  "viewportTypes": ["stack"],
  "matches": {
    "context": { "rightOnLeft": false },
    "Modality": "MG"
  },
  "groupBy": ["SeriesInstanceUID", "ImageLaterality", "mammoView"],
  "attributes": {
    "flipHorizontal": { "condition": { "ImageLaterality": "R" } },
    "defaultFlip": { "context": "defaultFlip" }
  }
}
```

`"rightOnLeft"` under `context` reads the context. A bare `"rightOnLeft"` would
read the instance, and the split consumer rejects it, because a lowercase bare
name must be in the registry (`RL-CONS-1`).

Compiled:

```js
// once for each split
const context = createRuleScope('context', { rightOnLeft: false }, {
  registry,
  declaration: SPLIT_ACCESS.scopes.context,
  computed: compileScopeValues(contextValues, { registry, scope: 'context', ...SPLIT_ACCESS }),
});
// context = { rightOnLeft: false, isRightOnLeft: false, defaultFlip: true }

// mgRightOnLeft.matches
(instance, env) =>
  scopeTest0(env.context) &&               // once per context: !looseEquals(context.rightOnLeft, false)
  looseEquals(read(instance, 'Modality'), 'MG'),

// mgLeftOnRight.matches
(instance, env) =>
  scopeTest1(env.context) &&               // once per context: looseEquals(context.rightOnLeft, false)
  looseEquals(read(instance, 'Modality'), 'MG'),

// mgLeftOnRight.customAttributes
(_attrs, { instances }) => {
  const first = instances[0];
  return {
    flipHorizontal: looseEquals(read(first, 'ImageLaterality'), 'R'),
    defaultFlip: context.defaultFlip,     // scope named attribute from the registry
  };
},
```

The same branch in an expression is
`{ "expression": "context.rightOnLeft !== false && Modality == 'MG'" }`.
`context.rightOnLeft` reads the context with a strict access. `Modality` reads
the instance.

The hanging protocol gets the same context, so a protocol can use the same test:

```jsonc
{
  "weight": 10,
  "required": true,
  "matches": {
    "context": { "rightOnLeft": false },
    "splitGroupId": "mammography",
  },
}
```

### Example 8: strict and optional access

The host declares the context names `rightOnLeft` and `isRightOnLeft`, and
denies `userId`. At run time the host also supplies `siteCode`, which it did
not declare.

```ts
SPLIT_ACCESS.scopes.context = {
  allow: ['rightOnLeft', 'isRightOnLeft'], // plus defaultFlip from the registry (RL-REG-7)
  deny: ['userId'],
};
const context = createRuleScope(
  'context',
  { rightOnLeft: false, siteCode: 'B2', userId: 'u-17' },
  { registry, declaration: SPLIT_ACCESS.scopes.context }
);
// context = { rightOnLeft: false, siteCode: 'B2', isRightOnLeft: false, defaultFlip: true }
// userId is dropped (RL-ENV-1 step 1)
```

| Rule text                                 | Result                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `"context.rightOnLeft === false"`         | compiles; strict access, `rightOnLeft` is allowed                                                    |
| `"context.rightOnLft === false"`          | compile error: `context.rightOnLft` is not allowed; allowed: rightOnLeft, isRightOnLeft, defaultFlip |
| `"context?.siteCode == 'B2'"`             | compiles; optional access, reads `'B2'`                                                              |
| `"context?.siteCodee == 'B2'"`            | compiles; reads `undefined`, so the condition is `false`                                             |
| `"context?.userId"`                       | compile error: `userId` is on the deny list of `context`                                             |
| `{ "context": { "siteCode": "B2" } }`     | compile error: a map key is a strict access, and `siteCode` is not allowed                           |
| `{ "context": { "siteCode?": "B2" } }`    | compiles; optional access, the test holds                                                            |
| `{ "context": { "userId?": "u-17" } }`    | compile error: `userId` is on the deny list of `context`                                             |
| `{ "context": "siteCode?" }` (a value)    | compiles; reads `'B2'`                                                                               |
| `"group?.instanceCount > 1"` in `matches` | compile error: the scope `group` is not available in `matches`; available: context                   |

### Example 9: tests of the group (group-level places only)

```jsonc
"usStillsAndClips": {
  "priority": 1.5,
  "viewportTypes": ["stack"],
  "matches": { "Modality": "US", "isStackImage": true },
  "splitOnChange": { "condition": { "NumberOfFrames": { "greaterThan": 1 } } },
  "attributes": {
    "isClip": { "condition": { "NumberOfFrames": { "greaterThan": 1 } } },
    "label": {
      "expression": "group.instanceCount > 1 ? `US ${group.splitNumber} (${group.instanceCount})` : `US ${group.splitNumber}`"
    },
    "isSingleImage": { "condition": { "group": { "instanceCount": 1 } } }
  }
}
```

Compiled:

```js
customAttributes: (_attrs, { instances, splitNumber }) => {
  const first = instances[0];
  const group = createRuleScope('group',
    { instances, instanceCount: instances.length, splitNumber /* , ... */ },
    { registry, declaration: SPLIT_ACCESS.scopes.group });
  const env = { context, group, series };
  return {
    isClip: toFinite(read(first, 'NumberOfFrames')) > 1,
    label: expression0(first, env),     // parameters (instance, context, group, series)
    isSingleImage: looseEquals(group.instanceCount, 1),
  };
},
```

The same `group` test in `matches` is a compile error, because `matches` runs
before the group exists (`RL-SCOPE-6`):

```text
Invalid display set split rule: rule 'usStillsAndClips'.matches.group:
the scope 'group' is not available here; available: context
```

## Open questions

1. **Present marker.** This draft uses `{ "notNull": true }` (the hanging
   protocol name) for "present", and `null` for "absent". The review proposed
   `"*"`. In DICOM matching, `*` alone is universal matching, which also matches
   an empty value, so `"*"` would mean something different to a DICOM reader.
2. **One-element arrays.** `RL-COND-2` makes a one-element array equal its
   element. The shared table test must confirm that `validator.js` `equals`
   does the same, or the hanging protocol consumer needs an adapter.
3. **Subject deny list default.** `RL-CONS-1` takes the subject deny list from
   the host. A default deny list of patient identifiers would support the OHIF
   requirement `SP-DESC-6`, but it would also stop a rule that must read one.
4. **Name of the list for the hanging protocol.** `instances` for a display set
   subject. A study subject could bind `series` or `displaySets`.
5. **Multiframe instances.** A per-frame subject (frames of one instance) is
   future work in the split engine. The rule language needs no change for it:
   the consumer declares a different subject and list.
