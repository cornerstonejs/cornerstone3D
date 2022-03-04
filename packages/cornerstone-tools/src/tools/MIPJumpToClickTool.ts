import { BaseTool } from './base'
import {
  getEnabledElement,
  VolumeViewport,
  getVolumeViewportsContainingVolumeUID,
} from '@precisionmetrics/cornerstone-render'
import { getVoxelPositionBasedOnIntensity } from '../util/planar'
import jumpToWorld from '../util/viewport/jumpToWorld'

export default class MIPJumpToClickTool extends BaseTool {
  _configuration: any
  _bounds: any

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'MIPJumpToClickTool',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {},
    })
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
    const { element, currentPoints, viewportUID } = evt.detail

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

    // 5. Get all the Viewports containing the volume
    const viewports = getVolumeViewportsContainingVolumeUID(
      targetVolumeUID,
      renderingEngine.uid
    )

    // 6. Update all the Viewports and its viewports
    viewports.forEach((viewport) => {
      // Don't want to jump for the viewport that was clicked on
      if (viewport.uid === viewportUID) {
        return
      }

      jumpToWorld(viewport, brightestPoint)
    })
  }
}
