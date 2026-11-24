import type { MemberRule, Rules, Run } from '../rules.ts';
import { importsCornerstone, reportMembersOfTypes } from './display-sets.ts';
import type { TypeMembers } from './display-sets.ts';

/**
 * Viewport members and queries: `getVolumeIds()`, `getScalarRange`,
 * `getDisplaySetIdForVolumeId`, `isInAcquisitionPlane()` and the
 * `geometry3d` content mode (lane RM2). Only the reverse lookup of a volume
 * is a rename; the others are new and need no rule.
 */

/** The members of a viewport that 6.0 renames, with their names in 6.0. */
const RENAMED_MEMBERS: Record<string, string> = {
  findDataIdByVolumeId: 'getDisplaySetIdForVolumeId',
};

/** The core types of a viewport, of 6.0 and of 6.0.0-beta.2. */
const VIEWPORT_TYPES = new Set([
  'IViewport',
  'IGenericViewport',
  'BaseViewport',
  'GenericViewport',
  'PlanarViewport',
  'VolumeViewport3D',
]);

/** The renamed members as a type of the application may declare them. */
const RENAMED_TYPE_MEMBERS: TypeMembers = Object.fromEntries(
  Object.entries(RENAMED_MEMBERS).map(([name, to]) => [
    name,
    { types: VIEWPORT_TYPES, text: `its name in 6.0 is ${to}` },
  ])
);

export const rules: Rules = {
  exports: [],
  members: Object.entries(RENAMED_MEMBERS).map(
    ([name, to]): MemberRule => ({
      receiver: 'viewport',
      name,
      to,
      manual: `its name in 6.0 is ${to}`,
    })
  ),
  keys: [],
};

/**
 * The rewrites of this family that no table entry says. They run before the
 * tables of every family; a site they rewrite or report is marked handled
 * (`run.handled`), and the tables leave it.
 *
 * A type of the application that declares a renamed member on top of a
 * Cornerstone viewport type is reported: the uses on a viewport are renamed,
 * the declaration is the application's.
 */
export function rewrite(run: Run): void {
  if (!importsCornerstone(run)) {
    return;
  }

  reportMembersOfTypes(run, RENAMED_TYPE_MEMBERS);
}
