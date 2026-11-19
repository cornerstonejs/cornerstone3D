import type { Codemod, SgRoot } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';
import { useMetricAtom } from 'codemod:metrics';
import {
  CORE_PACKAGE,
  CoreImports,
  EditSet,
  comparisonAt,
  coreImportOf,
  importSource,
  isCoreExport,
  isCoreNamespace,
  isMountedBefore,
  methodCall,
  objectEntries,
  site,
  unwrap,
} from './lib.ts';
import type { Node } from './lib.ts';

/** Sites that the reader changes. */
const manual = useMetricAtom('cornerstone3d-6-manual');

/** Rewrites at a decision of the migration guide. */
const review = useMetricAtom('cornerstone3d-6-review');

/** The legacy classes and the class that types the same viewport in 6.0. */
const LEGACY_CLASS_TYPE: Record<string, string> = {
  StackViewport: 'PlanarViewport',
  VolumeViewport: 'PlanarViewport',
  BaseVolumeViewport: 'PlanarViewport',
  Viewport: 'GenericViewport',
};

/** The class names that 6.0 renames, deprecated aliases and the legacy 3D name. */
const RENAMED_CLASS: Record<string, string> = {
  LegacyVolumeViewport3D: 'VolumeViewport3D',
  GenericVolumeViewport3D: 'VolumeViewport3D',
  VideoGenericViewport: 'VideoViewport',
  WSIGenericViewport: 'WSIViewport',
  ECGGenericViewport: 'ECGViewport',
};

/** The removed `Types` interfaces and the class that replaces each. */
const TYPES_TO_CLASS: Record<string, string> = {
  IStackViewport: 'PlanarViewport',
  IVolumeViewport: 'PlanarViewport',
  IBaseVolumeViewport: 'PlanarViewport',
  IVideoViewport: 'VideoViewport',
  IWSIViewport: 'WSIViewport',
  IECGViewport: 'ECGViewport',
};

/** The `Types` names that keep the namespace and change their name. */
const TYPES_RENAMED: Record<string, string> = {
  IGenericViewport: 'IViewport',
};

/** The removed `Types` names that need the application. */
const TYPES_REPORTED = new Set([
  'ViewportProperties',
  'StackViewportProperties',
  'VolumeViewportProperties',
  'VideoViewportProperties',
  'WSIViewportProperties',
  'ECGViewportProperties',
  'IVolumeInput',
  'VolumeInputCallback',
  'SetAspectRatioOptions',
  'ImageSetOptions',
]);

/** The test of the content mode that replaces an `instanceof` check. */
const INSTANCEOF_TEST: Record<
  string,
  (utilities: string, value: string) => string
> = {
  StackViewport: (utilities, value) =>
    `${utilities}.viewportIsInStackMode(${value})`,
  VolumeViewport: (utilities, value) =>
    `${utilities}.getViewportContentMode(${value}) === 'volume'`,
  BaseVolumeViewport: (utilities, value) =>
    `${utilities}.viewportIsInVolumeMode(${value})`,
};

/**
 * The names that typed a 3D viewport in 5.x as well as a volume viewport:
 * `IBaseVolumeViewport` and `BaseVolumeViewport` by their class, and
 * `IVolumeViewport` by a cast that applications wrote for a 3D viewport.
 */
const VOLUME_OR_3D = new Set([
  'IVolumeViewport',
  'IBaseVolumeViewport',
  'BaseVolumeViewport',
]);

/** A viewport type of 3D, as code names it. */
const THREE_D_TYPE = /\bVOLUME_3D(_NEXT)?\b|['"]volume3d(Next)?['"]/;

/** A planar viewport type, as code names it after the viewport types step. */
const PLANAR_TYPE =
  /\b(PLANAR(_NEXT)?|STACK|ORTHOGRAPHIC)\b|['"](planar(Next)?|stack|orthographic)['"]/;

/** The calls that give a typed rendering engine. */
const ENGINE_FACTORIES = new Set(['getRenderingEngine', 'RenderingEngine']);

/** The operators of an equality test. */
const EQUALITY = new Set(['===', '==', '!==', '!=']);

/** The statements that end a `case` without falling through. */
const CASE_ENDS = new Set([
  'break_statement',
  'return_statement',
  'throw_statement',
  'continue_statement',
]);

/** What a test of the viewport type tells about the family of a node. */
type Decision = '3d' | 'planar' | 'ambiguous' | undefined;

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
 * Tells whether a node lies inside an import statement.
 */
function inImport(node: Node): boolean {
  return node
    .ancestors()
    .some((ancestor) => ancestor.kind() === 'import_statement');
}

/**
 * Tells whether an expression is a rendering engine with a type, so that a
 * call of `getViewport` on it takes a type argument.
 */
function isTypedEngine(node: Node): boolean {
  const inner = unwrap(node);

  if (inner.kind() === 'call_expression' || inner.kind() === 'new_expression') {
    const callee = inner.field(
      inner.kind() === 'call_expression' ? 'function' : 'constructor'
    );

    return Boolean(
      callee && ENGINE_FACTORIES.has(callee.text().split('.').pop() ?? '')
    );
  }

  if (inner.kind() !== 'identifier') {
    return false;
  }

  const definition = inner.definition();
  const target = definition?.node;

  if (!target || definition.kind !== 'local') {
    return false;
  }

  const holder = target.kind() === 'identifier' ? target.parent() : target;
  const annotation = holder
    ?.children()
    .find((child) => child.kind() === 'type_annotation');

  if (annotation) {
    return /RenderingEngine\b/.test(annotation.text());
  }

  if (holder?.kind() === 'variable_declarator') {
    const value = holder.field('value');

    return Boolean(value && isTypedEngine(value));
  }

  return false;
}

/**
 * Returns the texts that name the viewport a type node types: the expression
 * of its cast and the variable that the cast or the annotation declares.
 */
function receiversOf(typeNode: Node): Set<string> {
  const receivers = new Set<string>();
  const holder = typeNode
    .ancestors()
    .find((ancestor) =>
      [
        'as_expression',
        'type_assertion',
        'variable_declarator',
        'required_parameter',
        'optional_parameter',
      ].includes(ancestor.kind())
    );

  if (!holder) {
    return receivers;
  }

  const named = holder.children().filter((child) => child.isNamed());
  const expression =
    holder.kind() === 'as_expression'
      ? named[0]
      : holder.kind() === 'type_assertion'
        ? named[named.length - 1]
        : undefined;
  const declarator =
    holder.kind() === 'variable_declarator'
      ? holder
      : holder.parent()?.kind() === 'variable_declarator'
        ? holder.parent()
        : undefined;

  if (expression) {
    receivers.add(unwrap(expression).text());
  }

  for (const name of [declarator?.field('name'), holder.field('pattern')]) {
    if (name?.kind() === 'identifier') {
      receivers.add(name.text());
    }
  }

  return receivers;
}

/**
 * Tells whether a tested value is the type of the viewport that a type node
 * types: `<receiver>.type`, or a name such as `type` or `viewportType`.
 */
function isTiedValue(value: Node, receivers: Set<string>): boolean {
  const inner = unwrap(value);

  if (inner.kind() === 'identifier') {
    return true;
  }

  return (
    inner.kind() === 'member_expression' &&
    inner.field('property')?.text() === 'type' &&
    receivers.has(unwrap(inner.field('object')).text())
  );
}

/**
 * Returns the family that a viewport type names, by its text.
 */
function familyOfTypeText(text: string): '3d' | 'planar' | undefined {
  if (THREE_D_TYPE.test(text)) {
    return '3d';
  }

  return PLANAR_TYPE.test(text) ? 'planar' : undefined;
}

/**
 * Returns what a condition tells about the family of a node that runs when
 * the condition is `positive`: a 3D or a planar family when the node runs
 * only when the tested type equals it, planar when it runs only when the
 * type is not 3D. A condition that names a 3D type and decides nothing (a
 * negation, `||`, a value other than the type of the viewport) is
 * `ambiguous`; one that names planar types only adds nothing to the default,
 * planar, and is undefined like one that names no type.
 */
function decidedFamily(
  condition: Node,
  positive: boolean,
  receivers: Set<string>
): Decision {
  if (!familyOfTypeText(condition.text())) {
    return undefined;
  }

  const undecided: Decision = THREE_D_TYPE.test(condition.text())
    ? 'ambiguous'
    : undefined;
  const inner = unwrap(condition);
  const operator = inner.field('operator')?.text() ?? '';

  if (inner.kind() !== 'binary_expression') {
    return undecided;
  }

  if (operator === '&&' && positive) {
    const decisions = new Set(
      [inner.field('left'), inner.field('right')]
        .map((side) => decidedFamily(side, true, receivers))
        .filter(Boolean)
    );

    return decisions.size === 1 ? [...decisions][0] : undecided;
  }

  if (!EQUALITY.has(operator)) {
    return undecided;
  }

  const left = inner.field('left');
  const right = inner.field('right');
  const leftFamily = familyOfTypeText(left.text());
  const typeSide = leftFamily ? left : right;
  const value = leftFamily ? right : left;
  const family = familyOfTypeText(typeSide.text());

  if (
    !family ||
    familyOfTypeText(value.text()) ||
    !isTiedValue(value, receivers)
  ) {
    return undecided;
  }

  if (operator.startsWith('!') !== positive) {
    return family;
  }

  return family === '3d' ? 'planar' : undecided;
}

/**
 * Returns what a `case` tells about the family of the nodes in its body. A
 * case that the case before it falls into decides nothing, and is ambiguous
 * when it names a 3D type.
 */
function caseFamily(caseNode: Node, receivers: Set<string>): Decision {
  const value = caseNode.field('value');
  const family = value ? familyOfTypeText(value.text()) : undefined;

  if (!family) {
    return undefined;
  }

  const previous = caseNode.prev();
  const previousLast = previous
    ?.children()
    .filter((child) => child.isNamed() && child.kind() !== 'comment')
    .pop();
  const discriminant = caseNode.parent()?.parent()?.field('value');
  const fallsIn =
    previous?.kind() === 'switch_case' &&
    !CASE_ENDS.has(previousLast?.kind() ?? '');

  if (fallsIn || !discriminant || !isTiedValue(discriminant, receivers)) {
    return family === '3d' ? 'ambiguous' : undefined;
  }

  return family;
}

/**
 * Returns the family that the file shows for a type node: '3d' or 'planar'
 * when an enclosing `if`, `else` or `case` runs only for that family of the
 * viewport it types, or when the viewport inputs of the file with the id of
 * the `getViewport` call that the type casts all have one family;
 * 'ambiguous' when an enclosing test names a viewport type and decides
 * nothing; undefined otherwise.
 */
function familyEvidence(run: Run, typeNode: Node): Decision {
  const receivers = receiversOf(typeNode);
  let child = typeNode;
  let ambiguous = false;

  for (const ancestor of typeNode.ancestors()) {
    const inConsequence =
      ancestor.kind() === 'if_statement' &&
      ancestor.field('consequence')?.id() === child.id();
    const inAlternative =
      ancestor.kind() === 'if_statement' &&
      ancestor.field('alternative')?.id() === child.id();
    const decision =
      inConsequence || inAlternative
        ? decidedFamily(ancestor.field('condition'), inConsequence, receivers)
        : ancestor.kind() === 'switch_case'
          ? caseFamily(ancestor, receivers)
          : undefined;

    if (decision === '3d' || decision === 'planar') {
      return decision;
    }

    ambiguous ||= decision === 'ambiguous';
    child = ancestor;
  }

  return inputFamily(run, typeNode) ?? (ambiguous ? 'ambiguous' : undefined);
}

/**
 * Returns the family of the viewport inputs of the file with the id of the
 * `getViewport` call that a type node casts, when they all have one.
 */
function inputFamily(run: Run, typeNode: Node): '3d' | 'planar' | undefined {
  const holder = typeNode
    .ancestors()
    .find((ancestor) =>
      ['as_expression', 'type_assertion', 'variable_declarator'].includes(
        ancestor.kind()
      )
    );
  const expression =
    holder?.kind() === 'variable_declarator'
      ? holder.field('value')
      : holder
          ?.children()
          .filter((node) => node.isNamed())
          .find((node) => node.kind() === 'call_expression');
  const call = expression ? methodCall(unwrap(expression)) : undefined;

  if (!call || call.method !== 'getViewport' || call.args.length !== 1) {
    return undefined;
  }

  const id = call.args[0].text();
  const families = new Set<string>();

  for (const objectNode of run.rootNode.findAll({ rule: { kind: 'object' } })) {
    const { pairs, shorthand } = objectEntries(objectNode);
    const idText =
      pairs.get('viewportId')?.field('value')?.text() ??
      (shorthand.has('viewportId') ? 'viewportId' : undefined);
    const typeText = pairs.get('type')?.field('value')?.text();

    if (idText !== id || !typeText) {
      continue;
    }

    families.add(
      THREE_D_TYPE.test(typeText)
        ? '3d'
        : PLANAR_TYPE.test(typeText)
          ? 'planar'
          : 'other'
    );
  }

  return families.size === 1 && !families.has('other')
    ? ([...families][0] as '3d' | 'planar')
    : undefined;
}

/**
 * Returns the 6.0 class of a legacy type name at a type node: the 3D class
 * for a name that also typed a 3D viewport when the file shows a 3D viewport,
 * the planar class otherwise. Returns undefined, and reports the site, when
 * a test of a 3D type around the node does not show the family: the type
 * stays for the reader.
 */
function classFor(
  run: Run,
  typeNode: Node,
  name: string,
  planarClass: string,
  label: string
): string | undefined {
  if (!VOLUME_OR_3D.has(name)) {
    return planarClass;
  }

  const family = familyEvidence(run, typeNode);

  if (family === 'ambiguous') {
    manual.increment(
      site(
        run.root,
        `${label}: a test of a 3D type here does not show the family`,
        typeNode
      )
    );

    return undefined;
  }

  return family === '3d' ? 'VolumeViewport3D' : planarClass;
}

/**
 * Replaces a type node with a class name. When the type is the cast of a
 * `getViewport` call on a typed engine, the cast becomes the type argument
 * of the call.
 */
function replaceType(run: Run, typeNode: Node, className: string): boolean {
  const parent = typeNode.parent();
  const cast =
    parent?.kind() === 'type_arguments' &&
    parent.parent()?.kind() === 'type_assertion'
      ? parent.parent()
      : parent;

  if (
    cast &&
    (cast.kind() === 'as_expression' || cast.kind() === 'type_assertion')
  ) {
    const named = cast.children().filter((child) => child.isNamed());
    const expression =
      cast.kind() === 'as_expression' ? named[0] : named[named.length - 1];
    const callNode = expression ? unwrap(expression) : undefined;
    const call = callNode ? methodCall(callNode) : undefined;

    if (
      call &&
      call.method === 'getViewport' &&
      !callNode.field('type_arguments') &&
      isTypedEngine(call.object)
    ) {
      return run.edits.add(
        cast.replace(
          `${call.object.text()}.getViewport<${className}>${call.argsNode.text()}`
        )
      );
    }
  }

  return run.edits.add(typeNode.replace(className));
}

/**
 * Returns the identifiers, type identifiers and shorthand properties of the
 * file that refer to an import specifier.
 */
function referencesOf(run: Run, specifier: Node, local: string): Node[] {
  return run.rootNode
    .findAll({
      rule: {
        any: [
          { kind: 'identifier' },
          { kind: 'type_identifier' },
          { kind: 'shorthand_property_identifier' },
        ],
        regex: `^${local}$`,
      },
    })
    .filter(
      (node) =>
        !inImport(node) && coreImportOf(node)?.specifier.id() === specifier.id()
    );
}

/**
 * Tells whether a reference is the right side of `instanceof`.
 */
function instanceofOf(node: Node): Node | undefined {
  const parent = node.parent();

  if (
    parent?.kind() === 'binary_expression' &&
    parent.field('operator')?.text() === 'instanceof' &&
    parent.field('right')?.id() === node.id()
  ) {
    return parent;
  }

  return undefined;
}

/**
 * Rewrites `value instanceof LegacyClass` to the test of the content mode,
 * when an awaited mount of the value comes before it: a 5.x class is known
 * from the creation of the viewport, a 6.0 mode only from its first mount.
 * Reports the test otherwise.
 */
function rewriteInstanceof(run: Run, binary: Node, name: string): boolean {
  const test = INSTANCEOF_TEST[name];
  const left = binary.field('left');

  if (test && !isMountedBefore(binary, unwrap(left).text())) {
    manual.increment(
      site(
        run.root,
        `instanceof ${name}: the viewport may not show its data yet`,
        binary
      )
    );

    return false;
  }

  const utilities = test
    ? run.imports.ensure('utilities', { at: binary })
    : undefined;

  if (!test || !utilities) {
    manual.increment(site(run.root, `instanceof ${name}`, binary));

    return false;
  }

  const text = test(utilities, left.text());
  const added = run.edits.add(
    binary.replace(text.includes(' === ') ? comparisonAt(binary, text) : text)
  );

  if (added) {
    review.increment(site(run.root, `instanceof ${name}`, binary));
  }

  return added;
}

/**
 * Rewrites the references of a named import of a legacy class: a type
 * becomes the 6.0 class, `instanceof` the test of the mode. The import goes
 * when no reference is left.
 */
function rewriteLegacyClass(
  run: Run,
  specifier: Node,
  name: string,
  local: string
): void {
  const references = referencesOf(run, specifier, local);
  let left = 0;

  for (const reference of references) {
    const binary = instanceofOf(reference);

    if (binary) {
      left += rewriteInstanceof(run, binary, name) ? 0 : 1;
      continue;
    }

    if (reference.kind() === 'type_identifier') {
      const chosen = classFor(
        run,
        reference,
        name,
        LEGACY_CLASS_TYPE[name],
        name
      );
      const className = chosen
        ? run.imports.ensure(chosen, { type: true })
        : undefined;

      left += className && replaceType(run, reference, className) ? 0 : 1;
      continue;
    }

    manual.increment(site(run.root, name, reference));
    left += 1;
  }

  if (!left) {
    run.imports.remove(name);
  }
}

/**
 * Renames a class that 6.0 names differently, in the import and in every
 * reference. A shorthand property and an export keep their public key.
 */
function renameClass(
  run: Run,
  specifier: Node,
  name: string,
  local: string
): void {
  const references = referencesOf(run, specifier, local);
  const newLocal = run.imports.rename(name, RENAMED_CLASS[name]);

  if (!newLocal || newLocal === local) {
    return;
  }

  for (const reference of references) {
    const parent = reference.parent();

    if (reference.kind() === 'shorthand_property_identifier') {
      run.edits.add(reference.replace(`${local}: ${newLocal}`));
    } else if (
      parent?.kind() === 'export_specifier' &&
      !parent.field('alias')
    ) {
      run.edits.add(parent.replace(`${newLocal} as ${local}`));
    } else {
      run.edits.add(reference.replace(newLocal));
    }
  }
}

/**
 * Rewrites the re-exports of the core: a renamed class keeps its public name
 * through `as`, and a removed class is reported, as 6.0 has no export of
 * that name.
 */
function rewriteReExports(run: Run): void {
  const statements = run.rootNode
    .children()
    .filter(
      (child) =>
        child.kind() === 'export_statement' &&
        importSource(child) === CORE_PACKAGE
    );

  for (const statement of statements) {
    for (const specifier of statement.findAll({
      rule: { kind: 'export_specifier' },
    })) {
      const nameNode = specifier.field('name');
      const name = nameNode?.text() ?? '';

      if (LEGACY_CLASS_TYPE[name]) {
        manual.increment(site(run.root, name, specifier));
      } else if (RENAMED_CLASS[name]) {
        run.edits.add(
          specifier.field('alias')
            ? nameNode.replace(RENAMED_CLASS[name])
            : specifier.replace(`${RENAMED_CLASS[name]} as ${name}`)
        );
      }
    }
  }
}

/**
 * Returns the parts of a nested type such as `Types.IStackViewport` or
 * `cs.Types.IStackViewport` when its namespace is the core `Types`, or the
 * core namespace itself.
 */
function coreNestedType(
  node: Node
): { namespace: 'Types' | 'core'; name: string; nameNode: Node } | undefined {
  const named = node.children().filter((child) => child.isNamed());
  const module = named[0];
  const nameNode = named[named.length - 1];

  if (!module || !nameNode || nameNode.kind() !== 'type_identifier') {
    return undefined;
  }

  if (module.kind() === 'identifier') {
    if (coreImportOf(module)?.name === 'Types') {
      return { namespace: 'Types', name: nameNode.text(), nameNode };
    }

    if (isCoreNamespace(module)) {
      return { namespace: 'core', name: nameNode.text(), nameNode };
    }

    return undefined;
  }

  if (module.kind() === 'nested_identifier') {
    const parts = module.children().filter((child) => child.isNamed());

    if (
      parts.length === 2 &&
      parts[0].kind() === 'identifier' &&
      parts[1].text() === 'Types' &&
      isCoreNamespace(parts[0])
    ) {
      return { namespace: 'Types', name: nameNode.text(), nameNode };
    }
  }

  return undefined;
}

/**
 * Rewrites the nested types of the core: the removed `Types` interfaces, the
 * renamed ones, and the classes read through the core namespace.
 */
function rewriteNestedTypes(run: Run): void {
  for (const node of run.rootNode.findAll({
    rule: { kind: 'nested_type_identifier' },
  })) {
    const nested = coreNestedType(node);

    if (!nested) {
      continue;
    }

    const { namespace, name, nameNode } = nested;

    if (namespace === 'Types' && TYPES_TO_CLASS[name]) {
      const chosen = classFor(
        run,
        node,
        name,
        TYPES_TO_CLASS[name],
        `Types.${name}`
      );
      const className = chosen
        ? run.imports.ensure(chosen, { type: true })
        : undefined;

      if (chosen && (!className || !replaceType(run, node, className))) {
        manual.increment(site(run.root, `Types.${name}`, node));
      }
    } else if (namespace === 'Types' && TYPES_RENAMED[name]) {
      run.edits.add(nameNode.replace(TYPES_RENAMED[name]));
    } else if (namespace === 'Types' && TYPES_REPORTED.has(name)) {
      manual.increment(site(run.root, `Types.${name}`, node));
    } else if (namespace === 'core' && LEGACY_CLASS_TYPE[name]) {
      const chosen = classFor(run, node, name, LEGACY_CLASS_TYPE[name], name);
      const module = node
        .children()
        .find((child) => child.isNamed())
        .text();

      if (chosen) {
        replaceType(run, node, `${module}.${chosen}`);
      }
    } else if (namespace === 'core' && RENAMED_CLASS[name]) {
      run.edits.add(nameNode.replace(RENAMED_CLASS[name]));
    }
  }
}

/**
 * Rewrites the classes read as values through the core namespace:
 * `value instanceof cs.StackViewport` and `cs.GenericVolumeViewport3D`.
 */
function rewriteNamespaceValues(run: Run): void {
  if (!run.imports.namespace) {
    return;
  }

  for (const node of run.rootNode.findAll({
    rule: { kind: 'member_expression' },
  })) {
    const name = node.field('property')?.text() ?? '';
    const object = node.field('object');

    if (
      (!LEGACY_CLASS_TYPE[name] && !RENAMED_CLASS[name]) ||
      object?.kind() !== 'identifier' ||
      !isCoreNamespace(object)
    ) {
      continue;
    }

    if (RENAMED_CLASS[name]) {
      run.edits.add(node.field('property').replace(RENAMED_CLASS[name]));
      continue;
    }

    const binary = instanceofOf(node);

    if (binary) {
      rewriteInstanceof(run, binary, name);
    } else {
      manual.increment(site(run.root, name, node));
    }
  }
}

/**
 * Reports `utilities.isGenericViewport(viewport)`: deprecated, true for every
 * viewport, so its check goes and its true branch stays.
 */
function reportIsGenericViewport(run: Run): void {
  for (const call of run.rootNode.findAll({
    rule: { pattern: '$UTILS.isGenericViewport($$$ARGS)' },
  })) {
    const callee = call.field('function');

    if (callee && isCoreExport(callee.field('object'), 'utilities')) {
      manual.increment(site(run.root, 'isGenericViewport', call));
    }
  }
}

/**
 * Rewrites the classes and the TypeScript types that Cornerstone3D 6.0
 * removes or renames: the legacy viewport classes become `PlanarViewport` in
 * a type and a test of the content mode after `instanceof`, the deprecated
 * class aliases get their plain names, `Types.IStackViewport` and its kin
 * become the class of their family, and a cast of `getViewport` becomes its
 * type argument.
 */
const codemod: Codemod<TSX> = (root) => {
  const rootNode = root.root();
  const run: Run = {
    root,
    rootNode,
    imports: new CoreImports(rootNode),
    edits: new EditSet(),
  };
  const specifiers = rootNode
    .findAll({ rule: { kind: 'import_specifier' } })
    .filter((specifier) => {
      const statement = specifier
        .ancestors()
        .find((ancestor) => ancestor.kind() === 'import_statement');

      return (
        statement?.field('source')?.text().slice(1, -1) ===
        '@cornerstonejs/core'
      );
    });

  for (const specifier of specifiers) {
    const name = specifier.field('name')?.text() ?? '';
    const local = specifier.field('alias')?.text() ?? name;

    if (LEGACY_CLASS_TYPE[name]) {
      rewriteLegacyClass(run, specifier, name, local);
    } else if (RENAMED_CLASS[name]) {
      renameClass(run, specifier, name, local);
    }
  }

  rewriteNestedTypes(run);
  rewriteNamespaceValues(run);
  rewriteReExports(run);
  reportIsGenericViewport(run);

  const importEdits = run.imports.edits();

  if (!run.edits.all().length && !importEdits.length) {
    return null;
  }

  return rootNode.commitEdits([...run.edits.all(), ...importEdits]);
};

export default codemod;
