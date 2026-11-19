import type { Codemod, SgRoot } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';
import { useMetricAtom } from 'codemod:metrics';
import {
  CoreImports,
  EditSet,
  indentOf,
  isCoreEnum,
  isViewportExpression,
  objectEntries,
  site,
  unwrap,
} from './lib.ts';
import type { Node } from './lib.ts';

/** Sites that the reader changes. */
const manual = useMetricAtom('cornerstone3d-6-manual');

/** Rewrites at a decision of the migration guide. */
const review = useMetricAtom('cornerstone3d-6-review');

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
 * Tells whether an object literal is a viewport input.
 */
function isViewportInput(objectNode: Node): boolean {
  const { keys } = objectEntries(objectNode);

  return INPUT_KEYS.some((key) => keys.includes(key));
}

/**
 * Returns the other operand of an equality test when it is `<viewport>.type`.
 */
function comparedViewport(
  node: Node
): { binary: Node; viewport: Node; operator: string } | undefined {
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

  if (
    other?.kind() !== 'member_expression' ||
    other.field('property')?.text() !== 'type' ||
    !isViewportExpression(other.field('object'))
  ) {
    return undefined;
  }

  return { binary, viewport: other.field('object'), operator };
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

  const enums = run.imports.ensure('Enums');

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

  if (comparison) {
    const mode = MODE_OF_LEGACY[member];
    const operator = comparison.operator.startsWith('!') ? '!==' : '===';

    run.edits.add(
      comparison.binary.replace(
        `${comparison.viewport.text()}.getCurrentMode() ${operator} '${mode}'`
      )
    );

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
 * Rewrites one string that names a removed or deprecated viewport type.
 */
function rewriteString(run: Run, node: Node, value: string): void {
  const quote = node.text()[0];
  const comparison = comparedViewport(node);

  if (comparison) {
    if (NEXT_STRINGS[value]) {
      run.edits.add(node.replace(`${quote}${NEXT_STRINGS[value]}${quote}`));
    } else if (MODE_OF_LEGACY[value]) {
      const operator = comparison.operator.startsWith('!') ? '!==' : '===';

      run.edits.add(
        comparison.binary.replace(
          `${comparison.viewport.text()}.getCurrentMode() ${operator} '${MODE_OF_LEGACY[value]}'`
        )
      );
    } else {
      manual.increment(site(run.root, `'${value}'`, node));
    }

    return;
  }

  const typePair = typePairOf(node);
  const isInput = typePair && isViewportInput(typePair.pair.parent());

  if (!isInput) {
    if (NEXT_STRINGS[value]) {
      manual.increment(site(run.root, `'${value}'`, node));
    }

    return;
  }

  if (NEXT_STRINGS[value]) {
    run.edits.add(node.replace(`${quote}${NEXT_STRINGS[value]}${quote}`));

    return;
  }

  if (value === 'perspective') {
    manual.increment(site(run.root, `'${value}'`, node));

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
 * itself.
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

  for (const key of ['displayArea', 'aspectRatio']) {
    const entry = pairs.get(key) ?? (shorthand.has(key) ? options : undefined);

    if (entry) {
      manual.increment(site(run.root, `defaultOptions.${key}`, entry));
    }
  }
}

/**
 * Rewrites the removed and deprecated viewport types of Cornerstone3D 5.x:
 * `STACK` and `ORTHOGRAPHIC` in a viewport input become `PLANAR`, a comparison
 * with `viewport.type` asks for the content mode, the `_NEXT` members and
 * the `*Next` strings get their plain names. `PERSPECTIVE` and every other
 * site are reported.
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

  if (!run.edits.all().length) {
    return null;
  }

  return rootNode.commitEdits([...run.edits.all(), ...run.imports.edits()]);
};

export default codemod;
