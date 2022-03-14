import dicomParser from 'dicom-parser'
import * as cornerstone from '@precisionmetrics/cornerstone-render'
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader'

export default function initProviders() {
  cornerstoneWADOImageLoader.external.cornerstone = cornerstone
  cornerstoneWADOImageLoader.external.dicomParser = dicomParser
  cornerstoneWADOImageLoader.configure({
    useWebWorkers: true,
    decodeConfig: {
      convertFloatPixelDataToInt: false,
    },
  })

  var config = {
    maxWebWorkers: navigator.hardwareConcurrency || 1,
    startWebWorkersOnDemand: false,
    taskConfiguration: {
      decodeTask: {
        initializeCodecsOnStartup: true,
        strict: false,
      },
    },
  }

  cornerstoneWADOImageLoader.webWorkerManager.initialize(config)
}
