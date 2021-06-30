import { getEnabledElement } from '@ohif/cornerstone-render'
import { ToolModes } from '../enums'
import { draw as drawSvg } from '../drawingSvg'
import getToolsWithModesForElement from './getToolsWithModesForElement'

const { Active, Passive, Enabled } = ToolModes

export function triggerAnnotationRender(element: HTMLCanvasElement): void {
  const enabledTools = getToolsWithModesForElement(element, [
    Active,
    Passive,
    Enabled,
  ])

  const enabledElement = getEnabledElement(element)
  const { renderingEngineUID, sceneUID, viewportUID } = enabledElement
  const eventData = {
    canvas: element,
    renderingEngineUID,
    sceneUID,
    viewportUID,
  }

  drawSvg(eventData.canvas, (svgDrawingHelper) => {
    const handleDrawSvg = (tool) => {
      // TODO: Could short-circuit if there's no ToolState?
      // Are there situations where that would be bad (Canvas Overlay Tool?)
      if (tool.renderToolData) {
        tool.renderToolData({ detail: eventData }, svgDrawingHelper)
      }
    }

    enabledTools.forEach(handleDrawSvg)
  })
}

export default triggerAnnotationRender
