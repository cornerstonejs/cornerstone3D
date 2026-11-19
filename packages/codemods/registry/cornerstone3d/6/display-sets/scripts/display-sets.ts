import type { Codemod, SgRoot } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';
import { useMetricAtom } from 'codemod:metrics';
import {
  CoreImports,
  EditSet,
  asPrimary,
  bindsAt,
  coreImportOf,
  coreSpecifiers,
  declarationNodeOf,
  enclosingFunction,
  isAsyncFunction,
  isCoreExport,
  isCoreNamespace,
  isOptionalCall,
  isPure,
  isRepeatable,
  methodCall,
  objectEntries,
  referencesOf,
  replaceStatement,
  site,
  statementOfCall,
  unwrap,
  viewportEvidence,
} from './lib.ts';
import type { Node } from './lib.ts';

/** Sites that the reader changes. */
const manual = useMetricAtom('cornerstone3d-6-manual');

/** Rewrites at a decision of the migration guide. */
const review = useMetricAtom('cornerstone3d-6-review');

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
 * Tells whether an expression can be written three times: a repeatable
 * expression, or a string without substitutions.
 */
function isStableValue(node: Node): boolean {
  if (
    node.kind() === 'string' ||
    node.kind() === 'shorthand_property_identifier'
  ) {
    return true;
  }

  if (node.kind() === 'template_string') {
    return node.findAll({ rule: { kind: 'call_expression' } }).length === 0;
  }

  return isRepeatable(node);
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

  return isStableValue(volumeId)
    ? { volumeId }
    : { reason: 'the volume id is not a name or a string' };
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
 * Returns the image ids expression of the volume that the file creates with
 * `createAndCacheVolume(volumeId, { imageIds })` before the target, in a
 * scope that the target sees, or undefined.
 */
function imageIdsOfVolume(
  run: Run,
  volumeId: Node,
  target: Node
): string | undefined {
  const found = new Set<string>();

  for (const call of run.rootNode.findAll({
    rule: { kind: 'call_expression' },
  })) {
    if (!isCoreVolumeCreation(call)) {
      continue;
    }

    const [id, options] = argumentsOf(call);

    if (id?.text() !== volumeId.text() || options?.kind() !== 'object') {
      continue;
    }

    if (call.range().start.index > target.range().start.index) {
      continue;
    }

    const { pairs, shorthand } = objectEntries(options);
    const imageIds = shorthand.has('imageIds')
      ? options
          .children()
          .find((child) => child.kind() === 'shorthand_property_identifier')
      : pairs.get('imageIds')?.field('value');

    if (
      !imageIds ||
      (imageIds.kind() !== 'identifier' &&
        imageIds.kind() !== 'shorthand_property_identifier')
    ) {
      return undefined;
    }

    const declaration = declarationNodeOf(imageIds);

    if (!declaration || !bindsAt(run.rootNode, declaration, target)) {
      return undefined;
    }

    found.add(imageIds.text());
  }

  return found.size === 1 ? [...found][0] : undefined;
}

/**
 * Returns `await ` when the new call waits: the old call waited, or its
 * function is async. Reports a call that cannot wait.
 */
function awaitPrefix(
  run: Run,
  call: Node,
  awaited: boolean,
  rule: string
): string {
  if (awaited) {
    return 'await ';
  }

  if (isAsyncFunction(enclosingFunction(call))) {
    return 'await ';
  }

  review.increment(
    site(
      run.root,
      `${rule}: not awaited, a next viewport has no view before its mount`,
      call
    )
  );

  return '';
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
 * Formats the call that mounts a display set by the expression of its id.
 */
function mountCall(wait: string, viewport: string, id: string): string {
  const key = id === 'displaySetId' ? id : `displaySetId: ${id}`;

  return `${wait}${viewport}.setDisplaySets({ ${key} });`;
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
 * Returns `viewportId`, or `viewportId2` and so on: the first that is none
 * of the names.
 */
function callbackParameter(taken: Set<string>): string {
  for (let index = 1; ; index += 1) {
    const name = index === 1 ? 'viewportId' : `viewportId${index}`;

    if (!taken.has(name)) {
      return name;
    }
  }
}

/**
 * Rewrites `viewport.setStack(imageIds, index)` in a statement to the
 * registration of a display set and its mount. The display set id names the
 * rendering engine, the viewport and the first image, so another series gets
 * another id and two engines never share one.
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
      : args.length < 1 ||
          args.length > 2 ||
          args.some((arg) => arg.kind() === 'spread_element')
        ? 'the arguments'
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

  const { statement, awaited } = statementInfo;
  const receiver = unwrap(object).text();
  const [list, indexArg] = args;
  const listLocal = isPure(list) ? undefined : run.imports.fresh('imageIds');
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
  const wait = awaitPrefix(run, call, awaited, 'setStack');
  const edit = replaceStatement(run.rootNode, statement, (indent) => [
    ...(listLocal ? [`const ${listLocal} = ${list.text()};`] : []),
    `const ${idLocal} = \`\${${receiver}.renderingEngineId}:\${${receiver}.id}:\${${first}}\`;`,
    registration(
      utilities,
      idLocal,
      [
        ['imageIds', listLocal ?? list.text()],
        ['initialImageIdIndex', index],
      ],
      indent
    ),
    mountCall(wait, object.text(), idLocal),
  ]);

  if (!run.edits.add(edit)) {
    manual.increment(site(run.root, 'setStack', call));
  }
}

/**
 * Rewrites `viewport.setVolumes([{ volumeId }])` in a statement to the
 * registration of a display set under the volume id and its mount.
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
        (!imageIds ? 'the image ids of the volume are not known' : undefined)));
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

  const { statement, awaited } = statementInfo;
  const id = volumeId.text();
  const wait = awaitPrefix(run, call, awaited, 'setVolumes');
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
    mountCall(wait, object.text(), id),
  ]);

  if (!run.edits.add(edit)) {
    manual.increment(site(run.root, 'setVolumes', call));
  }
}

/**
 * Rewrites `setVolumesForViewports(engine, [{ volumeId }], viewportIds)` in a
 * statement to the registration and a mount on each viewport. An engine that
 * is not a name is read once into a local first, as the call read it once.
 */
function rewriteSetVolumesForViewports(run: Run, call: Node): boolean {
  const args = argumentsOf(call);
  const statementInfo = statementOfCall(call);
  const { volumeId, reason: inputReason } = singleVolumeId(args[1]);
  const imageIds = volumeId ? imageIdsOfVolume(run, volumeId, call) : undefined;
  const reason =
    statementReason(call) ??
    (args.length !== 3
      ? 'the arguments'
      : (inputReason ??
        (!imageIds ? 'the image ids of the volume are not known' : undefined)));
  const utilities = reason
    ? undefined
    : run.imports.ensure('utilities', { at: call });

  if (reason || !utilities) {
    manual.increment(
      site(
        run.root,
        `setVolumesForViewports: ${reason ?? 'utilities cannot be imported'}`,
        call
      )
    );

    return false;
  }

  const { statement, awaited } = statementInfo;
  const [engine, , list] = args;
  const id = volumeId.text();
  const engineLocal = isRepeatable(engine)
    ? undefined
    : run.imports.fresh('renderingEngine');
  const engineText = engineLocal ?? engine.text();
  const parameter = callbackParameter(
    new Set(
      [engine, volumeId]
        .flatMap((node) => [
          node,
          ...node.findAll({ rule: { kind: 'identifier' } }),
        ])
        .map((node) => node.text())
    )
  );
  const wait = awaitPrefix(run, call, awaited, 'setVolumesForViewports');
  const edit = replaceStatement(run.rootNode, statement, (indent) => [
    ...(engineLocal ? [`const ${engineLocal} = ${engine.text()};`] : []),
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
      `${wait}Promise.all(`,
      `${indent}  ${asPrimary(list)}.map((${parameter}) =>`,
      `${indent}    ${engineText}.getViewport(${parameter}).setDisplaySets({ displaySetId: ${id} })`,
      `${indent}  )`,
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
 * `setDisplaySets`, the image id as the display set id.
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
 * `setDisplaySets`. Every other shape and the other data calls are
 * reported.
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

  const importEdits = run.imports.edits();

  if (!run.edits.all().length && !importEdits.length) {
    return null;
  }

  return rootNode.commitEdits([...run.edits.all(), ...importEdits]);
};

export default codemod;
