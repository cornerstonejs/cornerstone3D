import { BaseTool } from './base'
import {
  getEnabledElement,
  getVolume,
  EVENTS,
  triggerEvent,
  VolumeViewport,
  StackViewport,
  Utilities,
  cache,
  Types,
  getVolumeViewportsContainingVolumeUID,
} from '@precisionmetrics/cornerstone-render'

// Todo: should move to configuration
const DEFAULT_MULTIPLIER = 4
const DEFAULT_IMAGE_DYNAMIC_RANGE = 1024
const PT = 'PT'

export default class WindowLevelTool extends BaseTool {
  touchDragCallback: () => void
  mouseDragCallback: () => void

  constructor(
    toolProps = {},
    defaultToolProps = {
      name: 'WindowLevel',
      supportedInteractionTypes: ['Mouse', 'Touch'],
    }
  ) {
    super(toolProps, defaultToolProps)

    this.touchDragCallback = this._dragCallback.bind(this)
    this.mouseDragCallback = this._dragCallback.bind(this)
  }

  _dragCallback(evt) {
    const { element, deltaPoints } = evt.detail
    const enabledElement = getEnabledElement(element)
    const { renderingEngine, viewportUID, viewport } = enabledElement

    let volumeUID,
      volumeActor,
      lower,
      upper,
      rgbTransferFunction,
      modality,
      newRange,
      viewportsContainingVolumeUID
    let useDynamicRange = false

    if (viewport instanceof VolumeViewport) {
      volumeUID = this.getTargetUID(viewport as VolumeViewport)
      ;({ volumeActor } = viewport.getActor(volumeUID))
      rgbTransferFunction = volumeActor.getProperty().getRGBTransferFunction(0)
      viewportsContainingVolumeUID = getVolumeViewportsContainingVolumeUID(
        volumeUID,
        renderingEngine.uid
      )
      ;[lower, upper] = rgbTransferFunction.getRange()
      modality = cache.getVolume(volumeUID).metadata.Modality
      useDynamicRange = true
    } else {
      const properties = viewport.getProperties()
      modality = viewport.modality
      ;({ lower, upper } = properties.voiRange)
    }

    // If modality is PT, treat it special to not include the canvas delta in
    // the x direction. For other modalities, use the canvas delta in both
    // directions, and if the viewport is a volumeViewport, the multiplier
    // is calculate using the volume min and max.
    if (modality === PT) {
      newRange = this.getPTNewRange({
        deltaPointsCanvas: deltaPoints.canvas,
        lower,
        upper,
        clientHeight: element.clientHeight,
      })
    } else {
      newRange = this.getNewRange({
        deltaPointsCanvas: deltaPoints.canvas,
        useDynamicRange,
        volumeUID,
        lower,
        upper,
      })
    }

    const eventDetail: Types.EventsTypes.VoiModifiedEventData = {
      volumeUID,
      viewportUID,
      range: newRange,
    }

    triggerEvent(element, EVENTS.VOI_MODIFIED, eventDetail)

    if (viewport instanceof StackViewport) {
      viewport.setProperties({
        voiRange: newRange,
      })

      viewport.render()
      return
    }

    rgbTransferFunction.setRange(newRange.lower, newRange.upper)
    viewportsContainingVolumeUID.forEach((vp) => {
      vp.render()
    })
  }

  getPTNewRange({ deltaPointsCanvas, lower, upper, clientHeight }) {
    const deltaY = deltaPointsCanvas[1]
    const multiplier = 5 / clientHeight
    const wcDelta = deltaY * multiplier

    upper -= wcDelta
    upper = Math.max(upper, 0.1)

    return { lower, upper }
  }

  getNewRange({ deltaPointsCanvas, useDynamicRange, volumeUID, lower, upper }) {
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
    return Utilities.windowLevel.toLowHighRange(windowWidth, windowCenter)
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
