import {
  triggerEvent,
  eventTarget,
  getRenderingEngine,
  EVENTS as csRenderEvents,
  Types,
} from '@precisionmetrics/cornerstone-render'
import { CornerstoneTools3DEvents as csToolsEvents } from '../enums'
import {
  getToolGroupByToolGroupUID,
  getToolGroup,
} from '../store/ToolGroupManager'

import SegmentationDisplayTool from '../tools/displayTools/SegmentationDisplayTool'

class SegmentationRenderingEngine {
  private _needsRender: Set<string> = new Set()
  private _animationFrameSet = false
  private _animationFrameHandle: number | null = null
  public hasBeenDestroyed: boolean

  private _setToolGroupSegmentationToBeRenderedNextFrame(
    toolGroupUIDs: string[]
  ) {
    // Add the viewports to the set of flagged viewports
    toolGroupUIDs.forEach((toolGroupUID) => {
      this._needsRender.add(toolGroupUID)
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
        this._renderFlaggedToolGroups
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

  _triggerRender(toolGroupUID) {
    const toolGroup = getToolGroupByToolGroupUID(toolGroupUID)

    if (!toolGroup) {
      console.warn(`No tool group found with toolGroupUID: ${toolGroupUID}`)
      return
    }

    const { viewportsInfo } = toolGroup
    const viewports = []

    viewportsInfo.forEach(({ viewportUID, renderingEngineUID }) => {
      const renderingEngine = getRenderingEngine(renderingEngineUID)

      if (!renderingEngine) {
        console.warn('rendering Engine has been destroyed')
        return
      }

      viewports.push(renderingEngine.getViewport(viewportUID))
    })

    const segmentationDisplayToolInstance = toolGroup.getToolInstance(
      'SegmentationDisplay'
    ) as SegmentationDisplayTool

    function onSegmentationRender(evt: Types.EventsTypes.ImageRenderedEvent) {
      const { element, viewportUID, renderingEngineUID } = evt.detail

      element.removeEventListener(
        csRenderEvents.IMAGE_RENDERED,
        onSegmentationRender
      )

      const toolGroup = getToolGroup(renderingEngineUID, viewportUID)

      const eventData = {
        toolGroupUID: toolGroup.uid,
        viewportUID,
      }

      triggerEvent(eventTarget, csToolsEvents.SEGMENTATION_RENDERED, {
        ...eventData,
      })
    }

    // Todo: for other representations we probably need the drawSVG, but right now we are not using it
    // drawSvg(element, (svgDrawingHelper) => {
    //   const handleDrawSvg = (tool) => {
    //     if (tool instanceof SegmentationDisplayTool && tool.renderToolData) {
    //       tool.renderToolData({ detail: eventData })
    //       triggerEvent(element, csToolsEvents.SEGMENTATION_RENDERED, { ...eventData })
    //     }
    //   }
    //   enabledTools.forEach(handleDrawSvg)
    // })

    viewports.forEach(({ element }) => {
      element.addEventListener(
        csRenderEvents.IMAGE_RENDERED,
        onSegmentationRender
      )
    })

    segmentationDisplayToolInstance.renderToolData(toolGroupUID)
  }

  private _renderFlaggedToolGroups = () => {
    this._throwIfDestroyed()

    // for each toolGroupUID insides the _needsRender set, render the segmentation
    const toolGroupUIDs = Array.from(this._needsRender.values())

    for (const toolGroupUID of toolGroupUIDs) {
      this._triggerRender(toolGroupUID)

      // This viewport has been rendered, we can remove it from the set
      this._needsRender.delete(toolGroupUID)

      // If there is nothing left that is flagged for rendering, stop here
      // and allow RAF to be called again
      if (this._needsRender.size === 0) {
        this._animationFrameSet = false
        this._animationFrameHandle = null
        return
      }
    }
  }

  public renderToolGroupSegmentations(toolGroupUID): void {
    this._setToolGroupSegmentationToBeRenderedNextFrame([toolGroupUID])
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

const segmentationRenderingEngine = new SegmentationRenderingEngine()

export function triggerSegmentationRender(toolGroupUID: string): void {
  segmentationRenderingEngine.renderToolGroupSegmentations(toolGroupUID)
}

export { segmentationRenderingEngine }
export default triggerSegmentationRender
