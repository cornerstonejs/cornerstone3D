import {
  CORE_PACKAGE,
  bracketKey,
  declarationNodeOf,
  importSource,
  indentOf,
  isPure,
  isRepeatable,
  isStableBinding,
  keptValue,
  methodCall,
  objectEntries,
  referencesOf,
  removeProperty,
  removeStatement,
  staticKeyName,
  topLevelCoreTypes,
  unwrap,
  viewportEvidence,
  viewportFamily,
  writtenValues,
} from '../lib.ts';
import type { Node, ViewportFamily } from '../lib.ts';
import type { Edit } from 'codemod:ast-grep';
import {
  importOf,
  noteRewritten,
  pathOf,
  receiverEvidence,
  report,
} from '../rules.ts';
import type { Rules, Run } from '../rules.ts';

/** The path of the registry of 6.0.0-beta.2 in the core. */
const OLD_REGISTRY = 'utilities.genericViewportDisplaySetMetadataProvider';

/** The path of the registry in 6.0. */
const REGISTRY = 'displaySetRegistry';

/** The metadata key of the registry of 6.0.0-beta.2. */
const OLD_KEY = 'genericViewportDisplaySet';

/** The name of the beta registry. */
const OLD_NAME = 'genericViewportDisplaySetMetadataProvider';

/** The text of a descriptor that the step cannot see, word for word in the guide. */
const DESCRIPTOR_NOT_A_LITERAL =
  'the descriptor is not a literal here: delete its kind, and give a video or an ECG descriptor its image id as imageId (was sourceDataId)';

/** The text of a `dataId` that the file does not show to be Cornerstone's. */
const DATA_ID_UNPROVEN =
  'if this is a view reference, a render plan layer, an event detail, an actor entry, a stack input or a projection request of Cornerstone, the key is displaySetId';

/** The text of `getActiveDataId`, which never was public. */
const GET_ACTIVE_DATA_ID =
  'never public: on a planar or an ECG viewport getSourceDisplaySetId() gives the same id, and the slide that a whole slide viewport shows has no public getter';

/** The core types whose `dataId` is the id of a display set. */
const DATA_ID_TYPES = [
  'ViewReference',
  'RenderPlanLayer',
  'ActorEntry',
  'IStackInput',
  'RenderPlanChangedEventDetail',
  'ProjectionRequest',
  'ProjectionSnapshot',
];

/**
 * The events whose detail names a display set: in the detail itself, or in
 * its `rendering` (the whole slide viewport's `IMAGE_RENDERED`).
 */
const DETAIL_EVENTS: Record<string, 'detail' | 'rendering'> = {
  'Enums.Events.RENDER_PLAN_CHANGED': 'detail',
  'Enums.Events.RENDER_PATH_ERROR': 'detail',
  'Enums.Events.IMAGE_RENDERED': 'rendering',
};

/** The methods of an array that hand each entry to a callback. */
const ENTRY_CALLBACKS = new Set([
  'map',
  'forEach',
  'filter',
  'find',
  'findLast',
  'some',
  'every',
  'flatMap',
  'findIndex',
  'findLastIndex',
]);

/** The methods of an array that give one of its entries. */
const ENTRY_GETTERS = new Set(['find', 'findLast', 'at', 'pop', 'shift']);

/** The methods of an array that give an array of some of its entries. */
const LIST_GETTERS = new Set(['filter', 'slice', 'concat', 'reverse', 'sort']);

/** The methods of a viewport whose first argument names a display set by `dataId`. */
const VIEWPORT_METHODS = new Set([
  'addImages',
  'isReferenceViewable',
  'setViewReference',
]);

/** The kinds of the function nodes of the syntax tree. */
const FUNCTION_KINDS = new Set([
  'arrow_function',
  'function_expression',
  'function_declaration',
  'function',
]);

/** The kinds of the nodes that keep the value of an expression. */
const KEEPING_KINDS = new Set([
  'parenthesized_expression',
  'as_expression',
  'satisfies_expression',
  'non_null_expression',
]);

/**
 * What shows that an object is Cornerstone's: proven, a viewport known by
 * its name alone, or nothing.
 */
type Evidence = 'proven' | 'name' | undefined;

/**
 * Display sets: the registry (`displaySetRegistry.add` in place of the beta
 * metadata provider), `displaySetId` in place of `dataId`, the deleted
 * `kind` of a registered display set, `mode: 'volume'` on the mount of a
 * display set registered with a `volumeId`, and `initialImageIdIndex` from
 * the registration to the mount (lanes N2, DS1 to DS3).
 */
export const rules: Rules = {
  exports: [{ namespace: 'utilities', name: OLD_NAME, moveTo: REGISTRY }],
  members: [
    { receiver: 'viewport', name: 'removeData', to: 'removeDisplaySet' },
    {
      receiver: 'viewport',
      name: 'getSourceDataId',
      to: 'getSourceDisplaySetId',
    },
    {
      receiver: 'viewport',
      name: 'getActiveDataId',
      manual: GET_ACTIVE_DATA_ID,
    },
  ],
  keys: [OLD_REGISTRY, REGISTRY].flatMap((call) => [
    { in: { call: `${call}.add`, argument: 1 }, key: 'kind', remove: true },
    {
      in: { call: `${call}.add`, argument: 1 },
      key: 'sourceDataId',
      to: 'imageId',
    },
  ]),
};

/**
 * The rewrites of this family that no table entry says. They run before the
 * tables of every family; a site they rewrite or report is marked handled
 * (`run.handled`), and the tables leave it.
 */
export function rewrite(run: Run): void {
  if (!importsCornerstone(run)) {
    return;
  }

  rewriteRegistryCalls(run);
  rewriteRegisteredMounts(run);
  rewriteRegistryPatterns(run);
  reportRegistryKey(run);
  reportRegistryModules(run);
  rewriteDataIds(run);
  reportTypeMembers(run);
}

/** The core types of a viewport, of 6.0 and of 6.0.0-beta.2. */
const VIEWPORT_TYPES = new Set([
  'IViewport',
  'IGenericViewport',
  'BaseViewport',
  'GenericViewport',
  'PlanarViewport',
  'VolumeViewport3D',
  'VideoViewport',
  'WSIViewport',
  'ECGViewport',
]);

/**
 * Members that a family renames, by name, with the core types that have them
 * and the text of their report.
 */
export type TypeMembers = Record<string, { types: Set<string>; text: string }>;

/**
 * The members that this family renames, with the core types that have them
 * and their name in 6.0.
 */
const TYPE_MEMBERS: TypeMembers = {
  getSourceDataId: {
    types: VIEWPORT_TYPES,
    text: 'its name in 6.0 is getSourceDisplaySetId',
  },
  removeData: {
    types: VIEWPORT_TYPES,
    text: 'its name in 6.0 is removeDisplaySet',
  },
  getActiveDataId: { types: VIEWPORT_TYPES, text: GET_ACTIVE_DATA_ID },
  dataId: {
    types: new Set(DATA_ID_TYPES),
    text: 'its name in 6.0 is displaySetId',
  },
};

/**
 * Reports a member of a type of the application that declares a name of
 * this family on top of a Cornerstone type: an object type in an
 * intersection with the core type (`Types.IViewport & { getSourceDataId?():
 * string }`) or the body of an interface that extends it. The step renames
 * the uses of the member on a Cornerstone viewport; the declaration is the
 * application's and stays as it is.
 */
function reportTypeMembers(run: Run): void {
  reportMembersOfTypes(run, TYPE_MEMBERS);
}

/**
 * Reports each member of a table that a type of the application declares on
 * top of a Cornerstone type, as `reportTypeMembers` does for this family.
 * Other families call it with their own table.
 */
export function reportMembersOfTypes(run: Run, table: TypeMembers): void {
  for (const body of run.rootNode.findAll({
    rule: { any: [{ kind: 'object_type' }, { kind: 'interface_body' }] },
  })) {
    const bases = baseTypes(body);

    if (!bases.length) {
      continue;
    }

    for (const member of body.children()) {
      if (
        member.kind() !== 'property_signature' &&
        member.kind() !== 'method_signature'
      ) {
        continue;
      }

      const nameNode = member.field('name');
      const name = staticKeyName(nameNode) ?? '';
      const entry = Object.prototype.hasOwnProperty.call(table, name)
        ? table[name]
        : undefined;

      if (
        !nameNode ||
        !entry ||
        !bases.some((base) => entry.types.has(base)) ||
        run.handled.has(nameNode.range().start.index)
      ) {
        continue;
      }

      run.handled.add(nameNode.range().start.index);
      report(
        run,
        'manual',
        `${name}: a member of a type of the application on a Cornerstone type, ${entry.text}`,
        member
      );
    }
  }
}

/**
 * Returns the core types under an object type: the other members of the
 * intersection that holds it, or the types that its interface extends.
 */
function baseTypes(body: Node): string[] {
  const parent = body.parent();

  if (parent?.kind() === 'intersection_type') {
    return parent
      .children()
      .filter((child) => child.isNamed() && child.id() !== body.id())
      .flatMap((child) => topLevelCoreTypes(child));
  }

  if (parent?.kind() !== 'interface_declaration') {
    return [];
  }

  return parent
    .children()
    .filter((child) => child.kind() === 'extends_type_clause')
    .flatMap((clause) =>
      clause
        .children()
        .filter((child) => child.isNamed())
        .flatMap((child) => topLevelCoreTypes(child))
    );
}

/** The text of the module paths of the beta registry, word for word in the guide. */
const IMPORT_REGISTRY = `import { ${REGISTRY} } from '${CORE_PACKAGE}'`;

/**
 * Reports the imports of the beta registry from a subpath of the core: the
 * deleted module `@cornerstonejs/core/utilities/genericViewportDisplaySetMetadataProvider`,
 * and the name from `@cornerstonejs/core/utilities`. The step cannot follow
 * the calls on such a name.
 */
function reportRegistryModules(run: Run): void {
  for (const statement of run.rootNode.findAll({
    rule: {
      any: [{ kind: 'import_statement' }, { kind: 'export_statement' }],
    },
  })) {
    const source = (importSource(statement) ?? '').replace(/\.js$/, '');

    if (source === `${CORE_PACKAGE}/utilities/${OLD_NAME}`) {
      report(
        run,
        'manual',
        `${source}: the module is deleted, ${IMPORT_REGISTRY}`,
        statement
      );
      continue;
    }

    if (source !== `${CORE_PACKAGE}/utilities`) {
      continue;
    }

    for (const specifier of statement.findAll({
      rule: {
        any: [{ kind: 'import_specifier' }, { kind: 'export_specifier' }],
      },
    })) {
      if (specifier.field('name')?.text() === OLD_NAME) {
        report(
          run,
          'manual',
          `${OLD_NAME}: imported from ${source}, ${IMPORT_REGISTRY}`,
          specifier
        );
      }
    }
  }
}

/**
 * Tells whether a file imports a package of Cornerstone, so that a name in
 * it can be Cornerstone's.
 */
export function importsCornerstone(run: Run): boolean {
  const isCornerstone = (source: string | undefined) =>
    Boolean(source?.startsWith('@cornerstonejs/'));

  return run.rootNode
    .findAll({
      rule: {
        any: [
          { kind: 'import_statement' },
          { kind: 'export_statement' },
          { kind: 'call_expression' },
        ],
      },
    })
    .some((node) => {
      if (node.kind() !== 'call_expression') {
        return isCornerstone(importSource(node));
      }

      const callee = node.field('function');
      const argument = node
        .field('arguments')
        ?.children()
        .find((child) => child.isNamed());

      return (
        (callee?.kind() === 'import' || callee?.text() === 'require') &&
        argument?.kind() === 'string' &&
        isCornerstone(argument.text().slice(1, -1))
      );
    });
}

/**
 * Returns the path of an expression that is the registry: the beta provider
 * by any path (an alias, a namespace, a destructured name) or
 * `displaySetRegistry`; undefined for anything else.
 */
function registryPath(node: Node | null | undefined): string | undefined {
  const path = node ? pathOf(node) : undefined;

  return path === OLD_REGISTRY || path === REGISTRY ? path : undefined;
}

/** Marks a node and every name and string in it handled. */
function markHandled(run: Run, node: Node): void {
  run.handled.add(node.range().start.index);

  for (const inner of node.findAll({
    rule: {
      any: [
        { kind: 'identifier' },
        { kind: 'property_identifier' },
        { kind: 'string' },
      ],
    },
  })) {
    run.handled.add(inner.range().start.index);
  }
}

/** Returns the named arguments of a call, without comments. */
function argumentsOf(call: Node): Node[] {
  return (
    call
      .field('arguments')
      ?.children()
      .filter((child) => child.isNamed() && child.kind() !== 'comment') ?? []
  );
}

/**
 * Rewrites `const { genericViewportDisplaySetMetadataProvider } = utilities`:
 * the entry leaves the pattern (the whole declaration when it was the only
 * one) and each use of its name becomes `displaySetRegistry`. A name that
 * the file writes, or a nested pattern, is reported.
 */
function rewriteRegistryPatterns(run: Run): void {
  for (const pattern of run.rootNode.findAll({
    rule: { kind: 'object_pattern' },
  })) {
    const declarator = pattern.parent();

    if (
      declarator?.kind() !== 'variable_declarator' ||
      declarator.field('name')?.id() !== pattern.id() ||
      pathOf(declarator.field('value')) !== 'utilities'
    ) {
      continue;
    }

    const entries = pattern.children().filter((child) => child.isNamed());

    for (const entry of entries) {
      const keyNode =
        entry.kind() === 'shorthand_property_identifier_pattern'
          ? entry
          : entry.kind() === 'pair_pattern'
            ? entry.field('key')
            : undefined;

      if (!keyNode || staticKeyName(keyNode) !== OLD_NAME) {
        continue;
      }

      const local =
        entry.kind() === 'pair_pattern' ? entry.field('value') : entry;

      run.handled.add(keyNode.range().start.index);

      if (
        !local ||
        (local.kind() !== 'identifier' &&
          local.kind() !== 'shorthand_property_identifier_pattern')
      ) {
        report(
          run,
          'manual',
          `utilities.${OLD_NAME}: moves to ${REGISTRY}`,
          entry
        );
        continue;
      }

      rewritePatternEntry(run, declarator, entries, entry, local);
    }
  }
}

/** Rewrites one entry of the beta registry in a destructuring pattern. */
function rewritePatternEntry(
  run: Run,
  declarator: Node,
  entries: Node[],
  entry: Node,
  local: Node
): void {
  const label = `utilities.${OLD_NAME}`;

  if (!isStableBinding(local)) {
    report(run, 'manual', `${label}: moves to ${REGISTRY}`, entry);

    return;
  }

  const edits = [];

  for (const use of referencesOf(local)) {
    if (run.edits.covers(use)) {
      continue;
    }

    const text = run.imports.ensure(REGISTRY, { at: use });

    if (!text) {
      report(run, 'manual', `${label}: moves to ${REGISTRY}`, entry);

      return;
    }

    edits.push(
      use.kind() === 'shorthand_property_identifier'
        ? use.replace(`${use.text()}: ${text}`)
        : use.replace(text)
    );
  }

  const statement = declarator.parent();
  const alone =
    entries.length === 1 &&
    statement?.kind() === 'lexical_declaration' &&
    statement.children().filter((child) => child.isNamed()).length === 1;
  const removal = alone
    ? removeLine(run.rootNode, statement)
    : removeProperty(entry);

  if (!run.edits.add(removal, ...edits)) {
    report(
      run,
      'manual',
      `${label}: moves to ${REGISTRY}, another rewrite of the line overlaps it`,
      entry
    );

    return;
  }

  noteRewritten(run, `${label} -> ${REGISTRY}`, entry);

  if (alone) {
    dropUnusedImport(run, declarator.field('value'));
  }
}

/**
 * Returns an edit that removes a statement on a line of its own, with its
 * indentation and a blank line after it.
 */
function removeLine(rootNode: Node, statement: Node): Edit {
  const source = rootNode.text();
  const edit = removeStatement(rootNode, statement);
  let start = edit.startPos;

  while (
    start > 0 &&
    (source[start - 1] === ' ' || source[start - 1] === '\t')
  ) {
    start -= 1;
  }

  if (start > 0 && source[start - 1] !== '\n') {
    return edit;
  }

  const blank = /^[ \t]*\n/.exec(source.slice(edit.endPos));

  return {
    startPos: start,
    endPos: edit.endPos + (blank ? blank[0].length : 0),
    insertedText: '',
  };
}

/**
 * Drops the named core import of an expression, such as `utilities`, when
 * every use of it lies inside an edit of the run.
 */
function dropUnusedImport(run: Run, node: Node | null | undefined): void {
  const inner = node ? unwrap(node) : undefined;
  const imported = inner?.kind() === 'identifier' ? importOf(inner) : undefined;

  if (!imported?.name || imported.source !== CORE_PACKAGE) {
    return;
  }

  const local = imported.specifier.field('alias')?.text() ?? imported.name;
  const uses = run.rootNode
    .findAll({ rule: { kind: 'identifier', regex: `^${local}$` } })
    .filter(
      (use) =>
        !use
          .ancestors()
          .some((ancestor) => ancestor.kind() === 'import_statement') &&
        importOf(use)?.specifier.id() === imported.specifier.id()
    );

  if (uses.every((use) => run.edits.covers(use))) {
    run.imports.remove(imported.name, local);
  }
}

/**
 * Rewrites the calls of the beta registry that the tables cannot: `get(type,
 * id)` becomes `get(id)`, and a descriptor that is a string or an array of
 * image ids becomes `{ imageId }` or `{ imageIds }`. Reports a `get` with
 * other arguments, a `get` that is not called (a metadata provider), and an
 * `add` whose descriptor the file does not show as a literal.
 */
function rewriteRegistryCalls(run: Run): void {
  for (const member of run.rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: { field: 'property', regex: '^(get|add)$' },
    },
  })) {
    const call = member.parent();
    const method = member.field('property')?.text();

    if (registryPath(member.field('object')) !== OLD_REGISTRY) {
      if (heldInAWrittenName(member.field('object'))) {
        report(
          run,
          'manual',
          `${OLD_NAME}.${method}: the registry is in a name that the file writes, ${method === 'add' ? DESCRIPTOR_NOT_A_LITERAL : `${REGISTRY}.get takes the display set id only`}`,
          member
        );
      }
      continue;
    }

    if (
      call?.kind() !== 'call_expression' ||
      call.field('function')?.id() !== member.id()
    ) {
      if (method === 'get') {
        report(
          run,
          'manual',
          `${OLD_NAME}.get: the registry is not a metadata provider in 6.0, call ${REGISTRY}.get(displaySetId)`,
          member
        );
      }
      continue;
    }

    if (method === 'get') {
      rewriteGet(run, call, argumentsOf(call));
    } else {
      rewriteAddDescriptor(run, call, argumentsOf(call)[1]);
    }
  }
}

/**
 * Tells whether an expression is a `let`, a `var` or a written parameter
 * whose every value is the beta registry: its accesses move, but the step
 * cannot follow the calls on it.
 */
function heldInAWrittenName(node: Node | null | undefined): boolean {
  const inner = node ? unwrap(node) : undefined;
  const declaration =
    inner?.kind() === 'identifier' ? declarationNodeOf(inner) : undefined;
  const values =
    declaration && !isStableBinding(declaration)
      ? writtenValues(declaration)
      : undefined;

  return Boolean(
    values?.length &&
      values.every((value) => registryPath(value) === OLD_REGISTRY)
  );
}

/** Rewrites `get(type, id)` of the beta registry to `get(id)`. */
function rewriteGet(run: Run, call: Node, args: Node[]): void {
  const [type, id] = args;
  const label = `${OLD_NAME}.get: ${REGISTRY}.get takes the display set id only`;

  if (args.length !== 2 || !isBetaType(type) || !isPure(type)) {
    report(run, 'manual', label, call);

    return;
  }

  const edit = {
    startPos: type.range().start.index,
    endPos: id.range().start.index,
    insertedText: '',
  };

  if (!run.edits.add(edit)) {
    report(
      run,
      'manual',
      `${label}, another rewrite of the line overlaps it`,
      call
    );

    return;
  }

  markHandled(run, type);
  noteRewritten(
    run,
    `${OLD_NAME}.get(type, displaySetId) -> ${REGISTRY}.get(displaySetId)`,
    call
  );
}

/**
 * Tells whether an argument is the type of the beta registry: its key as a
 * string or its `VIEWPORT_V2_DISPLAY_SET` member.
 */
function isBetaType(node: Node | undefined): boolean {
  const inner = node ? unwrap(node) : undefined;

  if (inner?.kind() === 'string') {
    return inner.text().slice(1, -1) === OLD_KEY;
  }

  return (
    inner?.kind() === 'member_expression' &&
    inner.field('property')?.text() === 'VIEWPORT_V2_DISPLAY_SET' &&
    registryPath(inner.field('object')) === OLD_REGISTRY
  );
}

/**
 * Rewrites a descriptor of `add` that is a string or an array of image ids,
 * and reports one that the file does not show as a literal. A literal, or a
 * `const` that holds one, is the work of the key tables.
 */
function rewriteAddDescriptor(
  run: Run,
  call: Node,
  descriptor: Node | undefined
): void {
  const inner = descriptor ? unwrap(descriptor) : undefined;
  const kind = inner?.kind() ?? '';

  if (!inner || isLiteralDescriptor(inner)) {
    return;
  }

  if (kind === 'string' || kind === 'template_string' || kind === 'array') {
    const key = kind === 'array' ? 'imageIds' : 'imageId';

    if (run.edits.add(inner.replace(`{ ${key}: ${inner.text()} }`))) {
      markHandled(run, inner);
      noteRewritten(
        run,
        `${OLD_NAME}.add: ${kind === 'array' ? 'a list of image ids' : 'an image id'} -> { ${key} }`,
        call
      );

      return;
    }
  }

  report(run, 'manual', `${OLD_NAME}.add: ${DESCRIPTOR_NOT_A_LITERAL}`, call);
}

/**
 * Tells whether a descriptor is an object literal, or a `const` that holds
 * one, so that the key tables reach its keys.
 */
function isLiteralDescriptor(node: Node, depth = 0): boolean {
  const inner = unwrap(node);

  if (inner.kind() === 'object') {
    return true;
  }

  if (inner.kind() !== 'identifier' || depth > 1) {
    return false;
  }

  const declaration = declarationNodeOf(inner);
  const holder = declaration?.parent();
  const value =
    declaration &&
    holder?.kind() === 'variable_declarator' &&
    holder.field('name')?.id() === declaration.id() &&
    isStableBinding(declaration)
      ? holder.field('value')
      : undefined;

  return Boolean(value && isLiteralDescriptor(value, depth + 1));
}

/**
 * Reports the uses of the metadata key of the beta registry that are left:
 * its `VIEWPORT_V2_DISPLAY_SET` and the string `'genericViewportDisplaySet'`,
 * as in `metaData.get('genericViewportDisplaySet', id)`. The registry is not
 * a metadata provider in 6.0.
 */
function reportRegistryKey(run: Run): void {
  for (const member of run.rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: { field: 'property', regex: '^VIEWPORT_V2_DISPLAY_SET$' },
    },
  })) {
    const property = member.field('property');

    if (
      !property ||
      run.handled.has(property.range().start.index) ||
      registryPath(member.field('object')) !== OLD_REGISTRY
    ) {
      continue;
    }

    run.handled.add(property.range().start.index);
    report(
      run,
      'manual',
      `${OLD_NAME}.VIEWPORT_V2_DISPLAY_SET: deleted, call ${REGISTRY}.get(displaySetId)`,
      property
    );
  }

  for (const string of run.rootNode.findAll({ rule: { kind: 'string' } })) {
    if (
      string.text().slice(1, -1) !== OLD_KEY ||
      run.handled.has(string.range().start.index)
    ) {
      continue;
    }

    run.handled.add(string.range().start.index);
    report(
      run,
      'manual',
      `'${OLD_KEY}': the metadata key is deleted, call ${REGISTRY}.get(displaySetId)`,
      string
    );
  }
}

/** The stronger of two pieces of evidence. */
function stronger(a: Evidence, b: Evidence): Evidence {
  return a === 'proven' || b === 'proven' ? 'proven' : (a ?? b);
}

/** The evidence of a viewport expression, in the words of this file. */
function viewportOf(node: Node | null | undefined): Evidence {
  const evidence = viewportEvidence(node);

  return evidence === 'core'
    ? 'proven'
    : evidence === 'name'
      ? 'name'
      : undefined;
}

/**
 * Renames `dataId` to `displaySetId` where the file shows that the object
 * is Cornerstone's: a view reference, a render plan layer, the detail of an
 * event that names a display set, an actor entry, a stack input, a
 * projection request or snapshot. A member read, a destructured key and a
 * key of an object literal are renamed; every other `dataId` of an object
 * is reported. Local names are the application's and stay.
 */
function rewriteDataIds(run: Run): void {
  for (const node of run.rootNode.findAll({
    rule: {
      any: [
        {
          kind: 'member_expression',
          has: { field: 'property', regex: '^dataId$' },
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

    if (
      !nameNode ||
      (isBracket && bracketKey(node) !== 'dataId') ||
      run.handled.has(nameNode.range().start.index)
    ) {
      continue;
    }

    renameDataIdSite(run, node, nameNode, objectEvidence(node.field('object')));
  }

  for (const pattern of run.rootNode.findAll({
    rule: { kind: 'object_pattern' },
  })) {
    for (const entry of pattern.children().filter((child) => child.isNamed())) {
      const keyNode =
        entry.kind() === 'shorthand_property_identifier_pattern'
          ? entry
          : entry.kind() === 'pair_pattern'
            ? entry.field('key')
            : entry.kind() === 'object_assignment_pattern'
              ? entry.field('left')
              : undefined;

      if (
        !keyNode ||
        staticKeyName(keyNode) !== 'dataId' ||
        run.handled.has(keyNode.range().start.index)
      ) {
        continue;
      }

      renameDataIdSite(
        run,
        entry,
        keyNode,
        objectEvidence(patternSource(pattern)),
        keyNode.kind() === 'shorthand_property_identifier_pattern'
      );
    }
  }

  for (const object of run.rootNode.findAll({ rule: { kind: 'object' } })) {
    for (const entry of object.children()) {
      const keyNode =
        entry.kind() === 'pair'
          ? entry.field('key')
          : entry.kind() === 'shorthand_property_identifier'
            ? entry
            : undefined;

      if (
        !keyNode ||
        staticKeyName(keyNode) !== 'dataId' ||
        run.handled.has(keyNode.range().start.index)
      ) {
        continue;
      }

      renameDataIdSite(
        run,
        entry,
        keyNode,
        literalEvidence(object),
        entry.kind() === 'shorthand_property_identifier'
      );
    }
  }
}

/**
 * Renames one `dataId` site, or reports it. A shorthand keeps its value:
 * `{ dataId }` becomes `{ displaySetId: dataId }`.
 */
function renameDataIdSite(
  run: Run,
  site: Node,
  keyNode: Node,
  evidence: Evidence,
  shorthand = false
): void {
  run.handled.add(keyNode.range().start.index);

  if (evidence !== 'proven') {
    const name =
      evidence === 'name' ? 'the viewport is known by its name only, ' : '';

    report(run, 'manual', `dataId: ${name}${DATA_ID_UNPROVEN}`, site);

    return;
  }

  const string =
    keyNode.kind() === 'string'
      ? keyNode
      : keyNode.find({ rule: { kind: 'string' } });
  const quote = string?.text()[0] ?? '';
  const edit = shorthand
    ? keyNode.replace(`displaySetId: ${keyNode.text()}`)
    : string
      ? string.replace(`${quote}displaySetId${quote}`)
      : keyNode.replace('displaySetId');

  if (!run.edits.add(edit)) {
    report(
      run,
      'manual',
      `dataId: another rewrite of the line overlaps it, ${DATA_ID_UNPROVEN}`,
      site
    );

    return;
  }

  noteRewritten(run, 'dataId -> displaySetId', site);
}

/**
 * Returns the value that a destructuring pattern takes apart: the value of
 * its declarator, or the pattern itself where it is a parameter.
 */
export function patternSource(pattern: Node): Node {
  const holder = pattern.parent();

  return holder?.kind() === 'variable_declarator' &&
    holder.field('name')?.id() === pattern.id()
    ? (holder.field('value') ?? pattern)
    : pattern;
}

/**
 * Returns what shows that an expression, or a destructuring pattern that is
 * a parameter, is an object of Cornerstone whose `dataId` names a display
 * set.
 */
function objectEvidence(node: Node | null | undefined, depth = 0): Evidence {
  if (!node || depth > 4) {
    return undefined;
  }

  const inner = node.kind() === 'object_pattern' ? node : unwrap(node);
  let evidence: Evidence =
    inner.kind() === 'object_pattern'
      ? undefined
      : receiverEvidence(node, { returnOf: 'getViewReference' });

  for (const type of DATA_ID_TYPES) {
    if (inner.kind() !== 'object_pattern') {
      evidence = stronger(evidence, receiverEvidence(node, { type }));
    }
  }

  evidence = stronger(evidence, renderPlanEntryEvidence(inner, depth));
  evidence = stronger(evidence, detailEvidence(inner, 'detail'));
  evidence = stronger(evidence, projectionSnapshotEvidence(inner));

  if (
    evidence !== 'proven' &&
    inner.kind() === 'member_expression' &&
    inner.field('property')?.text() === 'rendering'
  ) {
    evidence = stronger(
      evidence,
      detailEvidence(unwrap(inner.field('object')), 'rendering')
    );
  }

  if (evidence !== 'proven' && inner.kind() === 'identifier') {
    evidence = stronger(evidence, objectEvidence(constValue(inner), depth + 1));
  }

  return evidence;
}

/**
 * Returns the value of the `const` that an identifier names, or undefined
 * for another binding.
 */
export function constValue(identifier: Node): Node | undefined {
  const declaration = declarationNodeOf(identifier);
  const holder = declaration?.parent();

  return declaration &&
    holder?.kind() === 'variable_declarator' &&
    holder.field('name')?.id() === declaration.id() &&
    isStableBinding(declaration)
    ? (holder.field('value') ?? undefined)
    : undefined;
}

/**
 * Returns what shows that an object literal reaches Cornerstone as a view
 * reference, a stack input, a projection request or a value typed with one
 * of `DATA_ID_TYPES`: a cast, the annotation of a `const`, an argument of a
 * call, an entry of an array argument, or the value of a `const` passed
 * there.
 */
function literalEvidence(object: Node): Evidence {
  let value = object;
  let parent = value.parent();

  while (parent && KEEPING_KINDS.has(parent.kind())) {
    if (
      DATA_ID_TYPES.some(
        (type) => receiverEvidence(parent, { type }) === 'proven'
      )
    ) {
      return 'proven';
    }

    value = parent;
    parent = value.parent();
  }

  if (parent?.kind() === 'array') {
    value = parent;
    parent = value.parent();
  }

  if (parent?.kind() !== 'variable_declarator') {
    return argumentEvidence(value);
  }

  const name = parent.field('name');

  if (!name || name.kind() !== 'identifier') {
    return undefined;
  }

  if (
    DATA_ID_TYPES.some((type) => receiverEvidence(name, { type }) === 'proven')
  ) {
    return 'proven';
  }

  return isStableBinding(name)
    ? referencesOf(name).reduce<Evidence>(
        (found, use) => stronger(found, argumentEvidence(use)),
        undefined
      )
    : undefined;
}

/**
 * Returns what shows that a value, or the array that holds it, is an
 * argument of a Cornerstone call that takes a view reference, a stack input
 * or a projection request there.
 */
function argumentEvidence(node: Node): Evidence {
  let value = node;

  if (value.parent()?.kind() === 'array') {
    value = value.parent();
  }

  const args = value.parent();
  const call = args?.parent();

  if (args?.kind() !== 'arguments' || call?.kind() !== 'call_expression') {
    return undefined;
  }

  const index = argumentsOf(call).findIndex((arg) => arg.id() === value.id());
  const calleePath = pathOf(call.field('function'));

  if (
    (index === 1 &&
      (calleePath === 'viewportProjection.get' ||
        calleePath === 'viewportProjection.getPresentation' ||
        calleePath === 'viewportProjection.getFraming')) ||
    (index === 2 &&
      (calleePath === 'viewportProjection.withPresentation' ||
        calleePath === 'viewportProjection.withFraming'))
  ) {
    return 'proven';
  }

  const parts = methodCall(call);

  return index === 0 && parts && VIEWPORT_METHODS.has(parts.method)
    ? viewportOf(parts.object)
    : undefined;
}

/**
 * Returns what shows that an expression is the render plan of a viewport:
 * `viewport.getRenderPlan()`, a part of it (`filter`, `slice`), or a `const`
 * that holds one.
 */
function renderPlanEvidence(
  node: Node | null | undefined,
  depth = 0
): Evidence {
  if (!node || depth > 4) {
    return undefined;
  }

  const inner = unwrap(node);
  const call = methodCall(inner);

  if (call?.method === 'getRenderPlan') {
    return viewportOf(call.object);
  }

  if (call && LIST_GETTERS.has(call.method)) {
    return renderPlanEvidence(call.object, depth + 1);
  }

  return inner.kind() === 'identifier'
    ? renderPlanEvidence(constValue(inner), depth + 1)
    : undefined;
}

/**
 * Returns what shows that an expression is one layer of a render plan: an
 * index or a `find` of a plan, the variable of a `for...of` over one, or the
 * first parameter of a callback of one (a name or a destructuring pattern).
 */
function renderPlanEntryEvidence(node: Node, depth: number): Evidence {
  if (node.kind() === 'subscript_expression') {
    return renderPlanEvidence(node.field('object'), depth + 1);
  }

  const call = methodCall(node);

  if (call) {
    return ENTRY_GETTERS.has(call.method)
      ? renderPlanEvidence(call.object, depth + 1)
      : undefined;
  }

  const declaration =
    node.kind() === 'object_pattern'
      ? node
      : node.kind() === 'identifier'
        ? declarationNodeOf(node)
        : undefined;

  if (!declaration) {
    return undefined;
  }

  const loop = declaration
    .ancestors()
    .find((ancestor) => ancestor.kind() === 'for_in_statement');
  const left = loop?.field('left');

  if (
    left &&
    left.range().start.index <= declaration.range().start.index &&
    declaration.range().end.index <= left.range().end.index
  ) {
    return renderPlanEvidence(loop.field('right'), depth + 1);
  }

  const callback = callbackOf(declaration);

  return callback && ENTRY_CALLBACKS.has(callback.method)
    ? renderPlanEvidence(callback.object, depth + 1)
    : undefined;
}

/**
 * Returns the method call whose callback takes a declaration as its first
 * parameter, as `plan.map((layer) => ...)`.
 */
function callbackOf(declaration: Node): ReturnType<typeof methodCall> {
  const fn = functionOfFirstParameter(declaration);
  const args = fn?.parent();
  const call = args?.parent();

  if (
    !fn ||
    args?.kind() !== 'arguments' ||
    call?.kind() !== 'call_expression' ||
    argumentsOf(call)[0]?.id() !== fn.id()
  ) {
    return undefined;
  }

  return methodCall(call);
}

/**
 * Returns the function whose first parameter is a declaration: a name, or
 * a destructuring pattern of it.
 */
export function functionOfFirstParameter(declaration: Node): Node | undefined {
  let node = declaration;
  let parent = node.parent();

  if (
    parent?.kind() === 'required_parameter' ||
    parent?.kind() === 'optional_parameter'
  ) {
    node = parent;
    parent = node.parent();
  }

  if (
    parent?.kind() === 'arrow_function' &&
    parent.field('parameter')?.id() === node.id()
  ) {
    return parent;
  }

  if (parent?.kind() !== 'formal_parameters') {
    return undefined;
  }

  const first = parent.children().find((child) => child.isNamed());
  const fn = parent.parent();

  return first?.id() === node.id() && fn && FUNCTION_KINDS.has(fn.kind())
    ? fn
    : undefined;
}

/**
 * Returns what shows that an expression is the detail of an event whose
 * detail names a display set (`where` is `detail`), or the detail whose
 * `rendering` does (`where` is `rendering`): `evt.detail` of the event
 * parameter of a listener of the event, a destructured `detail`, or a
 * `const` that holds one.
 */
function detailEvidence(
  node: Node,
  where: 'detail' | 'rendering',
  depth = 0
): Evidence {
  if (depth > 3) {
    return undefined;
  }

  if (
    node.kind() === 'member_expression' &&
    node.field('property')?.text() === 'detail'
  ) {
    const event = unwrap(node.field('object'));

    return event.kind() === 'identifier'
      ? listenerEvidence(declarationNodeOf(event), where)
      : undefined;
  }

  if (node.kind() !== 'identifier') {
    return undefined;
  }

  const value = constValue(node);

  if (value) {
    return detailEvidence(unwrap(value), where, depth + 1);
  }

  const declaration = declarationNodeOf(node);
  const pattern = declaration?.parent();

  if (
    declaration?.kind() !== 'shorthand_property_identifier_pattern' ||
    declaration.text() !== 'detail' ||
    pattern?.kind() !== 'object_pattern' ||
    !isStableBinding(declaration)
  ) {
    return undefined;
  }

  const source = patternSource(pattern);

  if (source.id() === pattern.id()) {
    return listenerEvidence(pattern, where);
  }

  const event = unwrap(source);

  return event.kind() === 'identifier'
    ? listenerEvidence(declarationNodeOf(event), where)
    : undefined;
}

/**
 * Returns what shows that a declaration is the event parameter of a
 * listener of an event whose detail names a display set at `where`: the
 * function, inline or by its name, is the listener of `addEventListener`
 * of that event of the core.
 */
function listenerEvidence(
  declaration: Node | undefined,
  where: 'detail' | 'rendering'
): Evidence {
  const fn = declaration ? functionOfFirstParameter(declaration) : undefined;

  if (!fn) {
    return undefined;
  }

  const holder = fn.parent();
  const name =
    fn.kind() === 'function_declaration'
      ? fn.field('name')
      : holder?.kind() === 'variable_declarator'
        ? holder.field('name')
        : undefined;
  const listeners = [fn, ...(name ? referencesOf(name) : [])].map(keptValue);

  for (const listener of listeners) {
    const args = listener.parent();
    const call = args?.parent();
    const parts =
      args?.kind() === 'arguments' && call?.kind() === 'call_expression'
        ? methodCall(call)
        : undefined;

    if (
      parts?.method === 'addEventListener' &&
      parts.args[1]?.id() === listener.id() &&
      DETAIL_EVENTS[pathOf(parts.args[0]) ?? ''] === where
    ) {
      return 'proven';
    }
  }

  return undefined;
}

/**
 * Returns what shows that an expression is a projection snapshot:
 * `viewportProjection.get(...)`.
 */
function projectionSnapshotEvidence(node: Node): Evidence {
  return node.kind() === 'call_expression' &&
    pathOf(node.field('function')) === 'viewportProjection.get'
    ? 'proven'
    : undefined;
}

/**
 * The text of a registration with a `volumeId` whose planar mounts the file
 * does not show, word for word in the guide.
 */
const VOLUME_ID_NO_MOUNT =
  "a volumeId no longer makes a planar viewport show a volume: the viewport shows this display set as a stack in its acquisition plane unless its mount asks for mode: 'volume' (setDisplaySets({ displaySetId, options: { mode: 'volume' } }) or addDisplaySet(displaySetId, { mode: 'volume' })); a 3D viewport shows it as before";

/**
 * The text of a mount of such a registration that the step cannot write,
 * with the reason in front.
 */
const VOLUME_ID_MOUNT =
  "write mode: 'volume' in its options to show the volume, a volumeId no longer makes a planar viewport show one";

/** The family of each core viewport type that a mount can name. */
const FAMILY_OF_TYPE: Record<string, ViewportFamily> = {
  PlanarViewport: 'planar',
  IStackViewport: 'planar',
  IVolumeViewport: 'planar',
  IBaseVolumeViewport: 'planar',
  StackViewport: 'planar',
  VolumeViewport: 'planar',
  BaseVolumeViewport: 'planar',
  VolumeViewport3D: '3d',
  VideoViewport: 'video',
  IVideoViewport: 'video',
  WSIViewport: 'wsi',
  IWSIViewport: 'wsi',
  ECGViewport: 'ecg',
  IECGViewport: 'ecg',
};

/**
 * The family of a mount: one viewport family, `mixed` for types of several
 * families (`PlanarViewport | VolumeViewport3D`), or undefined.
 */
type MountFamily = ViewportFamily | 'mixed' | undefined;

/** The family that core type names give together. */
function familyOfTypes(types: string[]): MountFamily {
  const families = new Set(types.map((type) => FAMILY_OF_TYPE[type]));

  if (families.size > 1) {
    return 'mixed';
  }

  return families.size === 1 ? [...families][0] : undefined;
}

/** One mount of a display set in the file: its call, its id and its options. */
interface Mount {
  call: Node;
  receiver: Node;
  id: Node;
  holder: Node;
  options: Node | undefined;
}

/**
 * The text of a registered `initialImageIdIndex` that the step cannot move,
 * word for word in the guide.
 */
const INDEX_NOT_MOVED =
  'initialImageIdIndex is a mount option in 6.0, and a planar viewport refuses a descriptor that has it: remove it from the descriptor and pass it on each planar mount, setDisplaySets({ displaySetId, options: { initialImageIdIndex } }) or addDisplaySet(displaySetId, { initialImageIdIndex })';

/**
 * Writes on the mounts of a registered display set what the registration
 * said and 6.0 reads from the mount. The registration is a literal (or a
 * `const` that holds one) given to `displaySetRegistry.add`, and a mount is
 * an entry of `setDisplaySets` or a call of `addDisplaySet` in the same
 * file with the same id, on a viewport that the file shows to be
 * Cornerstone's and not of another family than planar (`mountBlocker`).
 *
 * - A registration with a `volumeId` and its image ids: `mode: 'volume'` on
 *   each mount, as a `volumeId` made a planar viewport show a volume. A
 *   mount that says `mode` already is left. A registration with no such
 *   mount in the file, and a mount that the step cannot write, are
 *   reported. A registration with a `volumeId` and no image ids shows a
 *   volume without a mode.
 * - A registration with `initialImageIdIndex`: the key moves to the options
 *   of every planar mount of the display set in the file
 *   (`initialIndexMove`); a mount that names it already keeps its own. When
 *   it cannot move to all of them, nothing moves and the registration is
 *   reported as manual.
 *
 * The two go into one edit of each mount, so they do not overlap.
 */
function rewriteRegisteredMounts(run: Run): void {
  const mounts = mountsOf(run);

  for (const member of run.rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: { field: 'property', regex: '^add$' },
    },
  })) {
    const call = member.parent();

    if (
      !registryPath(member.field('object')) ||
      call?.kind() !== 'call_expression' ||
      call.field('function')?.id() !== member.id()
    ) {
      continue;
    }

    const [id, descriptor] = argumentsOf(call);
    const object = descriptor ? literalObjectOf(descriptor) : undefined;

    if (!id || !object) {
      continue;
    }

    const { keys, hasSpread } = objectEntries(object);
    const asVolume =
      keys.includes('volumeId') && (keys.includes('imageIds') || hasSpread);
    const own = mounts.filter((mount) => isSameId(mount.id, id));
    const index = keys.includes('initialImageIdIndex')
      ? initialIndexMove(run, call, descriptor, object, own)
      : undefined;

    if (!asVolume && !index) {
      continue;
    }

    if (asVolume && !own.length) {
      report(
        run,
        'review',
        `displaySetRegistry.add: ${VOLUME_ID_NO_MOUNT}`,
        call
      );
    }

    for (const mount of own) {
      writeMountOptions(run, mount, asVolume, index?.text);
    }

    if (index && run.edits.add(index.removal)) {
      noteRewritten(
        run,
        'displaySetRegistry.add: initialImageIdIndex -> the options of its planar mounts',
        call
      );
    }
  }
}

/**
 * What moves `initialImageIdIndex` of a registration to its mounts: the
 * property to write in their options, and the edit that removes it from the
 * registration. Undefined, with a manual report, when it cannot move to
 * every planar mount of the display set in the file: there is none, the
 * descriptor is a `const` that the file reads elsewhere too, a mount cannot
 * be written, or the value cannot be read where a mount is (`isMovable`).
 */
function initialIndexMove(
  run: Run,
  call: Node,
  descriptor: Node,
  object: Node,
  own: Mount[]
): { text: string; removal: Edit } | undefined {
  const { pairs, shorthand } = objectEntries(object);
  const property =
    pairs.get('initialImageIdIndex') ??
    object
      .children()
      .find(
        (child) =>
          child.kind() === 'shorthand_property_identifier' &&
          child.text() === 'initialImageIdIndex'
      );
  const value = shorthand.has('initialImageIdIndex')
    ? property
    : property?.field('value');
  const planar = own
    .map((mount) => ({ mount, blocker: mountBlocker(run, mount) }))
    .filter(({ blocker }) => blocker !== 'other family');
  const blocked = planar.find(({ blocker }) => blocker);
  const held = unwrap(descriptor);
  const heldDeclaration =
    held.kind() === 'identifier' ? declarationNodeOf(held) : undefined;
  const reason =
    !property || !value
      ? 'the key is not a plain property'
      : !planar.length
        ? 'the file shows no planar mount of this display set'
        : heldDeclaration && referencesOf(heldDeclaration).length !== 1
          ? 'the descriptor is a const that the file reads elsewhere too'
          : blocked
            ? `a mount (${methodName(blocked.mount)}, line ${blocked.mount.call.range().start.line + 1}): ${blocked.blocker}`
            : !planar.every(({ mount }) => isMovable(value, mount.call))
              ? 'its value cannot be read at every mount'
              : undefined;

  if (reason || !property || !value) {
    report(
      run,
      'manual',
      `displaySetRegistry.add: ${reason}, ${INDEX_NOT_MOVED}`,
      call
    );

    return undefined;
  }

  return {
    text: shorthand.has('initialImageIdIndex')
      ? 'initialImageIdIndex'
      : `initialImageIdIndex: ${value.text()}`,
    removal: removePropertyLine(run.rootNode, object, property),
  };
}

/** The names that a moved value may read without a declaration in the file. */
const MOVABLE_GLOBALS = new Set(['Math', 'Number', 'Infinity', 'NaN']);

/** The node kinds that a moved value may be made of. */
const MOVABLE_KINDS = new Set([
  'shorthand_property_identifier',
  'number',
  'string',
  'true',
  'false',
  'null',
  'undefined',
  'identifier',
  'property_identifier',
  'member_expression',
  'subscript_expression',
  'binary_expression',
  'unary_expression',
  'parenthesized_expression',
  'ternary_expression',
  'call_expression',
  'arguments',
]);

/**
 * Tells whether a value read at a registration gives the same value when it
 * is read at a mount: it is made of literals, names, property reads,
 * arithmetic and calls of `Math`, and each name is a global of
 * `MOVABLE_GLOBALS` or a `const`, an import or an unwritten parameter whose
 * scope holds the mount, declared before it.
 */
function isMovable(value: Node, mount: Node): boolean {
  const kind = value.kind();

  if (!MOVABLE_KINDS.has(kind)) {
    return false;
  }

  if (kind === 'call_expression') {
    const callee = value.field('function');

    if (
      callee?.kind() !== 'member_expression' ||
      callee.field('object')?.text() !== 'Math'
    ) {
      return false;
    }
  }

  if (kind === 'identifier' || kind === 'shorthand_property_identifier') {
    const declaration = declarationNodeOf(value);

    if (!declaration) {
      return MOVABLE_GLOBALS.has(value.text());
    }

    const scope = scopeOf(declaration);

    return Boolean(
      isStableBinding(declaration) &&
        declaration.range().start.index < mount.range().start.index &&
        scope &&
        scope.range().start.index <= mount.range().start.index &&
        mount.range().end.index <= scope.range().end.index
    );
  }

  return value
    .children()
    .filter((child) => child.isNamed() && child.kind() !== 'comment')
    .every((child) => isMovable(child, mount));
}

/**
 * The node whose text a declared name is visible in: the block or program
 * of a variable or an import, the function of a parameter.
 */
function scopeOf(declaration: Node): Node | undefined {
  let current = declaration.parent();
  let parameter = false;

  while (current) {
    const kind = current.kind();

    if (kind === 'formal_parameters' || kind.endsWith('_parameter')) {
      parameter = true;
    } else if (FUNCTION_KINDS.has(kind) || kind === 'method_definition') {
      return current;
    } else if (
      !parameter &&
      (kind === 'statement_block' || kind === 'program')
    ) {
      return current;
    }

    current = current.parent();
  }

  return undefined;
}

/**
 * Returns an edit that removes one property of an object literal: its whole
 * line, with its comma, when it stands on a line of its own, else the
 * property with its comma (`removeProperty`). After a `kind`, which the key
 * table removes up to the start of the next property, it is the property
 * with its comma too, so the two edits meet and do not overlap.
 */
function removePropertyLine(
  rootNode: Node,
  object: Node,
  property: Node
): Edit {
  const previous =
    property.prev()?.kind() === ',' ? property.prev()?.prev() : undefined;

  if (
    previous?.kind() === 'pair' &&
    staticKeyName(previous.field('key')) === 'kind'
  ) {
    return removeProperty(property);
  }

  const text = rootNode.text();
  const comma = property.next()?.kind() === ',' ? property.next() : undefined;
  const start = property.range().start.index;
  const end = (comma ?? property).range().end.index;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end);

  if (
    object.text().includes('\n') &&
    text.slice(lineStart, start).trim() === '' &&
    lineEnd !== -1 &&
    text.slice(end, lineEnd).trim() === ''
  ) {
    return { startPos: lineStart, endPos: lineEnd + 1, insertedText: '' };
  }

  return removeProperty(property);
}

/**
 * Why the step cannot write the options of a mount: `other family` for a
 * mount that is not planar (a `renderMode` option, or a viewport of another
 * family: left as it is), or the reason of a report. Undefined when it can.
 */
function mountBlocker(run: Run, mount: Mount): string | undefined {
  const family = mountFamily(mount.receiver);
  const evidence = viewportEvidence(mount.receiver);
  const options = mount.options ? unwrap(mount.options) : undefined;
  const entries =
    options?.kind() === 'object' ? objectEntries(options) : undefined;

  if (
    (family && family !== 'planar' && family !== 'mixed') ||
    entries?.keys.includes('renderMode')
  ) {
    return 'other family';
  }

  if (family === 'mixed') {
    return 'the viewport may be of another family than planar';
  }

  if (
    !family &&
    evidence !== 'core' &&
    !(evidence === 'name' && isUntyped(run, mount.receiver))
  ) {
    return evidence === 'name'
      ? 'the viewport is known by its name only'
      : 'the viewport is not shown';
  }

  if (mount.options && !entries) {
    return 'the options are not a literal that the step can extend';
  }

  return undefined;
}

/**
 * Writes in the options of one mount `mode: 'volume'` (`asVolume`, unless
 * the options say `mode`) and the moved `initialImageIdIndex` (`index`,
 * unless the options say it), in one edit. A mount that cannot be written
 * is reported for the volume mode (the move of the index was refused before,
 * by `initialIndexMove`). In options with a spread the keys go first, so a
 * key of the spread still wins.
 */
function writeMountOptions(
  run: Run,
  mount: Mount,
  asVolume: boolean,
  index: string | undefined
): void {
  const blocker = mountBlocker(run, mount);

  if (blocker === 'other family') {
    return;
  }

  if (blocker) {
    if (asVolume) {
      const planar = blocker.startsWith('the viewport')
        ? 'if it is a planar viewport '
        : '';

      report(
        run,
        'review',
        `${methodName(mount)}: ${blocker}, ${planar}${VOLUME_ID_MOUNT}`,
        mount.call
      );
    }

    return;
  }

  const options = mount.options ? unwrap(mount.options) : undefined;
  const entries =
    options?.kind() === 'object' ? objectEntries(options) : undefined;
  const writesMode = asVolume && !entries?.keys.includes('mode');
  const properties = [
    ...(writesMode ? ["mode: 'volume'"] : []),
    ...(index && !entries?.keys.includes('initialImageIdIndex') ? [index] : []),
  ];

  if (!properties.length) {
    return;
  }

  const edit = options
    ? entries?.hasSpread
      ? prependProperties(run.rootNode, options, properties)
      : appendProperties(run.rootNode, options, properties)
    : mount.holder.kind() === 'object'
      ? appendProperties(run.rootNode, mount.holder, [
          `options: { ${properties.join(', ')} }`,
        ])
      : appendArgument(mount.call, `{ ${properties.join(', ')} }`);

  if (!edit || !run.edits.add(edit)) {
    report(
      run,
      'review',
      `${methodName(mount)}: another rewrite of the line overlaps it, ${writesMode ? VOLUME_ID_MOUNT : INDEX_NOT_MOVED}`,
      mount.call
    );

    return;
  }

  if (writesMode) {
    noteRewritten(
      run,
      `${methodName(mount)}: a registration with a volumeId -> mode: 'volume'`,
      mount.call
    );
  }
}

/**
 * Returns the mounts of the file: each entry of a `setDisplaySets` call that
 * is an object literal with a `displaySetId` (also in an array that the call
 * spreads, `setDisplaySets(...entries)`, where every entry of the array is
 * such a literal), and each `addDisplaySet` call with an id.
 */
function mountsOf(run: Run): Mount[] {
  const mounts: Mount[] = [];

  for (const call of run.rootNode.findAll({
    rule: { kind: 'call_expression' },
  })) {
    const parts = methodCall(call);

    if (parts?.method === 'addDisplaySet' && parts.args[0]) {
      mounts.push({
        call,
        receiver: parts.object,
        id: parts.args[0],
        holder: call,
        options: parts.args[1],
      });
      continue;
    }

    if (parts?.method !== 'setDisplaySets') {
      continue;
    }

    for (const entry of parts.args.flatMap(spreadEntries)) {
      const object = unwrap(entry);

      if (object.kind() !== 'object') {
        continue;
      }

      const { pairs, shorthand } = objectEntries(object);
      const shorthandOf = (key: string) =>
        shorthand.has(key)
          ? object
              .children()
              .find(
                (child) =>
                  child.kind() === 'shorthand_property_identifier' &&
                  child.text() === key
              )
          : undefined;
      const id =
        shorthandOf('displaySetId') ??
        pairs.get('displaySetId')?.field('value');

      if (!id) {
        continue;
      }

      mounts.push({
        call,
        receiver: parts.object,
        id,
        holder: object,
        options:
          shorthandOf('options') ??
          pairs.get('options')?.field('value') ??
          undefined,
      });
    }
  }

  return mounts;
}

/**
 * Returns the entries of an argument of `setDisplaySets`: the argument
 * itself, or for `...entries` the object literals of the `const` array
 * `entries`, its literal entries and those of each `entries.push(...)`,
 * when that array gets nothing else.
 */
function spreadEntries(argument: Node): Node[] {
  if (argument.kind() !== 'spread_element') {
    return [argument];
  }

  const name = argument.children().find((child) => child.isNamed());
  const value = name?.kind() === 'identifier' ? constValue(name) : undefined;
  const declaration = name ? declarationNodeOf(name) : undefined;

  if (!value || !declaration || unwrap(value).kind() !== 'array') {
    return [];
  }

  const entries = unwrap(value)
    .children()
    .filter((child) => child.isNamed() && child.kind() !== 'comment');

  for (const use of referencesOf(declaration)) {
    if (use.id() === name?.id()) {
      continue;
    }

    const member = use.parent();
    const call = member?.parent();
    const parts = call ? methodCall(call) : undefined;

    if (
      member?.kind() !== 'member_expression' ||
      parts?.object.id() !== use.id()
    ) {
      continue;
    }

    if (parts.method !== 'push') {
      return [];
    }

    entries.push(...parts.args);
  }

  return entries.every((entry) => unwrap(entry).kind() === 'object')
    ? entries
    : [];
}

/**
 * Returns the object literal of a descriptor: the literal itself, or the
 * value of a `const` that holds one.
 */
function literalObjectOf(node: Node, depth = 0): Node | undefined {
  const inner = unwrap(node);

  if (inner.kind() === 'object') {
    return inner;
  }

  if (inner.kind() !== 'identifier' || depth > 1) {
    return undefined;
  }

  const value = constValue(inner);

  return value ? literalObjectOf(value, depth + 1) : undefined;
}

/**
 * Tells whether two expressions name the same display set: two strings with
 * the same text, two names of the same binding, or two equal chains of
 * property reads.
 */
function isSameId(a: Node, b: Node): boolean {
  const left = unwrap(a);
  const right = unwrap(b);
  const isName = (node: Node) =>
    node.kind() === 'identifier' ||
    node.kind() === 'shorthand_property_identifier';

  if (isName(left) && isName(right)) {
    if (left.text() !== right.text()) {
      return false;
    }

    const declaration = declarationNodeOf(left);

    return (
      Boolean(declaration) &&
      declaration?.id() === declarationNodeOf(right)?.id()
    );
  }

  if (left.kind() === 'string' && right.kind() === 'string') {
    return left.text().slice(1, -1) === right.text().slice(1, -1);
  }

  return (
    left.kind() === 'member_expression' &&
    right.kind() === 'member_expression' &&
    isRepeatable(left) &&
    left.text() === right.text()
  );
}

/**
 * Returns the family of the viewport of a mount that the file shows by its
 * types, as `viewportFamily` does; by the type argument of a `getViewport`
 * call (`getViewport<PlanarViewport>(id)`); by the declared return type of a
 * function of the file that gives it; or, for a `let`, by the family of
 * every value that the file gives it.
 */
function mountFamily(receiver: Node, depth = 0): MountFamily {
  const family = viewportFamily(receiver);

  if (family || depth > 2) {
    return family;
  }

  const inner = unwrap(receiver);

  if (inner.kind() === 'identifier') {
    const declaration = declarationNodeOf(inner);
    const annotation = declaration
      ?.parent()
      ?.children()
      .find((child) => child.kind() === 'type_annotation');
    const values =
      declaration && !annotation ? writtenValues(declaration) : undefined;
    const families = new Set(
      (values ?? []).map((value) => mountFamily(value, depth + 1))
    );

    if (annotation) {
      return familyOfTypes(topLevelCoreTypes(annotation));
    }

    if (!values?.length) {
      return undefined;
    }

    return families.size === 1 ? [...families][0] : 'mixed';
  }

  if (inner.kind() !== 'call_expression') {
    return undefined;
  }

  const called = inner.field('function');
  const callee =
    called?.kind() === 'await_expression'
      ? called.children().find((child) => child.isNamed())
      : called;
  const typeArgument =
    callee?.kind() === 'member_expression' &&
    callee.field('property')?.text() === 'getViewport'
      ? inner
          .field('type_arguments')
          ?.children()
          .find((child) => child.isNamed())
      : undefined;
  const declaration =
    callee?.kind() === 'identifier' ? declarationNodeOf(callee) : undefined;
  const holder = declaration?.parent();
  const types = typeArgument
    ? topLevelCoreTypes(typeArgument)
    : holder?.kind() === 'function_declaration'
      ? topLevelCoreTypes(holder.field('return_type'))
      : [];

  return familyOfTypes(types);
}

/**
 * Tells whether a receiver has no type that can refuse an option: any
 * receiver in a JavaScript file, and a parameter declared without a type.
 */
function isUntyped(run: Run, receiver: Node): boolean {
  if (/\.(js|jsx|mjs|cjs)$/.test(run.root.filename())) {
    return true;
  }

  const inner = unwrap(receiver);
  const declaration =
    inner.kind() === 'identifier' ? declarationNodeOf(inner) : undefined;
  const parameter = declaration?.parent();

  return Boolean(
    parameter &&
      (parameter.kind() === 'required_parameter' ||
        parameter.kind() === 'optional_parameter') &&
      !parameter.children().some((child) => child.kind() === 'type_annotation')
  );
}

/** The name of the method of a mount. */
function methodName(mount: Mount): string {
  return methodCall(mount.call)?.method ?? 'setDisplaySets';
}

/**
 * Returns an edit that adds properties at the end of an object literal, each
 * on a line of its own when the literal spans lines.
 */
function appendProperties(rootNode: Node, object: Node, texts: string[]): Edit {
  const last = object
    .children()
    .filter((child) => child.isNamed() && child.kind() !== 'comment')
    .pop();

  if (!last) {
    return {
      startPos: object.range().start.index,
      endPos: object.range().end.index,
      insertedText: `{ ${texts.join(', ')} }`,
    };
  }

  const trailing = last.next()?.kind() === ',' ? last.next() : undefined;
  const after = (trailing ?? last).range().end.index;
  const multiline = object.text().includes('\n');

  if (!multiline) {
    return {
      startPos: after,
      endPos: after,
      insertedText: trailing
        ? ` ${texts.join(', ')},`
        : `, ${texts.join(', ')}`,
    };
  }

  const indent = indentOf(rootNode, last);
  const lines = texts.map((text) => `\n${indent}${text},`).join('');

  return {
    startPos: after,
    endPos: after,
    insertedText: trailing ? lines : `,${lines}`,
  };
}

/**
 * Returns an edit that adds properties at the start of an object literal,
 * each on a line of its own when the literal spans lines.
 */
function prependProperties(
  rootNode: Node,
  object: Node,
  texts: string[]
): Edit {
  const first = object
    .children()
    .find((child) => child.isNamed() && child.kind() !== 'comment');
  const start = first?.range().start.index ?? object.range().start.index + 1;
  const multiline = object.text().includes('\n');

  return {
    startPos: start,
    endPos: start,
    insertedText:
      multiline && first
        ? texts.map((text) => `${text},\n${indentOf(rootNode, first)}`).join('')
        : `${texts.join(', ')}, `,
  };
}

/** Returns an edit that adds an argument at the end of a call. */
function appendArgument(call: Node, text: string): Edit | undefined {
  const args = argumentsOf(call);
  const last = args[args.length - 1];

  if (!last) {
    return undefined;
  }

  const trailing = last.next()?.kind() === ',' ? last.next() : undefined;
  const after = (trailing ?? last).range().end.index;

  return {
    startPos: after,
    endPos: after,
    insertedText: trailing ? ` ${text},` : `, ${text}`,
  };
}
