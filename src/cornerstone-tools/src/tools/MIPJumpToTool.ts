import { BaseTool } from './base'
import { getEnabledElement } from '@cornerstone'
import { mat4, vec3 } from 'gl-matrix'
import Point3 from 'src/cornerstone-core/src/types/Point3'
import vtkMath from 'vtk.js/Sources/Common/Core/Math'
import { ToolModes } from '../enums'
import getToolsWithDataForElement from '../store/getToolsWithDataForElement'
import getToolsWithModesForMouseEvent from '../eventDispatchers/shared/getToolsWithModesForMouseEvent'
import { getTargetVolume } from '../util/planar'
import { state, ToolGroupManager } from '../store'
import { getToolState } from '../stateManagement'
import CrosshairsTool from '../tools/CrosshairsTool'
const { Active, Passive } = ToolModes

export default class MIPJumpToTool extends BaseTool {
  _configuration: any

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'MIPJumpToTool',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {},
    })
  }

  // inBounds(point) {
  //   const [xMin, xMax, yMin, yMax, zMin, zMax] = model.bounds
  //   return (
  //     point[0] > xMin &&
  //     point[0] < xMax &&
  //     point[1] > yMin &&
  //     point[1] < yMax &&
  //     point[2] > zMin &&
  //     point[2] < zMax
  //   )
  // }

  mouseClickCallback(evt) {
    const {
      element: canvas,
      renderingEngineUID,
      sceneUID,
      viewportUID,
    } = evt.detail
    const { world: pickedPoint } = evt.detail.currentPoints

    const enabledElement = getEnabledElement(canvas)
    const { viewport, scene, renderingEngine } = enabledElement
    const targetVolumeUID = this._getTargetVolumeUID(scene)
    const camera = viewport.getCamera()

    const { spacingInNormalDirection } = getTargetVolume(
      scene,
      camera,
      targetVolumeUID
    )

    const bounds = viewport.getRenderer().computeVisiblePropBounds()
    const [xMin, xMax, yMin, yMax, zMin, zMax] = bounds

    // todo fix
    // const minSearch = bounds[0]
    // const maxSearch = bounds[1]
    const step = spacingInNormalDirection

    const { position } = camera

    const vector = [0, 0, 0]
    vtkMath.subtract(pickedPoint, position, vector)
    let maxIntensity = 0
    let brightestPoint
    for (let pointT = xMin; pointT <= xMax; pointT = pointT + step) {
      const point = [pointT, 0, 0]
      const t = (pointT - position[0]) / vector[0]
      point[1] = t * vector[1] + position[1]
      point[2] = t * vector[2] + position[2]
      if (
        point[0] > xMin &&
        point[0] < xMax &&
        point[1] > yMin &&
        point[1] < yMax &&
        point[2] > zMin &&
        point[2] < zMax
      ) {
        const intensity = viewport.getVoxelIntensity(point)
        if (intensity > maxIntensity) {
          maxIntensity = intensity
          brightestPoint = point
        }
      }
    }

    const crosshairsTool = this._getCrosshairsTool(
      evt,
      renderingEngine,
      targetVolumeUID
    )

    // crosshairsTool._jump(enabledElement, brightestPoint)

    // console.debug(maxIntensity)
    // console.debug(brightestPoint)
  }

  _getCrosshairsTool = (evt, renderingEngine, targetVolumeUID) => {
    const { renderingEngineUID } = evt.detail

    const viewportsWithVolumeUID = renderingEngine.getViewportsContainingVolumeUID(
      targetVolumeUID
    )

    const crosshairsTool = []
    for (const viewport of viewportsWithVolumeUID) {
      const { uid: viewportUID, sceneUID } = viewport

      const toolGroups = ToolGroupManager.getToolGroups(
        renderingEngineUID,
        sceneUID,
        viewportUID
      )

      for (let i = 0; i < toolGroups.length; i++) {
        const toolGroup = toolGroups[i]
        const toolGroupToolNames = Object.keys(toolGroup.tools)

        for (let j = 0; j < toolGroupToolNames.length; j++) {
          const toolName = toolGroupToolNames[j]

          if (toolName === 'Crosshairs') {
            const toolInstance = toolGroup._tools[toolName]
            crosshairsTool.push(toolInstance)
          }
        }
      }
    }

    return crosshairsTool[0]
  }

  _getTargetVolumeUID = (scene) => {
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
