import { EVENTS as RenderingEngineEvents } from '@precisionmetrics/cornerstone-render'
import { ToolModes } from '../enums'
import getToolsWithModesForMouseEvent from './shared/getToolsWithModesForMouseEvent'

const { Active, Passive, Enabled } = ToolModes

/**
 * @function onImageSpacingCalibrated - When image spacing is calibrated
 * check if tools need to react to this.
 *
 * - First we get all tools which are active, passive or enabled on the element.
 * - If any of these tools have a `onImageSpacingCalibrated` method, we call it.
 *
 * @param evt The normalized image calibration event.
 */
const onImageSpacingCalibrated = function (evt) {
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
    RenderingEngineEvents.IMAGE_SPACING_CALIBRATED,
    onImageSpacingCalibrated
  )
}

const disable = function (element: HTMLElement) {
  element.removeEventListener(
    RenderingEngineEvents.IMAGE_SPACING_CALIBRATED,
    onImageSpacingCalibrated
  )
}

export default {
  enable,
  disable,
}
