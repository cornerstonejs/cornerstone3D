import { Events as RenderingEngineEvents } from '../../index';
import { ToolModes } from './../enums';
import getToolsWithModesForMouseEvent from './shared/getToolsWithModesForMouseEvent';

const { Active, Passive, Enabled } = ToolModes;

/**
 * @function onImageRendered - When the image is rendered, check what tools can be rendered for this element.
 *
 * - First we get all tools which are active, passive or enabled on the element.
 * - If any of these tools have a `renderToolData` method, then we render them.
 * - Note that these tools don't necessarily have to be instances of  `BaseAnnotationTool`,
 *   Any tool may register a `renderToolData` method (e.g. a tool that displays an overlay).
 *
 * @param evt The normalized onImageRendered event.
 */
const onImageRendered = function (evt) {
  const enabledTools = getToolsWithModesForMouseEvent(evt, [
    Active,
    Passive,
    Enabled,
  ]);

  enabledTools.forEach((tool) => {
    if (tool.renderToolData) {
      tool.renderToolData(evt);
    }
  });
};

const enable = function (element) {
  element.addEventListener(
    RenderingEngineEvents.IMAGE_RENDERED,
    onImageRendered
  );
};

const disable = function (element) {
  element.removeEventListener(
    RenderingEngineEvents.IMAGE_RENDERED,
    onImageRendered
  );
};

export default {
  enable,
  disable,
};
