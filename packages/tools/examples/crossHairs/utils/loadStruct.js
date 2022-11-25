import dcmjs from 'dcmjs';
import cornerstone from '@cornerstonejs/core';
import cornerstoneTools from '@cornerstonejs/tools';
import { vec3 } from 'gl-matrix';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import { metaData } from '@cornerstonejs/core';

const dicomlab2RGB = dcmjs.data.Colors.dicomlab2RGB;

export default async function loadRTStruct(rtStructIds, referenceImageIds) {
  // Set here is loading is asynchronous.
  // If this function throws its set back to false.

  let rtstructInstanceMetaData =
    cornerstoneWADOImageLoader.wadors.metaDataManager.get(rtStructIds[0]);

  rtstructInstanceMetaData = JSON.parse(
    JSON.stringify(rtstructInstanceMetaData)
  );

  const rtStructDataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
    rtstructInstanceMetaData
  );

  //rtStructDataset._meta = dcmjs.data.DicomMetaDictionary.namifyDataset(dicomData.meta);

  const {
    StructureSetROISequence,
    ROIContourSequence,
    RTROIObservationsSequence,
  } = rtStructDataset;

  // Define our structure set entry and add it to the rtstruct module state.

  const imageIdSopInstanceUidPairs =
    _getImageIdSopInstanceUidPairsForDisplaySet(referenceImageIds);

  const ROIContourDataList = {};
  for (let i = 0; i < ROIContourSequence.length; i++) {
    const ROIContour = ROIContourSequence[i];
    const { ReferencedROINumber, ContourSequence } = ROIContour;

    if (!ContourSequence) {
      continue;
    }

    let isSupported = false;

    const ContourSequenceArray = _toArray(ContourSequence);
    const pointsList = [];
    for (let c = 0; c < ContourSequenceArray.length; c++) {
      const {
        ContourImageSequence,
        ContourData,
        NumberOfContourPoints,
        ContourGeometricType,
      } = ContourSequenceArray[c];

      const sopInstanceUID = ContourImageSequence
        ? ContourImageSequence.ReferencedSOPInstanceUID
        : _getClosestSOPInstanceUID(
            ContourData,
            ContourGeometricType,
            NumberOfContourPoints,
            imageIdSopInstanceUidPairs
          );
      const imageId = _getImageId(imageIdSopInstanceUidPairs, sopInstanceUID);

      if (!imageId) {
        continue;
      }

      const imagePlane = metaData.get('imagePlaneModule', imageId);
      const points = [];

      let measurementData;

      switch (ContourGeometricType) {
        case 'CLOSED_PLANAR':
        case 'OPEN_PLANAR':
        case 'POINT':
          isSupported = true;

          for (let p = 0; p < NumberOfContourPoints * 3; p += 3) {
            points.push({
              x: ContourData[p],
              y: ContourData[p + 1],
              z: ContourData[p + 2],
            });
          }

          //transformPointsToImagePlane(points, imagePlane);
          measurementData = {
            points: points,
            type: ContourGeometricType,
            structureSetSeriesInstanceUid: rtStructDataset.SeriesInstanceUID,
            ROINumber: ReferencedROINumber,
          };

          pointsList.push(measurementData);

          break;
        default:
          continue;
      }
    }

    const roiData = _setROIContourMetadata(
      StructureSetROISequence,
      RTROIObservationsSequence,
      ROIContour,
      isSupported
    );
    ROIContourDataList[roiData.ROIName] = { roiData, pointsList };
  }
  return ROIContourDataList;
}

function _setROIContourMetadata(
  StructureSetROISequence,
  RTROIObservationsSequence,
  ROIContour,
  isSupported
) {
  const StructureSetROI = StructureSetROISequence.find(
    (structureSetROI) =>
      structureSetROI.ROINumber === ROIContour.ReferencedROINumber
  );

  const ROIContourData = {
    ROINumber: StructureSetROI.ROINumber,
    ROIName: StructureSetROI.ROIName,
    ROIGenerationAlgorithm: StructureSetROI.ROIGenerationAlgorithm,
    ROIDescription: StructureSetROI.ROIDescription,
    isSupported,
    visible: true,
  };

  _setROIContourDataColor(ROIContour, ROIContourData);

  if (RTROIObservationsSequence) {
    // If present, add additional RTROIObservations metadata.
    _setROIContourRTROIObservations(
      ROIContourData,
      RTROIObservationsSequence,
      ROIContour.ReferencedROINumber
    );
  }

  return ROIContourData;
}

function _setROIContourDataColor(ROIContour, ROIContourData) {
  let { ROIDisplayColor, RecommendedDisplayCIELabValue } = ROIContour;

  if (!ROIDisplayColor && RecommendedDisplayCIELabValue) {
    // If ROIDisplayColor is absent, try using the RecommendedDisplayCIELabValue color.
    ROIDisplayColor = dicomlab2RGB(RecommendedDisplayCIELabValue);
  }

  if (ROIDisplayColor) {
    ROIContourData.colorArray = [...ROIDisplayColor];
  } else {
    //Choose a color from the cornerstoneTools colorLUT
    // We sample from the default color LUT here (i.e. 0), as we have nothing else to go on.
    const { getters } = cornerstoneTools.getModule('segmentation');
    const color = getters.colorForSegmentIndexColorLUT(
      0,
      ROIContourData.ROINumber
    );

    ROIContourData.colorArray = [...color];
  }
}

function _setROIContourRTROIObservations(
  ROIContourData,
  RTROIObservationsSequence,
  ROINumber
) {
  const RTROIObservations = RTROIObservationsSequence.find(
    (RTROIObservations) => RTROIObservations.ReferencedROINumber === ROINumber
  );

  if (RTROIObservations) {
    // Deep copy so we don't keep the reference to the dcmjs dataset entry.
    const {
      ObservationNumber,
      ROIObservationDescription,
      RTROIInterpretedType,
      ROIInterpreter,
    } = RTROIObservations;

    ROIContourData.RTROIObservations = {
      ObservationNumber,
      ROIObservationDescription,
      RTROIInterpretedType,
      ROIInterpreter,
    };
  }
}

const _getImageId = (imageIdSopInstanceUidPairs, sopInstanceUID) => {
  const imageIdSopInstanceUidPairsEntry = imageIdSopInstanceUidPairs.find(
    (imageIdSopInstanceUidPairsEntry) =>
      imageIdSopInstanceUidPairsEntry.sopInstanceUID === sopInstanceUID
  );

  return imageIdSopInstanceUidPairsEntry
    ? imageIdSopInstanceUidPairsEntry.imageId
    : null;
};

function _getImageIdSopInstanceUidPairsForDisplaySet(imageIds) {
  return imageIds.map((imageId) => {
    const metadata = metaData.get('sopCommonModule', imageId);
    return {
      imageId,
      sopInstanceUID: metadata.sopInstanceUID,
    };
  });
}

function _toArray(objOrArray) {
  return Array.isArray(objOrArray) ? objOrArray : [objOrArray];
}

function _getClosestSOPInstanceUID(
  ContourData,
  ContourGeometricType,
  NumberOfContourPoints,
  imageIdSopInstanceUidPairs
) {
  const closest = {
    distance: Infinity,
    sopInstanceUID: null,
  };

  let point;

  switch (ContourGeometricType) {
    case 'POINT':
      point = ContourData;
      break;
    case 'CLOSED_PLANAR':
    case 'OPEN_PLANAR':
      // These are defined as planar, so get the of the region to get the
      // Best mapping to a plane even if its potentially off center.

      point = [0, 0, 0];
      for (let p = 0; p < NumberOfContourPoints * 3; p += 3) {
        point[0] += ContourData[p];
        point[1] += ContourData[p + 1];
        point[2] += ContourData[p + 2];
      }

      point[0] /= NumberOfContourPoints;
      point[1] /= NumberOfContourPoints;
      point[2] /= NumberOfContourPoints;
  }

  imageIdSopInstanceUidPairs.forEach((pair) => {
    const { imageId } = pair;

    const imagePlaneModule = cornerstone.metaData.get(
      'imagePlaneModule',
      imageId
    );

    const distance = distanceFromPointToPlane(point, imagePlaneModule);

    if (distance < closest.distance) {
      closest.distance = distance;
      closest.sopInstanceUID = pair.sopInstanceUID;
    }
  });

  return closest.sopInstanceUID;
}

/**
 *
 * @param {number[3]} P - The point
 * @param {object} imagePlaneModule The cornerstone metadata object for the imagePlane
 */
function distanceFromPointToPlane(P, imagePlaneModule) {
  const {
    rowCosines,
    columnCosines,
    imagePositionPatient: Q,
  } = imagePlaneModule;

  let N = [];
  vec3.cross(N, rowCosines, columnCosines);

  const [A, B, C] = N;

  const D = -A * Q[0] - B * Q[1] - C * Q[2];

  return Math.abs(A * P[0] + B * P[1] + C * P[2] + D); // Denominator is sqrt(A**2 + B**2 + C**2) which is 1 as its a normal vector
}
