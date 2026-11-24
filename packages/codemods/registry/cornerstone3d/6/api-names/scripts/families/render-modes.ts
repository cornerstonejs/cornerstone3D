import {
  CORE_PACKAGE,
  declarationNodeOf,
  importSource,
  isStableBinding,
  methodCall,
  removeProperty,
  staticKeyName,
  unwrap,
  viewportEvidence,
  viewportFamily,
} from '../lib.ts';
import type { Node } from '../lib.ts';
import type { Edit } from 'codemod:ast-grep';
import {
  importOf,
  noteRewritten,
  pathOf,
  receiverEvidence,
  report,
} from '../rules.ts';
import type { Rules, Run } from '../rules.ts';
import { importsCornerstone } from './display-sets.ts';

/** How to find the layer of an actor entry, word for word in the guide. */
const PLAN_QUERY =
  'read the layer of viewport.getRenderPlan() whose displaySetId is the displaySetId of the actor entry';

/** The test of the render plan layer that stands for each old render mode. */
const MODE_TESTS: Record<string, string> = {
  VTK_IMAGE: "slice 'frame' and draw 'gpu'",
  VTK_VOLUME_SLICE: "slice 'gpuVolume'",
  VTK_SAMPLED_SLICE: "slice 'cpu' and draw 'gpu'",
  CPU_IMAGE: "slice 'frame' and draw 'cpu'",
  CPU_VOLUME: "slice 'cpu' and draw 'cpu'",
};

/** The members of `ActorRenderMode` by their string values. */
const MODE_VALUES: Record<string, string> = {
  vtkImage: 'VTK_IMAGE',
  vtkVolumeSlice: 'VTK_VOLUME_SLICE',
  vtkSampledSlice: 'VTK_SAMPLED_SLICE',
  cpuImage: 'CPU_IMAGE',
  cpuVolume: 'CPU_VOLUME',
  vtkVolume: 'VTK_VOLUME',
};

/** The text of `ActorRenderMode.VTK_VOLUME`, which no viewport of 6.0 mounts. */
const VTK_VOLUME_TEXT =
  "never drawn in 6.0, delete the branch (a 3D viewport that shows a volume gives viewport.getCurrentMode() === 'volume3d')";

/** The text of `ActorRenderMode` and its type, word for word in the guide. */
const ACTOR_RENDER_MODE =
  "removed from the public API: viewport.getRenderPlan() says how each display set is drawn, by slice ('frame' | 'cpu' | 'gpuVolume'), draw ('gpu' | 'cpu') and backend; an actor entry names its layer by displaySetId";

/** The text of `ActorMapperProxy` and `ActorEntry.actorMapper`. */
const ACTOR_MAPPER =
  'removed from the public API: the actor is entry.actor, its mapper entry.actor.getMapper(), and how it is drawn the layer of viewport.getRenderPlan() whose displaySetId is entry.displaySetId';

/** The text of an `actorMapper` of an object that the file does not show. */
const ACTOR_MAPPER_UNPROVEN = `if this is an actor entry of Cornerstone, actorMapper is ${ACTOR_MAPPER}`;

/** The text of `renderMode` of a render plan layer. */
const PLAN_RENDER_MODE =
  "removed from the render plan layer: read its slice ('frame' | 'cpu' | 'gpuVolume'), draw ('gpu' | 'cpu') and backend";

/** The text of a `registerRenderBackend` whose slots the step cannot see. */
const BACKEND_SLOTS =
  'the slots of renderModes are frame, cpu and gpuVolume in 6.0: image is frame, sampledVolume is cpu, and volume is cpu on a backend with surface cpu, gpuVolume on any other';

/** The text of a `renderMode` mount option of a 3D viewport that is not a literal. */
const MOUNT_RENDER_MODE =
  'a 3D viewport has no mount option renderMode in 6.0: the descriptor decides (image ids give a volume, a geometry id a surface), delete it';

/**
 * The values of the `renderMode` mount option of a 3D viewport of
 * 6.0.0-beta.2 that no other option takes.
 */
const THREE_D_MODES = new Set(['vtkVolume3d', 'vtkGeometry3d']);

/** The methods of an array that give one of its entries. */
const ENTRY_GETTERS = new Set(['find', 'findLast', 'at']);

/** The methods of an array that give an array of some of its entries. */
const LIST_GETTERS = new Set(['filter', 'slice', 'concat', 'reverse', 'sort']);

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

/** The kinds of the function nodes of the syntax tree. */
const FUNCTION_KINDS = new Set([
  'arrow_function',
  'function_expression',
  'function_declaration',
  'function',
]);

/** The operators of a comparison. */
const COMPARISONS = new Set(['===', '!==', '==', '!=']);

/**
 * What shows that an object is Cornerstone's: proven, a viewport known by
 * its name alone, or nothing.
 */
type Evidence = 'proven' | 'name' | undefined;

/**
 * Render modes: `ActorRenderMode`, `ActorMapperProxy` and
 * `ActorEntry.actorMapper` leave the public API, `renderMode` of a render plan
 * layer gives way to `backend`, the slots of `registerRenderBackend` are
 * `frame`, `cpu` and `gpuVolume`, and a 3D viewport has no `renderMode` mount
 * option (lane RM1).
 */
export const rules: Rules = {
  exports: [
    { namespace: 'Types', name: 'ActorMapperProxy', manual: ACTOR_MAPPER },
    { namespace: 'Types', name: 'ActorRenderMode', manual: ACTOR_RENDER_MODE },
  ],
  members: [],
  keys: [],
};

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
 * Returns the value of the `const` that an identifier names, or undefined
 * for another binding.
 */
function constValue(identifier: Node): Node | undefined {
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
 * Returns the method call whose callback takes a declaration as its first
 * parameter, as `viewport.getActors().map((entry) => ...)`.
 */
function callbackCall(declaration: Node): ReturnType<typeof methodCall> {
  let node = declaration;
  let parent = node.parent();

  if (
    parent?.kind() === 'required_parameter' ||
    parent?.kind() === 'optional_parameter'
  ) {
    node = parent;
    parent = node.parent();
  }

  let fn: Node | undefined;

  if (
    parent?.kind() === 'arrow_function' &&
    parent.field('parameter')?.id() === node.id()
  ) {
    fn = parent;
  } else if (parent?.kind() === 'formal_parameters') {
    const first = parent.children().find((child) => child.isNamed());
    const holder = parent.parent();

    fn =
      first?.id() === node.id() && holder && FUNCTION_KINDS.has(holder.kind())
        ? holder
        : undefined;
  }

  const args = fn?.parent();
  const call = args?.parent();

  if (
    !fn ||
    args?.kind() !== 'arguments' ||
    call?.kind() !== 'call_expression'
  ) {
    return undefined;
  }

  const parts = methodCall(call);

  return parts?.args[0]?.id() === fn.id() ? parts : undefined;
}

/**
 * Returns what shows that an expression is the list that a method of a
 * viewport gives (`getActors`, `getRenderPlan`), a part of it, or a `const`
 * that holds one.
 */
function listEvidence(
  node: Node | null | undefined,
  method: string,
  depth = 0
): Evidence {
  if (!node || depth > 4) {
    return undefined;
  }

  const inner = unwrap(node);
  const call = methodCall(inner);

  if (call?.method === method) {
    return (
      viewportOf(call.object) ??
      (method === 'getRenderPlan' ? 'name' : undefined)
    );
  }

  if (call && LIST_GETTERS.has(call.method)) {
    return listEvidence(call.object, method, depth + 1);
  }

  return inner.kind() === 'identifier'
    ? listEvidence(constValue(inner), method, depth + 1)
    : undefined;
}

/**
 * Returns what shows that an expression, or a destructuring pattern that is
 * a parameter, is one entry of the list of a viewport method: an index or a
 * `find` of the list, the variable of a `for...of` over it, the first
 * parameter of a callback of it, or a `const` that holds one.
 */
function entryEvidence(
  node: Node | null | undefined,
  method: string,
  depth = 0
): Evidence {
  if (!node || depth > 4) {
    return undefined;
  }

  const inner = node.kind() === 'object_pattern' ? node : unwrap(node);

  if (inner.kind() === 'subscript_expression') {
    return listEvidence(inner.field('object'), method, depth + 1);
  }

  const call = methodCall(inner);

  if (call) {
    return ENTRY_GETTERS.has(call.method)
      ? listEvidence(call.object, method, depth + 1)
      : undefined;
  }

  if (inner.kind() === 'identifier') {
    const value = constValue(inner);

    if (value) {
      return entryEvidence(value, method, depth + 1);
    }
  }

  const declaration =
    inner.kind() === 'object_pattern'
      ? inner
      : inner.kind() === 'identifier'
        ? declarationNodeOf(inner)
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
    return listEvidence(loop.field('right'), method, depth + 1);
  }

  const callback = callbackCall(declaration);

  return callback && ENTRY_CALLBACKS.has(callback.method)
    ? listEvidence(callback.object, method, depth + 1)
    : undefined;
}

/**
 * Returns what shows that an expression is an actor entry of a viewport: a
 * value typed `ActorEntry`, the result of `getDefaultActor()` or
 * `getActor()`, or an entry of `getActors()`.
 */
function actorEntryEvidence(node: Node | null | undefined): Evidence {
  if (!node) {
    return undefined;
  }

  let evidence = receiverEvidence(node, { type: 'ActorEntry' });

  evidence = stronger(
    evidence,
    receiverEvidence(node, { returnOf: 'getDefaultActor' })
  );
  evidence = stronger(
    evidence,
    receiverEvidence(node, { returnOf: 'getActor' })
  );

  return stronger(evidence, entryEvidence(node, 'getActors'));
}

/**
 * Returns what shows that an expression is a layer of a render plan: a value
 * typed `RenderPlanLayer`, an entry of `getRenderPlan()`, or the `previous`
 * or the `current` of the detail of an event in a file that listens to
 * `RENDER_PLAN_CHANGED`.
 */
function planLayerEvidence(run: Run, node: Node | null | undefined): Evidence {
  if (!node) {
    return undefined;
  }

  const evidence = stronger(
    receiverEvidence(node, { type: 'RenderPlanLayer' }),
    entryEvidence(node, 'getRenderPlan')
  );

  if (evidence === 'proven') {
    return evidence;
  }

  const inner = unwrap(node);
  const property = inner.field('property')?.text();
  const object = inner.field('object');

  if (
    inner.kind() === 'member_expression' &&
    (property === 'current' || property === 'previous') &&
    object &&
    /(^|\.)detail$/.test(unwrap(object).text()) &&
    listensToRenderPlan(run)
  ) {
    return 'proven';
  }

  return evidence;
}

/** Tells whether the file names `Events.RENDER_PLAN_CHANGED` of the core. */
function listensToRenderPlan(run: Run): boolean {
  return run.rootNode
    .findAll({
      rule: {
        kind: 'member_expression',
        has: { field: 'property', regex: '^RENDER_PLAN_CHANGED$' },
      },
    })
    .some((node) => pathOf(node) === 'Enums.Events.RENDER_PLAN_CHANGED');
}

/**
 * Returns the member of `ActorRenderMode` that an expression names, by an
 * access (`ActorRenderMode.VTK_IMAGE`, `Types.ActorRenderMode.VTK_IMAGE`) or
 * by its string value, or undefined.
 */
function modeMemberOf(node: Node | null | undefined): string | undefined {
  if (!node) {
    return undefined;
  }

  const inner = unwrap(node);

  if (inner.kind() === 'string') {
    return MODE_VALUES[inner.text().slice(1, -1)];
  }

  const match = /^(?:Types\.)?ActorRenderMode\.(\w+)$/.exec(
    pathOf(inner) ?? ''
  );

  return match?.[1];
}

/** The text of a member of `ActorRenderMode`. */
function modeText(member: string): string {
  return member === 'VTK_VOLUME'
    ? VTK_VOLUME_TEXT
    : MODE_TESTS[member]
      ? `removed from the public API: ${PLAN_QUERY} and test ${MODE_TESTS[member]}`
      : ACTOR_RENDER_MODE;
}

/**
 * Marks the access of a member of `ActorRenderMode` handled, with the name
 * of the enum in it, so that the other passes leave it.
 */
function markModeAccess(run: Run, node: Node): void {
  run.handled.add(node.range().start.index);
  node
    .findAll({
      rule: { any: [{ kind: 'property_identifier' }, { kind: 'identifier' }] },
    })
    .forEach((part) => run.handled.add(part.range().start.index));
}

/**
 * Reports a read of a render mode: once at the comparison that holds it when
 * the other operand names a mode, with the test of the render plan for that
 * mode; otherwise at the read, with `text`.
 */
function reportModeRead(run: Run, label: string, read: Node, text: string) {
  const parent = read.parent();
  const operator = parent
    ?.children()
    .find((child) => COMPARISONS.has(child.text()));

  if (parent?.kind() === 'binary_expression' && operator) {
    const left = parent.field('left');
    const right = parent.field('right');
    const other = left?.id() === read.id() ? right : left;
    const member = modeMemberOf(other);

    if (other && member) {
      markModeAccess(run, other);
      run.handled.add(parent.range().start.index);
      report(
        run,
        'manual',
        `${label} ${operator.text()} ${other.text()}: ${modeText(member)}`,
        parent
      );

      return;
    }
  }

  report(run, 'manual', `${label}: ${text}`, read);
}

/**
 * Returns an edit that removes one property of an object literal: its whole
 * line when it stands alone on it, else the property with its comma.
 */
function removePropertyEdit(property: Node): Edit {
  const text = property.getRoot().root().text();
  const start = property.range().start.index;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const comma = property.next()?.kind() === ',' ? property.next() : undefined;
  const end = comma ? comma.range().end.index : property.range().end.index;
  const lineEnd = text.indexOf('\n', end);

  if (
    /^[ \t]*$/.test(text.slice(lineStart, start)) &&
    lineEnd !== -1 &&
    /^[ \t]*$/.test(text.slice(end, lineEnd))
  ) {
    return { startPos: lineStart, endPos: lineEnd + 1, insertedText: '' };
  }

  return removeProperty(property);
}

/**
 * Rewrites `entry.actorMapper.mapper` to `entry.actor.getMapper()` and
 * `entry.actorMapper.actor` to `entry.actor` where the file shows that the
 * entry is an actor entry of a viewport, and reports every other
 * `actorMapper`: its `renderMode`, the proxy itself, and the `actorMapper` of
 * an object that the file does not show, in a file that imports Cornerstone.
 */
function rewriteActorMappers(run: Run): void {
  for (const node of run.rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: { field: 'property', regex: '^actorMapper$' },
    },
  })) {
    const property = node.field('property');
    const entry = node.field('object');

    if (!property || !entry || run.handled.has(property.range().start.index)) {
      continue;
    }

    run.handled.add(property.range().start.index);

    const evidence = actorEntryEvidence(entry);
    const parent = node.parent();
    const member =
      parent?.kind() === 'member_expression' &&
      parent.field('object')?.id() === node.id()
        ? parent.field('property')?.text()
        : undefined;

    if (evidence !== 'proven') {
      report(run, 'manual', `actorMapper: ${ACTOR_MAPPER_UNPROVEN}`, node);

      continue;
    }

    if (member === 'renderMode') {
      reportModeRead(
        run,
        'actorMapper.renderMode',
        parent,
        `removed: ${PLAN_QUERY}, its slice, draw and backend`
      );

      continue;
    }

    if (member !== 'mapper' && member !== 'actor') {
      report(run, 'manual', `actorMapper: ${ACTOR_MAPPER}`, node);

      continue;
    }

    const optional = node
      .children()
      .some(
        (child) => child.kind() === 'optional_chain' || child.text() === '?.'
      );
    const actor = `${entry.text()}${optional ? '?.' : '.'}actor`;
    const text = member === 'mapper' ? `${actor}.getMapper()` : actor;

    if (!run.edits.add(parent.replace(text))) {
      report(
        run,
        'manual',
        `actorMapper.${member}: another rewrite of the line overlaps it, ${ACTOR_MAPPER}`,
        parent
      );

      continue;
    }

    noteRewritten(
      run,
      `actorMapper.${member} -> ${member === 'mapper' ? 'actor.getMapper()' : 'actor'}`,
      parent
    );
  }

  for (const pattern of run.rootNode.findAll({
    rule: { kind: 'object_pattern' },
  })) {
    for (const entry of pattern.children()) {
      const keyNode =
        entry.kind() === 'shorthand_property_identifier_pattern'
          ? entry
          : entry.kind() === 'pair_pattern'
            ? entry.field('key')
            : undefined;

      if (
        keyNode &&
        staticKeyName(keyNode) === 'actorMapper' &&
        !run.handled.has(keyNode.range().start.index)
      ) {
        run.handled.add(keyNode.range().start.index);
        report(run, 'manual', `actorMapper: ${ACTOR_MAPPER_UNPROVEN}`, entry);
      }
    }
  }
}

/**
 * Reports `renderMode` of a layer of a render plan: a member read and a
 * destructured key. A comparison with a mode is one report, with the test of
 * the render plan for that mode. `getRenderPlan()` names a viewport of
 * Cornerstone by itself in a file that imports Cornerstone, so a layer of
 * the plan of any receiver is reported.
 */
function reportPlanRenderModes(run: Run): void {
  for (const node of run.rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: { field: 'property', regex: '^renderMode$' },
    },
  })) {
    const property = node.field('property');

    if (
      !property ||
      run.handled.has(property.range().start.index) ||
      !planLayerEvidence(run, node.field('object'))
    ) {
      continue;
    }

    run.handled.add(property.range().start.index);
    reportModeRead(run, 'renderMode', node, PLAN_RENDER_MODE);
  }

  for (const pattern of run.rootNode.findAll({
    rule: { kind: 'object_pattern' },
  })) {
    const holder = pattern.parent();
    const source =
      holder?.kind() === 'variable_declarator' &&
      holder.field('name')?.id() === pattern.id()
        ? holder.field('value')
        : pattern;

    if (!planLayerEvidence(run, source)) {
      continue;
    }

    for (const entry of pattern.children()) {
      const keyNode =
        entry.kind() === 'shorthand_property_identifier_pattern'
          ? entry
          : entry.kind() === 'pair_pattern'
            ? entry.field('key')
            : undefined;

      if (
        keyNode &&
        staticKeyName(keyNode) === 'renderMode' &&
        !run.handled.has(keyNode.range().start.index)
      ) {
        run.handled.add(keyNode.range().start.index);
        report(run, 'manual', `renderMode: ${PLAN_RENDER_MODE}`, entry);
      }
    }
  }
}

/**
 * Reports each use of `ActorRenderMode`: a member with the test of the render
 * plan that stands for it, the enum itself or its type with the render plan.
 * `Types.ActorRenderMode` alone is left to the table.
 */
function reportActorRenderModes(run: Run): void {
  for (const node of run.rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: { field: 'property', regex: '^[A-Z_]+$' },
    },
  })) {
    const property = node.field('property');
    const member = modeMemberOf(node);

    if (
      !property ||
      !member ||
      node.kind() !== 'member_expression' ||
      run.handled.has(property.range().start.index)
    ) {
      continue;
    }

    markModeAccess(run, node);
    report(
      run,
      'manual',
      `ActorRenderMode.${member}: ${modeText(member)}`,
      node
    );
  }

  for (const node of run.rootNode.findAll({
    rule: { kind: 'nested_type_identifier', regex: 'ActorRenderMode' },
  })) {
    const parts = node.text().split('.');
    const root = node.find({ rule: { kind: 'identifier' } });
    const imported = root ? importOf(root) : undefined;
    const path =
      imported?.source !== CORE_PACKAGE
        ? undefined
        : imported.name === undefined
          ? parts.slice(1).join('.')
          : [imported.name, ...parts.slice(1)].join('.');
    const match = /^(?:Types\.)?ActorRenderMode\.(\w+)$/.exec(path ?? '');

    if (match && !run.handled.has(node.range().start.index)) {
      markModeAccess(run, node);
      report(
        run,
        'manual',
        `ActorRenderMode.${match[1]}: ${modeText(match[1])}`,
        node
      );
    }
  }

  for (const node of run.rootNode.findAll({
    rule: {
      any: [{ kind: 'identifier' }, { kind: 'type_identifier' }],
      regex: '^ActorRenderMode$',
    },
  })) {
    if (
      run.handled.has(node.range().start.index) ||
      node
        .ancestors()
        .some((ancestor) => ancestor.kind() === 'import_statement')
    ) {
      continue;
    }

    const imported = importOf(node);

    if (
      imported?.source !== CORE_PACKAGE ||
      imported.name !== 'ActorRenderMode'
    ) {
      continue;
    }

    run.handled.add(node.range().start.index);
    report(run, 'manual', `ActorRenderMode: ${ACTOR_RENDER_MODE}`, node);
  }

  for (const specifier of run.rootNode.findAll({
    rule: { kind: 'import_specifier', regex: '^ActorRenderMode\\b' },
  })) {
    const local = specifier.field('alias') ?? specifier.field('name');
    const statement = specifier
      .ancestors()
      .find((ancestor) => ancestor.kind() === 'import_statement');
    const used = run.rootNode
      .findAll({
        rule: {
          any: [{ kind: 'identifier' }, { kind: 'type_identifier' }],
          regex: `^${local?.text() ?? 'ActorRenderMode'}$`,
        },
      })
      .some(
        (node) =>
          !node
            .ancestors()
            .some((ancestor) => ancestor.kind() === 'import_statement') &&
          importOf(node)?.specifier.id() === specifier.id()
      );

    if (!used && statement && importSource(statement) === CORE_PACKAGE) {
      report(run, 'manual', `ActorRenderMode: ${ACTOR_RENDER_MODE}`, specifier);
    }
  }
}

/**
 * Renames the slots of the literal that `registerRenderBackend` takes:
 * `image` is `frame`, `sampledVolume` is `cpu`, and `volume` is `cpu` on a
 * backend whose `surface` is `'cpu'`, `gpuVolume` on any other. A definition
 * or a `renderModes` that is not a literal is reported.
 */
function rewriteBackendSlots(run: Run): void {
  for (const call of run.rootNode.findAll({
    rule: { kind: 'call_expression' },
  })) {
    if (pathOf(call.field('function')) !== 'registerRenderBackend') {
      continue;
    }

    const definition = call
      .field('arguments')
      ?.children()
      .find((child) => child.isNamed());
    const literal = definition ? unwrap(definition) : undefined;

    if (literal?.kind() !== 'object') {
      report(run, 'manual', `registerRenderBackend: ${BACKEND_SLOTS}`, call);

      continue;
    }

    const pairs = literal.children().filter((child) => child.kind() === 'pair');
    const modesPair = pairs.find(
      (pair) => staticKeyName(pair.field('key')) === 'renderModes'
    );
    const surfacePair = pairs.find(
      (pair) => staticKeyName(pair.field('key')) === 'surface'
    );
    const modes = modesPair?.field('value');
    const surfaceValue = surfacePair?.field('value');
    const surface = !surfacePair
      ? 'vtk'
      : surfaceValue?.kind() === 'string'
        ? surfaceValue.text().slice(1, -1)
        : undefined;

    if (!modesPair) {
      continue;
    }

    if (!modes || unwrap(modes).kind() !== 'object') {
      report(
        run,
        'manual',
        `registerRenderBackend: renderModes is not a literal, ${BACKEND_SLOTS}`,
        modesPair
      );

      continue;
    }

    const slots = unwrap(modes)
      .children()
      .filter(
        (child) =>
          child.kind() === 'pair' ||
          child.kind() === 'shorthand_property_identifier'
      );
    const names = slots.map((slot) =>
      staticKeyName(slot.kind() === 'pair' ? slot.field('key') : slot)
    );
    const targets = names.map((name) =>
      name === 'image'
        ? 'frame'
        : name === 'sampledVolume'
          ? 'cpu'
          : name === 'volume'
            ? surface === undefined
              ? undefined
              : surface === 'cpu'
                ? 'cpu'
                : 'gpuVolume'
            : name
    );
    const clashes = (index: number) =>
      targets.filter((target) => target && target === targets[index]).length >
      1;

    slots.forEach((slot, index) => {
      const name = names[index];
      const target = targets[index];

      if (name !== 'image' && name !== 'volume' && name !== 'sampledVolume') {
        return;
      }

      if (!target || clashes(index) || slot.kind() !== 'pair') {
        report(
          run,
          'manual',
          `registerRenderBackend: the slot ${name}, ${BACKEND_SLOTS}`,
          slot
        );

        return;
      }

      const key = slot.field('key');

      if (key && run.edits.add(key.replace(target))) {
        noteRewritten(
          run,
          `registerRenderBackend: renderModes.${name} -> ${target}`,
          slot
        );
      } else {
        report(
          run,
          'manual',
          `registerRenderBackend: the slot ${name}, another rewrite of the line overlaps it, ${BACKEND_SLOTS}`,
          slot
        );
      }
    });
  }
}

/**
 * Removes `renderMode` from a literal mount option of a 3D viewport, where
 * its value is a literal mode of the 3D viewport of 6.0.0-beta.2: the second
 * argument of `addDisplaySet` and the `options` of an entry of
 * `setDisplaySets`. `'vtkVolume3d'` and `'vtkGeometry3d'` name the 3D
 * viewport by themselves, also in a file that imports no package of
 * Cornerstone, such as a fragment of a page; `'auto'` is removed on a
 * viewport that the file types as a 3D viewport. An option that holds nothing else goes with it. A
 * value that is not a literal on such a viewport is reported.
 */
function removeMountRenderModes(run: Run): void {
  const removeFrom = (
    options: Node,
    holder: Node,
    onViewport: boolean,
    threeD: boolean
  ) => {
    const pairs = options.children().filter((child) => child.isNamed());
    const pair = pairs.find(
      (child) =>
        child.kind() === 'pair' &&
        staticKeyName(child.field('key')) === 'renderMode'
    );
    const value = pair?.field('value');

    if (!pair || run.handled.has(pair.range().start.index)) {
      return;
    }

    run.handled.add(pair.range().start.index);

    if (value?.kind() !== 'string') {
      if (threeD) {
        report(run, 'manual', `renderMode: ${MOUNT_RENDER_MODE}`, pair);
      }

      return;
    }

    const mode = value.text().slice(1, -1);

    if (
      !THREE_D_MODES.has(mode) &&
      !(mode === 'auto' && onViewport && threeD)
    ) {
      return;
    }

    const edit = removePropertyEdit(pairs.length === 1 ? holder : pair);

    if (run.edits.add(edit)) {
      noteRewritten(run, `renderMode: ${value.text()} -> (removed)`, pair);
    } else {
      report(
        run,
        'manual',
        `renderMode: another rewrite of the line overlaps it, ${MOUNT_RENDER_MODE}`,
        pair
      );
    }
  };

  for (const call of run.rootNode.findAll({
    rule: { kind: 'call_expression' },
  })) {
    const parts = methodCall(call);

    if (
      !parts ||
      (parts.method !== 'addDisplaySet' && parts.method !== 'setDisplaySets')
    ) {
      continue;
    }

    const onViewport = Boolean(viewportOf(parts.object));
    const threeD = viewportFamily(parts.object) === '3d';

    if (parts.method === 'addDisplaySet') {
      const options = parts.args[1] ? unwrap(parts.args[1]) : undefined;

      if (options?.kind() === 'object') {
        removeFrom(options, parts.args[1], onViewport, threeD);
      }

      continue;
    }

    for (const entry of parts.args.map(unwrap)) {
      if (entry.kind() !== 'object') {
        continue;
      }

      const optionsPair = entry
        .children()
        .find(
          (child) =>
            child.kind() === 'pair' &&
            staticKeyName(child.field('key')) === 'options'
        );
      const options = optionsPair?.field('value');

      if (optionsPair && options && unwrap(options).kind() === 'object') {
        removeFrom(unwrap(options), optionsPair, onViewport, threeD);
      }
    }
  }
}

/**
 * Reports a `renderMode` whose value is a mode of the 3D viewport of
 * 6.0.0-beta.2 in an object literal that is not the literal option of a
 * mount, such as the options of a `setDisplaySets` entry that the
 * application builds apart: it reaches a mount the step cannot see.
 */
function reportOtherMountRenderModes(run: Run): void {
  for (const pair of run.rootNode.findAll({ rule: { kind: 'pair' } })) {
    const value = pair.field('value');

    if (
      run.handled.has(pair.range().start.index) ||
      staticKeyName(pair.field('key')) !== 'renderMode' ||
      value?.kind() !== 'string' ||
      !THREE_D_MODES.has(value.text().slice(1, -1))
    ) {
      continue;
    }

    run.handled.add(pair.range().start.index);
    report(
      run,
      'manual',
      `renderMode: if this object is the option of a mount of a 3D viewport, ${MOUNT_RENDER_MODE}`,
      pair
    );
  }
}

/**
 * The rewrites of this family that no table entry says. They run before the
 * tables of every family; a site they rewrite or report is marked handled
 * (`run.handled`), and the tables leave it.
 */
export function rewrite(run: Run): void {
  removeMountRenderModes(run);

  if (!importsCornerstone(run)) {
    return;
  }

  reportOtherMountRenderModes(run);
  rewriteActorMappers(run);
  reportPlanRenderModes(run);
  reportActorRenderModes(run);
  rewriteBackendSlots(run);
}
