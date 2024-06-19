import { Enums, Types } from '@cornerstonejs/core';
import { ToolModes } from '../enums';
import getToolsWithModesForMouseEvent from './shared/getToolsWithModesForMouseEvent';

const { Active, Passive, Enabled } = ToolModes;

/**
 * When the camera is reset, check what tools need to react to this.
 *
 * - First we get all tools which are active, passive or enabled on the element.
 * - If any of these tools have a `onCameraReset` method, we call it.
 *
 * @param evt - The normalized camera reset event.
 */
const onCameraReset = function (evt: Types.EventTypes.CameraResetEvent) {
  // @ts-ignore
  const enabledTools = getToolsWithModesForMouseEvent(evt, [
    Active,
    Passive,
    Enabled,
  ]);

  enabledTools.forEach((tool) => {
    if (tool.onResetCamera) {
      tool.onResetCamera(evt);
    }
  });
};

const enable = function (element) {
  element.addEventListener(Enums.Events.CAMERA_RESET, onCameraReset);
};

const disable = function (element) {
  element.removeEventListener(Enums.Events.CAMERA_RESET, onCameraReset);
};

export default {
  enable,
  disable,
};
