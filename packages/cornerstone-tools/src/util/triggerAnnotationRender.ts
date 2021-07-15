import { getEnabledElement } from '@ohif/cornerstone-render'
import { ToolModes } from '../enums'
import { draw as drawSvg } from '../drawingSvg'
import getToolsWithModesForElement from './getToolsWithModesForElement'

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
