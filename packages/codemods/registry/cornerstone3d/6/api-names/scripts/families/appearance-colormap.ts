import {
  declarationNodeOf,
  indentOf,
  removeProperty,
  stableBinding,
  staticKeyName,
  unwrap,
} from '../lib.ts';
import type { Node } from '../lib.ts';
import {
  entryOf,
  noteRewritten,
  objectAtPath,
  placeObjects,
  report,
} from '../rules.ts';
import type { KeyPlace, Run } from '../rules.ts';
import { importsCornerstone } from './display-sets.ts';

/** The text of a report of `colormap.opacity`, word for word in the guide. */
export const COLORMAP_OPACITY =
  'colormap.opacity is gone: a number is the opacity of the appearance (opacity beside the colormap), a list of { value, opacity } points is colormap.opacityMapping';

/** The text of a read of `colormap.opacity`, word for word in the guide. */
const COLORMAP_OPACITY_READ =
  'colormap.opacity is gone: read the opacity of the appearance (opacity) and the points of colormap.opacityMapping';

/** The most entries of one `setDisplaySets` call that the step reads. */
const MOUNT_ENTRIES = 8;

/** The methods that take an appearance, under the names of 6.0 and of 6.0.0-beta.2. */
const APPEARANCE_METHODS = [
  'setDisplaySetAppearance',
  'setDisplaySetPresentation',
];

/**
 * The places where an object literal is an appearance: the patch of a
 * method of the look (the first or the second argument), the appearance of
 * a mount entry, and a value typed with the appearance type of a viewport
 * that has a colormap. Each with the keys from the literal to the
 * appearance.
 */
const APPEARANCE_PLACES: { place: KeyPlace; path: string[] }[] = [
  ...APPEARANCE_METHODS.flatMap((method) =>
    [0, 1].map((argument) => ({
      place: { receiver: 'viewport' as const, method, argument },
      path: [],
    }))
  ),
  {
    place: { receiver: 'viewport', method: 'addDisplaySet', argument: 1 },
    path: ['appearance'],
  },
  ...Array.from({ length: MOUNT_ENTRIES }, (_, argument) => ({
    place: {
      receiver: 'viewport' as const,
      method: 'setDisplaySets',
      argument,
    },
    path: ['options', 'appearance'],
  })),
  { place: { type: 'PlanarDisplaySetAppearance' }, path: [] },
  { place: { type: 'Volume3DDisplaySetAppearance' }, path: [] },
];

/** The types of a colormap of an appearance, of 6.0 and of 6.0.0-beta.2. */
const COLORMAP_PLACES: KeyPlace[] = [
  { type: 'AppearanceColormap' },
  { type: 'ColormapPublic' },
];

/** The calls that give an array. */
const ARRAY_METHODS = new Set(['map', 'filter', 'slice', 'concat', 'flatMap']);

/**
 * The literal that an expression holds: the expression, or the value of the
 * `const` that a name refers to, through parentheses and casts.
 */
function heldLiteral(
  node: Node | null | undefined,
  depth = 0
): Node | undefined {
  if (!node || depth > 2) {
    return undefined;
  }

  const inner = unwrap(node);
  const kind = inner.kind();

  if (kind !== 'identifier' && kind !== 'shorthand_property_identifier') {
    return inner;
  }

  const declaration = stableBinding(inner);
  const holder = declaration?.parent();
  const value =
    holder?.kind() === 'variable_declarator' &&
    holder.field('name')?.id() === declaration.id()
      ? holder.field('value')
      : undefined;

  return value ? heldLiteral(value, depth + 1) : undefined;
}

/**
 * What a value of `colormap.opacity` is: a number, a list of points, or
 * unknown.
 */
function opacityKind(value: Node | undefined): 'number' | 'list' | undefined {
  const literal = heldLiteral(value);
  const kind = literal?.kind();

  if (kind === 'number') {
    return 'number';
  }

  if (kind === 'unary_expression' && /^[-+]\s*[\d.]/.test(literal.text())) {
    return 'number';
  }

  if (kind === 'array') {
    return 'list';
  }

  if (kind !== 'call_expression') {
    return undefined;
  }

  const callee = unwrap(literal.field('function'));
  const property = callee?.field('property')?.text() ?? '';

  if (callee?.kind() === 'member_expression' && ARRAY_METHODS.has(property)) {
    return 'list';
  }

  return callee?.text() === 'Array.from' || callee?.text() === 'Array.of'
    ? 'list'
    : undefined;
}

/** The entry of `opacity` of a colormap literal and its value. */
function opacityEntryOf(
  colormap: Node
): { entry: Node; keyNode: Node; value?: Node } | undefined {
  const found = entryOf(colormap, 'opacity');

  if (!found || found.entry.kind() === 'method_definition') {
    return undefined;
  }

  return {
    ...found,
    value:
      found.entry.kind() === 'pair'
        ? (found.entry.field('value') ?? undefined)
        : found.entry,
  };
}

/**
 * The pair `colormap: <literal>` of an appearance literal whose value is
 * that colormap literal, or undefined when the colormap comes from a name.
 */
function colormapPairOf(appearance: Node, colormap: Node): Node | undefined {
  const found = entryOf(appearance, 'colormap');
  const value =
    found?.entry.kind() === 'pair' ? found.entry.field('value') : undefined;

  return value && unwrap(value).id() === colormap.id()
    ? found.entry
    : undefined;
}

/** The colormap literal of an appearance literal, inline or held by a `const`. */
function colormapLiteralOf(appearance: Node): Node | undefined {
  const found = entryOf(appearance, 'colormap');

  if (!found || found.entry.kind() === 'method_definition') {
    return undefined;
  }

  const literal = heldLiteral(
    found.entry.kind() === 'pair' ? found.entry.field('value') : found.entry
  );

  return literal?.kind() === 'object' ? literal : undefined;
}

/**
 * The spread elements of an object literal whose value has an `opacity` by
 * the type that the file gives it: a name declared with an object type of
 * the application that has the member `opacity`.
 */
function spreadsWithOpacity(object: Node): Node[] {
  return object.children().filter((child) => {
    if (child.kind() !== 'spread_element') {
      return false;
    }

    const argument = unwrap(
      child.children().find((part) => part.isNamed()) ?? child
    );
    const declaration =
      argument.kind() === 'identifier'
        ? declarationNodeOf(argument)
        : undefined;
    const annotation = declaration
      ?.parent()
      ?.children()
      .find((part) => part.kind() === 'type_annotation');

    return Boolean(
      annotation
        ?.findAll({ rule: { kind: 'property_signature' } })
        .some((member) => staticKeyName(member.field('name')) === 'opacity')
    );
  });
}

/**
 * Rewrites the `opacity` of one colormap literal: a list becomes
 * `opacityMapping`; a number moves to the appearance literal that holds the
 * colormap (`appearance`) as its `opacity`. Reports what it cannot rewrite,
 * and a spread whose type has an `opacity`.
 */
function rewriteColormapLiteral(
  run: Run,
  colormap: Node,
  appearance: Node | undefined
): void {
  for (const spread of spreadsWithOpacity(colormap)) {
    if (!run.handled.has(spread.range().start.index)) {
      report(
        run,
        'manual',
        `colormap.opacity: the spread gives the colormap an opacity, ${COLORMAP_OPACITY}`,
        spread
      );
    }
  }

  const found = opacityEntryOf(colormap);

  if (!found || run.handled.has(found.keyNode.range().start.index)) {
    return;
  }

  const { entry, keyNode, value } = found;
  const kind = opacityKind(value);
  const manual = (reason: string) =>
    report(
      run,
      'manual',
      `colormap.opacity: ${reason}, ${COLORMAP_OPACITY}`,
      entry
    );

  run.handled.add(keyNode.range().start.index);

  if (kind === 'list') {
    if (entryOf(colormap, 'opacityMapping')) {
      manual('the colormap has an opacityMapping too');
      return;
    }

    const edit =
      entry.kind() === 'shorthand_property_identifier'
        ? entry.replace(`opacityMapping: ${entry.text()}`)
        : keyNode.replace('opacityMapping');

    if (run.edits.add(edit)) {
      noteRewritten(run, 'colormap.opacity -> colormap.opacityMapping', entry);
    } else {
      manual('another rewrite of the line overlaps it');
    }

    return;
  }

  if (kind !== 'number') {
    manual('its value is not a number or a list that the file shows');
    return;
  }

  const holder = appearance && colormapPairOf(appearance, colormap);

  if (!holder) {
    manual(
      'a number goes to the opacity of the appearance, which the file does not show here'
    );
    return;
  }

  if (entryOf(appearance, 'opacity')) {
    manual('the appearance has an opacity too, choose one');
    return;
  }

  const opacityText =
    entry.kind() === 'shorthand_property_identifier'
      ? entry.text()
      : `opacity: ${value.text()}`;
  const others = colormap
    .children()
    .filter(
      (child) =>
        child.isNamed() &&
        child.kind() !== 'comment' &&
        child.id() !== entry.id()
    );
  const edits = others.length
    ? [
        removeProperty(entry),
        {
          startPos: holder.range().end.index,
          endPos: holder.range().end.index,
          insertedText:
            holder.range().start.line > appearance.range().start.line
              ? `,\n${indentOf(run.rootNode, holder)}${opacityText}`
              : `, ${opacityText}`,
        },
      ]
    : [holder.replace(opacityText)];

  if (run.edits.add(...edits)) {
    noteRewritten(run, 'colormap.opacity -> opacity', entry);
  } else {
    manual('another rewrite of the line overlaps it');
  }
}

/** The object literals of a value: itself, or each branch of a `? :`. */
function objectLiteralsOf(value: Node): Node[] {
  const inner = unwrap(value);

  if (inner.kind() === 'object') {
    return [inner];
  }

  if (inner.kind() !== 'ternary_expression') {
    return [];
  }

  return [inner.field('consequence'), inner.field('alternative')]
    .filter(Boolean)
    .flatMap((branch) => objectLiteralsOf(branch));
}

/**
 * Tells whether an identifier is bound to the colormap of an object: a
 * destructured key `colormap`, or a `const` that holds a `.colormap` read.
 */
function isColormapBinding(identifier: Node): boolean {
  const declaration = declarationNodeOf(identifier);
  const holder = declaration?.parent();
  const kind = declaration?.kind() ?? '';

  if (kind === 'shorthand_property_identifier_pattern') {
    return declaration.text() === 'colormap';
  }

  if (holder?.kind() === 'pair_pattern') {
    return staticKeyName(holder.field('key')) === 'colormap';
  }

  if (holder?.kind() !== 'variable_declarator') {
    return false;
  }

  const value = holder.field('value');
  const inner = value ? unwrap(value) : undefined;

  return (
    inner?.kind() === 'member_expression' &&
    inner.field('property')?.text() === 'colormap'
  );
}

/**
 * Reports, in a file that imports Cornerstone, a `colormap` literal with an
 * `opacity` that no place shows to reach Cornerstone, and each read of
 * `.colormap.opacity` or of the `opacity` of a colormap that the file took
 * from an object.
 */
function reportUnprovenColormapOpacity(run: Run): void {
  if (!importsCornerstone(run)) {
    return;
  }

  for (const holder of run.rootNode.findAll({
    rule: { any: [{ kind: 'pair' }, { kind: 'variable_declarator' }] },
  })) {
    const named =
      holder.kind() === 'pair'
        ? staticKeyName(holder.field('key')) === 'colormap'
        : /colormap$/i.test(holder.field('name')?.text() ?? '');
    const value = holder.field('value');

    if (!named || !value) {
      continue;
    }

    for (const colormap of objectLiteralsOf(value)) {
      const found = opacityEntryOf(colormap);

      if (found && !run.handled.has(found.keyNode.range().start.index)) {
        run.handled.add(found.keyNode.range().start.index);
        report(
          run,
          'manual',
          `colormap.opacity: the file does not show that the object reaches Cornerstone, ${COLORMAP_OPACITY}`,
          found.entry
        );
      }
    }
  }

  for (const member of run.rootNode.findAll({
    rule: { kind: 'member_expression' },
  })) {
    if (member.field('property')?.text() !== 'opacity') {
      continue;
    }

    const object = unwrap(member.field('object'));
    const readsColormap =
      (object.kind() === 'member_expression' &&
        object.field('property')?.text() === 'colormap') ||
      (object.kind() === 'identifier' && isColormapBinding(object));

    if (readsColormap && !run.handled.has(member.range().start.index)) {
      report(
        run,
        'manual',
        `colormap.opacity: ${COLORMAP_OPACITY_READ}`,
        member
      );
    }
  }
}

/**
 * Rewrites `colormap.opacity` in the literals that the file shows to reach
 * Cornerstone as an appearance (decision 2B of 6.0: one opacity):
 * `colormap: { opacity: <number> }` becomes `opacity: <number>` beside the
 * colormap, and `colormap: { opacity: [...] }` becomes
 * `colormap: { opacityMapping: [...] }`. A literal typed as a colormap of an
 * appearance gets the list rewrite; its number is reported. What the file
 * does not show is reported.
 */
export function rewriteColormapOpacity(run: Run): void {
  for (const { place, path } of APPEARANCE_PLACES) {
    for (const { object, evidence } of placeObjects(run, place)) {
      const appearance = path.length ? objectAtPath(object, path) : object;
      const colormap = appearance ? colormapLiteralOf(appearance) : undefined;

      const found = colormap ? opacityEntryOf(colormap) : undefined;

      if (colormap && evidence === 'proven') {
        rewriteColormapLiteral(run, colormap, appearance);
      } else if (
        found &&
        evidence === 'name' &&
        !run.handled.has(found.keyNode.range().start.index)
      ) {
        run.handled.add(found.keyNode.range().start.index);
        report(
          run,
          'manual',
          `colormap.opacity: a viewport by its name only, ${COLORMAP_OPACITY}`,
          found.entry
        );
      }
    }
  }

  for (const place of COLORMAP_PLACES) {
    for (const { object } of placeObjects(run, place)) {
      rewriteColormapLiteral(run, object, undefined);
    }
  }

  reportUnprovenColormapOpacity(run);
}
