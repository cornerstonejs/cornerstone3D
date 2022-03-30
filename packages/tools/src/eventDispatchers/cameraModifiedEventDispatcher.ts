import { Enums, Types } from '@cornerstonejs/core';
import { ToolModes } from '../enums';
import getToolsWithModesForMouseEvent from './shared/getToolsWithModesForMouseEvent';

const { Active, Passive, Enabled } = ToolModes;

/**
 * When the camera is modified, check what tools need to react to this.
 *
 * - First we get all tools which are active, passive or enabled on the element.
 * - If any of these tools have a `onCameraModified` method, we call it.
 *
 * @param evt - The normalized camera modified event.
 */
const onCameraModified = function (evt: Types.EventTypes.CameraModifiedEvent) {
  // @ts-ignore
  const enabledTools = getToolsWithModesForMouseEvent(evt, [
    Active,
    Passive,
    Enabled,
  ]);

  enabledTools.forEach((tool) => {
    if (tool.onCameraModified) {
      tool.onCameraModified(evt);
    }
  });
};

const enable = function (element) {
  element.addEventListener(Enums.Events.CAMERA_MODIFIED, onCameraModified);
};

const disable = function (element) {
  element.removeEventListener(Enums.Events.CAMERA_MODIFIED, onCameraModified);
};

export default {
  enable,
  disable,
};
