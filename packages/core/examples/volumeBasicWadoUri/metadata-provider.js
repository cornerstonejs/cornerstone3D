import * as cornerstone from '@cornerstonejs/core';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';

function metadataProvider(type, imageId) {
  const { parseImageId, dataSetCacheManager } =
    cornerstoneWADOImageLoader.wadouri;
  const parsedImageId = parseImageId(imageId);
  let dataSet = dataSetCacheManager.get(parsedImageId.url);

  if (!dataSet) {
    // If image metadata not found, and this request isn't asking for instance
    // specific metadata, return metadata from the middle (or 2nd) prefetched
    // metadata set.
    const cachedImageIds = Object.keys(metaDataCache);
    const middleImageId =
      Object.keys(metaDataCache)[Math.floor(cachedImageIds.length / 2)];
    if (
      ![
        'generalImageModule',
        'cineModule',
        'sortableAttributes',
        'imagePlaneModule',
      ].includes(type) &&
      metaDataCache[middleImageId]
    ) {
      dataSet = metaDataCache[middleImageId];
    } else {
      console.warn(`Dataset for imageId ${imageId} not available`);
      return;
    }
  }

  if (type === 'frameOfReferenceModule') {
    return {
      frameOfReferenceUID: dataSet.string('x00200052'),
    };
  }

  if (type === 'imagePlaneModule') {
    const imageOrientationPatient = dataSet.string('x00200037');
    const imagePositionPatient = dataSet.string('x00200032');
    const pixelSpacing = dataSet.string('x00280030');
    const iPP = imagePositionPatient.split('\\').map((x) => parseFloat(x));
    const iOP = imageOrientationPatient.split('\\').map((x) => parseFloat(x));
    const pS = pixelSpacing.split('\\').map((x) => parseFloat(x));
    return {
      rowCosines: [iOP[0], iOP[1], iOP[2]],
      columnCosines: [iOP[3], iOP[4], iOP[5]],
      frameOfReferenceUID: dataSet.string('x00200052'),
      imagePositionPatient: iPP,
      imageOrientationPatient: iOP,
      rowPixelSpacing: pS[0],
      columnPixelSpacing: pS[1],
      pixelSpacing: pS,
      sliceLocation: parseFloat(dataSet.string('x00201041')),
      sliceThickness: parseFloat(dataSet.string('x00180050')),
      spacingBetweenSlices: parseFloat(dataSet.string('x00180088')),
      rows: dataSet.uint16('x00280010'),
      columns: dataSet.uint16('x00280011'),
    };
  }

  if (type === 'imagePixelModule') {
    return {
      rows: dataSet.uint16('x00280010'),
      columns: dataSet.uint16('x00280011'),
      pixelRepresentation: dataSet.uint16('x00280103'),
      bitsAllocated: dataSet.uint16('x00280100'),
      bitsStored: dataSet.uint16('x00280101'),
      highBit: dataSet.uint16('x00280102'),
      photometricInterpretation: dataSet.string('x00280004'),
      samplesPerPixel: dataSet.uint16('x00280002'),
    };
  }

  if (type === 'generalImageModule') {
    return {
      instanceNumber: dataSet.intString('x00200013'),
      lossyImageCompression: dataSet.string('x00282110'),
      lossyImageCompressionRatio: dataSet.string('x00282112'),
      lossyImageCompressionMethod: dataSet.string('x00282114'),
      acquisitionTime: dataSet.string('x00080032'),
      contentTime: dataSet.string('x00080033'),
    };
  }

  if (type === 'patientModule') {
    return {
      patientName: dataSet.string('x00100010'),
      patientId: dataSet.string('x00100020'),
    };
  }

  if (type === 'generalSeriesModule') {
    return {
      modality: dataSet.string('x00080060'),
      seriesInstanceUID: dataSet.string('x0020000e'),
    };
  }

  if (type === 'generalStudyModule') {
    return {
      studyDescription: dataSet.string('x00081030'),
      studyDate: dataSet.string('x00080020'),
      studyTime: dataSet.string('x00080030'),
    };
  }

  if (type === 'cineModule') {
    return {
      frameTime: dataSet.float('x00181063'),
    };
  }

  if (type === 'sortableAttributes') {
    return {
      instanceNumber: dataSet.intString('x00200013'),
      acquisitionTime: dataSet.string('x00080032'),
      contentTime: dataSet.string('x00080033'),
      sliceLocation: parseFloat(dataSet.string('x00201041')),
    };
  }

  if (type === 'voiLutModule') {
    return {
      windowWidth: parseFloat(dataSet.string('x00281051')),
      windowCenter: parseFloat(dataSet.string('x00281050')),
    };
  }

  if (type === 'modalityLutModule') {
    return {
      rescaleSlope: parseFloat(dataSet.string('x00281053')),
      rescaleIntercept: parseFloat(dataSet.string('x00281052')),
    };
  }

  if (type === 'scalingModule') {
    return {
      rescaleSlope: parseFloat(dataSet.string('x00281053')),
      rescaleIntercept: parseFloat(dataSet.string('x00281052')),
    };
  }
}

cornerstone.metaData.addProvider(metadataProvider);
