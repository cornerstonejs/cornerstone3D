import type { Edit, SgNode, SgRoot } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';

/**
 * Helpers shared by the Cornerstone3D 6.0 transforms. Each registry package is
 * published on its own, so each keeps a copy of this file;
 * `scripts/validate-registry-packages.mjs` checks that the copies are equal.
 */

/** A node of a TypeScript or JavaScript file. */
export type Node = SgNode<TSX>;

/** The package whose names the transforms rewrite. */
export const CORE_PACKAGE = '@cornerstonejs/core';

/** The longest line that a regenerated import statement keeps on one line. */
const IMPORT_LINE_LENGTH = 80;

/** A name of a viewport variable: `viewport`, `stackViewport`, `viewport2`. */
const VIEWPORT_NAME = /viewport\d*$/i;

/** A name of an array of viewports. */
const VIEWPORTS_NAME = /viewports$/i;

/** The family of each viewport type name, legacy and 6.0. */
const FAMILY_OF_TYPE: Record<string, ViewportFamily> = {
  PlanarViewport: 'planar',
  IStackViewport: 'planar',
  IVolumeViewport: 'planar',
  IBaseVolumeViewport: 'planar',
  StackViewport: 'planar',
  VolumeViewport: 'planar',
  BaseVolumeViewport: 'planar',
  VolumeViewport3D: '3d',
  GenericVolumeViewport3D: '3d',
  LegacyVolumeViewport3D: '3d',
  VideoViewport: 'video',
  IVideoViewport: 'video',
  VideoGenericViewport: 'video',
  WSIViewport: 'wsi',
  IWSIViewport: 'wsi',
  WSIGenericViewport: 'wsi',
  ECGViewport: 'ecg',
  IECGViewport: 'ecg',
  ECGGenericViewport: 'ecg',
};

/** The viewport families of 6.0. */
export type ViewportFamily = 'planar' | '3d' | 'video' | 'wsi' | 'ecg';

/** The node kinds that start a function scope. */
const FUNCTION_KINDS = new Set([
  'function_declaration',
  'function_expression',
  'function',
  'arrow_function',
  'method_definition',
  'generator_function_declaration',
  'generator_function',
]);

/** One named specifier of an import statement. */
interface ImportSpecifierInfo {
  name: string;
  local: string;
  isType: boolean;
}

/** A named import statement of the core package and its pending changes. */
interface NamedImport {
  node: Node;
  typeOnly: boolean;
  multiline: boolean;
  quote: string;
  specifiers: ImportSpecifierInfo[];
  changed: boolean;
}

/** A name that a transform asks the core import to bring in. */
interface ImportAddition {
  name: string;
  local: string;
  isType: boolean;
}

/**
 * Returns the module that an import statement reads from.
 */
export function importSource(statement: Node): string | undefined {
  const source = statement.field('source');

  return source ? source.text().slice(1, -1) : undefined;
}

/**
 * Returns the specifier node of a named import, or undefined.
 */
function specifierInfo(
  specifier: Node,
  typeOnly: boolean
): ImportSpecifierInfo {
  const name = specifier.field('name')?.text() ?? '';
  const alias = specifier.field('alias')?.text();

  return {
    name,
    local: alias ?? name,
    isType:
      typeOnly || specifier.children().some((child) => child.kind() === 'type'),
  };
}

/**
 * The imports of `@cornerstonejs/core` in one file. A transform asks it for the
 * local name of a core name, asks it to bring a name in, to rename one or to
 * drop one, and takes its edits at the end. It edits each import statement
 * once, so other edits must not touch the import statements.
 */
export class CoreImports {
  private readonly named: NamedImport[] = [];
  private readonly additions: ImportAddition[] = [];
  private readonly lastImport: Node | undefined;
  private readonly firstCoreImport: Node | undefined;
  private readonly rootNode: Node;
  readonly namespace: string | undefined;

  constructor(rootNode: Node) {
    this.rootNode = rootNode;

    const statements = rootNode
      .children()
      .filter((child) => child.kind() === 'import_statement');
    let namespace: string | undefined;

    this.lastImport = statements[statements.length - 1];

    for (const statement of statements) {
      if (importSource(statement) !== CORE_PACKAGE) {
        continue;
      }

      const clause = statement
        .children()
        .find((child) => child.kind() === 'import_clause');
      const namespaceImport = clause
        ?.children()
        .find((child) => child.kind() === 'namespace_import');

      if (namespaceImport) {
        namespace = namespaceImport
          .children()
          .find((child) => child.kind() === 'identifier')
          ?.text();
        continue;
      }

      const namedImports = clause
        ?.children()
        .find((child) => child.kind() === 'named_imports');

      if (!namedImports) {
        continue;
      }

      const typeOnly = statement
        .children()
        .some((child) => child.kind() === 'type');
      const sourceText =
        statement.field('source')?.text() ?? `'${CORE_PACKAGE}'`;

      this.firstCoreImport ??= statement;
      this.named.push({
        node: statement,
        typeOnly,
        multiline: namedImports.text().includes('\n'),
        quote: sourceText[0],
        specifiers: namedImports
          .children()
          .filter((child) => child.kind() === 'import_specifier')
          .map((specifier) => specifierInfo(specifier, typeOnly)),
        changed: false,
      });
    }

    this.namespace = namespace;
  }

  /**
   * Returns the expression that names a core export in this file: its local
   * name, or `namespace.name`, or undefined when the file has no access to it.
   * A value use needs a specifier that is not `type`.
   */
  ref(name: string, options: { type?: boolean } = {}): string | undefined {
    for (const entry of this.named) {
      const specifier = entry.specifiers.find(
        (candidate) =>
          candidate.name === name && (options.type || !candidate.isType)
      );

      if (specifier) {
        return specifier.local;
      }
    }

    const added = this.additions.find(
      (addition) => addition.name === name && (options.type || !addition.isType)
    );

    if (added) {
      return added.local;
    }

    return this.namespace ? `${this.namespace}.${name}` : undefined;
  }

  /**
   * Returns the expression that names a core export, and brings the name in
   * when the file has no access to it yet. Returns undefined when the name is
   * taken in the file by something else and its alias is taken too.
   */
  ensure(name: string, options: { type?: boolean } = {}): string | undefined {
    const existing = this.ref(name, options);

    if (existing) {
      return existing;
    }

    const promote = this.named.find(
      (entry) =>
        !entry.typeOnly &&
        entry.specifiers.some((specifier) => specifier.name === name)
    );

    if (promote) {
      const specifier = promote.specifiers.find(
        (candidate) => candidate.name === name
      );

      specifier.isType = false;
      promote.changed = true;

      return specifier.local;
    }

    const alias = `core${name[0].toUpperCase()}${name.slice(1)}`;
    let local = name;

    if (isNameTaken(this.rootNode, name)) {
      if (isNameTaken(this.rootNode, alias)) {
        return undefined;
      }

      local = alias;
    }

    this.additions.push({ name, local, isType: Boolean(options.type) });

    return local;
  }

  /**
   * Returns the local name of a named core import, or undefined.
   */
  local(name: string): string | undefined {
    for (const entry of this.named) {
      const specifier = entry.specifiers.find(
        (candidate) => candidate.name === name
      );

      if (specifier) {
        return specifier.local;
      }
    }

    return undefined;
  }

  /**
   * Renames the imported name `name` to `newName`. An aliased specifier keeps
   * its local name. When `newName` is imported already, the old specifier
   * goes. Returns the local name that the references use afterwards.
   */
  rename(name: string, newName: string): string | undefined {
    let result: string | undefined;

    for (const entry of this.named) {
      const index = entry.specifiers.findIndex(
        (specifier) => specifier.name === name
      );

      if (index === -1) {
        continue;
      }

      const specifier = entry.specifiers[index];
      const existing = this.named
        .flatMap((candidate) => candidate.specifiers)
        .find(
          (candidate) =>
            candidate.name === newName && candidate.local === newName
        );
      const keepLocal =
        specifier.local !== name ||
        (!existing && isNameTaken(this.rootNode, newName));

      entry.changed = true;

      if (existing && !keepLocal) {
        existing.isType &&= specifier.isType;
        entry.specifiers.splice(index, 1);
        result = existing.local;
        continue;
      }

      result = keepLocal ? specifier.local : newName;
      specifier.local = result;
      specifier.name = newName;
    }

    return result;
  }

  /**
   * Drops the specifier of `name` from the core imports.
   */
  remove(name: string): void {
    for (const entry of this.named) {
      const before = entry.specifiers.length;

      entry.specifiers = entry.specifiers.filter(
        (specifier) => specifier.name !== name
      );
      entry.changed ||= entry.specifiers.length !== before;
    }
  }

  /**
   * Returns the edits of the import statements.
   */
  edits(): Edit[] {
    const edits: Edit[] = [];
    const valueAdditions = this.additions.filter(
      (addition) => !addition.isType
    );
    const typeAdditions = this.additions.filter((addition) => addition.isType);
    const valueTarget = this.named.find((entry) => !entry.typeOnly);
    const typeTarget = this.named.find((entry) => entry.typeOnly);
    const newStatements: string[] = [];

    if (valueAdditions.length) {
      if (valueTarget) {
        valueTarget.specifiers.push(...valueAdditions);
        valueTarget.changed = true;
      } else {
        newStatements.push(formatImport(false, valueAdditions, false, "'"));
      }
    }

    if (typeAdditions.length) {
      if (typeTarget) {
        typeTarget.specifiers.push(
          ...typeAdditions.filter(
            (addition) =>
              !typeTarget.specifiers.some(
                (specifier) => specifier.name === addition.name
              )
          )
        );
        typeTarget.changed = true;
      } else {
        newStatements.push(formatImport(true, typeAdditions, false, "'"));
      }
    }

    const prefix =
      newStatements.length && this.firstCoreImport
        ? `${newStatements.join('\n')}\n`
        : '';

    for (const entry of this.named) {
      const isAnchor = entry.node.id() === this.firstCoreImport?.id();

      if (!entry.changed && !(isAnchor && prefix)) {
        continue;
      }

      if (!entry.specifiers.length) {
        edits.push(
          prefix && isAnchor
            ? entry.node.replace(prefix.trimEnd())
            : removeStatement(this.rootNode, entry.node)
        );
        continue;
      }

      const statement = entry.changed
        ? formatImport(
            entry.typeOnly,
            entry.specifiers,
            entry.multiline,
            entry.quote
          )
        : entry.node.text();

      edits.push(entry.node.replace(`${isAnchor ? prefix : ''}${statement}`));
    }

    if (newStatements.length && !this.firstCoreImport) {
      const anchor = this.lastImport;
      const text = newStatements.join('\n');

      if (anchor) {
        const end = anchor.range().end.index;

        edits.push({ startPos: end, endPos: end, insertedText: `\n${text}` });
      } else {
        edits.push({ startPos: 0, endPos: 0, insertedText: `${text}\n` });
      }
    }

    return edits;
  }
}

/**
 * Formats an import statement of the core package in the style of prettier.
 */
function formatImport(
  typeOnly: boolean,
  specifiers: ImportSpecifierInfo[],
  multiline: boolean,
  quote: string
): string {
  const parts = specifiers.map((specifier) => {
    const prefix = specifier.isType && !typeOnly ? 'type ' : '';
    const alias =
      specifier.local !== specifier.name ? ` as ${specifier.local}` : '';

    return `${prefix}${specifier.name}${alias}`;
  });
  const head = typeOnly ? 'import type ' : 'import ';
  const source = `${quote}${CORE_PACKAGE}${quote}`;
  const oneLine = `${head}{ ${parts.join(', ')} } from ${source};`;

  if (!multiline && oneLine.length <= IMPORT_LINE_LENGTH) {
    return oneLine;
  }

  return `${head}{\n${parts.map((part) => `  ${part},`).join('\n')}\n} from ${source};`;
}

/**
 * Returns an edit that removes a whole statement with its line break.
 */
export function removeStatement(rootNode: Node, statement: Node): Edit {
  const source = rootNode.text();
  const { start, end } = statement.range();
  let endIndex = end.index;

  if (source[endIndex] === '\n') {
    endIndex += 1;
  }

  return { startPos: start.index, endPos: endIndex, insertedText: '' };
}

/**
 * Tells whether a name is used anywhere in the file as an identifier.
 */
export function isNameTaken(rootNode: Node, name: string): boolean {
  return Boolean(
    rootNode.find({
      rule: {
        any: [
          { kind: 'identifier' },
          { kind: 'type_identifier' },
          { kind: 'shorthand_property_identifier_pattern' },
          { kind: 'shorthand_property_identifier' },
        ],
        regex: `^${name}$`,
      },
    })
  );
}

/**
 * Returns the import specifier that an identifier refers to, when it is a
 * named import of `@cornerstonejs/core` (or of a path under it when
 * `subpaths` is true), with the imported name.
 */
export function coreImportOf(
  identifier: Node,
  subpaths = false
): { name: string; specifier: Node } | undefined {
  const definition = identifier.definition();
  const target = definition?.node;
  const specifier = target?.kind() === 'identifier' ? target.parent() : target;

  if (!specifier || specifier.kind() !== 'import_specifier') {
    return undefined;
  }

  const statement = specifier
    .ancestors()
    .find((ancestor) => ancestor.kind() === 'import_statement');
  const source = statement ? importSource(statement) : undefined;

  if (
    !source ||
    (source !== CORE_PACKAGE &&
      !(subpaths && source.startsWith(`${CORE_PACKAGE}/`)))
  ) {
    return undefined;
  }

  return {
    name: specifier.field('name')?.text() ?? '',
    specifier,
  };
}

/**
 * Tells whether an identifier is the namespace import of `@cornerstonejs/core`.
 */
export function isCoreNamespace(identifier: Node): boolean {
  const definition = identifier.definition();

  if (!definition) {
    return false;
  }

  const statement = definition.node
    .ancestors()
    .find((ancestor) => ancestor.kind() === 'import_statement');

  return (
    Boolean(
      statement &&
        importSource(statement) === CORE_PACKAGE &&
        definition.node
          .ancestors()
          .some((ancestor) => ancestor.kind() === 'namespace_import')
    ) ||
    Boolean(
      statement &&
        importSource(statement) === CORE_PACKAGE &&
        definition.node.kind() === 'import_clause' &&
        definition.node.text().startsWith('*')
    )
  );
}

/**
 * Tells whether an expression names the core export `name`: an identifier
 * bound to its import, or `namespace.name` of the core namespace.
 */
export function isCoreExport(node: Node, name: string): boolean {
  if (node.kind() === 'identifier') {
    return coreImportOf(node)?.name === name;
  }

  if (node.kind() === 'member_expression') {
    const object = node.field('object');
    const property = node.field('property');

    return Boolean(
      object?.kind() === 'identifier' &&
        property?.text() === name &&
        isCoreNamespace(object)
    );
  }

  return false;
}

/**
 * Tells whether an expression names a member of the core `Enums`:
 * `Enums.member`, `cs.Enums.member`, or an identifier bound to it through
 * `const { member } = Enums` or `const member = Enums.member`.
 */
export function isCoreEnum(node: Node, member: string): boolean {
  if (node.kind() === 'member_expression') {
    return (
      node.field('property')?.text() === member &&
      isCoreExport(node.field('object'), 'Enums')
    );
  }

  if (node.kind() !== 'identifier') {
    return false;
  }

  if (coreImportOf(node, true)?.name === member) {
    return true;
  }

  const definition = node.definition();

  if (!definition || definition.kind !== 'local') {
    return false;
  }

  const target = definition.node;
  const declarator = target
    .ancestors()
    .find((ancestor) => ancestor.kind() === 'variable_declarator');
  const value = declarator?.field('value');

  if (!declarator || !value) {
    return false;
  }

  if (declarator.field('name')?.id() === target.id()) {
    return isCoreEnum(value, member);
  }

  const parent = target.parent();

  if (target.kind() === 'shorthand_property_identifier_pattern') {
    return target.text() === member && isCoreExport(value, 'Enums');
  }

  if (
    parent?.kind() === 'pair_pattern' &&
    parent.field('value')?.id() === target.id()
  ) {
    return (
      parent.field('key')?.text() === member && isCoreExport(value, 'Enums')
    );
  }

  return false;
}

/**
 * Returns the expression inside parentheses, casts and non-null assertions.
 */
export function unwrap(node: Node): Node {
  let current = node;

  for (;;) {
    const kind = current.kind();

    if (kind === 'parenthesized_expression' || kind === 'non_null_expression') {
      const inner = current.children().find((child) => child.isNamed());

      if (!inner) {
        return current;
      }

      current = inner;
      continue;
    }

    if (kind === 'as_expression' || kind === 'satisfies_expression') {
      current = current.children().find((child) => child.isNamed()) ?? current;
      continue;
    }

    if (kind === 'type_assertion') {
      const named = current.children().filter((child) => child.isNamed());

      current = named[named.length - 1] ?? current;
      continue;
    }

    return current;
  }
}

/**
 * Returns the type names that a cast, an annotation or a type argument puts
 * on an expression, without following variables.
 */
function castTypeNames(node: Node): string[] {
  const names: string[] = [];
  let current: Node | null = node;

  while (current) {
    const kind = current.kind();

    if (
      kind === 'as_expression' ||
      kind === 'satisfies_expression' ||
      kind === 'type_assertion'
    ) {
      const typeNode = current
        .children()
        .find((child) => child.isNamed() && /type/.test(child.kind()));

      if (typeNode) {
        names.push(...typeNamesIn(typeNode));
      }
    }

    if (kind === 'call_expression') {
      const typeArguments = current.field('type_arguments');

      if (typeArguments) {
        names.push(...typeNamesIn(typeArguments));
      }
    }

    if (
      kind === 'parenthesized_expression' ||
      kind === 'non_null_expression' ||
      kind === 'as_expression' ||
      kind === 'satisfies_expression'
    ) {
      current = current.children().find((child) => child.isNamed()) ?? null;
      continue;
    }

    if (kind === 'type_assertion') {
      const named = current.children().filter((child) => child.isNamed());

      current = named[named.length - 1] ?? null;
      continue;
    }

    current = null;
  }

  return names;
}

/**
 * Returns the last names of the type identifiers in a type node.
 */
function typeNamesIn(typeNode: Node): string[] {
  const names = typeNode
    .findAll({ rule: { kind: 'type_identifier' } })
    .map((identifier) => identifier.text());

  if (typeNode.kind() === 'type_identifier') {
    names.push(typeNode.text());
  }

  return names;
}

/**
 * Returns the type names that a declaration gives to the binding that an
 * identifier refers to, and the value it starts with.
 */
function declarationOf(
  identifier: Node
): { typeNames: string[]; value: Node | undefined } | undefined {
  const definition = identifier.definition();

  if (!definition || definition.kind !== 'local') {
    return undefined;
  }

  const target = definition.node;

  if (
    target.kind() === 'required_parameter' ||
    target.kind() === 'optional_parameter'
  ) {
    const annotation = target
      .children()
      .find((child) => child.kind() === 'type_annotation');

    return {
      typeNames: annotation ? typeNamesIn(annotation) : [],
      value: undefined,
    };
  }

  const declarator = target.parent();

  if (
    declarator?.kind() !== 'variable_declarator' ||
    declarator.field('name')?.id() !== target.id()
  ) {
    return undefined;
  }

  const annotation = declarator
    .children()
    .find((child) => child.kind() === 'type_annotation');

  return {
    typeNames: annotation ? typeNamesIn(annotation) : [],
    value: declarator.field('value') ?? undefined,
  };
}

/**
 * Tells whether an expression is a viewport: a name such as `viewport` or
 * `ctViewport`, `this.viewport`, `viewports[i]`, a call of `getViewport`, or a
 * variable that holds one of these or is typed as a viewport.
 */
export function isViewportExpression(node: Node, depth = 0): boolean {
  if (depth > 4) {
    return false;
  }

  if (castTypeNames(node).some((name) => FAMILY_OF_TYPE[name])) {
    return true;
  }

  const inner = unwrap(node);
  const kind = inner.kind();

  if (kind === 'identifier') {
    if (VIEWPORT_NAME.test(inner.text())) {
      return true;
    }

    const declaration = declarationOf(inner);

    if (!declaration) {
      return false;
    }

    if (declaration.typeNames.some((name) => FAMILY_OF_TYPE[name])) {
      return true;
    }

    return Boolean(
      declaration.value && isViewportExpression(declaration.value, depth + 1)
    );
  }

  if (kind === 'member_expression') {
    return VIEWPORT_NAME.test(inner.field('property')?.text() ?? '');
  }

  if (kind === 'subscript_expression') {
    return VIEWPORTS_NAME.test(
      unwrap(inner.field('object')).text().split('.').pop() ?? ''
    );
  }

  if (kind === 'call_expression') {
    const callee = inner.field('function');

    return (
      callee?.kind() === 'member_expression' &&
      callee.field('property')?.text() === 'getViewport'
    );
  }

  return false;
}

/**
 * Returns the family of a viewport expression when a cast, an annotation or a
 * type argument names it, or undefined.
 */
export function viewportFamily(
  node: Node,
  depth = 0
): ViewportFamily | undefined {
  if (depth > 4) {
    return undefined;
  }

  const fromCast = castTypeNames(node)
    .map((name) => FAMILY_OF_TYPE[name])
    .find(Boolean);

  if (fromCast) {
    return fromCast;
  }

  const inner = unwrap(node);

  if (inner.kind() !== 'identifier') {
    return undefined;
  }

  const declaration = declarationOf(inner);

  if (!declaration) {
    return undefined;
  }

  const fromType = declaration.typeNames
    .map((name) => FAMILY_OF_TYPE[name])
    .find(Boolean);

  if (fromType) {
    return fromType;
  }

  return declaration.value
    ? viewportFamily(declaration.value, depth + 1)
    : undefined;
}

/**
 * Tells whether an expression can be written twice without a change of
 * meaning: a name, `this`, or a chain of property reads of those.
 */
export function isRepeatable(node: Node): boolean {
  const kind = node.kind();

  if (kind === 'identifier' || kind === 'this') {
    return true;
  }

  if (kind === 'member_expression') {
    return (
      node.field('property')?.kind() === 'property_identifier' &&
      isRepeatable(node.field('object'))
    );
  }

  if (
    kind === 'parenthesized_expression' ||
    kind === 'non_null_expression' ||
    kind === 'as_expression' ||
    kind === 'type_assertion'
  ) {
    return isRepeatable(unwrap(node));
  }

  return false;
}

/**
 * Returns the parts of a method call `object.method(args)`, or undefined.
 */
export function methodCall(call: Node):
  | {
      object: Node;
      property: Node;
      method: string;
      args: Node[];
      argsNode: Node;
    }
  | undefined {
  if (call.kind() !== 'call_expression') {
    return undefined;
  }

  const callee = call.field('function');
  const argsNode = call.field('arguments');

  if (!callee || callee.kind() !== 'member_expression' || !argsNode) {
    return undefined;
  }

  const object = callee.field('object');
  const property = callee.field('property');

  if (!object || !property) {
    return undefined;
  }

  return {
    object,
    property,
    method: property.text(),
    args: argsNode
      .children()
      .filter((child) => child.isNamed() && child.kind() !== 'comment'),
    argsNode,
  };
}

/**
 * Returns the nearest function that contains a node, or undefined at the top
 * of the module.
 */
export function enclosingFunction(node: Node): Node | undefined {
  return node
    .ancestors()
    .find((ancestor) => FUNCTION_KINDS.has(ancestor.kind()));
}

/**
 * Tells whether a function node is declared `async`.
 */
export function isAsyncFunction(fn: Node | undefined): boolean {
  return Boolean(fn?.children().some((child) => child.kind() === 'async'));
}

/**
 * Returns the expression statement whose expression is the call, or the call
 * under `await`, with whether it awaits.
 */
export function statementOfCall(
  call: Node
): { statement: Node; awaited: boolean } | undefined {
  const parent = call.parent();

  if (parent?.kind() === 'expression_statement') {
    return { statement: parent, awaited: false };
  }

  if (
    parent?.kind() === 'await_expression' &&
    parent.parent()?.kind() === 'expression_statement'
  ) {
    return { statement: parent.parent(), awaited: true };
  }

  return undefined;
}

/**
 * Returns the white space before a node on its line.
 */
export function indentOf(rootNode: Node, node: Node): string {
  const source = rootNode.text();
  const start = node.range().start.index;
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const prefix = source.slice(lineStart, start);

  return /^\s*$/.test(prefix) ? prefix : (prefix.match(/^\s*/)?.[0] ?? '');
}

/**
 * Returns the properties of an object literal by key, with the shorthand and
 * spread entries.
 */
export function objectEntries(objectNode: Node): {
  pairs: Map<string, Node>;
  shorthand: Set<string>;
  hasSpread: boolean;
  keys: string[];
} {
  const pairs = new Map<string, Node>();
  const shorthand = new Set<string>();
  const keys: string[] = [];
  let hasSpread = false;

  for (const child of objectNode.children()) {
    if (child.kind() === 'pair') {
      const key = child.field('key');
      const name =
        key?.kind() === 'string'
          ? key.text().slice(1, -1)
          : (key?.text() ?? '');

      pairs.set(name, child);
      keys.push(name);
    } else if (child.kind() === 'shorthand_property_identifier') {
      shorthand.add(child.text());
      keys.push(child.text());
    } else if (
      child.kind() === 'spread_element' ||
      child.kind() === 'method_definition'
    ) {
      hasSpread = true;
    }
  }

  return { pairs, shorthand, hasSpread, keys };
}

/**
 * Returns an edit that removes one property of an object literal with its
 * comma, or undefined when the property is the only one left to remove
 * cleanly.
 */
export function removeProperty(property: Node): Edit {
  const next = property.next();
  const prev = property.prev();
  const start = property.range().start.index;

  if (next?.kind() === ',') {
    const after = next.next();
    const end = after ? after.range().start.index : next.range().end.index;

    return { startPos: start, endPos: end, insertedText: '' };
  }

  if (prev?.kind() === ',') {
    return {
      startPos: prev.range().start.index,
      endPos: property.range().end.index,
      insertedText: '',
    };
  }

  return {
    startPos: start,
    endPos: property.range().end.index,
    insertedText: '',
  };
}

/**
 * The cardinality of a reported site: the rule, the file and the line.
 */
export function site(
  root: SgRoot<TSX>,
  rule: string,
  node: Node
): Record<string, string> {
  return {
    rule,
    file: root.relativeFilename?.() || root.filename(),
    line: String(node.range().start.line + 1),
  };
}

/**
 * Keeps edits that do not overlap, so a transform can skip a site that
 * another rewrite of the same run touches.
 */
export class EditSet {
  private readonly list: Edit[] = [];

  /**
   * Adds the edits when none of them overlaps an edit already kept.
   */
  add(...edits: Edit[]): boolean {
    for (const edit of edits) {
      for (const kept of this.list) {
        const overlaps =
          edit.startPos < kept.endPos && kept.startPos < edit.endPos;
        const sameInsert =
          edit.startPos === edit.endPos &&
          kept.startPos === kept.endPos &&
          edit.startPos === kept.startPos;

        if (overlaps || sameInsert) {
          return false;
        }
      }
    }

    this.list.push(...edits);

    return true;
  }

  /**
   * Tells whether a node lies inside an edit already kept.
   */
  covers(node: Node): boolean {
    const { start, end } = node.range();

    return this.list.some(
      (kept) => start.index < kept.endPos && kept.startPos < end.index
    );
  }

  /**
   * Returns the kept edits.
   */
  all(): Edit[] {
    return this.list;
  }
}
