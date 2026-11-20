import type { Codemod, SgRoot } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';
import { useMetricAtom } from 'codemod:metrics';
import {
  EditSet,
  importSource,
  isNameTaken,
  referencesOf,
  site,
} from './lib.ts';
import type { Node } from './lib.ts';

/** Sites that the reader changes. */
const manual = useMetricAtom('cornerstone3d-6-manual');

/** The package of the tools. */
const TOOLS_PACKAGE = '@cornerstonejs/tools';

/** The modules of the tools that 6.0 moves, with the names each keeps. */
const MOVED_MODULES: Record<
  string,
  { path: string; names: Record<string, string> }
> = {
  [`${TOOLS_PACKAGE}/tools/displayTools/Labelmap/labelmapRenderPlan/legacyVolumePlan`]:
    {
      path: `${TOOLS_PACKAGE}/tools/displayTools/Labelmap/labelmapRenderPlan/volumeLabelmapPlan`,
      names: { createLegacyVolumeLabelmapPlan: 'createVolumeLabelmapPlan' },
    },
  [`${TOOLS_PACKAGE}/segmentation/labelmapModel/labelmapLegacyAdapter`]: {
    path: `${TOOLS_PACKAGE}/segmentation/labelmapModel/labelmapPrimaryLayerFields`,
    names: {
      syncLegacyLabelmapData: 'syncLegacyLabelmapData',
      getReferencedImageIdToCurrentImageIdMap:
        'getReferencedImageIdToCurrentImageIdMap',
    },
  },
};

/** The modules of the tools whose names 6.0 removes; `*` for the whole module. */
const REMOVED_NAMES: Record<string, string[] | '*'> = {
  [`${TOOLS_PACKAGE}/tools/displayTools/Labelmap/addVolumesAsIndependentComponents`]:
    '*',
  [`${TOOLS_PACKAGE}/tools/displayTools/Labelmap/volumeLabelmapImageMapper`]: [
    'removeVolumeLabelmapImageMapperActors',
  ],
  [`${TOOLS_PACKAGE}/utilities/genericViewportToolHelpers`]: [
    'getSlabThicknessOrDefault',
  ],
  [`${TOOLS_PACKAGE}/utilities/viewportCapabilities`]: [
    'viewportSupportsStackCompatibility',
    'StackCompatibilityViewport',
  ],
  [`${TOOLS_PACKAGE}/utilities/spatial/rotateViewportAroundWorldPoint`]: '*',
};

/**
 * The state of one run of the transform on a file.
 */
interface Run {
  root: SgRoot<TSX>;
  rootNode: Node;
  edits: EditSet;
}

/**
 * Returns the named specifiers of an import statement, or undefined when it
 * has a default or a namespace import.
 */
function namedSpecifiers(statement: Node): Node[] | undefined {
  const clause = statement
    .children()
    .find((child) => child.kind() === 'import_clause');

  if (!clause) {
    return [];
  }

  if (clause.children().some((child) => child.kind() !== 'named_imports')) {
    return undefined;
  }

  return clause.findAll({ rule: { kind: 'import_specifier' } });
}

/**
 * Moves an import of a module of the tools to its 6.0 path, with its names
 * and their uses. A renamed name keeps its old local name through `as` when
 * the new name is taken in the file or a use is not a plain name, such as a
 * shorthand property. Reports a statement with a name the move does not
 * know.
 */
function moveImport(
  run: Run,
  statement: Node,
  move: { path: string; names: Record<string, string> }
): void {
  const specifiers = namedSpecifiers(statement);
  const unknown = specifiers?.find(
    (specifier) => !move.names[specifier.field('name')?.text() ?? '']
  );

  if (!specifiers || unknown) {
    manual.increment(
      site(
        run.root,
        `import of ${importSource(statement)}`,
        unknown ?? statement
      )
    );

    return;
  }

  const source = statement.field('source');
  const quote = source.text()[0];

  run.edits.add(source.replace(`${quote}${move.path}${quote}`));

  for (const specifier of specifiers) {
    const nameNode = specifier.field('name');
    const name = nameNode.text();
    const newName = move.names[name];

    if (newName === name) {
      continue;
    }

    if (specifier.field('alias')) {
      run.edits.add(nameNode.replace(newName));
      continue;
    }

    const uses = referencesOf(nameNode);
    const keepLocal =
      isNameTaken(run.rootNode, newName) ||
      uses.some((use) => use.kind() !== 'identifier');

    if (keepLocal) {
      run.edits.add(nameNode.replace(`${newName} as ${name}`));
      continue;
    }

    run.edits.add(
      nameNode.replace(newName),
      ...uses.map((use) => use.replace(newName))
    );
  }
}

/**
 * Moves a re-export of a module of the tools to its 6.0 path. A renamed name
 * keeps its public name through `as`. Reports `export *`, which takes every
 * name of the module, and a statement with a name the move does not know.
 */
function moveReExport(
  run: Run,
  statement: Node,
  move: { path: string; names: Record<string, string> }
): void {
  const clause = statement
    .children()
    .find((child) => child.kind() === 'export_clause');
  const specifiers =
    clause?.findAll({ rule: { kind: 'export_specifier' } }) ?? [];
  const unknown = specifiers.find(
    (specifier) => !move.names[specifier.field('name')?.text() ?? '']
  );

  if (!clause || unknown) {
    manual.increment(
      site(
        run.root,
        `export of ${importSource(statement)}`,
        unknown ?? statement
      )
    );

    return;
  }

  const source = statement.field('source');
  const quote = source.text()[0];

  run.edits.add(source.replace(`${quote}${move.path}${quote}`));

  for (const specifier of specifiers) {
    const nameNode = specifier.field('name');
    const name = nameNode.text();
    const newName = move.names[name];

    if (newName === name) {
      continue;
    }

    run.edits.add(
      specifier.field('alias')
        ? nameNode.replace(newName)
        : specifier.replace(`${newName} as ${name}`)
    );
  }
}

/**
 * Reports a re-export of a module of the tools whose names 6.0 removes:
 * each removed name, or the statement for `export *` and a module that
 * 6.0 removes whole.
 */
function reportRemovedReExport(
  run: Run,
  statement: Node,
  names: string[] | '*'
): void {
  const clause = statement
    .children()
    .find((child) => child.kind() === 'export_clause');

  if (names === '*' || !clause) {
    manual.increment(
      site(run.root, `export of ${importSource(statement)}`, statement)
    );

    return;
  }

  for (const specifier of clause.findAll({
    rule: { kind: 'export_specifier' },
  })) {
    const name = specifier.field('name')?.text() ?? '';

    if (names.includes(name)) {
      manual.increment(site(run.root, name, specifier));
    }
  }
}

/**
 * Reports an import of a module of the tools whose names 6.0 removes.
 */
function reportRemoved(run: Run, statement: Node, names: string[] | '*'): void {
  const source = importSource(statement);

  if (names === '*') {
    manual.increment(site(run.root, `import of ${source}`, statement));

    return;
  }

  const specifiers = namedSpecifiers(statement);

  if (!specifiers) {
    manual.increment(site(run.root, `import of ${source}`, statement));

    return;
  }

  for (const specifier of specifiers) {
    const name = specifier.field('name')?.text() ?? '';

    if (names.includes(name)) {
      manual.increment(site(run.root, name, specifier));
    }
  }
}

/**
 * Tells whether an identifier is the `utilities` of the tools, or the
 * namespace import of the tools.
 */
function isToolsBinding(identifier: Node, name: string): boolean {
  const target = identifier.definition()?.node;
  const holder = target?.kind() === 'identifier' ? target.parent() : target;
  const statement = holder
    ?.ancestors()
    .find((ancestor) => ancestor.kind() === 'import_statement');

  if (!statement || importSource(statement) !== TOOLS_PACKAGE) {
    return false;
  }

  if (holder.kind() === 'import_specifier') {
    return holder.field('name')?.text() === name;
  }

  return (
    holder
      .ancestors()
      .some((ancestor) => ancestor.kind() === 'namespace_import') ||
    holder.kind() === 'namespace_import'
  );
}

/**
 * Reports `utilities.spatial.rotateViewportAroundWorldPoint` of the tools.
 */
function reportRotateViewport(run: Run): void {
  const members = run.rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: { field: 'property', regex: '^rotateViewportAroundWorldPoint$' },
    },
  });

  for (const member of members) {
    const spatial = member.field('object');
    const utilities =
      spatial?.kind() === 'member_expression'
        ? spatial.field('object')
        : undefined;
    const root =
      utilities?.kind() === 'member_expression'
        ? utilities.field('object')
        : utilities;
    const isTools =
      spatial?.field('property')?.text() === 'spatial' &&
      root?.kind() === 'identifier' &&
      (isToolsBinding(root, 'utilities') || isToolsBinding(root, '*'));

    if (isTools) {
      manual.increment(
        site(run.root, 'rotateViewportAroundWorldPoint', member)
      );
    }
  }
}

/**
 * Moves the two modules of the tools that 6.0 renames to their new paths
 * (`labelmapRenderPlan/legacyVolumePlan` and
 * `labelmapModel/labelmapLegacyAdapter`), and reports the names of the tools
 * that 6.0 removes.
 */
const codemod: Codemod<TSX> = (root) => {
  const rootNode = root.root();
  const run: Run = { root, rootNode, edits: new EditSet() };

  for (const statement of rootNode
    .children()
    .filter((child) => child.kind() === 'import_statement')) {
    const source = importSource(statement) ?? '';

    if (MOVED_MODULES[source]) {
      moveImport(run, statement, MOVED_MODULES[source]);
    } else if (REMOVED_NAMES[source]) {
      reportRemoved(run, statement, REMOVED_NAMES[source]);
    }
  }

  for (const statement of rootNode
    .children()
    .filter((child) => child.kind() === 'export_statement')) {
    const source = importSource(statement) ?? '';

    if (MOVED_MODULES[source]) {
      moveReExport(run, statement, MOVED_MODULES[source]);
    } else if (REMOVED_NAMES[source]) {
      reportRemovedReExport(run, statement, REMOVED_NAMES[source]);
    }
  }

  reportRotateViewport(run);

  if (!run.edits.all().length) {
    return null;
  }

  return rootNode.commitEdits(run.edits.all());
};

export default codemod;
