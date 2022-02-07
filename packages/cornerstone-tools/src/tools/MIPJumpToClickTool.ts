import { BaseTool } from './base'
import {
  getEnabledElement,
  Scene,
  VolumeViewport,
} from '@precisionmetrics/cornerstone-render'
import { getVoxelPositionBasedOnIntensity } from '../util/planar'
import { ToolGroupManager } from '../store'
import CrosshairsTool from './CrosshairsTool'

const CROSSHAIRS = 'Crosshairs'

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
   * brightest point in the line of sight, 2) move the crosshairs to that point,
   * this triggers a cameraModified event which then 4) moves all other synced
   * viewports and their crosshairs.
   *
   * @param evt click event
   */
  mouseClickCallback(evt): void {
    const { element, currentPoints, renderingEngineUID, sceneUID } = evt.detail

    // 1. Getting the enabled element
    const enabledElement = getEnabledElement(element)
    const { viewport, scene, renderingEngine } = enabledElement

    // 2. Getting the target volume that is clicked on
    const targetVolumeUID = this._getTargetVolumeUID(scene)

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
      scene,
      viewport as VolumeViewport,
      targetVolumeUID,
      maxFn,
      currentPoints.world
    )

    if (!brightestPoint || !brightestPoint.length) {
      return
    }

    // 5. Get all the scenes containing the volume
    const scenes = renderingEngine.getScenesContainingVolume(targetVolumeUID)

    // 6. Update all the scenes and its viewports, to jump their crosshairs
    // to the clicked point
    scenes.forEach((scene) => {
      if (scene.uid === sceneUID) {
        return
      }

      const viewports = scene.getViewports()

      viewports.forEach((viewport) => {
        const toolGroups = ToolGroupManager.getToolGroups(
          renderingEngineUID,
          scene.uid,
          viewport.uid
        )

        toolGroups.forEach((toolGroup) => {
          const crosshairs = toolGroup.getToolInstance(CROSSHAIRS)

          if (crosshairs && crosshairs instanceof CrosshairsTool) {
            const enabledElement = {
              viewport,
              scene,
              renderingEngine,
              viewportUID: viewport.uid,
              sceneUID,
              renderingEngineUID: renderingEngine.uid,
              FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
            }

            crosshairs.jumpToWorld(enabledElement, brightestPoint)
          }
        })
      })
    })
  }

  /**
   * Returns the volume UID in the scene. It returns the first volume.
   * @param scene Scene
   * @returns volume UID
   */
  _getTargetVolumeUID = (scene: Scene): string => {
    if (this.configuration.volumeUID) {
      return this.configuration.volumeUID
    }

    const volumeActors = scene.getVolumeActors()

    if (!volumeActors && !volumeActors.length) {
      // No stack to scroll through
      return
    }

    return volumeActors[0].uid
  }
}
