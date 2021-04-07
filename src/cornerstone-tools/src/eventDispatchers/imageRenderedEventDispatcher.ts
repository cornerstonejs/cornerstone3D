import { EVENTS as RenderingEngineEvents } from '@cornerstone'
import { ToolModes } from '../enums'
import { draw as drawSvg } from '../drawingSvg'
import getToolsWithModesForMouseEvent from './shared/getToolsWithModesForMouseEvent'

const { Active, Passive, Enabled } = ToolModes

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
  const { canvas: canvasElement } = evt.detail
  const enabledTools = getToolsWithModesForMouseEvent(evt, [
    Active,
    Passive,
    Enabled,
  ])

  drawSvg(canvasElement, (svgDrawingHelper) => {
    enabledTools.forEach((tool) => {
      // TODO: Could short-circuit if there's no ToolState?
      // Are there situations where that would be bad (Canvas Overlay Tool?)
      if (tool.renderToolData) {
        tool.renderToolData(evt, svgDrawingHelper)
      }
    })
  })
}

const enable = function (element) {
  element.addEventListener(
    RenderingEngineEvents.IMAGE_RENDERED,
    onImageRendered
  )
}

const disable = function (element) {
  element.removeEventListener(
    RenderingEngineEvents.IMAGE_RENDERED,
    onImageRendered
  )
}

export default {
  enable,
  disable,
}
