import { Enums, Types } from '@cornerstonejs/core';
import { ToolModes } from '../enums';
import getToolsWithModesForMouseEvent from './shared/getToolsWithModesForMouseEvent';

const { Active, Passive, Enabled } = ToolModes;

/**
 * When image spacing is calibrated modify the annotations for all of its tools
 * to consider the new calibration info.
 *
 * - First we get all tools which are active, passive or enabled on the element.
 * - If any of these tools have a `onImageSpacingCalibrated` method, we call it.
 *
 * @param evt - The normalized image calibration event.
 */
const onImageSpacingCalibrated = function (
  evt: Types.EventTypes.ImageSpacingCalibratedEvent
) {
  // @ts-ignore
  const enabledTools = getToolsWithModesForMouseEvent(evt, [
    Active,
    Passive,
    Enabled,
  ]);

  enabledTools.forEach((tool) => {
    if (tool.onImageSpacingCalibrated) {
      tool.onImageSpacingCalibrated(evt);
    }
  });
};

const enable = function (element: HTMLDivElement) {
  element.addEventListener(
    Enums.Events.IMAGE_SPACING_CALIBRATED,
    onImageSpacingCalibrated as EventListener
  );
};

const disable = function (element: HTMLDivElement) {
  element.removeEventListener(
    Enums.Events.IMAGE_SPACING_CALIBRATED,
    onImageSpacingCalibrated as EventListener
  );
};

export default {
  enable,
  disable,
};
