import * as cornerstone from '@cornerstone'
const canvas = document.createElement('canvas')
let lastImageIdDrawn

// TODO: Not sure why, but this seems to have broken?
// It resolves as undefined when running Karma tests?
// const { IRegisterImageLoader } = cornerstone.Types;

/**
 * creates a cornerstone Image object for the specified Image and imageId
 *
 * @param image - An Image
 * @param imageId - the imageId for this image
 * @returns Cornerstone Image Object
 */
function createImage(image, imageId) {
  // extract the attributes we need
  const rows = image.naturalHeight
  const columns = image.naturalWidth

  function getPixelData() {
    const imageData = getImageData()

    return imageData.data
  }

  function getImageData() {
    let context

    if (lastImageIdDrawn === imageId) {
      context = canvas.getContext('2d')
    } else {
      canvas.height = image.naturalHeight
      canvas.width = image.naturalWidth
      context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      lastImageIdDrawn = imageId
    }

    return context.getImageData(0, 0, image.naturalWidth, image.naturalHeight)
  }

  function getCanvas() {
    if (lastImageIdDrawn === imageId) {
      return canvas
    }

    canvas.height = image.naturalHeight
    canvas.width = image.naturalWidth
    const context = canvas.getContext('2d')

    context.drawImage(image, 0, 0)
    lastImageIdDrawn = imageId

    return canvas
  }

  // Extract the various attributes we need
  return {
    imageId,
    minPixelValue: 0,
    maxPixelValue: 255,
    slope: 1,
    intercept: 0,
    windowCenter: 128,
    windowWidth: 255,
    getPixelData,
    getCanvas,
    getImage: () => image,
    rows,
    columns,
    height: rows,
    width: columns,
    color: true,
    rgba: false,
    columnPixelSpacing: undefined,
    rowPixelSpacing: undefined,
    invert: false,
    sizeInBytes: rows * columns * 4,
  }
}

function arrayBufferToImage(arrayBuffer) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const arrayBufferView = new Uint8Array(arrayBuffer)
    const blob = new Blob([arrayBufferView])
    const urlCreator = window.URL || window.webkitURL
    const imageUrl = urlCreator.createObjectURL(blob)

    image.src = imageUrl
    image.onload = () => {
      resolve(image)
      urlCreator.revokeObjectURL(imageUrl)
    }

    image.onerror = (error) => {
      urlCreator.revokeObjectURL(imageUrl)
      reject(error)
    }
  })
}

//
// This is a cornerstone image loader for web images such as PNG and JPEG
//
const options = {
  // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
  beforeSend: () => {
    // xhr
  },
}

// Loads an image given a url to an image
function loadImage(uri, imageId) {
  const xhr = new XMLHttpRequest()

  xhr.open('GET', uri, true)
  xhr.responseType = 'arraybuffer'
  options.beforeSend(xhr)

  xhr.onprogress = function (oProgress) {
    if (oProgress.lengthComputable) {
      // evt.loaded the bytes browser receive
      // evt.total the total bytes set by the header
      const loaded = oProgress.loaded
      const total = oProgress.total
      const percentComplete = Math.round((loaded / total) * 100)

      const eventData = {
        imageId,
        loaded,
        total,
        percentComplete,
      }

      cornerstone.triggerEvent(
        cornerstone.eventTarget,
        'cornerstoneimageloadprogress',
        eventData
      )
    }
  }

  xhr.onerror = function (error) {
    reject(error)
  }

  const promise = new Promise((resolve, reject) => {
    xhr.onload = function () {
      const imagePromise = arrayBufferToImage(this.response)

      imagePromise
        .then((image) => {
          const imageObject = createImage(image, imageId)

          resolve(imageObject)
        }, reject)
        .catch((error) => {
          console.error(error)
        })
    }

    xhr.send()
  })

  const cancelFn = () => {
    xhr.abort()
  }

  return {
    promise,
    cancelFn,
  }
}

/**
 * Part of this library's setup. Required to setup image-loading capabilities. Our
 * integration and injection point for `cornerstone-core`.
 *
 * @remarks
 * `cornerstone-core` provides a method to register an image loader. It also provides
 * a mechanism for caching image data, a generic interface for image loaders, and a
 * few other benefits. For the time being, we leverage those benefits by injecting
 * `cornerstone-core` as a dependency when we use this method to wire up our image
 * loader.
 *
 * Under the hood, this method registers a new "Image Loader" with `cornerstone-core`.
 * It uses the "vtkjs" scheme for image ids.
 *
 * @public
 * @example
 * Wiring up the image-loader and providing cornerstone
 * ```
 * import cornerstone from 'cornerstone-core';
 * import { registerImageLoader } from 'vtkjs-viewport';
 *
 * registerImageLoader(cornerstone);
 * ```
 */
function registerWebImageLoader(cs): void {
  cs.registerImageLoader('web', _loadImageIntoBuffer)
}

/**
 * Small stripped down loader from cornerstoneWADOImageLoader
 * Which doesn't create cornerstone images that we don't need
 *
 * @private
 */
function _loadImageIntoBuffer(
  imageId: string,
  options?: Record<string, any>
): { promise: Promise<Record<string, any>>; cancelFn: () => void } {
  const uri = imageId.replace('web:', '')

  const promise = new Promise((resolve, reject) => {
    // get the pixel data from the server
    loadImage(uri, imageId)
      .promise.then(
        (image) => {
          if (!options || !options.targetBuffer) {
            resolve(image)
            return
          }
          // If we have a target buffer, write to that instead. This helps reduce memory duplication.
          const { arrayBuffer, offset, length, type } = options.targetBuffer

          const pixelDataRGBA = image.getPixelData()
          const pixelDataRGB = new Uint8ClampedArray(
            (pixelDataRGBA.length * 3) / 4
          )

          let j = 0
          for (let i = 0; i < pixelDataRGBA.length; i += 4) {
            pixelDataRGB[j] = pixelDataRGBA[i]
            pixelDataRGB[j + 1] = pixelDataRGBA[i + 1]
            pixelDataRGB[j + 2] = pixelDataRGBA[i + 2]
            j += 3
          }

          const targetArray = new Uint8Array(arrayBuffer, offset, length)

          // TypedArray.Set is api level and ~50x faster than copying elements even for
          // Arrays of different types, which aren't simply memcpy ops.
          targetArray.set(pixelDataRGB, 0)

          resolve()
        },
        (error) => {
          console.warn('something??')
        }
      )
      .catch((error) => {
        reject(error)
      })
  })

  return {
    promise,
    cancelFn: undefined,
  }
}

export { registerWebImageLoader }
