import {
  getPixelData,
  decodeImageFrame,
  getImageFrame,
} from 'cornerstone-wado-image-loader'
import { IRegisterImageLoader } from '../../src/types'

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
function volumeLoader(cornerstone: IRegisterImageLoader): void {
  cornerstone.registerImageLoader('vtkjs', _loadImageIntoBuffer)
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
  const uri = imageId.substring(6)

  const promise = new Promise((resolve, reject) => {
    // TODO: load bulk data items that we might need
    const mediaType = 'multipart/related; type="application/octet-stream"' // 'image/dicom+jp2';

    // get the pixel data from the server
    getPixelData(uri, imageId, mediaType)
      .then((result) => {
        const transferSyntax = getTransferSyntaxForContentType(
          result.contentType
        )

        const pixelData = result.imageFrame.pixelData

        if (!pixelData || !pixelData.length) {
          reject(new Error('The file does not contain image data.'))
          return
        }

        const canvas = document.createElement('canvas')
        const imageFrame = getImageFrame(imageId)
        const decodePromise = decodeImageFrame(
          imageFrame,
          transferSyntax,
          pixelData,
          canvas,
          options
        )

        decodePromise.then(() => {
          resolve(undefined)
        }, reject)
      }, reject)
      .catch((error) => {
        reject(error)
      })
  })

  return {
    promise,
    cancelFn: undefined,
  }
}

/**
 * Helper method to extract the transfer-syntax from the response of the server.
 *
 * @param contentType The value of the content-type header as returned by a WADO-RS server.
 */
function getTransferSyntaxForContentType(contentType: string): string {
  const defaultTransferSyntax = '1.2.840.10008.1.2' // Default is Implicit Little Endian.

  if (!contentType) {
    return defaultTransferSyntax
  }

  // Browse through the content type parameters
  const parameters = contentType.split(';')
  const params: Record<string, any> = {}

  parameters.forEach((parameter) => {
    // Look for a transfer-syntax=XXXX pair
    const parameterValues = parameter.split('=')

    if (parameterValues.length !== 2) {
      return
    }

    const value = parameterValues[1].trim().replace(/"/g, '')

    params[parameterValues[0].trim()] = value
  })

  // This is useful if the PACS doesn't respond with a syntax
  // in the content type.
  // http://dicom.nema.org/medical/dicom/current/output/chtml/part18/chapter_6.html#table_6.1.1.8-3b
  const defaultTransferSyntaxByType = {
    'image/jpeg': '1.2.840.10008.1.2.4.70',
    'image/x-dicom-rle': '1.2.840.10008.1.2.5',
    'image/x-jls': '1.2.840.10008.1.2.4.80',
    'image/jp2': '1.2.840.10008.1.2.4.90',
    'image/jpx': '1.2.840.10008.1.2.4.92',
  }

  if (params['transfer-syntax']) {
    return params['transfer-syntax']
  } else if (
    contentType &&
    !Object.keys(params).length &&
    defaultTransferSyntaxByType[contentType]
  ) {
    // dcm4che seems to be reporting the content type as just 'image/jp2'?
    return defaultTransferSyntaxByType[contentType]
  } else if (params.type && defaultTransferSyntaxByType[params.type]) {
    return defaultTransferSyntaxByType[params.type]
  }

  return defaultTransferSyntax
}

export { volumeLoader, getTransferSyntaxForContentType }
