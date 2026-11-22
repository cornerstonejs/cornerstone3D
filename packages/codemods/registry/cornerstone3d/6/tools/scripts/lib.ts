import type { Codemod, Edit, SgNode, SgRoot } from 'codemod:ast-grep';
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

/** The extensions of the files that hold JavaScript without types. */
const JAVASCRIPT_FILE = /\.(js|jsx|mjs|cjs)$/;

/** The part of an error of the tool's semantic analysis before its reason. */
const PARSE_FAILURE = /^[^]*Failed to parse file '[^]*?': /;

/** The node kinds of a name that can refer to a binding. */
const REFERENCE_KINDS = [
  'identifier',
  'shorthand_property_identifier',
  'shorthand_property_identifier_pattern',
  'type_identifier',
];

/** The node kinds of a name that can declare a binding. */
const BINDING_KINDS = [
  'identifier',
  'shorthand_property_identifier_pattern',
  'type_identifier',
];

/** The node kinds of a JSX tag, whose lower-case name is an element. */
const JSX_TAG_KINDS = new Set([
  'jsx_opening_element',
  'jsx_closing_element',
  'jsx_self_closing_element',
]);

/** The node kinds that hold the name of a parameter. */
const PARAMETER_KINDS = new Set([
  'required_parameter',
  'optional_parameter',
  'formal_parameters',
  'arrow_function',
]);

/**
 * The files of this run that the tool's semantic analysis could not read.
 * Their names are looked up on the syntax tree.
 */
const syntaxFiles = new Set<string>();

/** The declarations of each name of the file in work, by file and name. */
const bindingsByName = new Map<string, Declaration[]>();

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

/**
 * The expressions around a value that keep it: parentheses, casts and
 * non-null assertions.
 */
const KEEPING_KINDS = new Set([
  'parenthesized_expression',
  'as_expression',
  'satisfies_expression',
  'non_null_expression',
  'type_assertion',
]);

/**
 * The parents of a name that write it in another way than `name = value`:
 * an operator assignment, `++` or `--`, a `for in` or `for of`, or a
 * destructuring target.
 */
const OTHER_WRITES = new Set([
  'augmented_assignment_expression',
  'update_expression',
  'for_in_statement',
  'object_pattern',
  'array_pattern',
  'pair_pattern',
  'assignment_pattern',
  'object_assignment_pattern',
  'rest_pattern',
]);

/** The operators whose operands a chain of tests joins. */
const CHAIN_OPERATORS = new Set(['||', '&&']);

/** The nodes whose text is compared as one token. */
const TOKEN_KINDS = new Set(['string', 'template_string', 'regex', 'number']);

/** The nodes that only TypeScript reads, wherever they stand. */
const TYPE_PART_KINDS = new Set(['type_arguments', 'type_annotation']);

/** What to read at two operands that a run makes the same, by their place. */
const MERGED_NOTES: Record<MergedPlace, string> = {
  '||': 'two operands of one || are the same now, read what each tested in 5.x',
  '&&': 'two operands of one && are the same now, read what each tested in 5.x',
  case: 'two case labels of one switch are the same now, read what each chose in 5.x',
  includes:
    'two entries of one list used with includes are the same now, read what each named in 5.x',
};

/**
 * Where two operands stand: in a chain of `||` or of `&&`, as `case` labels
 * of one `switch`, or as entries of an array read with `includes`.
 */
export type MergedPlace = '||' | '&&' | 'case' | 'includes';

/**
 * An operand that the edits of a run make the same expression as an operand
 * before it in the same place, where the two differed.
 */
export interface MergedOperand {
  /** The later of the two operands. */
  node: Node;
  /** Where the two operands stand. */
  place: MergedPlace;
  /** What a person reads there, for the rule of the report. */
  note: string;
  /** The texts that the edits write into the two operands. */
  inserted: string[];
}

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

/** The declaration that a name refers to, as the tool answers it. */
export interface Definition {
  kind: string;
  node: Node;
}

/** A metric of the tool, as the transforms use it. */
interface Metric {
  increment(cardinality?: Record<string, string>): void;
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
 * Returns the reason of an error without the path of the file, in one line.
 */
function failureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return message.replace(PARSE_FAILURE, '').split('\n')[0].trim();
}

/**
 * Notes that the tool's semantic analysis could not read a file. The names
 * of a JavaScript file are looked up on the syntax tree from then on. Any
 * other file is not analysed: the error goes on to `analysed`.
 */
function leaveTool(file: string, error: unknown): void {
  if (!JAVASCRIPT_FILE.test(file)) {
    throw new Error(failureReason(error));
  }

  syntaxFiles.add(file);
}

/**
 * Returns the outermost node that covers the same text as a node. The tool
 * answers with this node: the import specifier of a name without an alias,
 * the parameter of a plain name, the export specifier of an exported name.
 */
function outermost(node: Node): Node {
  let current = node;
  let parent = current.parent();

  while (parent && contains(current, parent)) {
    current = parent;
    parent = current.parent();
  }

  return current;
}

/**
 * Returns the node that bounds the scope of a name that a node declares, as
 * `declarationScope` does. The left side of a `for in` or a `for of` without
 * `const`, `let` or `var` writes a name and declares none.
 */
function bindingScope(node: Node): Node | undefined {
  const holder = bindingHolder(node);

  if (holder?.kind() === 'for_in_statement' && !holder.field('kind')) {
    return undefined;
  }

  return declarationScope(node);
}

/**
 * Returns the declarations of a name in a file, each with its scope, with
 * the names of classes. The answer is kept for the file in work.
 */
function bindingsOf(rootNode: Node, name: string): Declaration[] {
  const key = `${rootNode.getRoot().filename()}\n${name}`;
  const kept = bindingsByName.get(key);

  if (kept) {
    return kept;
  }

  const found: Declaration[] = [];

  for (const node of rootNode.findAll({
    rule: {
      any: BINDING_KINDS.map((kind) => ({ kind })),
      regex: `^${escapeName(name)}$`,
    },
  })) {
    const scope = bindingScope(node);

    if (scope) {
      found.push({ node, scope });
    }
  }

  bindingsByName.set(key, found);

  return found;
}

/**
 * Tells whether a declaration may repeat a name of its scope: a `var`, a
 * function declaration or a parameter.
 */
function mayRepeat(declaration: Node): boolean {
  const holder = bindingHolder(declaration);
  const kind = holder?.kind() ?? '';

  return (
    PARAMETER_KINDS.has(kind) ||
    kind === 'function_declaration' ||
    kind === 'generator_function_declaration' ||
    (kind === 'variable_declarator' &&
      holder.parent()?.kind() === 'variable_declaration')
  );
}

/**
 * Tells whether a name stands where JavaScript reads a binding. The alias of
 * an export, a name of an export from another module and the lower-case
 * name of a JSX tag do not.
 */
function readsBinding(node: Node): boolean {
  const parent = node.parent();
  const kind = parent?.kind() ?? '';

  if (JSX_TAG_KINDS.has(kind)) {
    return !/^[a-z]/.test(node.text());
  }

  if (kind !== 'export_specifier' && kind !== 'namespace_export') {
    return true;
  }

  const statement = parent
    .ancestors()
    .find((ancestor) => ancestor.kind() === 'export_statement');

  return (
    kind === 'export_specifier' &&
    parent.field('alias')?.id() !== node.id() &&
    !statement?.field('source')
  );
}

/**
 * Returns the declared name that a name refers to at its place, read from
 * the syntax tree: the declaration of the innermost scope that holds the
 * node. The name of a function expression gives way to a parameter or a
 * variable of that function. Throws when two declarations of one scope
 * cannot both stand, as the binding is then unknown.
 */
function bindingAt(node: Node): Node | undefined {
  const name = node.text();
  const ownScope = bindingScope(node);

  if (ownScope && NAMED_EXPRESSION_KINDS.has(node.parent()?.kind() ?? '')) {
    return node;
  }

  const inScope = bindingsOf(node.getRoot().root(), name).filter(({ scope }) =>
    contains(scope, node)
  );
  const innermost = inScope.find(({ scope }) =>
    ownScope
      ? scope.id() === ownScope.id()
      : inScope.every((other) => contains(other.scope, scope))
  );

  if (!innermost) {
    return undefined;
  }

  const sameScope = inScope.filter(
    ({ scope }) => scope.id() === innermost.scope.id()
  );
  const own = sameScope.filter(
    ({ node: declaration }) =>
      !NAMED_EXPRESSION_KINDS.has(declaration.parent()?.kind() ?? '')
  );
  const candidates = own.length ? own : sameScope;

  if (
    candidates.length > 1 &&
    !candidates.every(({ node: declaration }) => mayRepeat(declaration))
  ) {
    throw new Error(`${name} is declared twice in one scope`);
  }

  return candidates[0].node;
}

/**
 * Returns the definition of a name read from the syntax tree, in the shape
 * of the tool's answer: a name of an import statement gives its specifier
 * with the kind `import`, any other name its declaration with the kind
 * `local`. A second declaration of a name gives nothing.
 */
function syntaxDefinition(node: Node): Definition | undefined {
  const ancestors = node.ancestors();

  if (ancestors.some((ancestor) => ancestor.kind() === 'import_statement')) {
    const specifier = ancestors.find(
      (ancestor) =>
        ancestor.kind() === 'import_specifier' ||
        ancestor.kind() === 'namespace_import'
    );

    return { kind: 'import', node: outermost(specifier ?? node) };
  }

  if (!readsBinding(node)) {
    return undefined;
  }

  const binding = bindingAt(node);

  if (!binding || (bindingScope(node) && binding.id() !== node.id())) {
    return undefined;
  }

  return { kind: 'local', node: outermost(binding) };
}

/**
 * Returns the nodes of the file that refer to a declared name, read from the
 * syntax tree, in the shape of the tool's answer. A node that is not the
 * declaration of its name gives none.
 */
function syntaxReferences(declaration: Node): Node[] {
  if (!bindingScope(declaration)) {
    return [];
  }

  if (bindingAt(declaration)?.id() !== declaration.id()) {
    return [];
  }

  return declaration
    .getRoot()
    .root()
    .findAll({
      rule: {
        any: REFERENCE_KINDS.map((kind) => ({ kind })),
        regex: `^${escapeName(declaration.text())}$`,
      },
    })
    .filter(
      (node) =>
        !bindingScope(node) &&
        readsBinding(node) &&
        !node
          .ancestors()
          .some((ancestor) => ancestor.kind() === 'import_statement') &&
        bindingAt(node)?.id() === declaration.id()
    )
    .map(outermost);
}

/**
 * Returns the definition of a name: the answer of the tool's semantic
 * analysis, or the one read from the syntax tree when the tool cannot read
 * a JavaScript file (it reads JSX only in `.jsx` and `.tsx` files).
 */
export function definitionAt(node: Node): Definition | undefined {
  const file = node.getRoot().filename();

  if (!syntaxFiles.has(file)) {
    try {
      return node.definition() ?? undefined;
    } catch (error) {
      leaveTool(file, error);
    }
  }

  return syntaxDefinition(node);
}

/**
 * Returns the nodes of the file that refer to a declared name, from the tool
 * or from the syntax tree as `definitionAt` does.
 */
function referencesAt(declaration: Node): Node[] {
  const file = declaration.getRoot().filename();

  if (!syntaxFiles.has(file)) {
    try {
      return declaration
        .references()
        .filter((entry) => entry.root.filename() === file)
        .flatMap((entry) => entry.nodes);
    } catch (error) {
      leaveTool(file, error);
    }
  }

  return syntaxReferences(declaration);
}

/**
 * Returns the definition of an identifier, with the kind of the definition.
 * A declarator with a type annotation comes back as its name, as one without.
 */
function definitionOf(
  identifier: Node
): { kind: string; node: Node } | undefined {
  const definition = definitionAt(identifier);

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
  const start = declaration.range().start.index;

  return referencesAt(declaration).filter(
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
 * Returns the specifiers of the statements that re-export names of
 * `@cornerstonejs/core` (`export { name } from '@cornerstonejs/core'`), each
 * with the name that it takes from the core.
 */
export function coreReExports(
  rootNode: Node
): Array<{ specifier: Node; name: string }> {
  return rootNode
    .children()
    .filter(
      (child) =>
        child.kind() === 'export_statement' &&
        importSource(child) === CORE_PACKAGE
    )
    .flatMap((statement) =>
      statement.findAll({ rule: { kind: 'export_specifier' } })
    )
    .map((specifier) => ({
      specifier,
      name: specifier.field('name')?.text() ?? '',
    }));
}

/**
 * Returns the name of a key that does not change: a name, a string, or a
 * string in brackets. Returns undefined for a key computed from code.
 */
export function staticKeyName(
  key: Node | null | undefined
): string | undefined {
  const kind = key?.kind() ?? '';

  if (kind === 'string') {
    return key.text().slice(1, -1);
  }

  if (kind === 'computed_property_name') {
    const inner = key.children().find((child) => child.isNamed());

    return inner?.kind() === 'string' ? inner.text().slice(1, -1) : undefined;
  }

  return /identifier/.test(kind) ? key.text() : undefined;
}

/**
 * Returns the string key of a bracket access such as `object['name']`, or
 * undefined.
 */
export function bracketKey(node: Node): string | undefined {
  const index =
    node.kind() === 'subscript_expression' ? node.field('index') : undefined;

  return index?.kind() === 'string' ? index.text().slice(1, -1) : undefined;
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
  const definition = definitionAt(identifier);
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
  const definition = definitionAt(identifier);

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

  if (
    !definition ||
    definition.kind !== 'local' ||
    !isStableBinding(definition.node)
  ) {
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
 * Returns the names of the core types that a type node names at its top: the
 * type itself, or each member of a union of core types with `null` and
 * `undefined`. A type argument of a generic type, an array type or an object
 * type names none, as the value is a container of the type, not the type.
 */
export function topLevelCoreTypes(typeNode: Node | null | undefined): string[] {
  const kind = typeNode?.kind() ?? '';

  if (kind === 'type_annotation' || kind === 'parenthesized_type') {
    return topLevelCoreTypes(
      typeNode.children().find((child) => child.isNamed())
    );
  }

  if (kind === 'type_identifier') {
    return isCoreType(typeNode) ? [typeNode.text()] : [];
  }

  if (kind === 'nested_type_identifier') {
    const named = typeNode.children().filter((child) => child.isNamed());
    const last = named[named.length - 1];

    return last?.kind() === 'type_identifier' && isCoreType(last)
      ? [last.text()]
      : [];
  }

  if (kind !== 'union_type') {
    return [];
  }

  const members = typeNode
    .children()
    .filter(
      (child) => child.isNamed() && !/^(null|undefined)$/.test(child.text())
    );
  const names = members.map((member) => topLevelCoreTypes(member));

  return names.every((found) => found.length) ? names.flat() : [];
}

/**
 * Returns the names of the core types that a cast puts on an expression at
 * its top, without following variables.
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
      const typed =
        typeNode?.kind() === 'type_arguments'
          ? typeNode.children().find((child) => child.isNamed())
          : typeNode;

      names.push(...topLevelCoreTypes(typed));
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
 * Returns the node that holds a declared name through its destructuring
 * patterns: a declarator, a parameter, an import specifier.
 */
function bindingHolder(declaration: Node): Node | undefined {
  let parent = declaration.parent();

  while (parent && PATTERN_KINDS.has(parent.kind())) {
    parent = parent.parent();
  }

  return parent ?? undefined;
}

/**
 * Tells whether a reference to a name writes it: the left side of `=`, of an
 * operator assignment or of a `for in`/`for of` without a declaration, a
 * destructuring target of those, or `++` and `--`.
 */
function isWrite(reference: Node): boolean {
  let child = reference;
  let parent = reference.parent();

  while (
    parent &&
    (PATTERN_KINDS.has(parent.kind()) ||
      parent.kind() === 'parenthesized_expression')
  ) {
    child = parent;
    parent = parent.parent();
  }

  const kind = parent?.kind() ?? '';

  if (kind === 'update_expression') {
    return true;
  }

  return (
    (kind === 'assignment_expression' ||
      kind === 'augmented_assignment_expression' ||
      kind === 'for_in_statement') &&
    parent.field('left')?.id() === child.id()
  );
}

/**
 * Tells whether a declared name holds one value for its whole scope: a
 * `const`, an import, or a parameter that the file never writes. A `let`, a
 * `var` or a written parameter can hold another value at a later node.
 */
export function isStableBinding(declaration: Node): boolean {
  const holder = bindingHolder(declaration);
  const kind = holder?.kind() ?? '';

  if (kind === 'variable_declarator') {
    const statement = holder.parent();

    return (
      statement?.kind() === 'lexical_declaration' &&
      statement.children()[0]?.text() === 'const'
    );
  }

  if (
    kind === 'import_specifier' ||
    kind === 'import_clause' ||
    kind === 'namespace_import'
  ) {
    return true;
  }

  if (
    kind === 'required_parameter' ||
    kind === 'optional_parameter' ||
    kind === 'formal_parameters' ||
    kind === 'arrow_function'
  ) {
    return !referencesOf(declaration).some(isWrite);
  }

  return false;
}

/**
 * Returns the declaration of the binding that an identifier refers to when
 * that binding holds one value for its whole scope, or undefined.
 */
export function stableBinding(identifier: Node): Node | undefined {
  const declaration = declarationNodeOf(identifier);

  return declaration && isStableBinding(declaration) ? declaration : undefined;
}

/**
 * Tells whether an expression is a name that refers to a declaration.
 */
export function isBoundTo(node: Node, declaration: Node): boolean {
  const kind = node.kind();

  return (
    (kind === 'identifier' || kind === 'shorthand_property_identifier') &&
    declarationNodeOf(node)?.range().start.index ===
      declaration.range().start.index
  );
}

/**
 * Returns the outermost expression that keeps the value of a node through
 * parentheses, casts and non-null assertions.
 */
export function keptValue(node: Node): Node {
  let current = node;
  let parent = node.parent();

  while (parent && KEEPING_KINDS.has(parent.kind())) {
    current = parent;
    parent = parent.parent();
  }

  return current;
}

/**
 * Returns the values that a declared name gets: the value of its declaration
 * and the value of each `name = value`. Undefined when the file writes the
 * name in another way, such as `+=` or a destructuring.
 */
export function writtenValues(declaration: Node): Node[] | undefined {
  const holder = declaration.parent();
  const initial =
    holder?.kind() === 'variable_declarator' &&
    holder.field('name')?.id() === declaration.id()
      ? holder.field('value')
      : undefined;
  const values = initial ? [initial] : [];

  for (const reference of referencesOf(declaration)) {
    let child = reference;
    let parent = reference.parent();

    while (parent?.kind() === 'parenthesized_expression') {
      child = parent;
      parent = parent.parent();
    }

    const kind = parent?.kind() ?? '';
    const right =
      kind === 'assignment_expression' &&
      parent.field('left')?.id() === child.id()
        ? parent.field('right')
        : undefined;

    if (right) {
      values.push(right);
    } else if (OTHER_WRITES.has(kind)) {
      return undefined;
    }
  }

  return values;
}

/**
 * Returns what a declaration gives to the binding that an identifier refers
 * to, when that binding holds one value for its whole scope: the core types
 * at the top of its annotation, the value it starts with, and for a
 * destructured name its key and the object it comes from. A `let`, a `var`,
 * a written parameter and an assignment give nothing.
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
    const pattern = target.field('pattern');
    const annotation = target
      .children()
      .find((child) => child.kind() === 'type_annotation');

    if (pattern?.kind() !== 'identifier' || !isStableBinding(pattern)) {
      return undefined;
    }

    return {
      typeNames: topLevelCoreTypes(annotation),
      value: undefined,
    };
  }

  if (!isStableBinding(target)) {
    return undefined;
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
    typeNames: topLevelCoreTypes(annotation),
    value: parent.field('value') ?? undefined,
  };
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
 * element, or a `const` or a parameter that the file never writes that holds
 * one or is typed as one.
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

  return isRenderingEngine(declaration.value, depth + 1);
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
 * a cast or an annotation whose top type is a core viewport type, a call of
 * `getViewport` on a rendering engine of the core, the `viewport` of an
 * enabled element, an entry of `engine.getViewports()`, or a `const` or a
 * parameter that the file never writes that holds one of these; `name` for a
 * name such as `viewport` or `ctViewport` alone (a `let`, a `var` or a
 * written parameter among them), or `getViewport` on something else;
 * undefined otherwise. A type argument of another type is no evidence.
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
        isEnabledElement(declaration.source, depth + 1));

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
 * Returns the family that core type names give together, when they give one.
 */
function familyOfTypes(names: string[]): ViewportFamily | undefined {
  const families = new Set(
    names.map((name) => FAMILY_OF_TYPE[name]).filter(Boolean)
  );

  return families.size === 1 ? [...families][0] : undefined;
}

/**
 * Returns the family of a viewport expression when the top type of a cast or
 * an annotation names it, or the type argument of `getViewport` on a core
 * rendering engine, or undefined.
 */
export function viewportFamily(
  node: Node,
  depth = 0
): ViewportFamily | undefined {
  if (depth > 4) {
    return undefined;
  }

  const fromCast = familyOfTypes(castCoreTypes(node));

  if (fromCast) {
    return fromCast;
  }

  const inner = unwrap(node);
  const call = methodCall(inner);
  const typeArguments = call ? inner.field('type_arguments') : undefined;

  if (
    call?.method === 'getViewport' &&
    typeArguments &&
    isRenderingEngine(call.object, depth + 1)
  ) {
    const argument = typeArguments
      .children()
      .filter((child) => child.isNamed());

    return argument.length === 1
      ? familyOfTypes(topLevelCoreTypes(argument[0]))
      : undefined;
  }

  if (inner.kind() !== 'identifier') {
    return undefined;
  }

  const declaration = declarationOf(inner);

  if (!declaration) {
    return undefined;
  }

  const fromType = familyOfTypes(declaration.typeNames);

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
 * Tells whether an expression gives the same value when it is read twice in
 * a row: a name, a literal, a template without substitutions, or an array
 * literal of those. A property read, a call, a spread or a conditional can
 * give another value or run code, so a rewrite reads it once into a `const`.
 */
export function isPlainValue(node: Node): boolean {
  const kind = node.kind();

  if (kind === 'identifier' || LITERAL_KINDS.has(kind)) {
    return true;
  }

  if (kind === 'template_string') {
    return !node
      .children()
      .some((child) => child.kind() === 'template_substitution');
  }

  return (
    kind === 'array' &&
    node
      .children()
      .filter((child) => child.isNamed() && child.kind() !== 'comment')
      .every((child) => isPlainValue(child))
  );
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
 * Tells whether a statement awaits a mount call on a receiver that refers to
 * a declaration: `await viewport.setStack(...)` and its kin.
 */
function isAwaitedMount(statement: Node, binding: Node): boolean {
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
      isBoundTo(unwrap(parts.object), binding)
  );
}

/**
 * Returns the statements that run before a node on every path to it in its
 * function: the statements before it in each block of the function that
 * holds it.
 */
export function statementsBefore(node: Node): Node[] {
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
    .flatMap((block) =>
      block
        .children()
        .filter((statement) => statement.range().end.index <= start)
    );
}

/**
 * Tells whether a viewport shows data at a node, so that its content mode
 * answers what its 5.x type or class did: the receiver is a name whose
 * binding holds one value, and a statement that awaits a mount call on the
 * same binding runs before the node in its function. Before its first mount
 * a planar viewport is in the mode `empty`.
 */
export function isMountedBefore(node: Node, receiver: Node): boolean {
  const target = unwrap(receiver);
  const binding =
    target.kind() === 'identifier' ? stableBinding(target) : undefined;

  return Boolean(
    binding &&
      statementsBefore(node).some((statement) =>
        isAwaitedMount(statement, binding)
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
 * Holds the entries of a metric until the transform of a file is done, so
 * that a file that could not be analysed leaves none of them.
 */
export class HeldMetric {
  private readonly metric: Metric;

  private held: Record<string, string>[] = [];

  constructor(metric: Metric) {
    this.metric = metric;
  }

  /**
   * Keeps one entry.
   */
  increment(cardinality: Record<string, string>): void {
    this.held.push(cardinality);
  }

  /**
   * Gives the kept entries to the metric, in their order.
   */
  release(): void {
    for (const cardinality of this.held) {
      this.metric.increment(cardinality);
    }

    this.held = [];
  }

  /**
   * Forgets the kept entries.
   */
  drop(): void {
    this.held = [];
  }
}

/**
 * Wraps the transform of a step so that it never fails on a file. When the
 * transform throws (the tool could not read a TypeScript file, or a name is
 * declared twice in one scope), the file stays as it is, the entries of the
 * file are dropped, and the file is reported once in `manual` with the
 * reason.
 */
export function analysed(
  transform: Codemod<TSX>,
  manual: HeldMetric,
  ...others: HeldMetric[]
): Codemod<TSX> {
  return (root, options) => {
    const metrics = [manual, ...others];

    bindingsByName.clear();

    try {
      const result = transform(root, options);

      metrics.forEach((metric) => metric.release());

      return result;
    } catch (error) {
      metrics.forEach((metric) => metric.drop());
      manual.increment(
        site(
          root,
          `the file was not analysed: ${failureReason(error)}`,
          root.root()
        )
      );
      manual.release();

      return null;
    }
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

/**
 * Tells whether an edit lies inside a node.
 */
function isEditInside(node: Node, edit: Edit): boolean {
  const { start, end } = node.range();

  return start.index <= edit.startPos && edit.endPos <= end.index;
}

/**
 * Returns the tokens of the value of a node: its leaves, where a string, a
 * template, a regular expression and a number are one token each. The
 * comments and the parts that only TypeScript reads (the type of a cast, a
 * non-null `!`, type arguments, a type annotation, and the parentheses
 * around a cast of a name, a member or a call) are not tokens: they go to
 * `skipped`.
 */
function tokensOf(node: Node, skipped: Node[]): Node[] {
  const kind = node.kind();

  if (kind === 'comment' || TYPE_PART_KINDS.has(kind)) {
    skipped.push(node);

    return [];
  }

  const children = node.children();

  if (!children.length || TOKEN_KINDS.has(kind)) {
    return [node];
  }

  const named = children.filter(
    (child) => child.isNamed() && child.kind() !== 'comment'
  );
  const isCastInParentheses =
    kind === 'parenthesized_expression' &&
    KEEPING_KINDS.has(named[0]?.kind() ?? '') &&
    named[0].kind() !== kind &&
    PRIMARY_KINDS.has(unwrap(named[0]).kind());

  if (
    !KEEPING_KINDS.has(kind) ||
    (kind === 'parenthesized_expression' && !isCastInParentheses)
  ) {
    return children.flatMap((child) => tokensOf(child, skipped));
  }

  const value = kind === 'type_assertion' ? named[named.length - 1] : named[0];

  skipped.push(...children.filter((child) => child.id() !== value?.id()));

  return value ? tokensOf(value, skipped) : [];
}

/**
 * A node as a list of edits leaves it: the text of its value, to compare
 * two nodes, and the texts that the edits write into that value.
 */
interface EditedText {
  text: string;
  inserted: string[];
}

/**
 * Returns the value of a node as a list of edits leaves it: its text without
 * comments, without the parts that only TypeScript reads and without the
 * white space around its punctuation. Undefined when an edit crosses the
 * border of the node or of one of its tokens.
 */
function editedText(node: Node, edits: Edit[]): EditedText | undefined {
  const { start, end } = node.range();
  const pieces: { at: number; order: number; text: string }[] = [];
  const inside: Edit[] = [];
  const skipped: Node[] = [];
  const tokens = tokensOf(node, skipped);

  for (const edit of edits) {
    const isApart =
      edit.startPos === edit.endPos
        ? !isEditInside(node, edit)
        : edit.endPos <= start.index || end.index <= edit.startPos;

    if (isApart || skipped.some((part) => isEditInside(part, edit))) {
      continue;
    }

    if (!isEditInside(node, edit)) {
      return undefined;
    }

    inside.push(edit);
    pieces.push({ at: edit.startPos, order: 0, text: edit.insertedText });
  }

  for (const token of tokens) {
    const range = token.range();
    const over = inside.filter(
      (edit) =>
        edit.startPos < range.end.index && range.start.index < edit.endPos
    );

    if (
      over.some(
        (edit) =>
          edit.startPos > range.start.index || edit.endPos < range.end.index
      )
    ) {
      return undefined;
    }

    if (!over.length) {
      pieces.push({ at: range.start.index, order: 1, text: token.text() });
    }
  }

  return {
    text: pieces
      .sort((a, b) => a.at - b.at || a.order - b.order)
      .map((piece) => piece.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/ ?([^\w$ ]) ?/g, '$1')
      .trim(),
    inserted: inside.map((edit) => edit.insertedText),
  };
}

/**
 * Returns the text of the value of a node as a list of edits leaves it,
 * without comments, without the parts that only TypeScript reads and
 * without the white space around its punctuation, so that two nodes can be
 * compared. Undefined when an edit crosses the border of the node or of one
 * of its tokens.
 */
export function textAfterEdits(node: Node, edits: Edit[]): string | undefined {
  return editedText(node, edits)?.text;
}

/**
 * Tells whether a node is a test that joins two operands with an operator.
 */
function isChain(node: Node | null | undefined, operator: string): boolean {
  return (
    node?.kind() === 'binary_expression' &&
    node.field('operator')?.text() === operator
  );
}

/**
 * Returns the operands of a chain of one operator, through parentheses and
 * casts: `a || (b || c)` gives `a`, `b` and `c`.
 */
function chainOperands(binary: Node, operator: string): Node[] {
  return ['left', 'right'].flatMap((side) => {
    const operand = binary.field(side);

    if (!operand) {
      return [];
    }

    const inner = unwrap(operand);

    return isChain(inner, operator)
      ? chainOperands(inner, operator)
      : [operand];
  });
}

/**
 * Tells whether a node is the object of a read of `includes`, through
 * parentheses and casts.
 */
function isIncludesObject(node: Node): boolean {
  const value = keptValue(node);
  const parent = value.parent();

  return (
    parent?.kind() === 'member_expression' &&
    parent.field('object')?.id() === value.id() &&
    parent.field('property')?.text() === 'includes'
  );
}

/**
 * Tells whether an array literal is read with `includes`: directly, or
 * through a `const` that holds it.
 */
function isReadWithIncludes(array: Node): boolean {
  if (isIncludesObject(array)) {
    return true;
  }

  const value = keptValue(array);
  const declarator = value.parent();
  const name =
    declarator?.kind() === 'variable_declarator' &&
    declarator.field('value')?.id() === value.id()
      ? declarator.field('name')
      : undefined;

  return Boolean(
    name?.kind() === 'identifier' &&
      isStableBinding(name) &&
      referencesOf(name).some(isIncludesObject)
  );
}

/**
 * Returns the operands of a file that stand in one place, place by place:
 * the operands of each chain of `||` or of `&&`, the `case` labels of each
 * `switch`, and the entries of each array literal read with `includes`.
 */
function operandGroups(
  rootNode: Node
): { place: MergedPlace; operands: Node[] }[] {
  const groups: { place: MergedPlace; operands: Node[] }[] = [];

  for (const binary of rootNode.findAll({
    rule: { kind: 'binary_expression' },
  })) {
    const operator = binary.field('operator')?.text() ?? '';

    if (
      CHAIN_OPERATORS.has(operator) &&
      !isChain(keptValue(binary).parent(), operator)
    ) {
      groups.push({
        place: operator as MergedPlace,
        operands: chainOperands(binary, operator),
      });
    }
  }

  for (const body of rootNode.findAll({ rule: { kind: 'switch_body' } })) {
    groups.push({
      place: 'case',
      operands: body
        .children()
        .filter((child) => child.kind() === 'switch_case')
        .flatMap((child) => child.field('value') ?? []),
    });
  }

  for (const array of rootNode.findAll({ rule: { kind: 'array' } })) {
    if (isReadWithIncludes(array)) {
      groups.push({
        place: 'includes',
        operands: array
          .children()
          .filter((child) => child.isNamed() && child.kind() !== 'comment'),
      });
    }
  }

  return groups;
}

/**
 * Returns each operand that a list of edits makes the same expression as an
 * operand before it in the same place, where the two differed: in a chain
 * of `||` or of `&&`, among the `case` labels of one `switch`, or among the
 * entries of an array literal read with `includes`. Such a rewrite is right
 * name by name, and what the two tests told apart in 5.x is gone.
 */
export function mergedOperands(rootNode: Node, edits: Edit[]): MergedOperand[] {
  if (!edits.length) {
    return [];
  }

  const found: MergedOperand[] = [];

  for (const { place, operands } of operandGroups(rootNode)) {
    const isEdited = operands.some((operand) =>
      edits.some((edit) => isEditInside(operand, edit))
    );

    if (!isEdited) {
      continue;
    }

    const texts = operands.map((operand) => ({
      before: textAfterEdits(unwrap(operand), []),
      after: editedText(unwrap(operand), edits),
    }));

    operands.forEach((operand, index) => {
      const { before, after } = texts[index];
      const twin = texts.find(
        (other, at) =>
          at < index &&
          after !== undefined &&
          other.after?.text === after.text &&
          other.before !== before
      );

      if (after && twin?.after) {
        found.push({
          node: operand,
          place,
          note: MERGED_NOTES[place],
          inserted: [...after.inserted, ...twin.after.inserted],
        });
      }
    });
  }

  return found;
}
