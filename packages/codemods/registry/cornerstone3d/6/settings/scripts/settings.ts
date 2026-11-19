import type { Codemod, SgRoot } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';
import { useMetricAtom } from 'codemod:metrics';
import {
  CoreImports,
  EditSet,
  comparisonAt,
  coreImportOf,
  coreSpecifiers,
  isCoreExport,
  isCoreNamespace,
  isPure,
  objectEntries,
  referencesOf,
  removeProperty,
  site,
} from './lib.ts';
import type { Node } from './lib.ts';

/** Sites that the reader changes. */
const manual = useMetricAtom('cornerstone3d-6-manual');

/** Rewrites at a decision of the migration guide. */
const review = useMetricAtom('cornerstone3d-6-review');

/** The removed functions of the CPU switch and of the generic switch. */
const SETTING_FUNCTIONS = new Set([
  'setUseCPURendering',
  'resetUseCPURendering',
  'getShouldUseCPURendering',
  'getUseGenericViewport',
]);

/** The core functions that take the configuration. */
const CONFIGURATION_FUNCTIONS = ['init', 'setConfiguration'];

/** The expressions that need parentheses before `? :`. */
const LOW_PRECEDENCE = new Set([
  'ternary_expression',
  'assignment_expression',
  'augmented_assignment_expression',
  'sequence_expression',
  'arrow_function',
  'yield_expression',
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
 * Returns the key of a pair, without quotes.
 */
function keyOf(pair: Node): string {
  const key = pair.field('key');

  return key?.kind() === 'string'
    ? key.text().slice(1, -1)
    : (key?.text() ?? '');
}

/**
 * Returns the pair whose value is the object that holds a pair, when its key
 * is `name`.
 */
function holderPair(pair: Node, name: string): Node | undefined {
  const objectNode = pair.parent();
  const holder = objectNode?.parent();

  return holder?.kind() === 'pair' && keyOf(holder) === name
    ? holder
    : undefined;
}

/**
 * Removes a pair from its object; when it was the only key, removes the pair
 * that holds the object too.
 */
function removeSetting(run: Run, pair: Node, holder: Node): boolean {
  const { keys, hasSpread } = objectEntries(pair.parent());

  if (keys.length !== 1 || hasSpread) {
    return run.edits.add(removeProperty(pair));
  }

  const outer = holder.parent();
  const outerEntries = objectEntries(outer);

  if (outerEntries.keys.length !== 1 || outerEntries.hasSpread) {
    return run.edits.add(removeProperty(holder));
  }

  const args = outer.parent();
  const call = args?.parent();
  const namedArgs = args?.children().filter((child) => child.isNamed()) ?? [];
  const callee =
    call?.kind() === 'call_expression' ? call.field('function') : undefined;
  const isInit =
    args?.kind() === 'arguments' &&
    namedArgs.length === 1 &&
    callee &&
    (coreImportOf(callee)?.name === 'init' ||
      (callee.kind() === 'member_expression' &&
        callee.field('property')?.text() === 'init' &&
        isCoreNamespace(callee.field('object'))));

  return run.edits.add(isInit ? args.replace('()') : outer.replace('{}'));
}

/**
 * Tells whether an object literal, or a variable that holds it, is passed to
 * the core `init` or `setConfiguration` in the file.
 */
function reachesConfigurationCall(node: Node): boolean {
  let current = node;

  while (
    [
      'parenthesized_expression',
      'as_expression',
      'satisfies_expression',
    ].includes(current.parent()?.kind() ?? '')
  ) {
    current = current.parent();
  }

  const parent = current.parent();

  if (parent?.kind() === 'arguments') {
    const callee = parent.parent()?.field('function');

    return Boolean(
      callee &&
        CONFIGURATION_FUNCTIONS.some((name) => isCoreExport(callee, name))
    );
  }

  if (
    parent?.kind() !== 'variable_declarator' ||
    parent.field('value')?.id() !== current.id()
  ) {
    return false;
  }

  const name = parent.field('name');

  return Boolean(
    name?.kind() === 'identifier' &&
      referencesOf(name).some(
        (reference) =>
          reference.kind() === 'identifier' &&
          reachesConfigurationCall(reference)
      )
  );
}

/**
 * Returns the outermost object literal that holds a pair through nested
 * pairs.
 */
function configurationOf(pair: Node): Node {
  let objectNode = pair.parent();

  while (
    objectNode.parent()?.kind() === 'pair' &&
    objectNode.parent().parent()?.kind() === 'object'
  ) {
    objectNode = objectNode.parent().parent();
  }

  return objectNode;
}

/**
 * Rewrites the removed keys of the `rendering` configuration of an object
 * that the file passes to `init` or `setConfiguration`. A key of another
 * object, or a key whose value runs code, is reported.
 */
function rewriteConfiguration(run: Run): void {
  const pairs = run.rootNode.findAll({
    rule: {
      kind: 'pair',
      has: {
        field: 'key',
        regex:
          '^[\'"]?(useGenericViewport|useCPURendering|useViewportSamplingForLinear)[\'"]?$',
      },
    },
  });

  for (const pair of pairs) {
    const key = keyOf(pair);
    const holderName =
      key === 'useViewportSamplingForLinear' ? 'cpuVolume' : 'rendering';
    const holder = holderPair(pair, holderName);
    const rule = `${holderName}.${key}`;
    const value = pair.field('value');

    if (!holder) {
      continue;
    }

    if (!reachesConfigurationCall(configurationOf(pair))) {
      manual.increment(
        site(run.root, `${rule}: not shown to reach init()`, pair)
      );
      continue;
    }

    const removes = key !== 'useCPURendering' || value?.text() === 'false';

    if (removes && (!value || !isPure(value))) {
      manual.increment(site(run.root, `${rule}: its value has effects`, pair));
      continue;
    }

    if (removes) {
      removeSetting(run, pair, holder);
      continue;
    }

    const { keys } = objectEntries(pair.parent());

    if (keys.includes('planar')) {
      manual.increment(site(run.root, 'rendering.useCPURendering', pair));
      continue;
    }

    const backend =
      value?.text() === 'true'
        ? "'cpu'"
        : `${LOW_PRECEDENCE.has(value.kind()) ? `(${value.text()})` : value.text()} ? 'cpu' : 'auto'`;

    if (run.edits.add(pair.replace(`planar: { renderBackend: ${backend} }`))) {
      review.increment(
        site(
          run.root,
          'rendering.useCPURendering: a 3D viewport stays on the GPU',
          pair
        )
      );
    }
  }
}

/**
 * Returns the expression that names a core function at a call, the way the
 * old call named its function.
 */
function functionRef(
  run: Run,
  call: Node,
  callee: Node,
  name: string
): string | undefined {
  if (callee.kind() === 'member_expression') {
    return `${callee.field('object').text()}.${name}`;
  }

  return run.imports.ensure(name, { at: call });
}

/**
 * Rewrites one call of a removed setting function. Returns whether the call
 * changed.
 */
function rewriteCall(
  run: Run,
  call: Node,
  callee: Node,
  name: string
): boolean {
  const args = call
    .field('arguments')
    .children()
    .filter((child) => child.isNamed() && child.kind() !== 'comment');

  if (
    name === 'getUseGenericViewport' ||
    (name === 'setUseCPURendering' && args.length !== 1)
  ) {
    manual.increment(site(run.root, `${name}()`, call));

    return false;
  }

  const newName =
    name === 'getShouldUseCPURendering'
      ? 'getEffectiveRenderBackend'
      : 'setRenderBackend';
  const ref = functionRef(run, call, callee, newName);

  if (!ref) {
    manual.increment(
      site(run.root, `${name}: ${newName} cannot be imported`, call)
    );

    return false;
  }

  if (name === 'getShouldUseCPURendering') {
    return run.edits.add(
      call.replace(comparisonAt(call, `${ref}() === 'cpu'`))
    );
  }

  if (name === 'resetUseCPURendering') {
    return run.edits.add(call.replace(`${ref}('auto')`));
  }

  const [arg] = args;
  const backend =
    arg.text() === 'true'
      ? "'cpu'"
      : arg.text() === 'false'
        ? "'auto'"
        : `${LOW_PRECEDENCE.has(arg.kind()) ? `(${arg.text()})` : arg.text()} ? 'cpu' : 'auto'`;
  const changed = run.edits.add(call.replace(`${ref}(${backend})`));

  if (changed) {
    review.increment(
      site(
        run.root,
        'setUseCPURendering: it marked the library initialized, call init() first',
        call
      )
    );
  }

  return changed;
}

/**
 * Rewrites a reference to a removed setting function when it is the callee
 * of a call, and reports it otherwise. Returns whether it changed.
 */
function rewriteReference(run: Run, callee: Node, name: string): boolean {
  const call = callee.parent();
  const isCall =
    call?.kind() === 'call_expression' &&
    call.field('function')?.id() === callee.id();

  if (!isCall) {
    manual.increment(site(run.root, name, callee));

    return false;
  }

  return rewriteCall(run, call, callee, name);
}

/**
 * Rewrites the calls of the removed setting functions, through each named
 * import with its local name or through the core namespace. A named import
 * goes when every reference to it changed.
 */
function rewriteFunctions(run: Run): void {
  for (const { name, local } of coreSpecifiers(run.rootNode)) {
    if (!SETTING_FUNCTIONS.has(name)) {
      continue;
    }

    let left = 0;

    for (const reference of referencesOf(local)) {
      const isIdentifier = reference.kind() === 'identifier';

      if (!isIdentifier) {
        manual.increment(site(run.root, name, reference));
      }

      left += isIdentifier && rewriteReference(run, reference, name) ? 0 : 1;
    }

    if (!left) {
      run.imports.remove(name, local.text());
    }
  }

  for (const member of run.rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: {
        field: 'property',
        regex: `^(${[...SETTING_FUNCTIONS].join('|')})$`,
      },
    },
  })) {
    const object = member.field('object');

    if (object?.kind() === 'identifier' && isCoreNamespace(object)) {
      rewriteReference(run, member, member.field('property').text());
    }
  }
}

/**
 * Rewrites the settings that Cornerstone3D 6.0 removes:
 * `rendering.useGenericViewport` and `useViewportSamplingForLinear` go,
 * `rendering.useCPURendering` becomes `rendering.planar.renderBackend`, and
 * the CPU functions become `setRenderBackend` and `getEffectiveRenderBackend`.
 * `getUseGenericViewport()` is reported.
 */
const codemod: Codemod<TSX> = (root) => {
  const rootNode = root.root();
  const run: Run = {
    root,
    rootNode,
    imports: new CoreImports(rootNode),
    edits: new EditSet(),
  };

  rewriteConfiguration(run);
  rewriteFunctions(run);

  const importEdits = run.imports.edits();

  if (!run.edits.all().length && !importEdits.length) {
    return null;
  }

  return rootNode.commitEdits([...run.edits.all(), ...importEdits]);
};

export default codemod;
