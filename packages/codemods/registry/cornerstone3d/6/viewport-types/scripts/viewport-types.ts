import type { Codemod, SgRoot } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';
import { useMetricAtom } from 'codemod:metrics';
import {
  CoreImports,
  EditSet,
  HeldMetric,
  analysed,
  bracketKey,
  declarationNodeOf,
  enclosingFunction,
  indentOf,
  isCoreEnum,
  isMountedBefore,
  isRenderingEngine,
  isStableBinding,
  mergedOperands,
  methodCall,
  objectEntries,
  referencesOf,
  site,
  staticKeyName,
  textAfterEdits,
  unwrap,
  viewportEvidence,
  writtenValues,
} from './lib.ts';
import type { Node, ViewportEvidence } from './lib.ts';

/** Sites that the reader changes. */
const manual = new HeldMetric(useMetricAtom('cornerstone3d-6-manual'));

/** Rewrites at a decision of the migration guide. */
const review = new HeldMetric(useMetricAtom('cornerstone3d-6-review'));

/** The deprecated `_NEXT` members and their plain names. */
const NEXT_MEMBERS: Record<string, string> = {
  PLANAR_NEXT: 'PLANAR',
  VOLUME_3D_NEXT: 'VOLUME_3D',
  VIDEO_NEXT: 'VIDEO',
  WHOLE_SLIDE_NEXT: 'WHOLE_SLIDE',
  ECG_NEXT: 'ECG',
};

/** The content mode that a comparison with a removed type asks for. */
const MODE_OF_LEGACY: Record<string, string> = {
  STACK: 'stack',
  ORTHOGRAPHIC: 'volume',
  stack: 'stack',
  orthographic: 'volume',
};

/** The deprecated `*Next` strings and their plain strings. */
const NEXT_STRINGS: Record<string, string> = {
  planarNext: 'planar',
  volume3dNext: 'volume3d',
  videoNext: 'video',
  wholeSlideNext: 'wholeSlide',
  ecgNext: 'ecg',
};

/** The removed strings of a viewport input. */
const LEGACY_STRINGS = new Set(['stack', 'orthographic', 'perspective']);

/** The operators of an equality test. */
const EQUALITY = new Set(['===', '!==', '==', '!=']);

/** The keys that make an object literal a viewport input. */
const INPUT_KEYS = ['viewportId', 'element'];

/** The methods of a rendering engine that take viewport inputs. */
const INPUT_METHODS = new Set(['enableElement', 'setViewports']);

/** The longest chain of names that a returned value is followed through. */
const MAX_NAME_DEPTH = 4;

/** The parents through which a viewport input keeps flowing to a call. */
const FLOW_KINDS = new Set([
  'parenthesized_expression',
  'as_expression',
  'satisfies_expression',
  'array',
  'spread_element',
]);

/**
 * Returns the pair `type: value` whose value holds the node, through
 * parentheses and the branches of a conditional, or undefined.
 */
function typePairOf(node: Node): { pair: Node; direct: boolean } | undefined {
  let current = node;
  let direct = true;

  for (;;) {
    const parent = current.parent();

    if (!parent) {
      return undefined;
    }

    if (parent.kind() === 'parenthesized_expression') {
      current = parent;
      continue;
    }

    if (
      parent.kind() === 'ternary_expression' &&
      parent.field('condition')?.id() !== current.id()
    ) {
      direct = false;
      current = parent;
      continue;
    }

    if (
      parent.kind() === 'pair' &&
      parent.field('value')?.id() === current.id()
    ) {
      const key = parent.field('key');
      const name =
        key?.kind() === 'string' ? key.text().slice(1, -1) : key?.text();

      return name === 'type' ? { pair: parent, direct } : undefined;
    }

    return undefined;
  }
}

/**
 * Tells whether an object literal has the keys of a viewport input.
 */
function isViewportInput(objectNode: Node): boolean {
  const { keys } = objectEntries(objectNode);

  return INPUT_KEYS.some((key) => keys.includes(key));
}

/**
 * Tells whether a variable reaches `enableElement` or `setViewports` of a
 * core rendering engine through one of its references.
 */
function variableReaches(name: Node, depth: number): boolean {
  return referencesOf(name).some(
    (reference) =>
      reference.kind() === 'identifier' &&
      reachesViewportCall(reference, depth + 1)
  );
}

/**
 * Tells whether a value reaches `enableElement` or `setViewports` of a core
 * rendering engine in the file: as an argument, as an entry of an array
 * argument, pushed onto such an array, or through a variable that holds it.
 */
function reachesViewportCall(node: Node, depth = 0): boolean {
  if (depth > 3) {
    return false;
  }

  let current = node;

  while (FLOW_KINDS.has(current.parent()?.kind() ?? '')) {
    current = current.parent();
  }

  const parent = current.parent();

  if (parent?.kind() === 'arguments') {
    const call = methodCall(parent.parent());

    if (call && INPUT_METHODS.has(call.method)) {
      return isRenderingEngine(call.object);
    }

    const array =
      call?.method === 'push' && call.object.kind() === 'identifier'
        ? declarationNodeOf(call.object)
        : undefined;

    return Boolean(array && variableReaches(array, depth));
  }

  const name =
    parent?.kind() === 'variable_declarator' &&
    parent.field('value')?.id() === current.id()
      ? parent.field('name')
      : undefined;

  return Boolean(name?.kind() === 'identifier' && variableReaches(name, depth));
}

/**
 * Returns the other operand of an equality test when it is `<viewport>.type`,
 * with what shows that its object is a viewport.
 */
function comparedViewport(node: Node):
  | {
      binary: Node;
      viewport: Node;
      operator: string;
      evidence: ViewportEvidence;
      optional: boolean;
    }
  | undefined {
  let current = node;

  while (current.parent()?.kind() === 'parenthesized_expression') {
    current = current.parent();
  }

  const binary = current.parent();

  if (binary?.kind() !== 'binary_expression') {
    return undefined;
  }

  const operator = binary.field('operator')?.text() ?? '';

  if (!EQUALITY.has(operator)) {
    return undefined;
  }

  const left = binary.field('left');
  const right = binary.field('right');
  const other = unwrap(left?.id() === current.id() ? right : left);
  const evidence =
    other?.kind() === 'member_expression' &&
    other.field('property')?.text() === 'type'
      ? viewportEvidence(other.field('object'))
      : undefined;

  if (!evidence) {
    return undefined;
  }

  return {
    binary,
    viewport: other.field('object'),
    operator,
    evidence,
    optional: other
      .children()
      .some((child) => child.kind() === 'optional_chain'),
  };
}

/**
 * Rewrites a comparison of the type of a viewport with a removed type to a
 * test of its content mode, when an awaited mount of the same binding of the
 * viewport runs before it in its function: the type of a viewport is known
 * from its creation, its mode only from its first mount. Reports the
 * comparison otherwise. `?.type` keeps its `?.`.
 */
function rewriteModeTest(
  run: Run,
  comparison: ReturnType<typeof comparedViewport>,
  mode: string,
  rule: string,
  node: Node
): void {
  if (!isMountedBefore(comparison.binary, comparison.viewport)) {
    manual.increment(
      site(run.root, `${rule}: the viewport may not show its data yet`, node)
    );

    return;
  }

  const operator = comparison.operator.startsWith('!') ? '!==' : '===';
  const access = comparison.optional ? '?.' : '.';

  run.edits.add(
    comparison.binary.replace(
      `${comparison.viewport.text()}${access}getCurrentMode() ${operator} '${mode}'`
    )
  );
}

/**
 * Tells whether a node is a value that names a viewport type to make: the
 * value of a variable, a return value, the body of an arrow function or the
 * right side of an assignment to `.type`.
 */
function isTypeValuePosition(node: Node): boolean {
  const parent = node.parent();
  const kind = parent?.kind();

  if (
    kind === 'variable_declarator' &&
    parent.field('value')?.id() === node.id()
  ) {
    return true;
  }

  if (kind === 'return_statement') {
    return true;
  }

  if (kind === 'arrow_function' && parent.field('body')?.id() === node.id()) {
    return true;
  }

  if (
    kind === 'assignment_expression' &&
    parent.field('right')?.id() === node.id()
  ) {
    return parent.field('left')?.text().endsWith('.type') ?? false;
  }

  return false;
}

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
 * Writes the 5.x default orientation of an orthographic viewport into a
 * viewport input that has none, and reports the site for review. Reports the
 * site as manual when the options cannot be read.
 */
function addDefaultOrientation(run: Run, typePair: Node, rule: string): void {
  const objectNode = typePair.parent();
  const { pairs, shorthand, hasSpread } = objectEntries(objectNode);

  if (shorthand.has('defaultOptions') || hasSpread) {
    manual.increment(site(run.root, `${rule}: orientation`, typePair));

    return;
  }

  const optionsPair = pairs.get('defaultOptions');

  if (optionsPair) {
    const options = optionsPair.field('value');

    if (options?.kind() !== 'object') {
      manual.increment(site(run.root, `${rule}: orientation`, typePair));

      return;
    }

    const optionEntries = objectEntries(options);

    if (optionEntries.keys.includes('orientation')) {
      return;
    }

    if (optionEntries.hasSpread) {
      manual.increment(site(run.root, `${rule}: orientation`, typePair));

      return;
    }
  }

  const enums = run.imports.ensure('Enums', { at: typePair });

  if (!enums) {
    manual.increment(site(run.root, `${rule}: orientation`, typePair));

    return;
  }

  const axial = `${enums}.OrientationAxis.AXIAL`;
  const multiline = objectNode.text().includes('\n');

  if (optionsPair) {
    const options = optionsPair.field('value');
    const first = options
      .children()
      .find((child) => child.isNamed() && child.kind() !== 'comment');
    const comment = options
      .children()
      .find((child) => child.kind() === 'comment');

    if (!first && comment) {
      const brace = options.children()[0].range().end.index;

      run.edits.add({
        startPos: brace,
        endPos: brace,
        insertedText: `\n${indentOf(run.rootNode, comment)}orientation: ${axial},`,
      });
    } else if (!first) {
      run.edits.add(options.replace(`{ orientation: ${axial} }`));
    } else {
      const separator = options.text().includes('\n')
        ? `\n${indentOf(run.rootNode, first)}`
        : ' ';
      const start = first.range().start.index;

      run.edits.add({
        startPos: start,
        endPos: start,
        insertedText: `orientation: ${axial},${separator}`,
      });
    }
  } else {
    const separator = multiline ? `\n${indentOf(run.rootNode, typePair)}` : ' ';
    const end = typePair.range().end.index;

    run.edits.add({
      startPos: end,
      endPos: end,
      insertedText: `,${separator}defaultOptions: { orientation: ${axial} }`,
    });
  }

  review.increment(
    site(run.root, `${rule}: default orientation AXIAL`, typePair)
  );
}

/**
 * Rewrites one use of a removed or deprecated `ViewportType` member.
 */
function rewriteMember(run: Run, node: Node, member: string): void {
  const property = node.field('property');

  if (NEXT_MEMBERS[member]) {
    run.edits.add(property.replace(NEXT_MEMBERS[member]));

    return;
  }

  const rule = `ViewportType.${member}`;

  if (member === 'PERSPECTIVE') {
    manual.increment(site(run.root, rule, node));

    return;
  }

  const comparison = comparedViewport(node);

  if (comparison?.evidence === 'name') {
    manual.increment(site(run.root, rule, node));

    return;
  }

  if (comparison) {
    rewriteModeTest(run, comparison, MODE_OF_LEGACY[member], rule, node);

    return;
  }

  const typePair = typePairOf(node);

  if (typePair || isTypeValuePosition(node)) {
    run.edits.add(property.replace('PLANAR'));

    if (member !== 'ORTHOGRAPHIC') {
      return;
    }

    if (typePair?.direct && isViewportInput(typePair.pair.parent())) {
      addDefaultOrientation(run, typePair.pair, rule);
    } else {
      review.increment(site(run.root, `${rule}: orientation`, node));
    }

    return;
  }

  manual.increment(site(run.root, rule, node));
}

/**
 * Rewrites one string that names a removed or deprecated viewport type: in
 * a comparison with the type of a viewport of the core, or as the `type` of
 * a viewport input that reaches `enableElement` or `setViewports`. An object
 * with the keys of a viewport input that does not is reported.
 */
function rewriteString(run: Run, node: Node, value: string): void {
  const quote = node.text()[0];
  const comparison = comparedViewport(node);

  if (comparison?.evidence === 'name') {
    manual.increment(site(run.root, `'${value}'`, node));

    return;
  }

  if (comparison) {
    if (NEXT_STRINGS[value]) {
      run.edits.add(node.replace(`${quote}${NEXT_STRINGS[value]}${quote}`));
    } else if (MODE_OF_LEGACY[value]) {
      rewriteModeTest(
        run,
        comparison,
        MODE_OF_LEGACY[value],
        `'${value}'`,
        node
      );
    } else {
      manual.increment(site(run.root, `'${value}'`, node));
    }

    return;
  }

  const typePair = typePairOf(node);
  const objectNode = typePair?.pair.parent();
  const looksLikeInput = Boolean(objectNode && isViewportInput(objectNode));

  if (looksLikeInput && value === 'perspective') {
    manual.increment(site(run.root, `'${value}'`, node));

    return;
  }

  if (looksLikeInput && !reachesViewportCall(objectNode)) {
    manual.increment(
      site(run.root, `'${value}': not shown to be a viewport input`, node)
    );

    return;
  }

  if (!looksLikeInput) {
    if (NEXT_STRINGS[value]) {
      manual.increment(site(run.root, `'${value}'`, node));
    }

    return;
  }

  if (NEXT_STRINGS[value]) {
    run.edits.add(node.replace(`${quote}${NEXT_STRINGS[value]}${quote}`));

    return;
  }

  run.edits.add(node.replace(`${quote}planar${quote}`));

  if (value === 'orthographic') {
    if (typePair.direct) {
      addDefaultOrientation(run, typePair.pair, `'${value}'`);
    } else {
      review.increment(site(run.root, `'${value}': orientation`, node));
    }
  }
}

/**
 * Reports the viewport options that a planar viewport does not apply by
 * itself. A `displayArea` is applied: it is the first display area of the
 * view state.
 */
function reportInputOptions(run: Run, typePair: Node): void {
  const objectNode = typePair.parent();

  if (!isViewportInput(objectNode)) {
    return;
  }

  const options = objectEntries(objectNode)
    .pairs.get('defaultOptions')
    ?.field('value');

  if (options?.kind() !== 'object') {
    return;
  }

  const { pairs, shorthand } = objectEntries(options);

  for (const key of ['aspectRatio']) {
    const entry = pairs.get(key) ?? (shorthand.has(key) ? options : undefined);

    if (entry) {
      manual.increment(site(run.root, `defaultOptions.${key}`, entry));
    }
  }
}

/**
 * Rewrites the keys that a pattern takes out of the core
 * `Enums.ViewportType`: a `_NEXT` key gets its plain name and keeps its local
 * name (a quoted key keeps its quotes, a shorthand with a default value
 * keeps its local name and its default), and a removed key is reported. A
 * key computed from code and a rest element can take any member, so they
 * are reported.
 */
function rewriteDestructured(run: Run): void {
  for (const pattern of run.rootNode.findAll({
    rule: { kind: 'object_pattern' },
  })) {
    const declarator = pattern.parent();
    const value =
      declarator?.kind() === 'variable_declarator' &&
      declarator.field('name')?.id() === pattern.id()
        ? declarator.field('value')
        : undefined;

    if (!value || !isCoreEnum(value, 'ViewportType')) {
      continue;
    }

    for (const entry of pattern.children()) {
      const kind = entry.kind();
      const keyNode =
        kind === 'shorthand_property_identifier_pattern'
          ? entry
          : kind === 'object_assignment_pattern'
            ? entry.field('left')
            : kind === 'pair_pattern'
              ? entry.field('key')
              : undefined;
      const member = staticKeyName(keyNode);

      if (kind === 'rest_pattern' || (keyNode && !member)) {
        manual.increment(
          site(run.root, 'ViewportType: a rest or computed key', entry)
        );
      } else if (NEXT_MEMBERS[member] && kind === 'pair_pattern') {
        const string =
          keyNode.kind() === 'string'
            ? keyNode
            : keyNode.find({ rule: { kind: 'string' } });
        const quote = string ? string.text()[0] : '';

        run.edits.add(
          (string ?? keyNode).replace(`${quote}${NEXT_MEMBERS[member]}${quote}`)
        );
      } else if (NEXT_MEMBERS[member]) {
        run.edits.add(keyNode.replace(`${NEXT_MEMBERS[member]}: ${member}`));
      } else if (/^(STACK|ORTHOGRAPHIC|PERSPECTIVE)$/.test(member ?? '')) {
        manual.increment(site(run.root, `ViewportType.${member}`, entry));
      }
    }
  }
}

/**
 * Reports a bracket access with a string key to a removed or deprecated
 * member of the core `Enums.ViewportType`, such as
 * `Enums.ViewportType['STACK']`.
 */
function reportBracketMembers(run: Run): void {
  for (const node of run.rootNode.findAll({
    rule: { kind: 'subscript_expression' },
  })) {
    const member = bracketKey(node);
    const isMember =
      Boolean(member && NEXT_MEMBERS[member]) ||
      /^(STACK|ORTHOGRAPHIC|PERSPECTIVE)$/.test(member ?? '');

    if (isMember && isCoreEnum(node.field('object'), 'ViewportType')) {
      manual.increment(site(run.root, `ViewportType.${member}`, node));
    }
  }
}

/**
 * Returns the values that a name holds: the value of a `const`, or every
 * value of a `let` or a `var` that the file writes only as `name = value`.
 * A parameter, a destructured name and a name written in another way give
 * nothing.
 */
function valuesOfName(identifier: Node): Node[] {
  const declaration = declarationNodeOf(identifier);
  const holder = declaration?.parent();

  if (
    !declaration ||
    holder?.kind() !== 'variable_declarator' ||
    holder.field('name')?.id() !== declaration.id()
  ) {
    return [];
  }

  if (!isStableBinding(declaration)) {
    return writtenValues(declaration) ?? [];
  }

  const value = holder.field('value');

  return value ? [value] : [];
}

/**
 * Returns the members of the core `ViewportType` that an expression can
 * give: the member itself, each branch of a conditional, and each value of
 * a name. Any other expression gives nothing.
 */
function typeMembersOf(expression: Node, depth = 0): Node[] {
  const value = unwrap(expression);
  const kind = value.kind();

  if (kind === 'member_expression') {
    return isCoreEnum(value.field('object'), 'ViewportType') ? [value] : [];
  }

  if (kind === 'ternary_expression') {
    return ['consequence', 'alternative'].flatMap((branch) => {
      const node = value.field(branch);

      return node ? typeMembersOf(node, depth) : [];
    });
  }

  if (kind !== 'identifier' || depth >= MAX_NAME_DEPTH) {
    return [];
  }

  return valuesOfName(value).flatMap((node) => typeMembersOf(node, depth + 1));
}

/**
 * Reports a function in which the rewrites turn the returns of two removed
 * types into one 6.0 type: it returned `STACK` on one path and
 * `ORTHOGRAPHIC` on another, and now returns `PLANAR` on both. That is right
 * for a viewport type, and an application that read the answer as "a stack
 * or a volume" has lost it. A return counts directly, in a branch of a
 * conditional, and through a name whose values the file shows.
 */
function reportMergedReturns(run: Run): void {
  const edits = run.edits.all();

  if (!edits.length) {
    return;
  }

  const order = Object.keys(MODE_OF_LEGACY);
  const returned = new Map<number, { fn: Node; members: Node[] }>();
  const values = [
    ...run.rootNode
      .findAll({ rule: { kind: 'return_statement' } })
      .map((statement) =>
        statement
          .children()
          .find((child) => child.isNamed() && child.kind() !== 'comment')
      ),
    ...run.rootNode
      .findAll({ rule: { kind: 'arrow_function' } })
      .map((arrow) => arrow.field('body'))
      .filter((body) => body?.kind() !== 'statement_block'),
  ];

  for (const value of values) {
    const fn = value ? enclosingFunction(value) : undefined;

    if (!fn) {
      continue;
    }

    const entry = returned.get(fn.id()) ?? { fn, members: [] };

    entry.members.push(...typeMembersOf(value));
    returned.set(fn.id(), entry);
  }

  for (const { fn, members } of returned.values()) {
    const removed = new Map<string, string[]>();

    for (const member of members) {
      const property = member.field('property');
      const before = property?.text() ?? '';
      const after = property ? textAfterEdits(property, edits) : undefined;

      if (!after || after === before || NEXT_MEMBERS[before]) {
        continue;
      }

      const names = removed.get(after) ?? [];

      if (!names.includes(before)) {
        names.push(before);
      }

      removed.set(after, names);
    }

    for (const [after, names] of removed) {
      if (names.length > 1) {
        const list = names
          .sort((a, b) => order.indexOf(a) - order.indexOf(b))
          .join(' and ');

        review.increment(
          site(
            run.root,
            `ViewportType.${after}: one function returned ${list}, read what its callers do with the answer`,
            fn
          )
        );
      }
    }
  }
}

/**
 * Returns the name of a rule for two operands that became the same: the
 * member or the string that the rewrite wrote. Undefined for another
 * rewrite, such as two tests of the content mode: a member and its string
 * meant the same in 5.x.
 */
function mergedLabel(inserted: string[]): string | undefined {
  for (const text of inserted) {
    if (/^[A-Z][A-Z0-9_]*$/.test(text)) {
      return `ViewportType.${text}`;
    }

    if (/^['"]\w+['"]$/.test(text)) {
      return `'${text.slice(1, -1)}'`;
    }
  }

  return undefined;
}

/**
 * Reports two operands that the rewrites make the same expression: in a
 * chain of `||` or of `&&`, as `case` labels of one `switch`, or as entries
 * of a list used with `includes`. A test of `VOLUME_3D` beside a test of
 * `VOLUME_3D_NEXT` told a legacy viewport from a next one in 5.x, and the
 * two are one test in 6.0.
 */
function reportMergedOperands(run: Run): void {
  for (const merged of mergedOperands(run.rootNode, run.edits.all())) {
    const label = mergedLabel(merged.inserted);

    if (label) {
      review.increment(site(run.root, `${label}: ${merged.note}`, merged.node));
    }
  }
}

/**
 * Rewrites the removed and deprecated viewport types of Cornerstone3D 5.x:
 * `STACK` and `ORTHOGRAPHIC` in a viewport input become `PLANAR`, a comparison
 * with `viewport.type` asks for the content mode, the `_NEXT` members and
 * the `*Next` strings get their plain names. `PERSPECTIVE` and every other
 * site are reported. A function that now returns one type where it returned
 * two, and two operands that are now the same, are reported for review.
 */
const codemod: Codemod<TSX> = (root) => {
  const rootNode = root.root();
  const run: Run = {
    root,
    rootNode,
    imports: new CoreImports(rootNode),
    edits: new EditSet(),
  };
  const members = rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: {
        field: 'property',
        regex:
          '^(STACK|ORTHOGRAPHIC|PERSPECTIVE|PLANAR_NEXT|VOLUME_3D_NEXT|VIDEO_NEXT|WHOLE_SLIDE_NEXT|ECG_NEXT)$',
      },
    },
  });

  for (const node of members) {
    const member = node.field('property').text();

    if (isCoreEnum(node.field('object'), 'ViewportType')) {
      rewriteMember(run, node, member);
    }
  }

  const strings = rootNode.findAll({
    rule: {
      kind: 'string',
      regex: `^['"](${[...LEGACY_STRINGS, ...Object.keys(NEXT_STRINGS)].join('|')})['"]$`,
    },
  });

  for (const node of strings) {
    rewriteString(run, node, node.text().slice(1, -1));
  }

  const typePairs = rootNode.findAll({
    rule: { kind: 'pair', has: { field: 'key', regex: '^type$' } },
  });

  for (const pair of typePairs) {
    reportInputOptions(run, pair);
  }

  rewriteDestructured(run);
  reportBracketMembers(run);
  reportMergedReturns(run);
  reportMergedOperands(run);

  if (!run.edits.all().length) {
    return null;
  }

  return rootNode.commitEdits([...run.edits.all(), ...run.imports.edits()]);
};

export default analysed(codemod, manual, review);
