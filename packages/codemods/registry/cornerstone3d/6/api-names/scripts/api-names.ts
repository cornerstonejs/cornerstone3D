import { familiesCodemod } from './rules.ts';
import * as appearanceAndFraming from './families/appearance-and-framing.ts';
import * as displaySets from './families/display-sets.ts';
import * as events from './families/events.ts';
import * as genericNames from './families/generic-names.ts';
import * as renderModes from './families/render-modes.ts';
import * as viewportMembers from './families/viewport-members.ts';

/**
 * Rewrites the names of Cornerstone3D that changed after 6.0.0-beta.2, family
 * by family; each family is a file of `families/`.
 */
export default familiesCodemod([
  genericNames,
  displaySets,
  appearanceAndFraming,
  events,
  renderModes,
  viewportMembers,
]);
