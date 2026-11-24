import type { Codemod, Edit, SgRoot } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';
import { useMetricAtom } from 'codemod:metrics';
import {
  CORE_PACKAGE,
  CoreImports,
  EditSet,
  HeldMetric,
  analysed,
  bracketKey,
  coreSpecifiers,
  definitionAt,
  importSource,
  isNameTaken,
  isPure,
  isRenderingEngine,
  isStableBinding,
  mergedOperands,
  methodCall,
  referencesOf,
  removeProperty,
  site,
  staticKeyName,
  topLevelCoreTypes,
  unwrap,
  viewportEvidence,
} from './lib.ts';
import type { MergedPlace, Node } from './lib.ts';

/**
 * The table engine of the step: the shapes of the rules that a family file
 * lists, and the code that applies them to a file. A family lists its rules
 * in tables; what a table cannot say goes in the `rewrite` function of the
 * family, with the helpers of this file and of `lib.ts`.
 */

/** Sites that the reader changes. */
export const manual = new HeldMetric(useMetricAtom('cornerstone3d-6-manual'));

/** Rewrites at a decision of the migration guide. */
export const review = new HeldMetric(useMetricAtom('cornerstone3d-6-review'));

/**
 * Every rewritten site, by rule. Only a run with the parameter
 * `cornerstone3d-6-rewritten=true` fills it (the runner of
 * `packages/codemods/scripts` passes it); a user sees the two metrics above.
 */
export const rewritten = new HeldMetric(
  useMetricAtom('cornerstone3d-6-rewritten')
);

/** The parameter that turns the metric of the rewritten sites on. */
const REWRITTEN_PARAMETER = 'cornerstone3d-6-rewritten';

/**
 * The names of one package that name another path of it. `EVENTS` of the
 * core is `Enums.Events`.
 */
const PATH_ALIASES: Record<string, Record<string, string>> = {
  [CORE_PACKAGE]: { EVENTS: 'Enums.Events' },
};

/** What to read at two operands that a rename makes the same, by their place. */
const MERGED_NOTES: Record<MergedPlace, string> = {
  '||': 'two operands of one || are the same now, read what each tested before the rename',
  '&&': 'two operands of one && are the same now, read what each tested before the rename',
  case: 'two case labels of one switch are the same now, read what each chose before the rename',
  includes:
    'two entries of one list used with includes are the same now, read what each named before the rename',
};

/** The kinds of a name that refers to an imported binding. */
const REFERENCE_KINDS = [
  'identifier',
  'type_identifier',
  'shorthand_property_identifier',
];

/**
 * What a rule does at a site. With `to`, `moveTo` or `remove` it rewrites
 * the site; without them it reports it.
 */
interface Outcome {
  /** The new name, in the same place. */
  to?: string;
  /**
   * The text for the sites that the rule reports: each site of a rule that
   * does not rewrite, and each site that a rewriting rule cannot rewrite.
   * `true` reports the label alone.
   */
  manual?: string | true;
  /**
   * The text for each rewritten site in `cornerstone3d-6-review`. On a rule
   * that does not rewrite and has no `manual`, each site goes to the review
   * list as it is: a name that stays and does something else now.
   */
  review?: string | true;
  /** The label of the site in a report, in place of the one the rule builds. */
  label?: string;
}

/**
 * A name exported by a package: a top-level export such as `GenericViewport`,
 * or a member of an exported object, namespace or enum such as
 * `Enums.Events.VOI_MODIFIED`, `Types.EventTypes.X` or `utilities.x`.
 */
export interface ExportRule extends Outcome {
  /** The package, `@cornerstonejs/core` when not given. */
  package?: string;
  /** The path of the exported object that holds the name, such as `Enums.Events`. */
  namespace?: string;
  name: string;
  /**
   * The new path of the name from the top of the core package, such as
   * `displaySetRegistry`, when it moves to another object. Each use becomes
   * the new path, and the import that the new path needs is added.
   */
  moveTo?: string;
  /** The string value of an enum member: a string literal of it is reported. */
  value?: string;
}

/**
 * The receivers that a member rule knows: a Cornerstone viewport, a
 * rendering engine, a value whose type is a core type, or the value that a
 * method of a viewport returns.
 */
export type Receiver =
  | 'viewport'
  | 'engine'
  | { type: string }
  | { returnOf: string };

/** A member of a Cornerstone object, such as `viewport.getViewPresentation`. */
export interface MemberRule extends Outcome {
  receiver: Receiver;
  name: string;
}

/**
 * Where an object literal reaches Cornerstone: an argument of a function of
 * a package (by its path, such as `displaySetRegistry.add`), an argument of
 * a method of a proven receiver, or a value typed with a core type.
 */
export type KeyPlace =
  | { call: string; package?: string; argument?: number }
  | { receiver: Receiver; method: string; argument?: number }
  | { type: string };

/** A key of an object literal that reaches Cornerstone. */
export interface KeyRule extends Outcome {
  in: KeyPlace;
  /** The key, or a path of keys into nested object literals: `defaultOptions.orientation`. */
  key: string;
  /** Deletes the key where its value runs no code, and reports it elsewhere. */
  remove?: boolean;
}

/** The tables of one family. */
export interface Rules {
  exports?: ExportRule[];
  members?: MemberRule[];
  keys?: KeyRule[];
}

/** A family file: its tables and the rewrites that no table entry says. */
export interface Family {
  rules: Rules;
  rewrite?: (run: Run) => void;
}

/**
 * Returns one table of the entries of several, so that two lanes can keep
 * their entries apart in one family file.
 */
export function mergeRules(...tables: Rules[]): Rules {
  return {
    exports: tables.flatMap((table) => table.exports ?? []),
    members: tables.flatMap((table) => table.members ?? []),
    keys: tables.flatMap((table) => table.keys ?? []),
  };
}

/** The state of one run of the step on a file. */
export interface Run {
  root: SgRoot<TSX>;
  rootNode: Node;
  imports: CoreImports;
  edits: EditSet;
  /** The start of each node that a rewrite or a report has taken. */
  handled: Set<number>;
  countRewritten: boolean;
}

/** What shows a receiver: enough to rewrite, a name alone, or nothing. */
type Evidence = 'proven' | 'name' | undefined;

/**
 * Returns the state of a run on a file.
 */
export function createRun(
  root: SgRoot<TSX>,
  options?: { params?: Record<string, unknown> }
): Run {
  const rootNode = root.root();
  const parameter = options?.params?.[REWRITTEN_PARAMETER];

  return {
    root,
    rootNode,
    imports: new CoreImports(rootNode),
    edits: new EditSet(),
    handled: new Set(),
    countRewritten: parameter === true || parameter === 'true',
  };
}

/**
 * Returns the edits of a run, with those of the core imports, or null when
 * the run changed nothing.
 */
export function finishRun(run: Run): string | null {
  const importEdits = run.imports.edits();

  if (!run.edits.all().length && !importEdits.length) {
    return null;
  }

  return run.rootNode.commitEdits([...run.edits.all(), ...importEdits]);
}

/**
 * Returns the text of a report: the label, and the text after a colon.
 */
function ruleText(label: string, text: string | true | undefined): string {
  return typeof text === 'string' && text ? `${label}: ${text}` : label;
}

/**
 * Reports a site in `cornerstone3d-6-manual` or `cornerstone3d-6-review` and
 * marks it handled.
 */
export function report(
  run: Run,
  metric: 'manual' | 'review',
  rule: string,
  node: Node
): void {
  run.handled.add(node.range().start.index);
  (metric === 'manual' ? manual : review).increment(site(run.root, rule, node));
}

/**
 * Notes a rewritten site in the metric of the rewritten sites, when the run
 * counts them, and marks it handled.
 */
export function noteRewritten(run: Run, rule: string, node: Node): void {
  run.handled.add(node.range().start.index);

  if (run.countRewritten) {
    rewritten.increment(site(run.root, rule, node));
  }
}

/**
 * Tells whether a rule rewrites its sites.
 */
function rewrites(rule: ExportRule | MemberRule | KeyRule): boolean {
  return Boolean(
    rule.to ||
      ('moveTo' in rule && rule.moveTo) ||
      ('remove' in rule && rule.remove)
  );
}

/**
 * Reports a site of a rule that does not rewrite it: in the review list when
 * the rule has only a review text, otherwise in the manual list, with the
 * reason when there is one.
 */
function reportSite(
  run: Run,
  rule: Outcome,
  label: string,
  node: Node,
  reason?: string
): void {
  if (!rewrites(rule) && rule.review && !rule.manual) {
    report(run, 'review', ruleText(label, rule.review), node);

    return;
  }

  const text = [reason, typeof rule.manual === 'string' ? rule.manual : '']
    .filter(Boolean)
    .join(', ');

  report(run, 'manual', ruleText(label, text || undefined), node);
}

/**
 * Adds the edits of a rewritten site and reports it: in the review list when
 * the rule asks, and in the metric of the rewritten sites. Reports the site
 * in the manual list when another rewrite of the run overlaps it.
 */
function applyEdits(
  run: Run,
  rule: Outcome,
  label: string,
  node: Node,
  edits: Edit[],
  result: string
): boolean {
  if (!run.edits.add(...edits)) {
    reportSite(
      run,
      rule,
      label,
      node,
      'another rewrite of the line overlaps it'
    );

    return false;
  }

  noteRewritten(run, `${label} -> ${result}`, node);

  if (rule.review) {
    report(run, 'review', ruleText(label, rule.review), node);
  }

  return true;
}

/**
 * Returns a name with the characters of a regular expression escaped.
 */
function escapeRegex(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns a regular expression source that matches one of the names.
 */
function namesPattern(names: Iterable<string>): string {
  return `^(${[...names].map(escapeRegex).join('|')})$`;
}

/**
 * Joins two parts of a path.
 */
function joinPath(base: string, name: string): string {
  return base ? `${base}.${name}` : name;
}

/**
 * Returns a path of a package with its aliases resolved: `EVENTS.X` of the
 * core is `Enums.Events.X`.
 */
function resolveAlias(packageName: string, path: string): string {
  const aliases = PATH_ALIASES[packageName] ?? {};
  const [first, ...rest] = path.split('.');

  return aliases[first] ? [aliases[first], ...rest].join('.') : path;
}

/**
 * Returns the label of a path in a report: without a leading `Enums.`.
 */
function pathLabel(path: string): string {
  return path.replace(/^Enums\./, '');
}

/**
 * Tells whether a node lies inside an import statement.
 */
function inImport(node: Node): boolean {
  return node
    .ancestors()
    .some((ancestor) => ancestor.kind() === 'import_statement');
}

/** What an identifier is bound to by an import statement. */
interface ImportBinding {
  source: string;
  /** The imported name, or undefined for the namespace import. */
  name?: string;
  specifier: Node;
}

/**
 * Returns the import that an identifier refers to: its module, the
 * imported name or the namespace, and the node of the specifier.
 */
export function importOf(identifier: Node): ImportBinding | undefined {
  const target = definitionAt(identifier)?.node;

  if (!target) {
    return undefined;
  }

  const statement = target
    .ancestors()
    .find((ancestor) => ancestor.kind() === 'import_statement');
  const source = statement ? importSource(statement) : undefined;

  if (!statement || !source) {
    return undefined;
  }

  const specifier =
    target.kind() === 'import_specifier'
      ? target
      : target
          .ancestors()
          .find((ancestor) => ancestor.kind() === 'import_specifier');

  if (specifier) {
    return {
      source,
      name: specifier.field('name')?.text() ?? '',
      specifier,
    };
  }

  const isNamespace =
    target.kind() === 'namespace_import' ||
    target
      .ancestors()
      .some((ancestor) => ancestor.kind() === 'namespace_import') ||
    (target.kind() === 'import_clause' && target.text().startsWith('*'));

  return isNamespace ? { source, specifier: target } : undefined;
}

/**
 * Returns the key and the source object of a name that a `const`
 * destructuring pattern declares (`const { key } = source`,
 * `const { key: name } = source`), or undefined.
 */
function destructuredFrom(
  declaration: Node
): { key: string; source: Node } | undefined {
  let entry = declaration;
  let key: string | undefined;

  if (entry.parent()?.kind() === 'object_assignment_pattern') {
    entry = entry.parent();
  }

  const parent = entry.parent();

  if (declaration.kind() === 'shorthand_property_identifier_pattern') {
    key = declaration.text();
  } else if (parent?.kind() === 'assignment_pattern') {
    const pair = parent.parent();

    key =
      pair?.kind() === 'pair_pattern'
        ? staticKeyName(pair.field('key'))
        : undefined;
    entry = pair ?? entry;
  } else if (parent?.kind() === 'pair_pattern') {
    key =
      parent.field('value')?.id() === declaration.id()
        ? staticKeyName(parent.field('key'))
        : undefined;
    entry = parent;
  }

  const pattern = entry.parent();
  const declarator = pattern?.parent();

  if (
    !key ||
    pattern?.kind() !== 'object_pattern' ||
    declarator?.kind() !== 'variable_declarator' ||
    declarator.field('name')?.id() !== pattern.id() ||
    !isStableBinding(declaration)
  ) {
    return undefined;
  }

  const source = declarator.field('value');

  return source ? { key, source } : undefined;
}

/**
 * Returns the node that declares the binding that an identifier refers to,
 * when the binding holds one value for its whole scope.
 */
function stableDeclaration(identifier: Node): Node | undefined {
  const target = definitionAt(identifier)?.node;

  if (!target) {
    return undefined;
  }

  const declaration =
    target.kind() === 'variable_declarator'
      ? target.field('name')
      : target.kind() === 'required_parameter' ||
          target.kind() === 'optional_parameter'
        ? target.field('pattern')
        : target;

  return declaration && isStableBinding(declaration) ? declaration : undefined;
}

/**
 * Returns the path of an expression in a package: `''` for its namespace
 * import, `Enums.Events` for `Enums.Events` or for a `const` that holds it,
 * `Enums.Events` for `Events` of `const { Events } = Enums`, or undefined
 * when the expression is not a value of the package.
 */
export function pathOf(
  node: Node | null | undefined,
  packageName = CORE_PACKAGE,
  depth = 0
): string | undefined {
  if (!node || depth > 6) {
    return undefined;
  }

  const inner = unwrap(node);
  const kind = inner.kind();

  if (kind === 'member_expression' || kind === 'subscript_expression') {
    const property = inner.field('property');
    const name =
      kind === 'subscript_expression'
        ? bracketKey(inner)
        : property?.kind() === 'property_identifier'
          ? property.text()
          : undefined;
    const base = name
      ? pathOf(inner.field('object'), packageName, depth + 1)
      : undefined;

    return base === undefined
      ? undefined
      : resolveAlias(packageName, joinPath(base, name));
  }

  if (kind !== 'identifier') {
    return undefined;
  }

  const imported = importOf(inner);

  if (imported) {
    if (imported.source !== packageName) {
      return undefined;
    }

    return imported.name === undefined
      ? ''
      : resolveAlias(packageName, imported.name);
  }

  const declaration = stableDeclaration(inner);

  if (!declaration) {
    return undefined;
  }

  const holder = declaration.parent();

  if (
    holder?.kind() === 'variable_declarator' &&
    holder.field('name')?.id() === declaration.id()
  ) {
    return pathOf(holder.field('value'), packageName, depth + 1);
  }

  const destructured = destructuredFrom(declaration);
  const base = destructured
    ? pathOf(destructured.source, packageName, depth + 1)
    : undefined;

  return base === undefined
    ? undefined
    : resolveAlias(packageName, joinPath(base, destructured.key));
}

/**
 * Returns the path of the module of a nested type in a package: `Types` for
 * `Types.X`, `Types.EventTypes` for `cs.Types.EventTypes.X`, or undefined.
 */
function typeModulePath(
  module: Node | null | undefined,
  packageName: string
): string | undefined {
  if (!module) {
    return undefined;
  }

  if (module.kind() === 'identifier') {
    const imported = importOf(module);

    if (!imported || imported.source !== packageName) {
      return undefined;
    }

    return imported.name === undefined
      ? ''
      : resolveAlias(packageName, imported.name);
  }

  if (
    module.kind() !== 'nested_identifier' &&
    module.kind() !== 'member_expression'
  ) {
    return undefined;
  }

  const parts = module.children().filter((child) => child.isNamed());
  const base = typeModulePath(parts[0], packageName);
  const last = parts[parts.length - 1];

  return base === undefined || parts.length !== 2
    ? undefined
    : resolveAlias(packageName, joinPath(base, last.text()));
}

/**
 * Returns the core types at the top of the casts around an expression.
 */
function castTypes(node: Node): string[] {
  const names: string[] = [];
  let current: Node | undefined = node;

  while (current) {
    const kind = current.kind();
    const named = current.children().filter((child) => child.isNamed());

    if (kind === 'as_expression' || kind === 'satisfies_expression') {
      names.push(...topLevelCoreTypes(named[named.length - 1]));
      current = named[0];
    } else if (kind === 'type_assertion') {
      const typeArguments = named[0];

      names.push(
        ...topLevelCoreTypes(
          typeArguments?.children().find((child) => child.isNamed())
        )
      );
      current = named[named.length - 1];
    } else if (
      kind === 'parenthesized_expression' ||
      kind === 'non_null_expression'
    ) {
      current = named[0];
    } else {
      current = undefined;
    }
  }

  return names;
}

/**
 * Returns the core types of the annotation of the declaration of a name
 * whose binding holds one value, and the value it starts with.
 */
function declaredType(
  identifier: Node
): { typeNames: string[]; value?: Node } | undefined {
  const declaration = stableDeclaration(identifier);
  const holder = declaration?.parent();

  if (!holder) {
    return undefined;
  }

  const annotation = holder
    .children()
    .find((child) => child.kind() === 'type_annotation');
  const value =
    holder.kind() === 'variable_declarator' &&
    holder.field('name')?.id() === declaration.id()
      ? (holder.field('value') ?? undefined)
      : undefined;

  return { typeNames: topLevelCoreTypes(annotation), value };
}

/**
 * Tells whether an expression has a core type at its top: by a cast, or by
 * the annotation of a binding that holds one value.
 */
function hasCoreType(node: Node, typeName: string): boolean {
  if (castTypes(node).includes(typeName)) {
    return true;
  }

  const inner = unwrap(node);

  return (
    inner.kind() === 'identifier' &&
    Boolean(declaredType(inner)?.typeNames.includes(typeName))
  );
}

/**
 * Returns what shows that an expression is the value that a method of a
 * Cornerstone viewport returns: the call itself or a binding that holds it.
 */
function returnEvidence(node: Node, method: string, depth = 0): Evidence {
  const inner = unwrap(node);
  const call = methodCall(inner);

  if (call?.method === method) {
    const evidence = viewportEvidence(call.object);

    return evidence === 'core' ? 'proven' : evidence;
  }

  if (inner.kind() !== 'identifier' || depth > 2) {
    return undefined;
  }

  const value = declaredType(inner)?.value;

  return value ? returnEvidence(value, method, depth + 1) : undefined;
}

/**
 * Returns what shows that an expression is the receiver of a rule.
 */
export function receiverEvidence(
  node: Node | null | undefined,
  receiver: Receiver
): Evidence {
  if (!node) {
    return undefined;
  }

  if (receiver === 'viewport') {
    const evidence = viewportEvidence(node);

    return evidence === 'core' ? 'proven' : evidence;
  }

  if (receiver === 'engine') {
    return isRenderingEngine(node) ? 'proven' : undefined;
  }

  if ('type' in receiver) {
    return hasCoreType(node, receiver.type) ? 'proven' : undefined;
  }

  return returnEvidence(node, receiver.returnOf);
}

/**
 * Returns the edit that gives a key a new name. A string key and a string in
 * brackets keep their quotes.
 */
function renameKeyEdit(keyNode: Node, newName: string): Edit {
  const string =
    keyNode.kind() === 'computed_property_name'
      ? keyNode.children().find((child) => child.kind() === 'string')
      : keyNode.kind() === 'string'
        ? keyNode
        : undefined;

  if (string) {
    const quote = string.text()[0];

    return string.replace(`${quote}${newName}${quote}`);
  }

  return keyNode.replace(newName);
}

/**
 * Returns the edits that give a reference of an imported name another
 * expression: a shorthand property keeps its key, and an export of the name
 * keeps its public name.
 */
function referenceEdits(reference: Node, name: string, text: string): Edit[] {
  const parent = reference.parent();

  if (reference.kind() === 'shorthand_property_identifier') {
    return [reference.replace(`${name}: ${text}`)];
  }

  if (parent?.kind() === 'export_specifier' && !parent.field('alias')) {
    return /^[\w$]+$/.test(text) ? [parent.replace(`${text} as ${name}`)] : [];
  }

  return [reference.replace(text)];
}

/**
 * Returns the references of an import specifier in the file.
 */
function importReferences(run: Run, specifier: Node, local: string): Node[] {
  return run.rootNode
    .findAll({
      rule: {
        any: REFERENCE_KINDS.map((kind) => ({ kind })),
        regex: `^${escapeRegex(local)}$`,
      },
    })
    .filter(
      (node) =>
        !inImport(node) && importOf(node)?.specifier.id() === specifier.id()
    );
}

/**
 * Returns the text of the new path of a moved name at a node, with the
 * import that it needs, or undefined where the file cannot take the import.
 */
function movedText(
  run: Run,
  moveTo: string,
  at: Node,
  type: boolean
): string | undefined {
  const [first, ...rest] = moveTo.split('.');
  const local = run.imports.ensure(first, { type, at });

  return local ? [local, ...rest].join('.') : undefined;
}

/**
 * Renames a named import of the core and returns the local name that the
 * references of one specifier take: its alias, the local name of the new
 * name where the file imports it already, the new name where it is free,
 * and the old local name otherwise (`New as Old`), as `CoreImports.rename`
 * edits the specifiers.
 */
function renamedCoreLocal(
  run: Run,
  specifier: Node,
  name: string,
  to: string
): string {
  const alias = specifier.field('alias')?.text();
  const existing = coreSpecifiers(run.rootNode).find(
    (entry) => entry.name === to && entry.local.text() === to
  );
  const newLocal =
    alias ?? (existing || !isNameTaken(run.rootNode, to) ? to : name);

  run.imports.rename(name, to);

  return newLocal;
}

/**
 * Applies the rules of top-level names to one named import specifier of
 * their package: renames the import and its references, or moves them, or
 * reports them.
 */
function applyImportRule(run: Run, rule: ExportRule, specifier: Node): void {
  const packageName = rule.package ?? CORE_PACKAGE;
  const name = rule.name;
  const label = rule.label ?? name;
  const local = specifier.field('alias')?.text() ?? name;
  const references = importReferences(run, specifier, local);
  const sites = references.length ? references : [specifier];

  if (!rewrites(rule)) {
    sites.forEach((node) => reportSite(run, rule, label, node));

    return;
  }

  if (rule.remove) {
    sites.forEach((node) =>
      reportSite(run, rule, label, node, 'a removed name')
    );

    return;
  }

  if (rule.moveTo) {
    if (packageName !== CORE_PACKAGE) {
      sites.forEach((node) =>
        reportSite(run, rule, label, node, `moves to ${rule.moveTo}`)
      );

      return;
    }

    let left = 0;

    for (const reference of references) {
      const text = movedText(
        run,
        rule.moveTo,
        reference,
        reference.kind() === 'type_identifier'
      );
      const edits = text ? referenceEdits(reference, local, text) : [];

      if (!edits.length) {
        reportSite(run, rule, label, reference, `moves to ${rule.moveTo}`);
        left += 1;
      } else if (!applyEdits(run, rule, label, reference, edits, rule.moveTo)) {
        left += 1;
      }
    }

    if (!left) {
      run.imports.remove(name, local);
    }

    return;
  }

  const to = rule.to;

  if (packageName === CORE_PACKAGE) {
    const newLocal = renamedCoreLocal(run, specifier, name, to);

    if (newLocal === local || !references.length) {
      noteRewritten(run, `${label} -> ${to}`, specifier);

      if (rule.review) {
        report(run, 'review', ruleText(label, rule.review), specifier);
      }

      return;
    }

    for (const reference of references) {
      applyEdits(
        run,
        rule,
        label,
        reference,
        referenceEdits(reference, local, newLocal),
        to
      );
    }

    return;
  }

  const nameNode = specifier.field('name');
  const aliased = Boolean(specifier.field('alias'));
  const free = !aliased && !isNameTaken(run.rootNode, to);

  if (!nameNode) {
    return;
  }

  if (aliased || !free) {
    applyEdits(
      run,
      rule,
      label,
      specifier,
      [aliased ? nameNode.replace(to) : specifier.replace(`${to} as ${name}`)],
      to
    );

    return;
  }

  run.edits.add(nameNode.replace(to));

  for (const reference of references) {
    applyEdits(
      run,
      rule,
      label,
      reference,
      referenceEdits(reference, local, to),
      to
    );
  }
}

/**
 * Applies the rules of top-level names to the import and export statements
 * of each package: named imports, re-exports (`export { X } from`), and the
 * imports of a path under the package, which are reported.
 */
function applyStatementRules(run: Run, rules: ExportRule[]): void {
  const topLevel = rules.filter((rule) => !rule.namespace);

  if (!topLevel.length) {
    return;
  }

  for (const statement of run.rootNode.findAll({
    rule: { any: [{ kind: 'import_statement' }, { kind: 'export_statement' }] },
  })) {
    const source = importSource(statement);
    const isImport = statement.kind() === 'import_statement';

    if (!source) {
      continue;
    }

    for (const specifier of statement.findAll({
      rule: {
        kind: isImport ? 'import_specifier' : 'export_specifier',
      },
    })) {
      const name = specifier.field('name')?.text() ?? '';
      const exact = topLevel.find(
        (rule) =>
          rule.name === name && (rule.package ?? CORE_PACKAGE) === source
      );
      const subpath = topLevel.find(
        (rule) =>
          rule.name === name &&
          source.startsWith(`${rule.package ?? CORE_PACKAGE}/`)
      );

      if (subpath) {
        reportSite(
          run,
          subpath,
          subpath.label ?? name,
          specifier,
          `imported from ${source}`
        );
      } else if (exact && isImport) {
        applyImportRule(run, exact, specifier);
      } else if (exact) {
        applyReExport(run, exact, specifier);
      }
    }
  }
}

/**
 * Applies a rule of a top-level name to a re-export of it: a renamed name
 * keeps its public name through `as`; a moved or removed name is reported.
 */
function applyReExport(run: Run, rule: ExportRule, specifier: Node): void {
  const label = rule.label ?? rule.name;
  const nameNode = specifier.field('name');

  if (!rule.to || !nameNode) {
    reportSite(run, rule, label, specifier);

    return;
  }

  applyEdits(
    run,
    rule,
    label,
    specifier,
    [
      specifier.field('alias')
        ? nameNode.replace(rule.to)
        : specifier.replace(`${rule.to} as ${rule.name}`),
    ],
    rule.to
  );
}

/**
 * Applies a rule of a member of an exported object at a member access, a
 * string in brackets, or a nested type: renames the member, moves the whole
 * access, or reports it. Tells whether it moved the access.
 */
function applyMemberAccess(
  run: Run,
  rule: ExportRule,
  node: Node,
  nameNode: Node,
  type: boolean
): boolean {
  const label =
    rule.label ?? pathLabel(joinPath(rule.namespace ?? '', rule.name));

  if (!rewrites(rule)) {
    reportSite(run, rule, label, node);

    return false;
  }

  if (rule.moveTo) {
    const text =
      (rule.package ?? CORE_PACKAGE) === CORE_PACKAGE
        ? movedText(run, rule.moveTo, node, type)
        : undefined;

    if (text && node.kind() !== 'subscript_expression') {
      return applyEdits(
        run,
        rule,
        label,
        node,
        [node.replace(text)],
        rule.moveTo
      );
    }

    reportSite(run, rule, label, node, `moves to ${rule.moveTo}`);

    return false;
  }

  if (rule.remove) {
    reportSite(run, rule, label, node, 'a removed name');

    return false;
  }

  applyEdits(
    run,
    rule,
    label,
    node,
    [renameKeyEdit(nameNode, rule.to)],
    rule.to
  );

  return false;
}

/**
 * Returns the name at the start of a chain of member accesses:
 * `utilities` for `utilities.a.b`.
 */
function chainRoot(node: Node | null | undefined): Node | undefined {
  let current = node ? unwrap(node) : undefined;

  while (current?.kind() === 'member_expression') {
    current = unwrap(current.field('object'));
  }

  return current?.kind() === 'identifier' ? current : undefined;
}

/**
 * Drops the named core imports that a move left without a use: the
 * `utilities` of `utilities.x` where every use of it moved.
 */
function dropMovedImports(run: Run, roots: Node[]): void {
  const done = new Set<number>();

  for (const root of roots) {
    const imported = importOf(root);

    if (
      !imported?.name ||
      imported.source !== CORE_PACKAGE ||
      done.has(imported.specifier.id())
    ) {
      continue;
    }

    done.add(imported.specifier.id());

    const local = imported.specifier.field('alias')?.text() ?? imported.name;
    const references = importReferences(run, imported.specifier, local);

    if (references.every((reference) => run.edits.covers(reference))) {
      run.imports.remove(imported.name, local);
    }
  }
}

/**
 * Returns the rules of exported names by their package.
 */
function rulesByPackage(rules: ExportRule[]): Map<string, ExportRule[]> {
  const byPackage = new Map<string, ExportRule[]>();

  for (const rule of rules) {
    const packageName = rule.package ?? CORE_PACKAGE;

    byPackage.set(packageName, [...(byPackage.get(packageName) ?? []), rule]);
  }

  return byPackage;
}

/**
 * Returns the rule of a member of an exported object at a path, or
 * undefined.
 */
function ruleAt(
  rules: ExportRule[],
  base: string | undefined,
  name: string
): ExportRule | undefined {
  if (base === undefined) {
    return undefined;
  }

  return rules.find(
    (rule) => (rule.namespace ?? '') === base && rule.name === name
  );
}

/**
 * Applies the rules of exported names at member accesses, strings in
 * brackets and nested types, for one package.
 */
function applyAccessRules(
  run: Run,
  packageName: string,
  rules: ExportRule[]
): void {
  const names = new Set(rules.map((rule) => rule.name));
  const pattern = namesPattern(names);
  const movedRoots: Node[] = [];

  for (const node of run.rootNode.findAll({
    rule: {
      any: [
        {
          kind: 'member_expression',
          has: { field: 'property', regex: pattern },
        },
        {
          kind: 'subscript_expression',
          has: { field: 'index', kind: 'string' },
        },
      ],
    },
  })) {
    const isBracket = node.kind() === 'subscript_expression';
    const nameNode = isBracket ? node.field('index') : node.field('property');
    const name = isBracket ? bracketKey(node) : nameNode?.text();

    if (!name || !names.has(name) || !nameNode) {
      continue;
    }

    if (run.handled.has(nameNode.range().start.index)) {
      continue;
    }

    const rule = ruleAt(rules, pathOf(node.field('object'), packageName), name);

    if (!rule) {
      continue;
    }

    run.handled.add(nameNode.range().start.index);

    if (applyMemberAccess(run, rule, node, nameNode, false)) {
      const root = chainRoot(node.field('object'));

      if (root) {
        movedRoots.push(root);
      }
    }
  }

  dropMovedImports(run, movedRoots);

  for (const node of run.rootNode.findAll({
    rule: { kind: 'nested_type_identifier' },
  })) {
    const named = node.children().filter((child) => child.isNamed());
    const nameNode = named[named.length - 1];
    const name = nameNode?.text() ?? '';

    if (!names.has(name)) {
      continue;
    }

    const rule = ruleAt(rules, typeModulePath(named[0], packageName), name);

    if (rule) {
      applyMemberAccess(run, rule, node, nameNode, true);
    }
  }
}

/**
 * Applies the rules of exported names to the destructuring patterns of an
 * exported object, such as `const { VOI_MODIFIED } = Enums.Events`. A
 * renamed shorthand entry and its uses take the new name when it is free
 * and each use is a plain name; otherwise the entry becomes
 * `NEW: OLD` and its uses stay. A computed key and a rest element of such a
 * pattern are reported.
 */
function applyPatternRules(
  run: Run,
  packageName: string,
  rules: ExportRule[]
): void {
  const namespaces = new Set(rules.map((rule) => rule.namespace ?? ''));

  for (const pattern of run.rootNode.findAll({
    rule: { kind: 'object_pattern' },
  })) {
    const declarator = pattern.parent();
    const value =
      declarator?.kind() === 'variable_declarator' &&
      declarator.field('name')?.id() === pattern.id()
        ? declarator.field('value')
        : undefined;
    const base = value ? pathOf(value, packageName) : undefined;

    if (base === undefined || !namespaces.has(base)) {
      continue;
    }

    for (const entry of pattern.children()) {
      applyPatternEntry(run, rules, base, entry);
    }
  }
}

/**
 * Applies the rule of one entry of a destructuring pattern of an exported
 * object.
 */
function applyPatternEntry(
  run: Run,
  rules: ExportRule[],
  base: string,
  entry: Node
): void {
  const kind = entry.kind();
  const keyNode =
    kind === 'shorthand_property_identifier_pattern'
      ? entry
      : kind === 'object_assignment_pattern'
        ? entry.field('left')
        : kind === 'pair_pattern'
          ? entry.field('key')
          : undefined;
  const name = staticKeyName(keyNode);

  if (kind === 'rest_pattern' || (keyNode && !name)) {
    report(
      run,
      'manual',
      `${pathLabel(base) || 'the namespace'}: ${kind === 'rest_pattern' ? 'a rest element' : 'a computed key'}`,
      entry
    );

    return;
  }

  const rule = name ? ruleAt(rules, base, name) : undefined;

  if (!rule || !keyNode || run.handled.has(keyNode.range().start.index)) {
    return;
  }

  const label = rule.label ?? pathLabel(joinPath(base, name));

  keyNode
    .findAll({ rule: { kind: 'string' } })
    .forEach((string) => run.handled.add(string.range().start.index));

  if (!rule.to) {
    reportSite(
      run,
      rule,
      label,
      entry,
      rule.moveTo ? `moves to ${rule.moveTo}` : undefined
    );

    return;
  }

  if (kind === 'shorthand_property_identifier_pattern') {
    const uses = referencesOf(entry);
    const plain = uses.every((use) => use.kind() === 'identifier');

    if (plain && !isNameTaken(run.rootNode, rule.to)) {
      applyEdits(
        run,
        rule,
        label,
        entry,
        [entry.replace(rule.to), ...uses.map((use) => use.replace(rule.to))],
        rule.to
      );

      return;
    }

    applyEdits(
      run,
      rule,
      label,
      entry,
      [entry.replace(`${rule.to}: ${name}`)],
      rule.to
    );

    return;
  }

  if (kind === 'object_assignment_pattern') {
    applyEdits(
      run,
      rule,
      label,
      entry,
      [keyNode.replace(`${rule.to}: ${name}`)],
      rule.to
    );

    return;
  }

  applyEdits(
    run,
    rule,
    label,
    entry,
    [renameKeyEdit(keyNode, rule.to)],
    rule.to
  );
}

/**
 * Reports the string literals that hold the value of a renamed enum member,
 * such as `'CORNERSTONE_VOI_MODIFIED'`: a listener of it compiles and never
 * runs. A string that a rule took as a key is not reported again.
 */
function applyValueRules(run: Run, rules: ExportRule[]): void {
  const byValue = new Map(
    rules.filter((rule) => rule.value).map((rule) => [rule.value, rule])
  );

  if (!byValue.size) {
    return;
  }

  for (const node of run.rootNode.findAll({ rule: { kind: 'string' } })) {
    const value = node.text().slice(1, -1);
    const rule = byValue.get(value);

    if (rule && !run.handled.has(node.range().start.index) && !inImport(node)) {
      report(run, 'manual', `'${value}'`, node);
    }
  }
}

/**
 * Applies the rules of exported names.
 */
function applyExportRules(run: Run, rules: ExportRule[]): void {
  if (!rules.length) {
    return;
  }

  applyStatementRules(run, rules);

  for (const [packageName, packageRules] of rulesByPackage(rules)) {
    applyAccessRules(run, packageName, packageRules);
    applyPatternRules(run, packageName, packageRules);
  }

  applyValueRules(run, rules);
}

/**
 * Applies the rules of members of Cornerstone objects: a member access, a
 * string in brackets, a destructured key and the string of an `in` test on
 * a proven receiver are renamed; on a receiver that only its name shows,
 * they are reported.
 */
function applyMemberRules(run: Run, rules: MemberRule[]): void {
  if (!rules.length) {
    return;
  }

  const pattern = namesPattern(new Set(rules.map((rule) => rule.name)));

  for (const node of run.rootNode.findAll({
    rule: {
      any: [
        {
          kind: 'member_expression',
          has: { field: 'property', regex: pattern },
        },
        {
          kind: 'subscript_expression',
          has: { field: 'index', kind: 'string' },
        },
        {
          kind: 'binary_expression',
          has: { field: 'left', kind: 'string' },
        },
      ],
    },
  })) {
    const kind = node.kind();
    const isIn =
      kind === 'binary_expression' && node.field('operator')?.text() === 'in';

    if (kind === 'binary_expression' && !isIn) {
      continue;
    }

    const nameNode =
      kind === 'member_expression'
        ? node.field('property')
        : kind === 'subscript_expression'
          ? node.field('index')
          : node.field('left');
    const name =
      kind === 'member_expression'
        ? nameNode?.text()
        : nameNode?.text().slice(1, -1);
    const object = isIn ? node.field('right') : node.field('object');

    for (const rule of rules.filter((candidate) => candidate.name === name)) {
      if (applyMemberSite(run, rule, node, nameNode, object)) {
        break;
      }
    }
  }

  applyMemberPatterns(run, rules);
}

/**
 * Applies a member rule at one site, and tells whether its receiver is the
 * rule's.
 */
function applyMemberSite(
  run: Run,
  rule: MemberRule,
  node: Node,
  nameNode: Node,
  object: Node | null
): boolean {
  const evidence = receiverEvidence(object, rule.receiver);
  const label = rule.label ?? rule.name;

  if (!evidence || run.handled.has(nameNode.range().start.index)) {
    return false;
  }

  run.handled.add(nameNode.range().start.index);

  if (evidence === 'name' || !rewrites(rule)) {
    reportSite(run, rule, label, node);
  } else if (rule.to) {
    applyEdits(
      run,
      rule,
      label,
      node,
      [renameKeyEdit(nameNode, rule.to)],
      rule.to
    );
  } else {
    reportSite(run, rule, label, node, 'a removed member');
  }

  return true;
}

/**
 * Applies the member rules to the destructuring patterns of a proven
 * receiver, such as `const { getViewPresentation } = viewport`.
 */
function applyMemberPatterns(run: Run, rules: MemberRule[]): void {
  for (const pattern of run.rootNode.findAll({
    rule: { kind: 'object_pattern' },
  })) {
    const declarator = pattern.parent();
    const value =
      declarator?.kind() === 'variable_declarator' &&
      declarator.field('name')?.id() === pattern.id()
        ? declarator.field('value')
        : undefined;

    if (!value) {
      continue;
    }

    for (const entry of pattern.children()) {
      const keyNode =
        entry.kind() === 'shorthand_property_identifier_pattern'
          ? entry
          : entry.kind() === 'object_assignment_pattern'
            ? entry.field('left')
            : entry.kind() === 'pair_pattern'
              ? entry.field('key')
              : undefined;
      const name = staticKeyName(keyNode);
      const rule = rules.find(
        (candidate) =>
          candidate.name === name && receiverEvidence(value, candidate.receiver)
      );

      if (!rule || !keyNode) {
        continue;
      }

      const label = rule.label ?? rule.name;
      const evidence = receiverEvidence(value, rule.receiver);

      if (evidence === 'name' || !rule.to) {
        reportSite(run, rule, label, entry);
      } else {
        applyEdits(
          run,
          rule,
          label,
          entry,
          [
            keyNode.kind() === 'shorthand_property_identifier_pattern'
              ? keyNode.replace(`${rule.to}: ${name}`)
              : renameKeyEdit(keyNode, rule.to),
          ],
          rule.to
        );
      }
    }
  }
}

/**
 * Returns the object literals that an argument gives: the literal itself,
 * each object of an array literal, or the literal that a `const` holds.
 */
function objectsOf(argument: Node | undefined, depth = 0): Node[] {
  if (!argument || depth > 1) {
    return [];
  }

  const inner = unwrap(argument);
  const kind = inner.kind();

  if (kind === 'object') {
    return [inner];
  }

  if (kind === 'array') {
    return inner
      .children()
      .filter((child) => child.isNamed())
      .flatMap((child) =>
        unwrap(child).kind() === 'object' ? [unwrap(child)] : []
      );
  }

  if (kind !== 'identifier') {
    return [];
  }

  const value = declaredType(inner)?.value;

  return value ? objectsOf(value, depth + 1) : [];
}

/**
 * Returns the label of the place of a key rule.
 */
function placeLabel(place: KeyPlace): string {
  if ('call' in place) {
    return place.call;
  }

  return 'method' in place ? place.method : place.type;
}

/**
 * Returns the object literals of a file that a key rule reaches, each with
 * what shows it: proven, or a receiver shown by its name alone.
 */
export function placeObjects(
  run: Run,
  place: KeyPlace
): { object: Node; evidence: Evidence; at: Node }[] {
  const found: { object: Node; evidence: Evidence; at: Node }[] = [];

  if ('type' in place) {
    for (const node of run.rootNode.findAll({
      rule: {
        any: [
          { kind: 'variable_declarator' },
          { kind: 'as_expression' },
          { kind: 'satisfies_expression' },
        ],
      },
    })) {
      const isDeclarator = node.kind() === 'variable_declarator';
      const typed = isDeclarator
        ? topLevelCoreTypes(
            node.children().find((child) => child.kind() === 'type_annotation')
          ).includes(place.type)
        : castTypes(node).includes(place.type);
      const value = isDeclarator
        ? node.field('value')
        : node.children().find((child) => child.isNamed());

      if (typed && value) {
        objectsOf(value, 1).forEach((object) =>
          found.push({ object, evidence: 'proven', at: object })
        );
      }
    }

    return found;
  }

  for (const call of run.rootNode.findAll({
    rule: { kind: 'call_expression' },
  })) {
    const callee = call.field('function');
    const args =
      call
        .field('arguments')
        ?.children()
        .filter((child) => child.isNamed() && child.kind() !== 'comment') ?? [];
    let evidence: Evidence;

    if ('call' in place) {
      evidence =
        callee && pathOf(callee, place.package ?? CORE_PACKAGE) === place.call
          ? 'proven'
          : undefined;
    } else {
      const parts = methodCall(call);

      evidence =
        parts?.method === place.method
          ? receiverEvidence(parts.object, place.receiver)
          : undefined;
    }

    if (evidence) {
      objectsOf(args[place.argument ?? 0]).forEach((object) =>
        found.push({ object, evidence, at: call })
      );
    }
  }

  return found;
}

/**
 * Returns the entry of an object literal with a key, and the node of its
 * key: a pair, a shorthand property or a method.
 */
export function entryOf(
  object: Node,
  key: string
): { entry: Node; keyNode: Node } | undefined {
  for (const child of object.children()) {
    const kind = child.kind();
    const keyNode =
      kind === 'pair' || kind === 'method_definition'
        ? child.field(kind === 'pair' ? 'key' : 'name')
        : kind === 'shorthand_property_identifier'
          ? child
          : undefined;

    if (keyNode && staticKeyName(keyNode) === key) {
      return { entry: child, keyNode };
    }
  }

  return undefined;
}

/**
 * Returns the object literal at a path of keys inside an object literal.
 */
export function objectAtPath(object: Node, path: string[]): Node | undefined {
  let current: Node | undefined = object;

  for (const key of path) {
    const found = current ? entryOf(current, key) : undefined;
    const value =
      found?.entry.kind() === 'pair' ? found.entry.field('value') : undefined;

    current =
      value && unwrap(value).kind() === 'object' ? unwrap(value) : undefined;
  }

  return current;
}

/**
 * Applies one key rule to one object literal that reaches its place.
 */
function applyKeySite(
  run: Run,
  rule: KeyRule,
  object: Node,
  evidence: Evidence
): void {
  const path = rule.key.split('.');
  const key = path[path.length - 1];
  const holder = objectAtPath(object, path.slice(0, -1));
  const found = holder ? entryOf(holder, key) : undefined;
  const label = rule.label ?? `${placeLabel(rule.in)}: the key ${rule.key}`;

  if (!found || run.handled.has(found.keyNode.range().start.index)) {
    return;
  }

  const { entry, keyNode } = found;

  run.handled.add(keyNode.range().start.index);

  if (evidence === 'name' || !rewrites(rule)) {
    reportSite(run, rule, label, entry);

    return;
  }

  if (rule.remove) {
    const value = entry.kind() === 'pair' ? entry.field('value') : undefined;

    if (
      entry.kind() === 'shorthand_property_identifier' ||
      (value && isPure(value))
    ) {
      applyEdits(run, rule, label, entry, [removeProperty(entry)], 'removed');
    } else {
      reportSite(run, rule, label, entry, 'its value runs code');
    }

    return;
  }

  if (rule.to && entryOf(holder, rule.to)) {
    reportSite(run, rule, label, entry, `the object has ${rule.to} already`);

    return;
  }

  applyEdits(
    run,
    rule,
    label,
    entry,
    [
      entry.kind() === 'shorthand_property_identifier'
        ? entry.replace(`${rule.to}: ${key}`)
        : renameKeyEdit(keyNode, rule.to),
    ],
    rule.to
  );
}

/**
 * Applies the rules of keys of object literals that reach Cornerstone.
 */
function applyKeyRules(run: Run, rules: KeyRule[]): void {
  const places = new Map<string, ReturnType<typeof placeObjects>>();

  for (const rule of rules) {
    const place = JSON.stringify(rule.in);

    if (!places.has(place)) {
      places.set(place, placeObjects(run, rule.in));
    }

    for (const { object, evidence } of places.get(place)) {
      applyKeySite(run, rule, object, evidence);
    }
  }
}

/**
 * Applies the tables of the families to a file: the rules of exported
 * names, then of members, then of keys.
 */
export function applyRules(run: Run, rules: Rules[]): void {
  applyExportRules(
    run,
    rules.flatMap((table) => table.exports ?? [])
  );
  applyMemberRules(
    run,
    rules.flatMap((table) => table.members ?? [])
  );
  applyKeyRules(
    run,
    rules.flatMap((table) => table.keys ?? [])
  );
}

/**
 * Reports two operands that the rewrites of the run make the same
 * expression: in a chain of `||` or of `&&`, as `case` labels of one
 * `switch`, or as entries of a list used with `includes`. Two events or two
 * names that 6.0 merges into one are one test after the rename.
 */
export function reportMergedOperands(run: Run): void {
  for (const merged of mergedOperands(run.rootNode, run.edits.all())) {
    const name = merged.inserted.find((text) =>
      /^['"]?[A-Za-z_$][\w$]*['"]?$/.test(text)
    );

    if (name) {
      report(
        run,
        'review',
        `${name.replace(/['"]/g, '')}: ${MERGED_NOTES[merged.place]}`,
        merged.node
      );
    }
  }
}

/**
 * Returns the transform of a list of families. Each family first rewrites
 * what its tables cannot say, then the tables of all families run: the
 * exported names, the members of Cornerstone objects and the keys of
 * objects that reach Cornerstone. Two operands that the rewrites make the
 * same are reported for review. A file that cannot be analysed stays as it
 * is, with one manual entry.
 */
export function familiesCodemod(families: Family[]): Codemod<TSX> {
  const codemod: Codemod<TSX> = (root, options) => {
    const run = createRun(root, options);

    for (const family of families) {
      family.rewrite?.(run);
    }

    applyRules(
      run,
      families.map((family) => family.rules)
    );
    reportMergedOperands(run);

    return finishRun(run);
  };

  return analysed(codemod, manual, review, rewritten);
}
