import {
  getEnabledElement,
  triggerEvent,
  getRenderingEngine,
} from '@ohif/cornerstone-render'
import { CornerstoneTools3DEvents as EVENTS, ToolModes } from '../enums'
import { draw as drawSvg } from '../drawingSvg'
import getToolsWithModesForElement from './getToolsWithModesForElement'
import { getToolState } from '../stateManagement'

const { Active, Passive, Enabled } = ToolModes

class AnnotationRenderingEngine {
  private _needsRender: Set<HTMLElement> = new Set()
  private _animationFrameSet = false
  private _animationFrameHandle: number | null = null
  public hasBeenDestroyed: boolean
  private _viewportElements: Set<HTMLElement> = new Set()

  private _setViewportsToBeRenderedNextFrame(elements: HTMLElement[]) {
    // Add the viewports to the set of flagged viewports
    elements.forEach((element) => {
      this._needsRender.add(element)
    })

    // Render any flagged viewports
    this._render()
  }

  /**
   * @method _render Sets up animation frame if necessary
   */
  private _render() {
    // If we have viewports that need rendering and we have not already
    // set the RAF callback to run on the next frame.
    if (this._needsRender.size > 0 && this._animationFrameSet === false) {
      this._animationFrameHandle = window.requestAnimationFrame(
        this._renderFlaggedViewports
      )

      // Set the flag that we have already set up the next RAF call.
      this._animationFrameSet = true
    }
  }

  /**
   * @method _throwIfDestroyed Throws an error if trying to interact with the `RenderingEngine`
   * instance after its `destroy` method has been called.
   */
  private _throwIfDestroyed() {
    if (this.hasBeenDestroyed) {
      throw new Error(
        'this.destroy() has been manually called to free up memory, can not longer use this instance. Instead make a new one.'
      )
    }
  }

  _triggerRender(element) {
    const enabledElement = getEnabledElement(element)

    if (!enabledElement) {
      console.warn('Element has been disabled')
      return
    }

    const renderingEngine = getRenderingEngine(
      enabledElement.renderingEngineUID
    )
    if (!renderingEngine) {
      console.warn('rendering Engine has been destroyed')
      return
    }

    const enabledTools = getToolsWithModesForElement(element, [
      Active,
      Passive,
      Enabled,
    ])

    const { renderingEngineUID, sceneUID, viewportUID } = enabledElement
    const eventData = {
      canvas: element,
      renderingEngineUID,
      sceneUID,
      viewportUID,
    }

    const enabledToolsWithToolState = enabledTools.filter((tool) => {
      const toolState = getToolState(enabledElement, tool.name)
      return toolState && toolState.length
    })

    drawSvg(eventData.canvas, (svgDrawingHelper) => {
      const handleDrawSvg = (tool) => {
        // Are there situations where that would be bad (Canvas Overlay Tool?)
        if (tool.renderToolData) {
          tool.renderToolData({ detail: eventData }, svgDrawingHelper)
          triggerEvent(element, EVENTS.ANNOTATION_RENDERED, { ...eventData })
        }
      }

      enabledToolsWithToolState.forEach(handleDrawSvg)
    })
  }

  private _renderFlaggedViewports = () => {
    this._throwIfDestroyed()

    const elements = Array.from(this._viewportElements)

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i]
      if (this._needsRender.has(element)) {
        this._triggerRender(element)

        // This viewport has been rendered, we can remove it from the set
        this._needsRender.delete(element)

        // If there is nothing left that is flagged for rendering, stop here
        // and allow RAF to be called again
        if (this._needsRender.size === 0) {
          this._animationFrameSet = false
          this._animationFrameHandle = null
          return
        }
      }
    }
  }

  public addViewportElement(element) {
    this._viewportElements.add(element)
  }

  public removeViewportElement(element) {
    this._viewportElements.delete(element)

    // Reset the request animation frame if no enabled elements
    if (this._viewportElements.size === 0) {
      this._reset()
    }
  }

  public renderViewport(element): void {
    this._setViewportsToBeRenderedNextFrame([element])
  }

  /**
   * @method _reset Resets the `RenderingEngine`
   */
  private _reset() {
    window.cancelAnimationFrame(this._animationFrameHandle)

    this._needsRender.clear()
    this._animationFrameSet = false
    this._animationFrameHandle = null
  }
}

const annotationRenderingEngine = new AnnotationRenderingEngine()

export function triggerAnnotationRender(element: HTMLCanvasElement): void {
  annotationRenderingEngine.renderViewport(element)
}

export { annotationRenderingEngine }

export default triggerAnnotationRender
