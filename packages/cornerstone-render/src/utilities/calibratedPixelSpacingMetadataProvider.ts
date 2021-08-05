import imageIdtoURI from './imageIdToURI'

const state = {} // Calibrated pixel spacing per imageId

/**
 * Simple metadataProvider object to store metadata for calibrated spacings
 */
const metadataProvider = {
  add: (imageId: string, payload: [number, number]): void => {
    const imageURI = imageIdtoURI(imageId)
    if (!state[imageURI]) {
      state[imageURI] = {}
    }
    state[imageURI] = payload
  },

  get: (type: string, imageId: string): [number, number] => {
    if (type === 'calibratedPixelSpacing') {
      const imageURI = imageIdtoURI(imageId)
      return state[imageURI]
    }
  },
}

export default metadataProvider
