import { BaseTool } from './base'
import {
  getEnabledElement,
  VolumeViewport,
} from '@precisionmetrics/cornerstone-render'
import { getVoxelPositionBasedOnIntensity } from '../util/planar'
import jumpToWorld from '../util/viewport/jumpToWorld'
import { PublicToolProps, ToolProps } from '../types'

export default class MIPJumpToClickTool extends BaseTool {
  _configuration: any
  _bounds: any

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      name: 'MIPJumpToClickTool',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        targetViewportUIDs: [],
      },
    }
  ) {
    super(toolProps, defaultToolProps)
  }

  /**
   * Handles the click event, and move the camera's focal point the brightest
   * point that is in the line of sight of camera. This function 1) search for the
   * brightest point in the line of sight, 2) move the camera to that point,
   * this triggers a cameraModified event which then 4) moves all other synced
   * viewports and their crosshairs.
   *
   * @param evt click event
   */
  mouseClickCallback(evt): void {
    const { element, currentPoints } = evt.detail

    // 1. Getting the enabled element
    const enabledElement = getEnabledElement(element)
    const { viewport, renderingEngine } = enabledElement

    // 2. Getting the target volume that is clicked on
    const targetVolumeUID = this.getTargetUID(viewport as VolumeViewport)

    // 3. Criteria function to search for the point (maximum intensity)
    let maxIntensity = -Infinity
    const maxFn = (intensity, point) => {
      if (intensity > maxIntensity) {
        maxIntensity = intensity
        return point
      }
    }

    // 4. Search for the brightest point location in the line of sight
    const brightestPoint = getVoxelPositionBasedOnIntensity(
      viewport as VolumeViewport,
      targetVolumeUID,
      maxFn,
      currentPoints.world
    )

    if (!brightestPoint || !brightestPoint.length) {
      return
    }

    const { targetViewportUIDs } = this.configuration

    // 6. Update all the targetedViewports to jump
    targetViewportUIDs.forEach((viewportUID) => {
      // Todo: current limitation is that we cannot jump in viewports
      // that don't belong to the renderingEngine of the source clicked viewport
      const viewport = renderingEngine.getViewport(viewportUID)

      if (viewport instanceof VolumeViewport) {
        jumpToWorld(viewport, brightestPoint)
      } else {
        console.warn(
          'Cannot jump to specified world coordinates for a viewport that is not a VolumeViewport'
        )
      }
    })
  }
}
