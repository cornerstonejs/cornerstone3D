import { BaseTool } from './base'
import {
  getEnabledElement,
  getVolume,
  EVENTS,
  triggerEvent,
  VolumeViewport,
  StackViewport,
  Utilities,
} from '@ohif/cornerstone-render'

// Todo: should move to configuration
const DEFAULT_MULTIPLIER = 4
const DEFAULT_IMAGE_DYNAMIC_RANGE = 1024

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

  _dragCallback(evt) {
    const { element: canvas, deltaPoints } = evt.detail
    const enabledElement = getEnabledElement(canvas)
    const { scene, sceneUID, viewportUID, viewport } = enabledElement

    let volumeUID, volumeActor, lower, upper, rgbTransferFunction
    let useDynamicRange = false

    if (viewport instanceof VolumeViewport) {
      volumeUID = this.configuration.volumeUID
      volumeActor = scene.getVolumeActor(volumeUID)
      rgbTransferFunction = volumeActor.getProperty().getRGBTransferFunction(0)
      ;[lower, upper] = rgbTransferFunction.getRange()
      useDynamicRange = true
    } else {
      const properties = viewport.getProperties()
      ;({ lower, upper } = properties.voiRange)
    }

    const deltaPointsCanvas = deltaPoints.canvas

    // Todo: enabling a viewport twice in a row sets the imageDynamicRange to be zero for some reason
    // 1 was too little
    const multiplier = useDynamicRange
      ? this._getMultiplyerFromDynamicRange(volumeUID)
      : DEFAULT_MULTIPLIER

    const wwDelta = deltaPointsCanvas[0] * multiplier
    const wcDelta = deltaPointsCanvas[1] * multiplier

    let { windowWidth, windowCenter } = Utilities.windowLevel.toWindowLevel(
      lower,
      upper
    )

    windowWidth += wwDelta
    windowCenter += wcDelta

    windowWidth = Math.max(windowWidth, 1)

    // Convert back to range
    const newRange = Utilities.windowLevel.toLowHighRange(
      windowWidth,
      windowCenter
    )

    const eventDetail = {
      volumeUID,
      viewportUID,
      sceneUID,
      range: newRange,
    }

    triggerEvent(canvas, EVENTS.VOI_MODIFIED, eventDetail)

    if (viewport instanceof StackViewport) {
      viewport.setProperties({
        voiRange: newRange,
      })

      viewport.render()
      return
    }

    rgbTransferFunction.setRange(newRange.lower, newRange.upper)
    scene.render()
  }

  _getMultiplyerFromDynamicRange(volumeUID) {
    if (!volumeUID) {
      throw new Error('No volumeUID provided for the volume Viewport')
    }

    let multiplier = DEFAULT_MULTIPLIER
    const imageDynamicRange = this._getImageDynamicRange(volumeUID)

    const ratio = imageDynamicRange / DEFAULT_IMAGE_DYNAMIC_RANGE

    if (ratio > 1) {
      multiplier = Math.round(ratio)
    }

    return multiplier
  }

  _getImageDynamicRange = (volumeUID: string) => {
    const imageVolume = getVolume(volumeUID)
    const { dimensions, scalarData } = imageVolume
    const middleSliceIndex = Math.floor(dimensions[2] / 2)

    // Todo: volume shouldn't only be streaming image volume, it can be imageVolume
    // if (!(imageVolume instanceof StreamingImageVolume)) {
    //   return
    // }

    // const streamingVolume = <StreamingImageVolume>imageVolume

    // if (!streamingVolume.loadStatus.cachedFrames[middleSliceIndex]) {
    //   return DEFAULT_IMAGE_DYNAMIC_RANGE
    // }

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
