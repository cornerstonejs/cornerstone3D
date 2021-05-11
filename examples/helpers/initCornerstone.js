import dicomParser from 'dicom-parser';
import * as cornerstone from '@ohif/cornerstone-render';
import * as csTools3d from '@cornerstone-tools';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';

import WADORSHeaderProvider from './WADORSHeaderProvider';

// Wire up listeners for renderingEngine's element enabled events
csTools3d.init();

window.cornerstone = cornerstone;
window.cornerstoneWADOImageLoader = cornerstoneWADOImageLoader;

cornerstone.metaData.addProvider(
WADORSHeaderProvider.get.bind(WADORSHeaderProvider),
  9999
);

cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({ useWebWorkers: true });

var config = {
  maxWebWorkers: navigator.hardwareConcurrency || 1,
  startWebWorkersOnDemand: false,
  taskConfiguration: {
    decodeTask: {
      initializeCodecsOnStartup: false,
      usePDFJS: false,
      strict: false,
    },
  },
};

cornerstoneWADOImageLoader.webWorkerManager.initialize(config);

// Add hardcoded meta data provider for color images

export function hardcodedMetaDataProvider(type, imageId, imageIds) {
  const colonIndex = imageId.indexOf(':')
  const scheme = imageId.substring(0, colonIndex)
  if (scheme !== 'web') return

  if (type === 'imagePixelModule') {
    const imagePixelModule = {
      pixelRepresentation: 0,
      bitsAllocated: 24,
      bitsStored: 24,
      highBit: 24,
      photometricInterpretation: 'RGB',
      samplesPerPixel: 3,
    }

    return imagePixelModule;
  } else if (type === 'generalSeriesModule') {
    const generalSeriesModule = {
      modality: 'SC'
    }

    return generalSeriesModule
  } else if (type === 'imagePlaneModule') {
    const index = imageIds.indexOf(imageId);
    // console.warn(index);
    const imagePlaneModule = {
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      imagePositionPatient: [0, 0, index * 5],
      pixelSpacing: [1, 1],
      columnPixelSpacing: 1,
      rowPixelSpacing: 1,
      frameOfReferenceUID: 'FORUID',
      columns: 2048,
      rows: 1216,
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
    }

    return imagePlaneModule
  } else if (type === 'voiLutModule') {
    return {
      windowWidth: [255],
      windowCenter: [127]
    }
  } else if (type === 'modalityLutModule') {
    return {
      rescaleSlope: 1,
      rescaleIntercept: 0
    }
  }

  console.warn(type);
  throw new Error('not available!')
}
