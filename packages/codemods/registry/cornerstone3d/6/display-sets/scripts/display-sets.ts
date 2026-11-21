import type { Codemod, SgRoot } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';
import { useMetricAtom } from 'codemod:metrics';
import {
  CoreImports,
  EditSet,
  HeldMetric,
  analysed,
  asPrimary,
  bindsAt,
  bracketKey,
  coreImportOf,
  coreReExports,
  coreSpecifiers,
  isCoreExport,
  isCoreNamespace,
  isOptionalCall,
  isPlainValue,
  isRepeatable,
  methodCall,
  objectEntries,
  referencesOf,
  replaceStatement,
  site,
  stableBinding,
  statementOfCall,
  statementsBefore,
  unwrap,
  viewportEvidence,
} from './lib.ts';
import type { Node } from './lib.ts';

/** Sites that the reader changes. */
const manual = new HeldMetric(useMetricAtom('cornerstone3d-6-manual'));

/** The data members of the legacy viewports that the transform reports. */
const REPORTED_MEMBERS = new Set([
  'addVolumes',
  'setWSI',
  'setDataIds',
  'setDataList',
  'removeVolumeActors',
]);

/** The data functions of the core that the transform reports. */
const REPORTED_FUNCTIONS = new Set([
  'addVolumesToViewports',
  'convertStackToVolumeViewport',
  'convertVolumeToStackViewport',
]);

/**
 * The nodes between a call and its statement through which the call runs
 * whenever the statement runs.
 */
const UNCONDITIONAL_KINDS = new Set([
  'expression_statement',
  'lexical_declaration',
  'variable_declaration',
  'variable_declarator',
  'await_expression',
  'parenthesized_expression',
  'as_expression',
  'non_null_expression',
  'arguments',
  'array',
  'call_expression',
  'member_expression',
]);

/**
 * The statements that run every part of their expression whenever they run:
 * an expression statement and a declaration, never a loop, an `if` or a
 * `return`.
 */
const PLAIN_STATEMENTS = new Set([
  'expression_statement',
  'lexical_declaration',
  'variable_declaration',
]);

/** The members whose presence a legacy check tests with `in`. */
const PRESENCE_CHECKS = new Set([
  'setStack',
  'setVolumes',
  'setVideo',
  'setWSI',
  'setEcg',
]);

/**
 * The state of one run of the transform on a file.
 */
interface Run {
  root: SgRoot<TSX>;
  rootNode: Node;
  imports: CoreImports;
  edits: EditSet;
}

/**
 * Returns the arguments of a call, without comments.
 */
function argumentsOf(call: Node): Node[] {
  return call
    .field('arguments')
    .children()
    .filter((child) => child.isNamed() && child.kind() !== 'comment');
}

/**
 * Returns what identifies the value of a volume id at a node: the text of a
 * string, or the declaration of a name whose binding holds one value. Two
 * volume ids with one key have one value. Returns undefined for any other
 * expression.
 */
function volumeIdKey(node: Node): string | undefined {
  if (node.kind() === 'string') {
    return `string:${node.text().slice(1, -1)}`;
  }

  const binding =
    node.kind() === 'identifier' ||
    node.kind() === 'shorthand_property_identifier'
      ? stableBinding(node)
      : undefined;

  return binding ? `binding:${binding.range().start.index}` : undefined;
}

/**
 * Returns the volume id of a volume input list `[{ volumeId }]` with exactly
 * one input that holds only its volume id, or the reason why not.
 */
function singleVolumeId(list: Node | undefined): {
  volumeId?: Node;
  reason?: string;
} {
  if (list?.kind() !== 'array') {
    return { reason: 'the inputs are not an array literal' };
  }

  const inputs = list
    .children()
    .filter((child) => child.isNamed() && child.kind() !== 'comment');

  if (inputs.length !== 1 || inputs[0].kind() !== 'object') {
    return { reason: 'more than one input' };
  }

  const { pairs, shorthand, hasSpread, keys } = objectEntries(inputs[0]);

  if (hasSpread || keys.length !== 1 || !keys.includes('volumeId')) {
    const other = keys.find((key) => key !== 'volumeId') ?? 'a spread';

    return { reason: `the input has ${other}` };
  }

  const volumeId = shorthand.has('volumeId')
    ? inputs[0]
        .children()
        .find((child) => child.kind() === 'shorthand_property_identifier')
    : pairs.get('volumeId').field('value');

  return volumeIdKey(volumeId)
    ? { volumeId }
    : { reason: 'the volume id is not a const name or a string' };
}

/**
 * Tells whether a call of `createAndCacheVolume` comes from the core.
 */
function isCoreVolumeCreation(call: Node): boolean {
  const callee = call.field('function');

  if (callee?.kind() === 'identifier') {
    return coreImportOf(callee)?.name === 'createAndCacheVolume';
  }

  return Boolean(
    callee?.kind() === 'member_expression' &&
      callee.field('property')?.text() === 'createAndCacheVolume' &&
      isCoreExport(callee.field('object'), 'volumeLoader')
  );
}

/**
 * Tells whether an object literal has a key computed in brackets, such as
 * `['imageIds']` or `[key]`: it can name a key that another entry names, and
 * the later entry wins.
 */
function hasComputedKey(objectNode: Node): boolean {
  return objectNode
    .children()
    .some(
      (child) =>
        child.kind() === 'pair' &&
        child.field('key')?.kind() === 'computed_property_name'
    );
}

/**
 * Returns the image ids expression of the volume that the function of the
 * target creates with `createAndCacheVolume(volumeId, { imageIds })` on
 * every path to the target, or undefined. The volume id of the creation has
 * the value of the volume id at the target (one string, or one binding that
 * holds one value), and the image ids are a name whose binding holds one
 * value and is seen at the target. Options with a computed key, or with
 * `imageIds` twice, give no image ids: the loader takes the last entry.
 */
function imageIdsOfVolume(
  run: Run,
  volumeId: Node,
  target: Node
): string | undefined {
  const key = volumeIdKey(volumeId);
  const found = new Set<string>();
  const creations = statementsBefore(target).flatMap((statement) =>
    statement
      .findAll({ rule: { kind: 'call_expression' } })
      .filter((call) => isCoreVolumeCreation(call) && runsWith(call, statement))
  );

  for (const call of creations) {
    const [id, options] = argumentsOf(call);

    if (!id || volumeIdKey(id) !== key) {
      continue;
    }

    if (options?.kind() !== 'object') {
      return undefined;
    }

    const { pairs, shorthand, hasSpread, keys } = objectEntries(options);

    if (
      hasSpread ||
      hasComputedKey(options) ||
      keys.filter((name) => name === 'imageIds').length > 1
    ) {
      return undefined;
    }

    const imageIds = shorthand.has('imageIds')
      ? options
          .children()
          .find(
            (child) =>
              child.kind() === 'shorthand_property_identifier' &&
              child.text() === 'imageIds'
          )
      : pairs.get('imageIds')?.field('value');
    const binding =
      imageIds?.kind() === 'identifier' ||
      imageIds?.kind() === 'shorthand_property_identifier'
        ? stableBinding(imageIds)
        : undefined;

    if (!binding || !bindsAt(run.rootNode, binding, target)) {
      return undefined;
    }

    found.add(imageIds.text());
  }

  return found.size === 1 ? [...found][0] : undefined;
}

/**
 * Tells whether a call runs whenever its statement runs: the statement is an
 * expression statement or a declaration, and the nodes between them are
 * declarations, `await`, parentheses, casts, arrays, arguments and the calls
 * and member reads that hold them, never a condition, a loop or a function.
 * A call in a part of a loop or of an `if`, such as the increment of a `for`
 * that its body leaves with `break`, proves nothing.
 */
function runsWith(call: Node, statement: Node): boolean {
  for (const ancestor of call.ancestors()) {
    if (ancestor.id() === statement.id()) {
      return PLAIN_STATEMENTS.has(statement.kind());
    }

    if (
      !UNCONDITIONAL_KINDS.has(ancestor.kind()) ||
      ancestor.children().some((child) => child.kind() === 'optional_chain')
    ) {
      return false;
    }
  }

  return false;
}

/**
 * Tells whether the code waits for a call where it makes it, or hands its
 * promise on: the call, in parentheses or not, is under `await`, is the value
 * of a `return` or is the body of an arrow function. Code after any other
 * call runs before the mount ends.
 */
function isWaitedFor(call: Node): boolean {
  let node = call;
  let parent = call.parent();

  while (parent?.kind() === 'parenthesized_expression') {
    node = parent;
    parent = parent.parent();
  }

  if (
    parent?.kind() === 'await_expression' ||
    parent?.kind() === 'return_statement'
  ) {
    return true;
  }

  return (
    parent?.kind() === 'arrow_function' &&
    parent.field('body')?.id() === node.id()
  );
}

/**
 * Formats the registration of a planar display set.
 */
function registration(
  utilities: string,
  idText: string,
  entries: Array<[string, string]>,
  indent: string
): string {
  const lines = entries.map(
    ([key, value]) => `${indent}  ${key === value ? key : `${key}: ${value}`},`
  );

  return `${utilities}.genericViewportDisplaySetMetadataProvider.add(${idText}, {\n${indent}  kind: 'planar',\n${lines.join('\n')}\n${indent}});`;
}

/**
 * Formats the awaited call that mounts a display set by the expression of its
 * id.
 */
function mountCall(viewport: string, id: string): string {
  const key = id === 'displaySetId' ? id : `displaySetId: ${id}`;

  return `await ${viewport}.setDisplaySets({ ${key} });`;
}

/**
 * Returns why a data call cannot become statements, or undefined: an
 * optional call would mount on a missing viewport, and a call inside an
 * expression has no statement to expand.
 */
function statementReason(call: Node): string | undefined {
  if (isOptionalCall(call)) {
    return 'an optional call';
  }

  return statementOfCall(call) ? undefined : 'not a statement';
}

/**
 * Returns `base`, or `base2`, `base3` and so on: the first that is none of
 * the names.
 */
function freshAmong(base: string, taken: Set<string>): string {
  for (let index = 1; ; index += 1) {
    const name = index === 1 ? base : `${base}${index}`;

    if (!taken.has(name)) {
      return name;
    }
  }
}

/**
 * Returns `viewportId`, or `viewportId2` and so on: the first that is none
 * of the names.
 */
function callbackParameter(taken: Set<string>): string {
  return freshAmong('viewportId', taken);
}

/**
 * Returns an expression without the parentheses around it.
 */
function withoutParentheses(node: Node): Node {
  let current = node;

  while (current.kind() === 'parenthesized_expression') {
    const inner = current
      .children()
      .find((child) => child.isNamed() && child.kind() !== 'comment');

    if (!inner) {
      return current;
    }

    current = inner;
  }

  return current;
}

/**
 * Rewrites `viewport.setStack(imageIds, index)` in a statement to the
 * registration of a display set and its mount. The display set id is the
 * JSON of the rendering engine id, the viewport id and the first image id,
 * so another series gets another id, two engines never share one, and no
 * two of these tuples give one text. A viewport that is a property read,
 * such as a getter, is read once into a `const` before the image list, and
 * so is a name that a write can change (a `let`, a `var`, a written
 * parameter) when an argument can run code, such as a getter that assigns
 * it; an image list that is not a plain value is read once into a `const`,
 * as the old call read each once and in that order. A call that is not
 * awaited is reported: 5.x set the image ids and the index before its
 * promise, so the code after it saw them, where a 6.0 viewport shows nothing
 * before its mount ends, and only the reader knows which of the two the code
 * needs.
 */
function rewriteSetStack(
  run: Run,
  call: Node,
  object: Node,
  args: Node[]
): void {
  const statementInfo = statementOfCall(call);
  const reason =
    statementReason(call) ??
    (!isRepeatable(object)
      ? 'the viewport is not a name'
      : args.some((arg) => arg.kind() === 'spread_element')
        ? 'a spread argument'
        : args.length < 1 || args.length > 2
          ? 'the arguments'
          : !statementInfo?.awaited
            ? 'not awaited'
            : undefined);
  const utilities = reason
    ? undefined
    : run.imports.ensure('utilities', { at: call });

  if (reason || !utilities) {
    manual.increment(
      site(
        run.root,
        `setStack: ${reason ?? 'utilities cannot be imported'}`,
        call
      )
    );

    return;
  }

  const { statement } = statementInfo;
  const target = unwrap(object);
  const viewportLocal =
    target.kind() === 'this' ||
    (target.kind() === 'identifier' &&
      (stableBinding(target) || args.every((arg) => isPlainValue(arg))))
      ? undefined
      : run.imports.fresh('viewport');
  const receiver = viewportLocal ?? target.text();
  const [list, indexArg] = args;
  const listLocal = isPlainValue(list)
    ? undefined
    : run.imports.fresh('imageIds');
  const firstElement =
    list.kind() === 'array'
      ? list
          .children()
          .find((child) => child.isNamed() && child.kind() !== 'comment')
      : undefined;
  const first =
    !listLocal && firstElement
      ? firstElement.text()
      : `${listLocal ?? asPrimary(list)}[0]`;
  const idLocal = run.imports.fresh('displaySetId');
  const index = indexArg?.text() ?? '0';
  const edit = replaceStatement(run.rootNode, statement, (indent) => [
    ...(viewportLocal
      ? [`const ${viewportLocal} = ${withoutParentheses(object).text()};`]
      : []),
    ...(listLocal ? [`const ${listLocal} = ${list.text()};`] : []),
    `const ${idLocal} = JSON.stringify([${receiver}.renderingEngineId, ${receiver}.id, ${first}]);`,
    registration(
      utilities,
      idLocal,
      [
        ['imageIds', listLocal ?? list.text()],
        ['initialImageIdIndex', index],
      ],
      indent
    ),
    mountCall(viewportLocal ?? object.text(), idLocal),
  ]);

  if (!run.edits.add(edit)) {
    manual.increment(site(run.root, 'setStack', call));
  }
}

/**
 * Rewrites `viewport.setVolumes([{ volumeId }])` in a statement to the
 * registration of a display set under the volume id and its mount. A call
 * that is not awaited is reported: the code after it saw the camera of a 5.x
 * volume viewport, where a 6.0 viewport has no view before its mount ends.
 */
function rewriteSetVolumes(
  run: Run,
  call: Node,
  object: Node,
  args: Node[]
): void {
  const statementInfo = statementOfCall(call);
  const { volumeId, reason: inputReason } = singleVolumeId(args[0]);
  const imageIds = volumeId ? imageIdsOfVolume(run, volumeId, call) : undefined;
  const reason =
    statementReason(call) ??
    (args.length !== 1
      ? 'more arguments'
      : (inputReason ??
        (!imageIds
          ? 'the image ids of the volume are not known'
          : !statementInfo?.awaited
            ? 'not awaited'
            : undefined)));
  const utilities = reason
    ? undefined
    : run.imports.ensure('utilities', { at: call });

  if (reason || !utilities) {
    manual.increment(
      site(
        run.root,
        `setVolumes: ${reason ?? 'utilities cannot be imported'}`,
        call
      )
    );

    return;
  }

  const { statement } = statementInfo;
  const id = volumeId.text();
  const edit = replaceStatement(run.rootNode, statement, (indent) => [
    registration(
      utilities,
      id,
      [
        ['imageIds', imageIds],
        ['volumeId', id],
      ],
      indent
    ),
    mountCall(object.text(), id),
  ]);

  if (!run.edits.add(edit)) {
    manual.increment(site(run.root, 'setVolumes', call));
  }
}

/**
 * Rewrites `setVolumesForViewports(engine, [{ volumeId }], viewportIds)` in a
 * statement to the registration and a mount on each viewport. As in 5.x,
 * every viewport is looked up and checked before any mount starts: a
 * missing one, or one that is not planar or 3D (5.x took only viewports with
 * `setVolumes`), throws before the registration. An engine that is not a
 * name is read once into a local first, as the call read it once. A call
 * that is not awaited is reported: 5.x gave a promise that the code did not
 * wait for, where the new statements wait for every mount or throw.
 */
function rewriteSetVolumesForViewports(run: Run, call: Node): boolean {
  const args = argumentsOf(call);
  const statementInfo = statementOfCall(call);
  const { volumeId, reason: inputReason } = singleVolumeId(args[1]);
  const imageIds = volumeId ? imageIdsOfVolume(run, volumeId, call) : undefined;
  const awaits = statementInfo?.awaited;
  const reason =
    statementReason(call) ??
    (args.some((arg) => arg.kind() === 'spread_element')
      ? 'a spread argument'
      : args.length !== 3
        ? 'the arguments'
        : (inputReason ??
          (!imageIds
            ? 'the image ids of the volume are not known'
            : !awaits
              ? 'not awaited'
              : undefined)));
  const utilities = reason
    ? undefined
    : run.imports.ensure('utilities', { at: call });
  const enums = utilities
    ? run.imports.ensure('Enums', { at: call })
    : undefined;

  if (reason || !utilities || !enums) {
    const missing = utilities ? 'Enums' : 'utilities';

    manual.increment(
      site(
        run.root,
        `setVolumesForViewports: ${reason ?? `${missing} cannot be imported`}`,
        call
      )
    );

    return false;
  }

  const { statement } = statementInfo;
  const [engine, , list] = args;
  const id = volumeId.text();
  const engineLocal =
    engine.kind() === 'identifier'
      ? undefined
      : run.imports.fresh('renderingEngine');
  const engineText = engineLocal ?? engine.text();
  const taken = new Set(
    [engine, volumeId]
      .flatMap((node) => [
        node,
        ...node.findAll({ rule: { kind: 'identifier' } }),
      ])
      .map((node) => node.text())
  );
  const parameter = callbackParameter(taken);
  const element = freshAmong(
    'viewport',
    new Set([...taken, parameter, engineText])
  );
  const viewports = run.imports.fresh('viewports');
  const edit = replaceStatement(run.rootNode, statement, (indent) => [
    ...(engineLocal ? [`const ${engineLocal} = ${engine.text()};`] : []),
    [
      `const ${viewports} = ${asPrimary(list)}.map((${parameter}) => {`,
      `${indent}  const ${element} = ${engineText}.getViewport(${parameter});`,
      '',
      `${indent}  if (!${element}) {`,
      `${indent}    throw new Error(\`Viewport with Id \${${parameter}} does not exist\`);`,
      `${indent}  }`,
      '',
      `${indent}  if (`,
      `${indent}    ${element}.type !== ${enums}.ViewportType.PLANAR &&`,
      `${indent}    ${element}.type !== ${enums}.ViewportType.VOLUME_3D`,
      `${indent}  ) {`,
      `${indent}    throw new Error(`,
      `${indent}      'setVolumesForViewports only supports viewports that implement setVolumes'`,
      `${indent}    );`,
      `${indent}  }`,
      '',
      `${indent}  return ${element};`,
      `${indent}});`,
    ].join('\n'),
    '',
    registration(
      utilities,
      id,
      [
        ['imageIds', imageIds],
        ['volumeId', id],
      ],
      indent
    ),
    '',
    [
      'await Promise.all(',
      `${indent}  ${viewports}.map((${element}) => ${element}.setDisplaySets({ displaySetId: ${id} }))`,
      `${indent});`,
    ].join('\n'),
  ]);

  if (run.edits.add(edit)) {
    return true;
  }

  manual.increment(site(run.root, 'setVolumesForViewports', call));

  return false;
}

/**
 * Rewrites `setVideo(imageId, frameNumber)` and `setEcg(imageId)` to
 * `setDisplaySets`, the image id as the display set id. A call that the code
 * does not wait for or hand on is reported: 5.x set the image id (a video
 * also its frame count and its source) before its promise, so the code after
 * it saw them, where a 6.0 viewport shows nothing before its mount ends.
 */
function rewriteSingleSource(
  run: Run,
  call: Node,
  property: Node,
  args: Node[],
  method: string
): void {
  const maxArgs = method === 'setVideo' ? 2 : 1;

  if (
    args.length < 1 ||
    args.length > maxArgs ||
    args.some((arg) => arg.kind() === 'spread_element')
  ) {
    manual.increment(site(run.root, `${method}: the arguments`, call));

    return;
  }

  if (!isWaitedFor(call)) {
    manual.increment(site(run.root, `${method}: not awaited`, call));

    return;
  }

  const options = args[1]
    ? `, options: { frameNumber: ${args[1].text()} }`
    : '';

  run.edits.add(
    property.replace('setDisplaySets'),
    call
      .field('arguments')
      .replace(`({ displaySetId: ${args[0].text()}${options} })`)
  );
}

/**
 * Rewrites and reports the data calls on the viewports.
 */
function rewriteMembers(run: Run): void {
  const names = [
    'setStack',
    'setVolumes',
    'setVideo',
    'setEcg',
    ...REPORTED_MEMBERS,
  ].join('|');
  const calls = run.rootNode.findAll({
    rule: {
      kind: 'call_expression',
      has: {
        field: 'function',
        kind: 'member_expression',
        has: { field: 'property', regex: `^(${names})$` },
      },
    },
  });

  for (const call of calls) {
    const { object, property, method, args } = methodCall(call);

    if (REPORTED_MEMBERS.has(method) || viewportEvidence(object) !== 'core') {
      manual.increment(site(run.root, method, call));
      continue;
    }

    if (method === 'setStack') {
      rewriteSetStack(run, call, object, args);
    } else if (method === 'setVolumes') {
      rewriteSetVolumes(run, call, object, args);
    } else {
      rewriteSingleSource(run, call, property, args, method);
    }
  }
}

/**
 * Returns the core data function that a callee names, through its import,
 * the core namespace or the core `utilities`.
 */
function coreDataFunction(callee: Node): string | undefined {
  const names = ['setVolumesForViewports', ...REPORTED_FUNCTIONS];

  if (callee.kind() === 'identifier') {
    const name = coreImportOf(callee)?.name;

    return name && names.includes(name) ? name : undefined;
  }

  if (callee.kind() !== 'member_expression') {
    return undefined;
  }

  const name = callee.field('property')?.text() ?? '';
  const object = callee.field('object');

  if (!names.includes(name)) {
    return undefined;
  }

  return isCoreExport(object, 'utilities') ||
    (object?.kind() === 'identifier' && isCoreNamespace(object))
    ? name
    : undefined;
}

/**
 * Rewrites and reports the data functions of the core. Each other reference
 * to an import of `setVolumesForViewports`, such as a shorthand property or
 * an alias read as a value, is reported; the import goes when every
 * reference was a call that the transform rewrote.
 */
function rewriteFunctions(run: Run): void {
  const rewritten = new Set<number>();
  const reported = new Set<number>();

  for (const call of run.rootNode.findAll({
    rule: { kind: 'call_expression' },
  })) {
    const callee = call.field('function');
    const name = callee ? coreDataFunction(callee) : undefined;

    if (!name) {
      continue;
    }

    const changed =
      name === 'setVolumesForViewports' &&
      rewriteSetVolumesForViewports(run, call);

    if (name !== 'setVolumesForViewports') {
      manual.increment(site(run.root, name, call));
    }

    (changed ? rewritten : reported).add(callee.range().start.index);
  }

  for (const { name, local } of coreSpecifiers(run.rootNode)) {
    if (name !== 'setVolumesForViewports') {
      continue;
    }

    let left = 0;

    for (const reference of referencesOf(local)) {
      const start = reference.range().start.index;

      if (!rewritten.has(start) && !reported.has(start)) {
        manual.increment(site(run.root, name, reference));
      }

      left += rewritten.has(start) ? 0 : 1;
    }

    if (!left && rewritten.size) {
      run.imports.remove(name, local.text());
    }
  }

  for (const { specifier, name } of coreReExports(run.rootNode)) {
    if (name === 'setVolumesForViewports' || REPORTED_FUNCTIONS.has(name)) {
      manual.increment(site(run.root, name, specifier));
    }
  }
}

/**
 * Reports a bracket access with a string key to a data member, such as
 * `viewport['setStack'](imageIds)`: it names the member that
 * `viewport.setStack` names.
 */
function reportBracketMembers(run: Run): void {
  const names = new Set([
    'setStack',
    'setVolumes',
    'setVideo',
    'setEcg',
    ...REPORTED_MEMBERS,
    ...PRESENCE_CHECKS,
  ]);

  for (const node of run.rootNode.findAll({
    rule: { kind: 'subscript_expression' },
  })) {
    const name = bracketKey(node);
    const parent = node.parent();

    if (!name || !names.has(name)) {
      continue;
    }

    const isCall =
      parent?.kind() === 'call_expression' &&
      parent.field('function')?.id() === node.id();

    manual.increment(site(run.root, isCall ? name : `${name} read`, node));
  }
}

/**
 * Reports `'setStack' in viewport`, a read of `viewport.setStack` that is not
 * a call (`typeof viewport.setStack === 'function'`) and their kin: false for
 * every 6.0 viewport.
 */
function reportPresenceChecks(run: Run): void {
  for (const binary of run.rootNode.findAll({
    rule: {
      kind: 'binary_expression',
      has: { field: 'operator', regex: '^in$' },
    },
  })) {
    const left = binary.field('left');

    if (
      left?.kind() === 'string' &&
      PRESENCE_CHECKS.has(left.text().slice(1, -1))
    ) {
      manual.increment(site(run.root, `${left.text()} in`, binary));
    }
  }

  const members = run.rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: {
        field: 'property',
        regex: `^(${[...PRESENCE_CHECKS].join('|')})$`,
      },
    },
  });

  for (const member of members) {
    const parent = member.parent();

    if (
      parent?.kind() !== 'call_expression' ||
      parent.field('function')?.id() !== member.id()
    ) {
      manual.increment(
        site(run.root, `${member.field('property').text()} read`, member)
      );
    }
  }
}

/**
 * Rewrites the data calls of the legacy viewports: `setStack`, `setVolumes`
 * and `setVolumesForViewports` in their common shapes become a registered
 * display set and `setDisplaySets`, `setVideo` and `setEcg` become
 * `setDisplaySets`, each only where the code waits for its promise or hands
 * it on. Every other shape and the other data calls are reported.
 */
const codemod: Codemod<TSX> = (root) => {
  const rootNode = root.root();
  const run: Run = {
    root,
    rootNode,
    imports: new CoreImports(rootNode),
    edits: new EditSet(),
  };

  rewriteMembers(run);
  rewriteFunctions(run);
  reportPresenceChecks(run);
  reportBracketMembers(run);

  const importEdits = run.imports.edits();

  if (!run.edits.all().length && !importEdits.length) {
    return null;
  }

  return rootNode.commitEdits([...run.edits.all(), ...importEdits]);
};

export default analysed(codemod, manual);
