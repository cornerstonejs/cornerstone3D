import cornerstone from 'cornerstone-core'
import requestPoolManager from './requestPoolManager'
import getImageIdInstanceMetadata from './getImageIdInstanceMetadata'
import getInterleavedFrames from './getInterleavedFrames'
import StreamingImageVolume from '../imageCache/classes/StreamingImageVolume'
import { calculateSUVScalingFactors } from 'calculate-suv'
import renderingEventTarget from '../RenderingEngine/renderingEventTarget'
import { triggerEvent } from '../utilities/'
import EVENTS from '../enums/EVENTS'
import configuration from '../configuration'
import autoLoad from './autoLoad'

const requestType = 'prefetch'
const preventCache = true // We are not using the cornerstone cache for this.

type ScalingParamaters = {
  rescaleSlope: number
  rescaleIntercept: number
  modality: string
  suvbw?: number
  suvlbm?: number
  suvbsa?: number
}

function prefetchImageIds(volume: StreamingImageVolume) {
  const { scalarData, loadStatus } = volume
  const { cachedFrames } = loadStatus

  const {
    imageIds,
    vtkOpenGLTexture,
    vtkImageData,
    metadata,
    uid: volumeUID,
  } = volume

  const { FrameOfReferenceUID } = metadata

  const interleavedFrames = getInterleavedFrames(imageIds)

  loadStatus.loading = true

  // SharedArrayBuffer
  const arrayBuffer = scalarData.buffer
  const numFrames = interleavedFrames.length

  // Length of one frame in voxels
  const length = scalarData.length / numFrames
  // Length of one frame in bytes
  const lengthInBytes = arrayBuffer.byteLength / numFrames

  let type

  if (scalarData instanceof Uint8Array) {
    type = 'Uint8Array'
  } else if (scalarData instanceof Float32Array) {
    type = 'Float32Array'
  } else {
    throw new Error('Unsupported array type')
  }

  let framesLoaded = 0
  let framesProcessed = 0

  const { autoRenderOnLoad, autoRenderPercentage } = configuration.get()

  let reRenderFraction
  let reRenderTarget

  if (autoRenderOnLoad) {
    reRenderFraction = numFrames * (autoRenderPercentage / 100)
    reRenderTarget = reRenderFraction
  }

  function callLoadStatusCallback(evt) {
    if (autoRenderOnLoad) {
      if (
        evt.framesProcessed > reRenderTarget ||
        evt.framesProcessed === evt.numFrames
      ) {
        reRenderTarget += reRenderFraction

        autoLoad(volumeUID)
      }
    }

    loadStatus.callbacks.forEach((callback) => callback(evt))
  }

  function successCallback(imageIdIndex, imageId) {
    cachedFrames[imageIdIndex] = true
    framesLoaded++
    framesProcessed++

    vtkOpenGLTexture.setUpdatedFrame(imageIdIndex)
    vtkImageData.modified()

    const eventData = {
      FrameOfReferenceUID,
      imageVolume: volume,
    }

    triggerEvent(renderingEventTarget, EVENTS.IMAGE_VOLUME_MODIFIED, eventData)

    if (framesProcessed === numFrames) {
      loadStatus.loaded = true
      loadStatus.loading = false

      callLoadStatusCallback({
        success: true,
        imageIdIndex,
        imageId,
        framesLoaded,
        framesProcessed,
        numFrames,
      })
      loadStatus.callbacks = []
    } else {
      callLoadStatusCallback({
        success: true,
        imageIdIndex,
        imageId,
        framesLoaded,
        framesProcessed,
        numFrames,
      })
    }
  }

  function errorCallback(error, imageIdIndex, imageId) {
    framesProcessed++

    if (framesProcessed === numFrames) {
      loadStatus.loaded = true
      loadStatus.loading = false

      callLoadStatusCallback({
        success: false,
        imageId,
        imageIdIndex,
        error,
        framesLoaded,
        framesProcessed,
        numFrames,
      })

      loadStatus.callbacks = []
    } else {
      callLoadStatusCallback({
        success: false,
        imageId,
        imageIdIndex,
        error,
        framesLoaded,
        framesProcessed,
        numFrames,
      })
    }
  }

  const InstanceMetadataArray = []
  interleavedFrames.forEach((frame) => {
    const { imageId } = frame

    const generalSeriesModule =
      cornerstone.metaData.get('generalSeriesModule', imageId) || {}

    if (generalSeriesModule.modality === 'PT') {
      const instanceMetadata = getImageIdInstanceMetadata(imageId)
      InstanceMetadataArray.push(instanceMetadata)
    }
  })

  let suvScalingFactors
  if (InstanceMetadataArray.length > 0) {
    suvScalingFactors = calculateSUVScalingFactors(InstanceMetadataArray)

    _addScalingToVolume(volume, suvScalingFactors)
  }

  interleavedFrames.forEach((frame) => {
    const { imageId, imageIdIndex } = frame

    if (cachedFrames[imageIdIndex]) {
      framesLoaded++
      framesProcessed++
      return
    }

    const modalityLutModule =
      cornerstone.metaData.get('modalityLutModule', imageId) || {}

    const generalSeriesModule =
      cornerstone.metaData.get('generalSeriesModule', imageId) || {}

    const scalingParameters: ScalingParamaters = {
      rescaleSlope: modalityLutModule.rescaleSlope,
      rescaleIntercept: modalityLutModule.rescaleIntercept,
      modality: generalSeriesModule.modality,
    }

    if (scalingParameters.modality === 'PT') {
      const suvFactor = suvScalingFactors[imageIdIndex]
      scalingParameters.suvbw = suvFactor.suvbw
    }

    const options = {
      targetBuffer: {
        arrayBuffer,
        offset: imageIdIndex * lengthInBytes,
        length,
        type,
      },
      preScale: {
        scalingParameters,
      },
    }

    requestPoolManager.addRequest(
      {},
      imageId,
      requestType,
      preventCache,
      () => {
        successCallback(imageIdIndex, imageId)
      },
      (error) => {
        errorCallback(error, imageIdIndex, imageId)
      },
      null, // addToBeginning option, need to pass something to pass options in correct spot.
      options
    )
  })

  requestPoolManager.startGrabbing()
}

type PetScaling = {
  suvbwToSuvlbm?: number
  suvbwToSuvbsa?: number
}

function _addScalingToVolume(volume, suvScalingFactors) {
  if (!volume.scaling) {
    volume.scaling = {}
  }

  const firstSUVFactor = suvScalingFactors[0]

  if (!volume.scaling.PET) {
    // These ratios are constant across all frames, so only need one.
    const { suvbw, suvlbm, suvbsa } = firstSUVFactor

    const petScaling = <PetScaling>{}

    if (suvlbm) {
      petScaling.suvbwToSuvlbm = suvlbm / suvbw
    }

    if (suvbsa) {
      petScaling.suvbwToSuvbsa = suvbsa / suvbw
    }

    volume.scaling.PET = petScaling
  }
}

export default prefetchImageIds
