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

/** The core types of a viewport of any family. */
const ANY_VIEWPORT_TYPES = new Set([
  'IViewport',
  'IGenericViewport',
  'GenericViewport',
  'Viewport',
]);

/** The core classes and types of a rendering engine. */
const ENGINE_TYPES = [
  'RenderingEngine',
  'IRenderingEngine',
  'BaseRenderingEngine',
  'TiledRenderingEngine',
  'ContextPoolRenderingEngine',
];

/** The core functions that return an enabled element. */
const ENABLED_ELEMENT_GETTERS = [
  'getEnabledElement',
  'getEnabledElementByViewportId',
  'getEnabledElementByIds',
];

/** The viewport families of 6.0. */
export type ViewportFamily = 'planar' | '3d' | 'video' | 'wsi' | 'ecg';

/**
 * What shows that an expression is a Cornerstone viewport: `core` for a value
 * reached through Cornerstone or a Cornerstone type, `name` for a name alone.
 */
export type ViewportEvidence = 'core' | 'name';

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

/** The node kinds that bound the scope of a `var` or a parameter. */
const FUNCTION_SCOPE_KINDS = new Set([...FUNCTION_KINDS, 'program']);

/** The node kinds that bound the scope of a `let`, a `const`, a function or a class. */
const BLOCK_KINDS = new Set([
  'statement_block',
  'program',
  'switch_body',
  'for_statement',
  'for_in_statement',
  'class_body',
]);

/** The node kinds of a destructuring pattern. */
const PATTERN_KINDS = new Set([
  'object_pattern',
  'array_pattern',
  'pair_pattern',
  'assignment_pattern',
  'object_assignment_pattern',
  'rest_pattern',
]);

/** The declarations whose name lives in the enclosing block. */
const BLOCK_DECLARATION_KINDS = new Set([
  'function_declaration',
  'generator_function_declaration',
  'class_declaration',
]);

/** The expressions whose name lives in the expression itself. */
const NAMED_EXPRESSION_KINDS = new Set([
  'function_expression',
  'function',
  'generator_function',
  'class',
]);

/** The node kinds of a literal value. */
const LITERAL_KINDS = new Set([
  'string',
  'number',
  'true',
  'false',
  'null',
  'undefined',
]);

/** The node kinds that take a member access without parentheses. */
const PRIMARY_KINDS = new Set([
  'identifier',
  'this',
  'member_expression',
  'subscript_expression',
  'call_expression',
  'parenthesized_expression',
  'non_null_expression',
  'array',
  'string',
  'template_string',
]);

/** The calls that mount data on a viewport, in 5.x and in 6.0. */
const MOUNT_METHODS = new Set([
  'setStack',
  'setVolumes',
  'setVideo',
  'setEcg',
  'setWSI',
  'setDataIds',
  'setDataList',
  'setDisplaySets',
]);

/** The parents in which a comparison needs no parentheses. */
const LOOSE_PARENTS = new Set([
  'variable_declarator',
  'arguments',
  'parenthesized_expression',
  'return_statement',
  'pair',
  'array',
  'template_substitution',
  'expression_statement',
  'assignment_expression',
  'arrow_function',
  'ternary_expression',
]);

/** One named specifier of an import statement. */
interface ImportSpecifierInfo {
  name: string;
  local: string;
  isType: boolean;
  node?: Node;
}

/** A named import statement of the core package and its pending changes. */
interface NamedImport {
  node: Node;
  namedImports: Node;
  typeOnly: boolean;
  multiline: boolean;
  hasComments: boolean;
  quote: string;
  specifiers: ImportSpecifierInfo[];
  originals: ImportSpecifierInfo[];
  changed: boolean;
}

/** A name that a transform asks the core import to bring in. */
interface ImportAddition {
  name: string;
  local: string;
  isType: boolean;
}

/** A declared name and the node that bounds its scope. */
interface Declaration {
  node: Node;
  scope: Node;
}

/**
 * Returns the module that an import statement reads from.
 */
export function importSource(statement: Node): string | undefined {
  const source = statement.field('source');

  return source ? source.text().slice(1, -1) : undefined;
}

/**
 * Returns the information of a named import specifier.
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
    node: specifier,
  };
}

/**
 * Formats one named import specifier.
 */
function formatSpecifier(
  specifier: ImportSpecifierInfo,
  typeOnly: boolean
): string {
  const prefix = specifier.isType && !typeOnly ? 'type ' : '';
  const alias =
    specifier.local !== specifier.name ? ` as ${specifier.local}` : '';

  return `${prefix}${specifier.name}${alias}`;
}

/**
 * The imports of `@cornerstonejs/core` in one file. A transform asks it for the
 * local name of a core name, asks it to bring a name in, to rename one or to
 * drop one, and takes its edits at the end. It edits each import statement
 * once, so other edits must not touch the import statements. It also gives
 * out the fresh names of a run, so that no two of them collide.
 */
export class CoreImports {
  private readonly named: NamedImport[] = [];
  private readonly additions: ImportAddition[] = [];
  private readonly reserved = new Set<string>();
  private readonly lastImport: Node | undefined;
  private readonly firstCoreImport: Node | undefined;
  private readonly rootNode: Node;
  private readonly commonJs: boolean;
  readonly namespace: string | undefined;
  readonly typeNamespace: string | undefined;

  constructor(rootNode: Node) {
    this.rootNode = rootNode;

    const statements = rootNode
      .children()
      .filter((child) => child.kind() === 'import_statement');
    let namespace: string | undefined;
    let typeNamespace: string | undefined;

    this.lastImport = statements[statements.length - 1];
    this.commonJs =
      !statements.length &&
      !rootNode
        .children()
        .some((child) => child.kind() === 'export_statement') &&
      Boolean(
        rootNode.find({
          rule: {
            kind: 'call_expression',
            has: { field: 'function', regex: '^require$' },
          },
        })
      );

    for (const statement of statements) {
      if (importSource(statement) !== CORE_PACKAGE) {
        continue;
      }

      const typeOnly = statement
        .children()
        .some((child) => child.kind() === 'type');
      const clause = statement
        .children()
        .find((child) => child.kind() === 'import_clause');
      const namespaceImport = clause
        ?.children()
        .find((child) => child.kind() === 'namespace_import');

      if (namespaceImport) {
        const name = namespaceImport
          .children()
          .find((child) => child.kind() === 'identifier')
          ?.text();

        typeNamespace ??= name;

        if (!typeOnly) {
          namespace ??= name;
        }

        continue;
      }

      const namedImports = clause
        ?.children()
        .find((child) => child.kind() === 'named_imports');

      if (!namedImports) {
        continue;
      }

      const sourceText =
        statement.field('source')?.text() ?? `'${CORE_PACKAGE}'`;
      const specifiers = namedImports
        .children()
        .filter((child) => child.kind() === 'import_specifier')
        .map((specifier) => specifierInfo(specifier, typeOnly));

      this.firstCoreImport ??= statement;
      this.named.push({
        node: statement,
        namedImports,
        typeOnly,
        multiline: namedImports.text().includes('\n'),
        hasComments: namedImports
          .children()
          .some((child) => child.kind() === 'comment'),
        quote: sourceText[0],
        specifiers,
        originals: [...specifiers],
        changed: false,
      });
    }

    this.namespace = namespace;
    this.typeNamespace = typeNamespace;
  }

  /**
   * Returns a name that no identifier of the file uses and that this run has
   * not given out: `base`, or `base2`, `base3` and so on.
   */
  fresh(base: string): string {
    for (let index = 1; ; index += 1) {
      const candidate = index === 1 ? base : `${base}${index}`;

      if (
        !this.reserved.has(candidate) &&
        !isNameTaken(this.rootNode, candidate)
      ) {
        this.reserved.add(candidate);

        return candidate;
      }
    }
  }

  /**
   * Returns the expressions that name a core export in this file, in the
   * order to try them.
   */
  private candidates(name: string, type: boolean): string[] {
    const found: string[] = [];

    for (const entry of this.named) {
      for (const specifier of entry.specifiers) {
        if (specifier.name === name && (type || !specifier.isType)) {
          found.push(specifier.local);
        }
      }
    }

    for (const addition of this.additions) {
      if (addition.name === name && (type || !addition.isType)) {
        found.push(addition.local);
      }
    }

    const namespace = type ? this.typeNamespace : this.namespace;

    if (namespace) {
      found.push(`${namespace}.${name}`);
    }

    return found;
  }

  /**
   * Returns the expression that names a core export in this file: its local
   * name, or `namespace.name`, or undefined when the file has no access to it.
   * A value use needs a specifier that is not `type` and a namespace that is
   * not `import type`; with `at`, a name that a local declaration hides at
   * that node does not count.
   */
  ref(
    name: string,
    options: { type?: boolean; at?: Node } = {}
  ): string | undefined {
    return this.candidates(name, Boolean(options.type)).find(
      (candidate) =>
        options.type ||
        !options.at ||
        !isShadowedAt(this.rootNode, candidate.split('.')[0], options.at)
    );
  }

  /**
   * Returns the expression that names a core export at a node, and brings
   * the name in when the file has no access to it there. A name that the file
   * uses already comes in under a fresh alias such as `coreUtilities`.
   * Returns undefined in a CommonJS module, which cannot take an `import`.
   */
  ensure(
    name: string,
    options: { type?: boolean; at?: Node } = {}
  ): string | undefined {
    const existing = this.ref(name, options);

    if (existing || this.commonJs) {
      return existing;
    }

    for (const entry of this.named) {
      const specifier = entry.typeOnly
        ? undefined
        : entry.specifiers.find(
            (candidate) =>
              candidate.name === name &&
              candidate.isType &&
              (!options.at ||
                !isShadowedAt(this.rootNode, candidate.local, options.at))
          );

      if (specifier) {
        specifier.isType = Boolean(options.type);
        entry.changed = true;

        return specifier.local;
      }
    }

    const local =
      !this.reserved.has(name) && !isNameTaken(this.rootNode, name)
        ? name
        : this.fresh(`core${name[0].toUpperCase()}${name.slice(1)}`);

    this.reserved.add(local);
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
        (!existing &&
          (this.reserved.has(newName) || isNameTaken(this.rootNode, newName)));

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
   * Drops the specifiers of `name` from the core imports, or only the one
   * with the local name `local`.
   */
  remove(name: string, local?: string): void {
    for (const entry of this.named) {
      const before = entry.specifiers.length;

      entry.specifiers = entry.specifiers.filter(
        (specifier) =>
          specifier.name !== name ||
          (local !== undefined && specifier.local !== local)
      );
      entry.changed ||= entry.specifiers.length !== before;
    }
  }

  /**
   * Returns the edits of an import statement that holds comments: each
   * specifier is edited in place, and new ones go in after `{`, so the
   * comments stay where they are.
   */
  private editsInPlace(entry: NamedImport): Edit[] {
    const edits: Edit[] = [];

    for (const original of entry.originals) {
      if (!entry.specifiers.includes(original)) {
        edits.push(removeProperty(original.node));
        continue;
      }

      const text = formatSpecifier(original, entry.typeOnly);

      if (text !== original.node.text()) {
        edits.push(original.node.replace(text));
      }
    }

    const added = entry.specifiers.filter(
      (specifier) => !entry.originals.includes(specifier)
    );

    if (added.length) {
      const brace = entry.namedImports.children()[0].range().end.index;
      const separator = entry.multiline ? '\n  ' : ' ';

      edits.push({
        startPos: brace,
        endPos: brace,
        insertedText: added
          .map(
            (specifier) =>
              `${separator}${formatSpecifier(specifier, entry.typeOnly)},`
          )
          .join(''),
      });
    }

    return edits;
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
                (specifier) =>
                  specifier.name === addition.name &&
                  specifier.local === addition.local
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

      if (entry.hasComments) {
        if (isAnchor && prefix) {
          const start = entry.node.range().start.index;

          edits.push({ startPos: start, endPos: start, insertedText: prefix });
        }

        if (entry.changed) {
          edits.push(...this.editsInPlace(entry));
        }

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
      const end = this.lastImport?.range().end.index ?? this.prologueEnd();
      const text = newStatements.join('\n');

      edits.push(
        end
          ? { startPos: end, endPos: end, insertedText: `\n${text}` }
          : { startPos: 0, endPos: 0, insertedText: `${text}\n` }
      );
    }

    return edits;
  }

  /**
   * Returns where the prologue of the file ends: after a shebang and the
   * directives such as `'use client'`, which must stay first. 0 when the file
   * has neither.
   */
  private prologueEnd(): number {
    let end = 0;

    for (const child of this.rootNode.children()) {
      const expression =
        child.kind() === 'expression_statement'
          ? child.children().find((part) => part.isNamed())
          : undefined;

      if (
        child.kind() === 'hash_bang_line' ||
        expression?.kind() === 'string'
      ) {
        end = child.range().end.index;
      } else if (child.kind() !== 'comment') {
        break;
      }
    }

    return end;
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
  const parts = specifiers.map((specifier) =>
    formatSpecifier(specifier, typeOnly)
  );
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
 * Returns a name with the characters of a regular expression escaped.
 */
function escapeName(name: string): string {
  return name.replace(/[$]/g, '\\$');
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
        regex: `^${escapeName(name)}$`,
      },
    })
  );
}

/**
 * Tells whether a node lies inside another node, or is that node.
 */
function contains(outer: Node, node: Node): boolean {
  const outerRange = outer.range();
  const range = node.range();

  return (
    outerRange.start.index <= range.start.index &&
    range.end.index <= outerRange.end.index
  );
}

/**
 * Returns the nearest ancestor of a node of one of the kinds, or the root.
 */
function nearestOf(node: Node, kinds: Set<string>): Node | undefined {
  const ancestors = node.ancestors();

  return (
    ancestors.find((ancestor) => kinds.has(ancestor.kind())) ??
    ancestors[ancestors.length - 1]
  );
}

/**
 * Returns the node that bounds the scope of a name that a node declares: the
 * function of a parameter or a `var`, the block of a `let`, a `const`, a
 * function or a class, the module of an import. Returns undefined when the
 * node does not declare a name.
 */
export function declarationScope(node: Node): Node | undefined {
  let child = node;
  let parent = node.parent();

  while (parent && PATTERN_KINDS.has(parent.kind())) {
    const isKey =
      parent.kind() === 'pair_pattern' &&
      parent.field('key')?.id() === child.id();
    const isDefault =
      parent.kind() !== 'pair_pattern' &&
      parent.field('right')?.id() === child.id();

    if (isKey || isDefault) {
      return undefined;
    }

    child = parent;
    parent = parent.parent();
  }

  if (!parent) {
    return undefined;
  }

  const kind = parent.kind();
  const holder = parent;
  const isField = (field: string) => holder.field(field)?.id() === child.id();

  if (kind === 'variable_declarator') {
    const declaration = parent.parent();

    if (!isField('name') || !declaration) {
      return undefined;
    }

    return nearestOf(
      declaration,
      declaration.kind() === 'variable_declaration'
        ? FUNCTION_SCOPE_KINDS
        : BLOCK_KINDS
    );
  }

  if (kind === 'required_parameter' || kind === 'optional_parameter') {
    return isField('pattern') ? enclosingFunction(parent) : undefined;
  }

  if (kind === 'formal_parameters') {
    return parent.parent() ?? undefined;
  }

  if (kind === 'arrow_function' || kind === 'catch_clause') {
    return isField('parameter') ? parent : undefined;
  }

  if (kind === 'for_in_statement') {
    return isField('left') ? parent : undefined;
  }

  if (BLOCK_DECLARATION_KINDS.has(kind)) {
    return isField('name') ? nearestOf(parent, BLOCK_KINDS) : undefined;
  }

  if (NAMED_EXPRESSION_KINDS.has(kind)) {
    return isField('name') ? parent : undefined;
  }

  if (kind === 'import_specifier') {
    return isField(parent.field('alias') ? 'alias' : 'name')
      ? nearestOf(parent, new Set(['program']))
      : undefined;
  }

  if (kind === 'import_clause' || kind === 'namespace_import') {
    return nearestOf(parent, new Set(['program']));
  }

  return undefined;
}

/**
 * Returns the declarations of a name in a file, each with its scope.
 */
export function declarationsOf(rootNode: Node, name: string): Declaration[] {
  const found: Declaration[] = [];

  for (const node of rootNode.findAll({
    rule: {
      any: [
        { kind: 'identifier' },
        { kind: 'shorthand_property_identifier_pattern' },
      ],
      regex: `^${escapeName(name)}$`,
    },
  })) {
    const scope = declarationScope(node);

    if (scope) {
      found.push({ node, scope });
    }
  }

  return found;
}

/**
 * Tells whether a local declaration hides a module-level name at a node.
 */
export function isShadowedAt(rootNode: Node, name: string, at: Node): boolean {
  return declarationsOf(rootNode, name).some(
    ({ scope }) => scope.kind() !== 'program' && contains(scope, at)
  );
}

/**
 * Tells whether the name that a declaration node declares refers to that
 * declaration at another node: its scope holds the node, and no declaration
 * of the same name inside its scope holds the node too.
 */
export function bindsAt(rootNode: Node, declaration: Node, at: Node): boolean {
  const scope = declarationScope(declaration);

  if (!scope || !contains(scope, at)) {
    return false;
  }

  return !declarationsOf(rootNode, declaration.text()).some(
    (other) =>
      other.node.id() !== declaration.id() &&
      contains(other.scope, at) &&
      contains(scope, other.scope)
  );
}

/**
 * Returns the definition of an identifier, with the kind of the definition.
 * A declarator with a type annotation comes back as its name, as one without.
 */
function definitionOf(
  identifier: Node
): { kind: string; node: Node } | undefined {
  const definition = identifier.definition();

  if (!definition) {
    return undefined;
  }

  const name =
    definition.node.kind() === 'variable_declarator'
      ? definition.node.field('name')
      : undefined;

  return { kind: definition.kind, node: name ?? definition.node };
}

/**
 * Returns the node that declares the binding an identifier refers to: the
 * name of a variable, a parameter, a destructured key or an import.
 */
export function declarationNodeOf(identifier: Node): Node | undefined {
  const target = definitionOf(identifier)?.node;

  if (!target) {
    return undefined;
  }

  const kind = target.kind();

  if (kind === 'required_parameter' || kind === 'optional_parameter') {
    return target.field('pattern') ?? undefined;
  }

  if (kind === 'import_specifier') {
    return target.field('alias') ?? target.field('name') ?? undefined;
  }

  return target;
}

/**
 * Returns the nodes of the file that refer to a declared name: identifiers,
 * shorthand properties and export specifiers, without the declaration and
 * the import statements.
 */
export function referencesOf(declaration: Node): Node[] {
  const file = declaration.getRoot().filename();
  const start = declaration.range().start.index;

  return declaration
    .references()
    .filter((entry) => entry.root.filename() === file)
    .flatMap((entry) => entry.nodes)
    .filter(
      (node) =>
        node.range().start.index !== start &&
        !node
          .ancestors()
          .some((ancestor) => ancestor.kind() === 'import_statement')
    );
}

/**
 * Returns the named import specifiers of `@cornerstonejs/core` in a file, each
 * with the imported name and the node of its local name.
 */
export function coreSpecifiers(
  rootNode: Node
): Array<{ specifier: Node; name: string; local: Node }> {
  return rootNode
    .children()
    .filter(
      (child) =>
        child.kind() === 'import_statement' &&
        importSource(child) === CORE_PACKAGE
    )
    .flatMap((statement) =>
      statement.findAll({ rule: { kind: 'import_specifier' } })
    )
    .map((specifier) => ({
      specifier,
      name: specifier.field('name')?.text() ?? '',
      local: specifier.field('alias') ?? specifier.field('name'),
    }))
    .filter((entry) => Boolean(entry.local));
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

  const definition = definitionOf(node);

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
 * Tells whether a type identifier names a type of the core: imported from it,
 * or read from its `Types` or its namespace.
 */
function isCoreType(identifier: Node): boolean {
  const parent = identifier.parent();

  if (parent?.kind() !== 'nested_type_identifier') {
    return Boolean(coreImportOf(identifier, true));
  }

  const named = parent.children().filter((child) => child.isNamed());
  const module = named[0];

  if (!module || named[named.length - 1]?.id() !== identifier.id()) {
    return false;
  }

  if (module.kind() === 'identifier') {
    return (
      coreImportOf(module, true)?.name === 'Types' || isCoreNamespace(module)
    );
  }

  const parts = module.children().filter((child) => child.isNamed());

  return (
    module.kind() === 'nested_identifier' &&
    parts.length === 2 &&
    parts[0].kind() === 'identifier' &&
    parts[1].text() === 'Types' &&
    isCoreNamespace(parts[0])
  );
}

/**
 * Returns the names of the core types in a type node.
 */
function coreTypeNamesIn(typeNode: Node): string[] {
  const identifiers =
    typeNode.kind() === 'type_identifier'
      ? [typeNode]
      : typeNode.findAll({ rule: { kind: 'type_identifier' } });

  return identifiers
    .filter((identifier) => isCoreType(identifier))
    .map((identifier) => identifier.text());
}

/**
 * Returns the names of the core types that a cast, an annotation or a type
 * argument puts on an expression, without following variables.
 */
function castCoreTypes(node: Node | null | undefined): string[] {
  const names: string[] = [];
  let current: Node | null | undefined = node;

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
        names.push(...coreTypeNamesIn(typeNode));
      }
    }

    if (kind === 'call_expression') {
      const typeArguments = current.field('type_arguments');

      if (typeArguments) {
        names.push(...coreTypeNamesIn(typeArguments));
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
 * Returns what a declaration gives to the binding that an identifier refers
 * to: the core types of its annotation, the value it starts with, and for a
 * destructured name its key and the object it comes from.
 */
function declarationOf(identifier: Node):
  | {
      typeNames: string[];
      value: Node | undefined;
      key?: string;
      source?: Node;
    }
  | undefined {
  const definition = definitionOf(identifier);

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
      typeNames: annotation ? coreTypeNamesIn(annotation) : [],
      value: undefined,
    };
  }

  const parent = target.parent();

  if (
    target.kind() === 'shorthand_property_identifier_pattern' ||
    (parent?.kind() === 'pair_pattern' &&
      parent.field('value')?.id() === target.id())
  ) {
    const pattern = target.kind() === 'pair_pattern' ? target : parent;
    const objectPattern =
      pattern?.kind() === 'pair_pattern' ? pattern.parent() : pattern;
    const declarator = objectPattern?.parent();

    if (
      objectPattern?.kind() !== 'object_pattern' ||
      declarator?.kind() !== 'variable_declarator' ||
      declarator.field('name')?.id() !== objectPattern.id()
    ) {
      return undefined;
    }

    return {
      typeNames: [],
      value: undefined,
      key:
        target.kind() === 'shorthand_property_identifier_pattern'
          ? target.text()
          : parent.field('key')?.text(),
      source: declarator.field('value') ?? undefined,
    };
  }

  if (
    parent?.kind() !== 'variable_declarator' ||
    parent.field('name')?.id() !== target.id()
  ) {
    return undefined;
  }

  const annotation = parent
    .children()
    .find((child) => child.kind() === 'type_annotation');

  return {
    typeNames: annotation ? coreTypeNamesIn(annotation) : [],
    value: parent.field('value') ?? undefined,
  };
}

/**
 * Returns the values that the file assigns with `=` to a variable that its
 * declaration leaves without a value and a type, such as `let viewport;`.
 */
function assignedValues(identifier: Node): Node[] {
  const declaration = declarationNodeOf(identifier);

  if (declaration?.kind() !== 'identifier') {
    return [];
  }

  return referencesOf(declaration)
    .map((reference) => ({ reference, parent: reference.parent() }))
    .filter(
      ({ reference, parent }) =>
        parent?.kind() === 'assignment_expression' &&
        parent.field('left')?.id() === reference.id()
    )
    .map(({ parent }) => parent.field('right'))
    .filter(Boolean);
}

/**
 * Tells whether a variable without a value and a type gets values with `=`,
 * each of which passes a check.
 */
function everyAssignment(
  identifier: Node,
  declaration: { typeNames: string[]; value: Node | undefined },
  check: (value: Node) => boolean
): boolean {
  if (declaration.value || declaration.typeNames.length) {
    return false;
  }

  const values = assignedValues(identifier);

  return values.length > 0 && values.every(check);
}

/**
 * Tells whether a type name of the core is the type of a viewport.
 */
function isViewportTypeName(name: string): boolean {
  return Boolean(FAMILY_OF_TYPE[name]) || ANY_VIEWPORT_TYPES.has(name);
}

/**
 * Tells whether an expression is an enabled element of the core: a call of
 * `getEnabledElement` and its kin, or a variable that holds one or is typed
 * `Types.IEnabledElement`.
 */
function isEnabledElement(
  node: Node | null | undefined,
  depth: number
): boolean {
  if (!node || depth > 4) {
    return false;
  }

  if (castCoreTypes(node).includes('IEnabledElement')) {
    return true;
  }

  const inner = unwrap(node);

  if (inner.kind() === 'call_expression') {
    const callee = inner.field('function');

    return Boolean(
      callee &&
        ENABLED_ELEMENT_GETTERS.some((name) => isCoreExport(callee, name))
    );
  }

  if (inner.kind() !== 'identifier') {
    return false;
  }

  const declaration = declarationOf(inner);

  return Boolean(
    declaration &&
      (declaration.typeNames.includes('IEnabledElement') ||
        (declaration.value && isEnabledElement(declaration.value, depth + 1)))
  );
}

/**
 * Tells whether an expression is a rendering engine of the core: made with
 * `new RenderingEngine`, got with `getRenderingEngine`, read from an enabled
 * element, or a variable that holds one or is typed as one.
 */
export function isRenderingEngine(
  node: Node | null | undefined,
  depth = 0
): boolean {
  if (!node || depth > 4) {
    return false;
  }

  if (castCoreTypes(node).some((name) => ENGINE_TYPES.includes(name))) {
    return true;
  }

  const inner = unwrap(node);
  const kind = inner.kind();

  if (kind === 'new_expression') {
    const constructor = inner.field('constructor');

    return Boolean(
      constructor &&
        ENGINE_TYPES.some((name) => isCoreExport(constructor, name))
    );
  }

  if (kind === 'call_expression') {
    const callee = inner.field('function');

    if (!callee) {
      return false;
    }

    return (
      isCoreExport(callee, 'getRenderingEngine') ||
      (callee.kind() === 'member_expression' &&
        callee.field('property')?.text() === 'getRenderingEngine' &&
        viewportEvidence(callee.field('object'), depth + 1) === 'core')
    );
  }

  if (kind === 'member_expression') {
    return (
      inner.field('property')?.text() === 'renderingEngine' &&
      isEnabledElement(inner.field('object'), depth + 1)
    );
  }

  if (kind !== 'identifier') {
    return false;
  }

  const declaration = declarationOf(inner);

  if (!declaration) {
    return false;
  }

  if (declaration.typeNames.some((name) => ENGINE_TYPES.includes(name))) {
    return true;
  }

  if (declaration.key === 'renderingEngine') {
    return isEnabledElement(declaration.source, depth + 1);
  }

  return (
    isRenderingEngine(declaration.value, depth + 1) ||
    everyAssignment(inner, declaration, (value) =>
      isRenderingEngine(value, depth + 1)
    )
  );
}

/**
 * Tells whether an expression is the list of the viewports of a rendering
 * engine: `engine.getViewports()`, or a variable that holds it.
 */
function isViewportList(node: Node | null | undefined, depth: number): boolean {
  if (!node || depth > 4) {
    return false;
  }

  const inner = unwrap(node);

  if (inner.kind() === 'call_expression') {
    const callee = inner.field('function');

    return Boolean(
      callee?.kind() === 'member_expression' &&
        callee.field('property')?.text() === 'getViewports' &&
        isRenderingEngine(callee.field('object'), depth + 1)
    );
  }

  if (inner.kind() !== 'identifier') {
    return false;
  }

  return isViewportList(declarationOf(inner)?.value, depth + 1);
}

/**
 * Returns what shows that an expression is a Cornerstone viewport: `core` for
 * a cast, an annotation or a type argument of a core viewport type, a call
 * of `getViewport` on a rendering engine of the core, the `viewport` of an
 * enabled element, an entry of `engine.getViewports()`, or a variable that
 * holds one of these; `name` for a name such as `viewport` or `ctViewport`
 * alone, or `getViewport` on something else; undefined otherwise.
 */
export function viewportEvidence(
  node: Node | null | undefined,
  depth = 0
): ViewportEvidence | undefined {
  if (!node || depth > 4) {
    return undefined;
  }

  if (castCoreTypes(node).some(isViewportTypeName)) {
    return 'core';
  }

  const inner = unwrap(node);
  const kind = inner.kind();

  if (kind === 'identifier') {
    const declaration = declarationOf(inner);
    const fromValue = declaration?.value
      ? viewportEvidence(declaration.value, depth + 1)
      : undefined;
    const isCore =
      fromValue === 'core' ||
      Boolean(declaration?.typeNames.some(isViewportTypeName)) ||
      (declaration?.key === 'viewport' &&
        isEnabledElement(declaration.source, depth + 1)) ||
      Boolean(
        declaration &&
          everyAssignment(
            inner,
            declaration,
            (value) => viewportEvidence(value, depth + 1) === 'core'
          )
      );

    if (isCore) {
      return 'core';
    }

    return VIEWPORT_NAME.test(inner.text()) || fromValue === 'name'
      ? 'name'
      : undefined;
  }

  if (kind === 'member_expression') {
    const property = inner.field('property')?.text() ?? '';

    if (
      property === 'viewport' &&
      isEnabledElement(inner.field('object'), depth + 1)
    ) {
      return 'core';
    }

    return VIEWPORT_NAME.test(property) ? 'name' : undefined;
  }

  if (kind === 'subscript_expression') {
    const object = inner.field('object');

    if (isViewportList(object, depth + 1)) {
      return 'core';
    }

    return object &&
      VIEWPORTS_NAME.test(unwrap(object).text().split('.').pop() ?? '')
      ? 'name'
      : undefined;
  }

  if (kind === 'call_expression') {
    const callee = inner.field('function');

    if (
      callee?.kind() !== 'member_expression' ||
      callee.field('property')?.text() !== 'getViewport'
    ) {
      return undefined;
    }

    return isRenderingEngine(callee.field('object'), depth + 1)
      ? 'core'
      : 'name';
  }

  return undefined;
}

/**
 * Returns the family of a viewport expression when a cast, an annotation or a
 * type argument of a core type names it, or undefined.
 */
export function viewportFamily(
  node: Node,
  depth = 0
): ViewportFamily | undefined {
  if (depth > 4) {
    return undefined;
  }

  const fromCast = castCoreTypes(node)
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
 * Tells whether an expression runs no code of its own: a literal, a
 * repeatable expression, an index of those, or an array or a template of
 * those.
 */
export function isPure(node: Node): boolean {
  const kind = node.kind();

  if (LITERAL_KINDS.has(kind)) {
    return true;
  }

  if (kind === 'template_string') {
    return node
      .children()
      .filter((child) => child.kind() === 'template_substitution')
      .every((substitution) => {
        const inner = substitution.children().find((child) => child.isNamed());

        return Boolean(inner && isPure(inner));
      });
  }

  if (kind === 'array') {
    return node
      .children()
      .filter((child) => child.isNamed() && child.kind() !== 'comment')
      .every((child) => isPure(child));
  }

  if (kind === 'subscript_expression') {
    const object = node.field('object');
    const index = node.field('index');

    return Boolean(object && index && isPure(object) && isPure(index));
  }

  return isRepeatable(node);
}

/**
 * Returns the text of an expression, in parentheses when a member access
 * after it would bind to a part of it.
 */
export function asPrimary(node: Node): string {
  return PRIMARY_KINDS.has(node.kind()) ? node.text() : `(${node.text()})`;
}

/**
 * Returns the text of a comparison that replaces a node, in parentheses
 * unless the parent of the node keeps it whole.
 */
export function comparisonAt(node: Node, text: string): string {
  const parent = node.parent();
  const kind = parent?.kind() ?? '';
  const loose =
    LOOSE_PARENTS.has(kind) ||
    (kind === 'binary_expression' &&
      /^(&&|\|\||\?\?)$/.test(parent.field('operator')?.text() ?? ''));

  return loose ? text : `(${text})`;
}

/**
 * Tells whether a call has an optional link: `a?.b()`, `a.b?.()` or an
 * optional chain in its receiver.
 */
export function isOptionalCall(call: Node): boolean {
  const callee = call.field('function');

  return (
    call
      .children()
      .some(
        (child) => child.kind() === 'optional_chain' || child.text() === '?.'
      ) || Boolean(callee?.find({ rule: { kind: 'optional_chain' } }))
  );
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
 * Tells whether a statement awaits a mount call on a receiver:
 * `await viewport.setStack(...)` and its kin.
 */
function isAwaitedMount(statement: Node, receiver: string): boolean {
  const expression =
    statement.kind() === 'expression_statement'
      ? statement.children().find((child) => child.isNamed())
      : undefined;
  const call =
    expression?.kind() === 'await_expression'
      ? expression.children().find((child) => child.isNamed())
      : undefined;
  const parts = call ? methodCall(call) : undefined;

  return Boolean(
    parts &&
      MOUNT_METHODS.has(parts.method) &&
      unwrap(parts.object).text() === receiver
  );
}

/**
 * Tells whether a viewport shows data at a node, so that its content mode
 * answers what its 5.x type or class did: in the function of the node, a
 * statement that awaits a mount call on the same receiver comes before the
 * node, directly in a block that holds the node. Before its first mount a
 * planar viewport is in the mode `empty`.
 */
export function isMountedBefore(node: Node, receiver: string): boolean {
  const fn = enclosingFunction(node);
  const start = node.range().start.index;

  return node
    .ancestors()
    .filter(
      (ancestor) =>
        (ancestor.kind() === 'statement_block' ||
          ancestor.kind() === 'program') &&
        (!fn || contains(fn, ancestor))
    )
    .some((block) =>
      block
        .children()
        .some(
          (statement) =>
            statement.range().end.index <= start &&
            isAwaitedMount(statement, receiver)
        )
    );
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
 * Returns an edit that replaces a statement with other statements. They go
 * in a block when the statement is the single-statement body of an `if`, an
 * `else`, a loop, a label or a `case`. Each entry of `build` is one
 * statement whose later lines carry the indent it is given; an empty entry
 * is a blank line.
 */
export function replaceStatement(
  rootNode: Node,
  statement: Node,
  build: (indent: string) => string[]
): Edit {
  const indent = indentOf(rootNode, statement);
  const parentKind = statement.parent()?.kind() ?? '';
  const inBlock = parentKind === 'statement_block' || parentKind === 'program';
  const inner = inBlock ? indent : `${indent}  `;
  const parts = build(inner);
  const body = parts
    .map((part, index) => (index === 0 || !part ? part : `${inner}${part}`))
    .join('\n');

  return statement.replace(inBlock ? body : `{\n${inner}${body}\n${indent}}`);
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
 * Returns an edit that removes one property of an object literal, or one
 * specifier of a list, with its comma.
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
