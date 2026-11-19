import type { Codemod, SgRoot } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';
import { useMetricAtom } from 'codemod:metrics';
import {
  CoreImports,
  EditSet,
  coreImportOf,
  isCoreNamespace,
  objectEntries,
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

/** The parents in which `a === b` needs no parentheses. */
const SAFE_PARENTS = new Set([
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
 * Rewrites the removed keys of the `rendering` configuration.
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

    if (key === 'useViewportSamplingForLinear') {
      const holder = holderPair(pair, 'cpuVolume');

      if (holder) {
        removeSetting(run, pair, holder);
      }

      continue;
    }

    const rendering = holderPair(pair, 'rendering');

    if (!rendering) {
      continue;
    }

    if (key === 'useGenericViewport') {
      removeSetting(run, pair, rendering);
      continue;
    }

    const value = pair.field('value');
    const { keys } = objectEntries(pair.parent());

    if (value?.text() === 'false') {
      removeSetting(run, pair, rendering);
      continue;
    }

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
 * Returns the removed setting function that a callee names, through its
 * import or the core namespace.
 */
function settingFunction(callee: Node): string | undefined {
  if (callee.kind() === 'identifier') {
    const name = coreImportOf(callee)?.name;

    return name && SETTING_FUNCTIONS.has(name) ? name : undefined;
  }

  if (callee.kind() === 'member_expression') {
    const object = callee.field('object');
    const name = callee.field('property')?.text() ?? '';

    return SETTING_FUNCTIONS.has(name) &&
      object?.kind() === 'identifier' &&
      isCoreNamespace(object)
      ? name
      : undefined;
  }

  return undefined;
}

/**
 * Returns the expression that names a core function in this file, the way
 * the old call named its function.
 */
function functionRef(run: Run, callee: Node, name: string): string | undefined {
  if (callee.kind() === 'member_expression') {
    return `${callee.field('object').text()}.${name}`;
  }

  return run.imports.ensure(name);
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

  if (name === 'getShouldUseCPURendering') {
    const ref = functionRef(run, callee, 'getEffectiveRenderBackend');
    const test = `${ref}() === 'cpu'`;
    const parent = call.parent();
    const safe =
      SAFE_PARENTS.has(parent?.kind() ?? '') ||
      (parent?.kind() === 'binary_expression' &&
        /^(&&|\|\||\?\?)$/.test(parent.field('operator')?.text() ?? ''));

    return run.edits.add(call.replace(safe ? test : `(${test})`));
  }

  const ref = functionRef(run, callee, 'setRenderBackend');

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
 * Rewrites the calls of the removed setting functions, and drops their
 * imports when no use is left.
 */
function rewriteFunctions(run: Run): void {
  const left = new Map<string, number>();
  const identifiers = run.rootNode.findAll({
    rule: {
      any: [{ kind: 'identifier' }, { kind: 'property_identifier' }],
      regex: `^(${[...SETTING_FUNCTIONS].join('|')})$`,
    },
  });

  for (const identifier of identifiers) {
    if (
      identifier
        .ancestors()
        .some((ancestor) => ancestor.kind() === 'import_statement')
    ) {
      continue;
    }

    const callee =
      identifier.kind() === 'property_identifier'
        ? identifier.parent()
        : identifier;
    const name = callee ? settingFunction(callee) : undefined;

    if (!name) {
      continue;
    }

    const call = callee.parent();
    const isCall =
      call?.kind() === 'call_expression' &&
      call.field('function')?.id() === callee.id();
    const changed = isCall ? rewriteCall(run, call, callee, name) : false;

    if (!isCall) {
      manual.increment(site(run.root, name, callee));
    }

    if (!changed && callee.kind() === 'identifier') {
      left.set(name, (left.get(name) ?? 0) + 1);
    }
  }

  for (const name of SETTING_FUNCTIONS) {
    if (run.imports.local(name) && !left.get(name)) {
      run.imports.remove(name);
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
