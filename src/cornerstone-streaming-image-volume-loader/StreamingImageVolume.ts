import {
  EVENTS,
  eventTarget,
  metaData,
  requestPoolManager,
  triggerEvent,
  ImageVolume
} from '@cornerstone'
import { calculateSUVScalingFactors } from 'calculate-suv'
import { IImageVolume, IStreamingVolume } from '../types'

import getInterleavedFrames from './helpers/getInterleavedFrames'
import autoLoad from './helpers/autoLoad'
import getImageIdInstanceMetadata from './helpers/getImageIdInstanceMetadata'

const requestType = 'prefetch'
const preventCache = true // We are not using the cornerstone cache for this.

type ScalingParameters = {
  rescaleSlope: number
  rescaleIntercept: number
  modality: string
  suvbw?: number
  suvlbm?: number
  suvbsa?: number
}

// James wants another layer in between ImageVolume and SliceStreamingImageVolume
// which adds loaded/loading as an interface?

type PetScaling = {
  suvbwToSuvlbm?: number
  suvbwToSuvbsa?: number
}

export default class StreamingImageVolume extends ImageVolume {
  readonly imageIds: Array<string>
  loadStatus: {
    loaded: boolean
    loading: boolean
    cachedFrames: Array<boolean>
    callbacks: Array<Function>
  }

  constructor(
    imageVolumeProperties: IImageVolume,
    streamingProperties: IStreamingVolume
  ) {
    super(imageVolumeProperties)

    this.imageIds = streamingProperties.imageIds
    this.loadStatus = streamingProperties.loadStatus
  }

  private _hasLoaded = (): boolean => {
    const { loadStatus, imageIds } = this
    const numFrames = imageIds.length

    for (let i = 0; i < numFrames; i++) {
      if (!loadStatus.cachedFrames[i]) {
        return false
      }
    }

    return true
  }

  public cancelLoading() {
    const { loadStatus } = this

    if (!loadStatus || !loadStatus.loading) {
      return
    }

    // Set to not loading.
    loadStatus.loading = false

    // Remove all the callback listeners
    this.clearLoadCallbacks()
  }

  public clearLoadCallbacks() {
    this.loadStatus.callbacks = []
  }

  public load = (callback: Function) => {
    const { imageIds, loadStatus } = this

    if (loadStatus.loading === true) {
      console.log(`loadVolume: Loading is already in progress for ${this.uid}`)
      return // Already loading, will get callbacks from main load.
    }

    const { loaded } = this.loadStatus
    const numFrames = imageIds.length

    if (loaded) {
      if (callback) {
        callback({
          success: true,
          framesLoaded: numFrames,
          numFrames,
          framesProcessed: numFrames,
        })
      }
      return
    }

    if (callback) {
      this.loadStatus.callbacks.push(callback)
    }

    this._prefetchImageIds()
  }

  private _prefetchImageIds() {
    const { scalarData, loadStatus } = this
    const { cachedFrames } = loadStatus

    const {
      imageIds,
      vtkOpenGLTexture,
      vtkImageData,
      metadata,
      uid: volumeUID,
    } = this

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

    const autoRenderOnLoad = true
    const autoRenderPercentage = 2

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

    function successCallback(volume : StreamingImageVolume, imageIdIndex, imageId) {
      cachedFrames[imageIdIndex] = true
      framesLoaded++
      framesProcessed++

      vtkOpenGLTexture.setUpdatedFrame(imageIdIndex)
      vtkImageData.modified()

      const eventData = {
        FrameOfReferenceUID,
        imageVolume: volume,
      }

      triggerEvent(eventTarget, EVENTS.IMAGE_VOLUME_MODIFIED, eventData)

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
        metaData.get('generalSeriesModule', imageId) || {}

      if (generalSeriesModule.modality === 'PT') {
        const instanceMetadata = getImageIdInstanceMetadata(imageId)
        InstanceMetadataArray.push(instanceMetadata)
      }
    })

    let suvScalingFactors
    if (InstanceMetadataArray.length > 0) {
      suvScalingFactors = calculateSUVScalingFactors(InstanceMetadataArray)

      this._addScalingToVolume(suvScalingFactors)
    }

    interleavedFrames.forEach((frame) => {
      const { imageId, imageIdIndex } = frame

      if (cachedFrames[imageIdIndex]) {
        framesLoaded++
        framesProcessed++
        return
      }

      const modalityLutModule = metaData.get('modalityLutModule', imageId) || {}

      const generalSeriesModule =
        metaData.get('generalSeriesModule', imageId) || {}

      const scalingParameters: ScalingParameters = {
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
          successCallback(this, imageIdIndex, imageId)
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

  private _addScalingToVolume(suvScalingFactors) {
    if (!this.scaling) {
      this.scaling = {}
    }

    const firstSUVFactor = suvScalingFactors[0]

    if (!this.scaling.PET) {
      // These ratios are constant across all frames, so only need one.
      const { suvbw, suvlbm, suvbsa } = firstSUVFactor

      const petScaling = <PetScaling>{}

      if (suvlbm) {
        petScaling.suvbwToSuvlbm = suvlbm / suvbw
      }

      if (suvbsa) {
        petScaling.suvbwToSuvbsa = suvbsa / suvbw
      }

      this.scaling.PET = petScaling
    }
  }

  /*decache(completelyRemove = false) {
    if (completelyRemove) {
    } else {
      // Do we have enough space in volatile cache?
      // If not, remove some
      // Next, start convertToImages (createImage style) => putIntoImageCache
    }
  }*/
}
