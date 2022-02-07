import { CPUFallbackViewport } from '../../../../types';

const state = {
  viewport: {},
};

/**
 * Sets new default values for `getDefaultViewport`
 *
 * @param {Object} viewport - Object that sets new default values for getDefaultViewport
 * @returns {undefined}
 */
export default function (viewport: CPUFallbackViewport): void {
  state.viewport = viewport || {};
}

export { state };
