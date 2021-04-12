import { BaseTool } from './base'
import {
  getEnabledElement,
  getVolume,
  EVENTS,
  triggerEvent,
} from '@cornerstone'
import { StreamingImageVolume } from '../../../cornerstone-streaming-image-volume-loader/src'

export default class WindowLevelTool extends BaseTool {
  touchDragCallback: () => void
  mouseDragCallback: () => void

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'WindowLevel',
      supportedInteractionTypes: ['Mouse', 'Touch'],
    })

    this.touchDragCallback = this._dragCallback.bind(this)
    this.mouseDragCallback = this._dragCallback.bind(this)
  }

  private _toWindowLevel(low, high) {
    const windowWidth = Math.abs(low - high)
    const windowCenter = low + windowWidth / 2

    return { windowWidth, windowCenter }
  }

  private _toLowHighRange(windowWidth, windowCenter) {
    const lower = windowCenter - windowWidth / 2.0
    const upper = windowCenter + windowWidth / 2.0

    return { lower, upper }
  }

  _dragCallback(evt) {
    const { element: canvas, deltaPoints } = evt.detail
    const enabledElement = getEnabledElement(canvas)
    const { scene, sceneUID, viewport } = enabledElement
    const { volumeUID } = this.configuration

    let volumeActor

    if (volumeUID) {
      volumeActor = scene.getVolumeActor(volumeUID)
    } else {
      const volumeActors = viewport.getActors()
      if (volumeActors && volumeActors.length) {
        volumeActor = volumeActors[0].volumeActor
      }
    }

    if (!volumeActor) {
      // No volume actor available.
      return
    }

    const rgbTransferFunction = volumeActor
      .getProperty()
      .getRGBTransferFunction(0)

    const deltaPointsCanvas = deltaPoints.canvas

    // 1 was too little
    let multiplier = 4
    if (volumeUID) {
      const imageDynamicRange = this._getImageDynamicRange(volumeUID)

      multiplier = Math.round(imageDynamicRange / 1024)
    }

    const wwDelta = deltaPointsCanvas[0] * multiplier
    const wcDelta = deltaPointsCanvas[1] * multiplier

    const [lower, upper] = rgbTransferFunction.getRange()

    let { windowWidth, windowCenter } = this._toWindowLevel(lower, upper)

    windowWidth += wwDelta
    windowCenter += wcDelta

    windowWidth = Math.max(windowWidth, 1)

    // Convert back to range
    const newRange = this._toLowHighRange(windowWidth, windowCenter)

    rgbTransferFunction.setMappingRange(newRange.lower, newRange.upper)

    const eventDetail = {
      volumeUID,
      sceneUID,
      range: newRange,
    }

    triggerEvent(canvas, EVENTS.VOI_MODIFIED, eventDetail)

    if (scene) {
      scene.render()
      return
    }

    viewport.setStackActorVOI(newRange)
    viewport.render()
  }

  _getImageDynamicRange = (volumeUID) => {
    const imageVolume = getVolume(volumeUID)
    const { dimensions, scalarData } = imageVolume
    const middleSliceIndex = Math.floor(dimensions[2] / 2)

    if (!(imageVolume instanceof StreamingImageVolume)) {
      return
    }

    const streamingVolume = <StreamingImageVolume>imageVolume

    if (!streamingVolume.loadStatus.cachedFrames[middleSliceIndex]) {
      return DEFAULT_IMAGE_DYNAMIC_RANGE
    }

    const frameLength = dimensions[0] * dimensions[1]
    let bytesPerVoxel
    let TypedArrayConstructor

    if (scalarData instanceof Float32Array) {
      bytesPerVoxel = 4
      TypedArrayConstructor = Float32Array
    } else if (scalarData instanceof Uint8Array) {
      bytesPerVoxel = 1
      TypedArrayConstructor = Uint8Array
    }

    const buffer = scalarData.buffer
    const byteOffset = middleSliceIndex * frameLength * bytesPerVoxel
    const frame = new TypedArrayConstructor(buffer, byteOffset, frameLength)

    let min = Infinity
    let max = -Infinity

    for (let i = 0; i < frameLength; i++) {
      const voxel = frame[i]

      if (voxel < min) {
        min = voxel
      }

      if (voxel > max) {
        max = voxel
      }
    }

    return max - min
  }
}

const DEFAULT_IMAGE_DYNAMIC_RANGE = 1024
