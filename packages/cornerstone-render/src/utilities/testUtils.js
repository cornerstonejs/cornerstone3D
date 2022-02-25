import resemble from 'resemblejs'

import { fakeImageLoader, fakeMetaDataProvider } from './testUtilsImageLoader'
import { fakeVolumeLoader } from './testUtilsVolumeLoader'
import { createNormalizedMouseEvent } from './testUtilsMouseEvents'

// 10 slice, 10 colors
const colors = [
  [255, 0, 0],
  [0, 255, 0],
  [128, 0, 0],
  [0, 0, 255],
  [0, 128, 0],
  [255, 255, 0],
  [0, 255, 255],
  [0, 0, 0],
  [0, 0, 128],
  [255, 0, 255],
]

Object.freeze(colors)

function downloadURI(uri, name) {
  const link = document.createElement('a')

  link.download = `${name}.png`
  link.href = uri
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function compareImages(imageDataURL, baseline, outputName) {
  return new Promise((resolve, reject) => {
    resemble.outputSettings({
      useCrossOrigin: false,
      errorColor: {
        red: 0,
        green: 255,
        blue: 0,
      },
      // errorType: 'movement',
      transparency: 0.5,
      largeImageThreshold: 1200,
      outputDiff: true,
    })

    resemble(baseline.default)
      .compareTo(imageDataURL)
      .onComplete((data) => {
        const mismatch = parseFloat(data.misMatchPercentage)
        // If the error is greater than 1%, fail the test
        // and download the difference image
        if (mismatch > 1) {
          console.log(imageDataURL)

          console.log('mismatch of ' + mismatch + '%')
          const diff = data.getImageDataUrl()

          //downloadURI(diff, outputName)

          reject(new Error(`mismatch between images for ${outputName}`))
        } else {
          console.log(`Images match for ${outputName}`)
          resolve()
        }
      })
  })
}

const testUtils = {
  fakeImageLoader,
  fakeMetaDataProvider,
  fakeVolumeLoader,
  compareImages,
  createNormalizedMouseEvent,
  // utils
  downloadURI,
  colors,
}

export default testUtils
export { colors }
