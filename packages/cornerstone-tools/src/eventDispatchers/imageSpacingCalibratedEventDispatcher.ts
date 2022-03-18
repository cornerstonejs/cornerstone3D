import { Enums, Types } from '@precisionmetrics/cornerstone-render'
import { ToolModes } from '../enums'
import getToolsWithModesForMouseEvent from './shared/getToolsWithModesForMouseEvent'

const { Active, Passive, Enabled } = ToolModes

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
  ])

  enabledTools.forEach((tool) => {
    if (tool.onImageSpacingCalibrated) {
      tool.onImageSpacingCalibrated(evt)
    }
  })
}

const enable = function (element: HTMLElement) {
  element.addEventListener(
    Enums.Events.IMAGE_SPACING_CALIBRATED,
    onImageSpacingCalibrated
  )
}

const disable = function (element: HTMLElement) {
  element.removeEventListener(
    Enums.Events.IMAGE_SPACING_CALIBRATED,
    onImageSpacingCalibrated
  )
}

export default {
  enable,
  disable,
}
