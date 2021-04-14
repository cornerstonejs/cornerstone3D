import {
  EVENTS,
  eventTarget,
  metaData,
  requestPoolManager,
  triggerEvent,
  ImageVolume,
  Types,
  cache,
  loadImage,
} from '@cornerstone'
import { calculateSUVScalingFactors } from 'calculate-suv'

import getInterleavedFrames from './helpers/getInterleavedFrames'
import autoLoad from './helpers/autoLoad'
import getImageIdInstanceMetadata from './helpers/getImageIdInstanceMetadata'
import {
  IImage,
  IVolume,
  IStreamingVolume,
} from 'src/cornerstone-core/src/types'

const requestType = 'prefetch'

type LoadStatusInterface = {
  success: boolean
  framesLoaded: number
  numFrames: number
  framesProcessed: number
}

type ScalingParameters = {
  rescaleSlope: number
  rescaleIntercept: number
  modality: string
  suvbw?: number
  suvlbm?: number
  suvbsa?: number
}

// TODO James wants another layer in between ImageVolume and SliceStreamingImageVolume
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
    callbacks: Array<(LoadStatusInterface) => void>
  }

  constructor(
    imageVolumeProperties: IVolume,
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

    // Create a filter function which only keeps requests
    // which do not match this volume's UID
    const filterFunction = ({ additionalDetails }) => {
      return additionalDetails.volumeUID !== this.uid
    }

    // Instruct the request pool manager to filter queued
    // requests to ensure requests we no longer need are
    // no longer sent.
    requestPoolManager.filterRequests(filterFunction)
  }

  public clearLoadCallbacks() {
    this.loadStatus.callbacks = []
  }

  public load = (callback: (LoadStatusInterface) => void) => {
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

    function successCallback(
      volume: StreamingImageVolume,
      imageIdIndex,
      imageId
    ) {
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

        // TODO: Should we remove the callbacks in favour of just using events?
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

      // Note: These options are specific to the WADO Image Loader
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

      // Use loadImage because we are skipping the Cornerstone Image cache
      // when we load directly into the Volume cache
      function sendRequest(imageId, imageIdIndex, options) {
        return loadImage(imageId, options).then(
          () => {
            successCallback(this, imageIdIndex, imageId)
          },
          (error) => {
            errorCallback(error, imageIdIndex, imageId)
          }
        )
      }

      const additionalDetails = {
        volumeUID: this.uid,
      }

      const priority = 5
      const addToBeginning = false

      console.log('adding requests')
      requestPoolManager.addRequest(
        sendRequest.bind(this, imageId, imageIdIndex, options),
        requestType,
        priority,
        additionalDetails,
        addToBeginning
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

  private _removeFromCache() {
    // TODO: not 100% sure this is the same UID as the volume loader's volumeId?
    // so I have no idea if this will work
    cache.removeVolumeLoadObject(this.uid)
  }

  private _convertToImages() {
    // 1. Try to decache images in the volatile Image Cache to provide
    //    enough space to store another entire copy of the volume (as Images).
    //    If we do not have enough, we will store as many images in the cache
    //    as possible, and the rest of the volume will be decached.
    const byteLength = this.sizeInBytes
    const numImages = this.imageIds.length
    let bytesRemaining = cache.decacheIfNecessaryUntilBytesAvailable(
      byteLength,
      this.imageIds
    )

    // Divide the total volume size by the number of images in the stack
    // to get the bytes per image
    const bytesPerImage = byteLength / numImages

    // TODO: There is probably a better way to get this information
    const numVoxels =
      this.dimensions[0] * this.dimensions[1] * this.dimensions[2]
    const numComponents = this.scalarData.length / numVoxels
    const pixelsPerImage =
      this.dimensions[0] * this.dimensions[1] * numComponents

    // Grab the buffer and it's type
    const volumeBuffer = this.scalarData.buffer
    // (not sure if this actually works, TypeScript keeps complaining)
    const TypedArray = this.scalarData.constructor

    const { PhotometricInterpretation, voiLut } = this.metadata

    let windowCenter = []
    let windowWidth = []

    if (voiLut && voiLut.length) {
      windowCenter = voiLut.map((voi) => {
        return voi.windowCenter
      })

      windowWidth = voiLut.map((voi) => {
        return voi.windowWidth
      })
    }

    const pointData = this.vtkImageData.getPointData()
    const color = pointData.getNumberOfComponents() > 1 ? true : false

    for (let imageIdIndex = 0; imageIdIndex < numImages; imageIdIndex++) {
      bytesRemaining = bytesRemaining - bytesPerImage
      // 2. Given the index of the image and frame length in bytes,
      //    create a view on the volume arraybuffer
      const byteOffset = bytesPerImage * imageIdIndex

      // 3. Create a new TypedArray of the same type for the new
      //    Image that will be created
      const imageScalarData = new TypedArray(pixelsPerImage)
      const volumeBufferView = new TypedArray(
        volumeBuffer,
        byteOffset,
        pixelsPerImage
      )

      // 4. Use e.g. TypedArray.set() to copy the data from the larger
      //    buffer's view into the smaller one
      imageScalarData.set(volumeBufferView)

      // 5. TODO: Create an Image Object from imageScalarData and put it into the Image
      // cache...
      const imageId = this.imageIds[imageIdIndex]
      const modalityLutModule = metaData.get('modalityLutModule', imageId) || {}
      const minMax = this.getMinMax(imageScalarData)

      const image: IImage = {
        imageId,
        rows: this.dimensions[0],
        columns: this.dimensions[1],
        sizeInBytes: imageScalarData.byteLength,
        getPixelData: () => {
          return imageScalarData
        },
        minPixelValue: minMax.min,
        maxPixelValue: minMax.max,
        slope: modalityLutModule.rescaleSlope
          ? modalityLutModule.rescaleSlope
          : 1,
        intercept: modalityLutModule.rescaleIntercept
          ? modalityLutModule.rescaleIntercept
          : 0,
        windowCenter,
        windowWidth,
        getCanvas: undefined, // todo: which canvas?
        height: this.dimensions[0],
        width: this.dimensions[1],
        color,
        rgba: undefined, // todo: how
        columnPixelSpacing: this.spacing[0],
        rowPixelSpacing: this.spacing[1],
        invert: PhotometricInterpretation === 'MONOCHROME1',
      }

      // todo: should we await here? since we are adding images to the imageCache
      // and cache size doesn't get updated unless promise is resolved into the image
      cache.putImageLoadObject(imageId, {
        promise: Promise.resolve(image),
      })

      // 6. If we know we won't be able to add another Image to the cache
      //    without breaching the limit, stop here.
      if (bytesRemaining <= bytesPerImage) {
        break
      }
    }
    // 7. When as much of the Volume is processed into Images as possible
    //    without breaching the cache limit, remove the Volume
    this._removeFromCache()
  }

  public decache(completelyRemove = false): void {
    if (completelyRemove) {
      this._removeFromCache()
    } else {
      this._convertToImages()
    }
  }

  /**
   * Calculate the minimum and maximum values in an Array
   *
   * @param {Number[]} storedPixelData
   * @return {{min: Number, max: Number}}
   */
  private getMinMax(storedPixelData) {
    // we always calculate the min max values since they are not always
    // present in DICOM and we don't want to trust them anyway as cornerstone
    // depends on us providing reliable values for these
    let min = storedPixelData[0]

    let max = storedPixelData[0]

    let storedPixel
    const numPixels = storedPixelData.length

    for (let index = 1; index < numPixels; index++) {
      storedPixel = storedPixelData[index]
      min = Math.min(min, storedPixel)
      max = Math.max(max, storedPixel)
    }

    return {
      min,
      max,
    }
  }
}
