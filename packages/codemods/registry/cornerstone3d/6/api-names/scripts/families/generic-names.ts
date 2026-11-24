import { CORE_PACKAGE, importSource } from '../lib.ts';
import type { Node } from '../lib.ts';
import { noteRewritten, report } from '../rules.ts';
import type { ExportRule, Rules, Run } from '../rules.ts';

const TOOLS_PACKAGE = '@cornerstonejs/tools';

const NEXT_VIEWPORT_TYPES: Record<string, string> = {
  PLANAR_NEXT: 'PLANAR',
  VOLUME_3D_NEXT: 'VOLUME_3D',
  VIDEO_NEXT: 'VIDEO',
  WHOLE_SLIDE_NEXT: 'WHOLE_SLIDE',
  ECG_NEXT: 'ECG',
};

/** The text of the guide row of `utilities.isGenericViewport`, word for word. */
const IS_GENERIC_VIEWPORT =
  'true for every viewport in 6.0: delete the test and the branch for the other case';

/** The text of the guide row of `renderingEngineExportsV2`, word for word. */
const RENDERING_ENGINE_EXPORTS_V2 =
  'import each class and function from @cornerstonejs/core by its own name';

/**
 * Generic names: every `Generic*` name of 6.0.0-beta.2 and its final name,
 * such as `GenericViewport` and `IGenericViewport` (lane N1). The 5.x
 * strings `'planarNext'` and its kin are not here: the `viewport-types` step
 * rewrites them.
 */
export const rules: Rules = {
  exports: [
    { name: 'GenericViewport', to: 'BaseViewport' },
    { name: 'GenericVolumeViewport3D', to: 'VolumeViewport3D' },
    { name: 'VideoGenericViewport', to: 'VideoViewport' },
    { name: 'WSIGenericViewport', to: 'WSIViewport' },
    { name: 'ECGGenericViewport', to: 'ECGViewport' },
    { namespace: 'Types', name: 'IGenericViewport', to: 'IViewport' },
    {
      namespace: 'utilities',
      name: 'resolveGenericViewportVolumeId',
      to: 'resolveViewportVolumeId',
    },
    {
      namespace: 'utilities',
      name: 'isGenericViewport',
      manual: IS_GENERIC_VIEWPORT,
    },
    { name: 'renderingEngineExportsV2', manual: RENDERING_ENGINE_EXPORTS_V2 },
    ...Object.entries(NEXT_VIEWPORT_TYPES).flatMap(
      ([name, to]): ExportRule[] => [
        { namespace: 'Enums.ViewportType', name, to },
        { namespace: 'Enums.ViewportTypes', name, to },
      ]
    ),
  ],
  members: [],
  keys: [],
};

/**
 * The names of this family that a subpath of the core exports, with the
 * name to use instead. The tables read the members of `Types` and
 * `utilities` on the top of the core only.
 */
const SUBPATH_NAMES: Record<string, Record<string, string>> = {
  [`${CORE_PACKAGE}/types`]: { IGenericViewport: 'use Types.IViewport' },
  [`${CORE_PACKAGE}/utilities`]: {
    isGenericViewport: IS_GENERIC_VIEWPORT,
    resolveGenericViewportVolumeId: 'use utilities.resolveViewportVolumeId',
  },
};

/**
 * The modules of a subpath of a package that 6.0 renamed, with their new
 * path and the names in them that changed (`@cornerstonejs/core/utilities/*`,
 * `@cornerstonejs/tools/utilities/*` and `@cornerstonejs/tools/tools/*` are
 * entry points of the packages).
 */
const MOVED_MODULES: Record<
  string,
  { to: string; names: Record<string, string> }
> = {
  [`${CORE_PACKAGE}/utilities/resolveGenericViewportVolumeId`]: {
    to: `${CORE_PACKAGE}/utilities/resolveViewportVolumeId`,
    names: { resolveGenericViewportVolumeId: 'resolveViewportVolumeId' },
  },
  [`${TOOLS_PACKAGE}/utilities/genericViewportToolHelpers`]: {
    to: `${TOOLS_PACKAGE}/utilities/viewportToolHelpers`,
    names: {},
  },
  [`${TOOLS_PACKAGE}/tools/displayTools/Labelmap/labelmapRenderPlan/planarGenericVolumeLabelmap`]:
    {
      to: `${TOOLS_PACKAGE}/tools/displayTools/Labelmap/labelmapRenderPlan/planarVolumeLabelmap`,
      names: {
        addLabelmapToPlanarGenericViewport: 'addLabelmapToPlanarVolumeViewport',
        isPlanarNextVolumeViewport: 'isPlanarVolumeViewport',
        PlanarNextVolumeViewport: 'PlanarVolumeViewport',
      },
    },
  [`${TOOLS_PACKAGE}/tools/displayTools/Labelmap/labelmapRenderPlan/volume3DNextLabelmap`]:
    {
      to: `${TOOLS_PACKAGE}/tools/displayTools/Labelmap/labelmapRenderPlan/volume3DLabelmap`,
      names: {
        addLabelmapToVolume3DNextViewport: 'addLabelmapToVolume3DViewport',
        isVolume3DNextViewport: 'isVolume3DViewport',
      },
    },
};

/** The modules of a subpath that 6.0 deleted, with what to use instead. */
const DELETED_MODULES: Record<string, string> = {
  [`${CORE_PACKAGE}/types/IGenericViewport`]: 'use Types.IViewport',
};

/** The import and export statements of a file that name a module. */
function moduleStatements(run: Run): Node[] {
  return run.rootNode
    .findAll({
      rule: {
        any: [{ kind: 'import_statement' }, { kind: 'export_statement' }],
      },
    })
    .filter((statement) => importSource(statement));
}

/**
 * Gives the path of a module without its `.js` extension, the key of
 * `MOVED_MODULES` and `DELETED_MODULES`.
 */
function modulePath(statement: Node): string {
  return (importSource(statement) ?? '').replace(/\.js$/, '');
}

/**
 * Rewrites the path of each import and re-export of a renamed module, and
 * each renamed name in it, which keeps its local or public name through
 * `as` (`import { resolveViewportVolumeId as resolveGenericViewportVolumeId }`).
 * A namespace import of a module whose names changed is reported. Reports
 * each import of a deleted module. Gives the statements that it took.
 */
function rewriteModulePaths(run: Run): Set<number> {
  const taken = new Set<number>();

  for (const statement of moduleStatements(run)) {
    const path = modulePath(statement);
    const moved = MOVED_MODULES[path];

    if (DELETED_MODULES[path]) {
      taken.add(statement.id());
      report(
        run,
        'manual',
        `${path}: the module is deleted, ${DELETED_MODULES[path]}`,
        statement
      );
      continue;
    }

    if (!moved) {
      continue;
    }

    taken.add(statement.id());

    const sourceNode = statement.field('source');
    const quote = sourceNode.text()[0];
    const extension = importSource(statement).endsWith('.js') ? '.js' : '';

    run.edits.add(
      sourceNode.replace(`${quote}${moved.to}${extension}${quote}`)
    );
    noteRewritten(run, `${path}: ${moved.to}`, sourceNode);

    if (
      Object.keys(moved.names).length &&
      statement.find({ rule: { kind: 'namespace_import' } })
    ) {
      report(
        run,
        'manual',
        `${path}: a namespace import, ${Object.entries(moved.names)
          .map(([name, to]) => `${name} is ${to}`)
          .join(', ')}`,
        statement
      );
    }

    for (const specifier of statement.findAll({
      rule: {
        any: [{ kind: 'import_specifier' }, { kind: 'export_specifier' }],
      },
    })) {
      const nameNode = specifier.field('name');
      const name = nameNode?.text() ?? '';
      const to = moved.names[name];

      if (!to) {
        continue;
      }

      run.edits.add(
        nameNode.replace(specifier.field('alias') ? to : `${to} as ${name}`)
      );
      noteRewritten(run, `${name}: ${to}`, nameNode);
    }
  }

  return taken;
}

/**
 * Reports each name of this family that a file imports or re-exports from a
 * subpath of the core (`import type { IGenericViewport } from
 * '@cornerstonejs/core/types'`), with the name to use instead. A statement
 * that `rewriteModulePaths` took is left.
 */
function reportSubpathNames(run: Run, taken: Set<number>): void {
  for (const statement of moduleStatements(run)) {
    const source = importSource(statement) ?? '';
    const subpath = Object.keys(SUBPATH_NAMES).find(
      (path) => source === path || source.startsWith(`${path}/`)
    );

    if (!subpath || taken.has(statement.id())) {
      continue;
    }

    for (const specifier of statement.findAll({
      rule: {
        any: [{ kind: 'import_specifier' }, { kind: 'export_specifier' }],
      },
    })) {
      const name = specifier.field('name')?.text() ?? '';
      const instead = SUBPATH_NAMES[subpath][name];

      if (instead) {
        report(
          run,
          'manual',
          `${name}: imported from ${source}, ${instead}`,
          specifier
        );
      }
    }
  }
}

/**
 * The rewrites of this family that no table entry says. They run before the
 * tables of every family; a site they rewrite or report is marked handled
 * (`run.handled`), and the tables leave it.
 */
export function rewrite(run: Run): void {
  reportSubpathNames(run, rewriteModulePaths(run));
}
