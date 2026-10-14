import { log, utilities, normalizers, derivations } from 'dcmjs';
import ndarray from 'ndarray';
import getDatasetsFromImages from '../helpers/getDatasetsFromImages';
import {
  alignPixelDataWithSourceData,
  getValidOrientations,
} from './Segmentation_4X';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.adaptersLog.getLogger(
  'Cornerstone.Segmentation_3X'
);

const { datasetToBlob, BitArray, DicomMessage, DicomMetaDictionary } =
  utilities;

const { Normalizer } = normalizers;
const { Segmentation: SegmentationDerivation } = derivations;

const Segmentation = {
  generateSegmentation,
  generateToolState,
};

export default Segmentation;

/**
 *
 * @typedef {Object} BrushData
 * @property {Object} toolState - The cornerstoneTools global toolState.
 * @property {Object[]} segments - The cornerstoneTools segment metadata that corresponds to the
 *                                 seriesInstanceUid.
 */

/**
 * generateSegmentation - Generates cornerstoneTools brush data, given a stack of
 * imageIds, images and the cornerstoneTools brushData.
 *
 * @param  {object[]} images    An array of the cornerstone image objects.
 * @param  {BrushData} brushData and object containing the brushData.
 * @returns {type}           description
 */
function generateSegmentation(
  images,
  brushData,
  options = { includeSliceSpacing: true }
) {
  const { toolState, segments } = brushData;

  // Calculate the dimensions of the data cube.
  const image0 = images[0];

  const dims = {
    x: image0.columns,
    y: image0.rows,
    z: images.length,
  };

  dims.xy = dims.x * dims.y;

  const numSegments = _getSegCount(seg, segments);

  if (!numSegments) {
    throw new Error('No segments to export!');
  }

  const isMultiframe = image0.imageId.includes('?frame');
  const seg = _createSegFromImages(images, isMultiframe, options);

  const { referencedFramesPerSegment, segmentIndicies } =
    _getNumberOfFramesPerSegment(toolState, images, segments);

  let NumberOfFrames = 0;

  for (let i = 0; i < referencedFramesPerSegment.length; i++) {
    NumberOfFrames += referencedFramesPerSegment[i].length;
  }

  seg.setNumberOfFrames(NumberOfFrames);

  for (let i = 0; i < segmentIndicies.length; i++) {
    const segmentIndex = segmentIndicies[i];
    const referencedFrameIndicies = referencedFramesPerSegment[i];

    // Frame numbers start from 1.
    const referencedFrameNumbers = referencedFrameIndicies.map((element) => {
      return element + 1;
    });

    const segment = segments[segmentIndex];

    seg.addSegment(
      segment,
      _extractCornerstoneToolsPixelData(
        segmentIndex,
        referencedFrameIndicies,
        toolState,
        images,
        dims
      ),
      referencedFrameNumbers
    );
  }

  seg.bitPackPixelData();

  const segBlob = datasetToBlob(seg.dataset);

  return segBlob;
}

function _extractCornerstoneToolsPixelData(
  segmentIndex,
  referencedFrames,
  toolState,
  images,
  dims
) {
  const pixelData = new Uint8Array(dims.xy * referencedFrames.length);

  let pixelDataIndex = 0;

  for (let i = 0; i < referencedFrames.length; i++) {
    const frame = referencedFrames[i];

    const imageId = images[frame].imageId;
    const imageIdSpecificToolState = toolState[imageId];

    const brushPixelData =
      imageIdSpecificToolState.brush.data[segmentIndex].pixelData;

    for (let p = 0; p < brushPixelData.length; p++) {
      pixelData[pixelDataIndex] = brushPixelData[p];
      pixelDataIndex++;
    }
  }

  return pixelData;
}

function _getNumberOfFramesPerSegment(toolState, images, segments) {
  const segmentIndicies = [];
  const referencedFramesPerSegment = [];

  for (let i = 0; i < segments.length; i++) {
    if (segments[i]) {
      segmentIndicies.push(i);
      referencedFramesPerSegment.push([]);
    }
  }

  for (let z = 0; z < images.length; z++) {
    const imageId = images[z].imageId;
    const imageIdSpecificToolState = toolState[imageId];

    for (let i = 0; i < segmentIndicies.length; i++) {
      const segIdx = segmentIndicies[i];

      if (
        imageIdSpecificToolState &&
        imageIdSpecificToolState.brush &&
        imageIdSpecificToolState.brush.data &&
        imageIdSpecificToolState.brush.data[segIdx] &&
        imageIdSpecificToolState.brush.data[segIdx].pixelData
      ) {
        referencedFramesPerSegment[i].push(z);
      }
    }
  }

  return {
    referencedFramesPerSegment,
    segmentIndicies,
  };
}

function _getSegCount(seg, segments) {
  let numSegments = 0;

  for (let i = 0; i < segments.length; i++) {
    if (segments[i]) {
      numSegments++;
    }
  }

  return numSegments;
}

/**
 * _createSegFromImages - description
 *
 * @param  {Object[]} images    An array of the cornerstone image objects.
 * @param  {Boolean} isMultiframe Whether the images are multiframe.
 * @returns {Object}              The Seg derived dataSet.
 */
function _createSegFromImages(images, isMultiframe, options) {
  const multiframe = getDatasetsFromImages(images, isMultiframe);

  return new SegmentationDerivation([multiframe], options);
}

/**
 * generateToolState - Given a set of cornrstoneTools imageIds and a Segmentation buffer,
 * derive cornerstoneTools toolState and brush metadata.
 *
 * @param  {string[]} imageIds    An array of the imageIds.
 * @param  {ArrayBuffer} arrayBuffer The SEG arrayBuffer.
 * @param {*} metadataProvider
 * @returns {Object}  The toolState and an object from which the
 *                    segment metadata can be derived.
 */
function generateToolState(imageIds, arrayBuffer, metadataProvider) {
  const dicomData = DicomMessage.readFile(arrayBuffer);
  const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);
  dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);
  const multiframe = Normalizer.normalizeToDataset([dataset]);

  const imagePlaneModule = metadataProvider.get(
    'imagePlaneModule',
    imageIds[0]
  );

  if (!imagePlaneModule) {
    cs3dLogger.warn('Insufficient metadata, imagePlaneModule missing.');
  }

  const ImageOrientationPatient = Array.isArray(imagePlaneModule.rowCosines)
    ? [...imagePlaneModule.rowCosines, ...imagePlaneModule.columnCosines]
    : [
        imagePlaneModule.rowCosines.x,
        imagePlaneModule.rowCosines.y,
        imagePlaneModule.rowCosines.z,
        imagePlaneModule.columnCosines.x,
        imagePlaneModule.columnCosines.y,
        imagePlaneModule.columnCosines.z,
      ];

  // Get IOP from ref series, compute supported orientations:
  const validOrientations = getValidOrientations(ImageOrientationPatient);

  const SharedFunctionalGroupsSequence =
    multiframe.SharedFunctionalGroupsSequence;

  const sharedImageOrientationPatient =
    SharedFunctionalGroupsSequence.PlaneOrientationSequence
      ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
          .ImageOrientationPatient
      : undefined;

  const sliceLength = multiframe.Columns * multiframe.Rows;
  const segMetadata = getSegmentMetadata(multiframe);
  const pixelData = unpackPixelData(multiframe);

  const PerFrameFunctionalGroupsSequence =
    multiframe.PerFrameFunctionalGroupsSequence;

  const toolState = {};

  let inPlane = true;

  for (let i = 0; i < PerFrameFunctionalGroupsSequence.length; i++) {
    const PerFrameFunctionalGroups = PerFrameFunctionalGroupsSequence[i];

    const ImageOrientationPatientI =
      sharedImageOrientationPatient ||
      PerFrameFunctionalGroups.PlaneOrientationSequence.ImageOrientationPatient;

    const pixelDataI2D = ndarray(
      new Uint8Array(pixelData.buffer, i * sliceLength, sliceLength),
      [multiframe.Rows, multiframe.Columns]
    );

    const alignedPixelDataI = alignPixelDataWithSourceData(
      pixelDataI2D,
      ImageOrientationPatientI,
      validOrientations
    );

    if (!alignedPixelDataI) {
      cs3dLogger.warn(
        "This segmentation object is not in-plane with the source data. Bailing out of IO. It'd be better to render this with vtkjs. "
      );
      inPlane = false;
      break;
    }

    const segmentIndex =
      PerFrameFunctionalGroups.SegmentIdentificationSequence
        .ReferencedSegmentNumber - 1;

    let SourceImageSequence;
    if (
      SharedFunctionalGroupsSequence.DerivationImageSequence &&
      SharedFunctionalGroupsSequence.DerivationImageSequence.SourceImageSequence
    ) {
      SourceImageSequence =
        SharedFunctionalGroupsSequence.DerivationImageSequence
          .SourceImageSequence[i];
    } else {
      SourceImageSequence =
        PerFrameFunctionalGroups.DerivationImageSequence.SourceImageSequence;
    }

    const imageId = getImageIdOfSourceImage(
      SourceImageSequence,
      imageIds,
      metadataProvider
    );

    addImageIdSpecificBrushToolState(
      toolState,
      imageId,
      segmentIndex,
      alignedPixelDataI
    );
  }

  if (!inPlane) {
    return;
  }

  return { toolState, segMetadata };
}

/**
 * unpackPixelData - Unpacks bitpacked pixelData if the Segmentation is BINARY.
 *
 * @param  {Object} multiframe The multiframe dataset.
 * @return {Uint8Array}      The unpacked pixelData.
 */
function unpackPixelData(multiframe) {
  const segType = multiframe.SegmentationType;

  if (segType === 'BINARY') {
    return BitArray.unpack(multiframe.PixelData);
  }

  const pixelData = new Uint8Array(multiframe.PixelData);

  const max = multiframe.MaximumFractionalValue;
  const onlyMaxAndZero =
    pixelData.find((element) => element !== 0 && element !== max) === undefined;

  if (!onlyMaxAndZero) {
    log.warn(
      'This is a fractional segmentation, which is not currently supported.'
    );
    return;
  }

  log.warn(
    'This segmentation object is actually binary... processing as such.'
  );

  return pixelData;
}

/**
 * addImageIdSpecificBrushToolState - Adds brush pixel data to cornerstoneTools
 * formatted toolState object.
 *
 * @param  {Object} toolState    The toolState object to modify
 * @param  {String} imageId      The imageId of the toolState to add the data.
 * @param  {Number} segmentIndex The index of the segment data being added.
 * @param  {Ndarray} pixelData2D  The pixelData in Ndarry 2D format.
 */
function addImageIdSpecificBrushToolState(
  toolState,
  imageId,
  segmentIndex,
  pixelData2D
) {
  if (!toolState[imageId]) {
    toolState[imageId] = {};
    toolState[imageId].brush = {};
    toolState[imageId].brush.data = [];
  } else if (!toolState[imageId].brush) {
    toolState[imageId].brush = {};
    toolState[imageId].brush.data = [];
  } else if (!toolState[imageId].brush.data) {
    toolState[imageId].brush.data = [];
  }

  toolState[imageId].brush.data[segmentIndex] = {};

  const brushDataI = toolState[imageId].brush.data[segmentIndex];

  brushDataI.pixelData = new Uint8Array(pixelData2D.data.length);

  const cToolsPixelData = brushDataI.pixelData;

  for (let p = 0; p < cToolsPixelData.length; p++) {
    if (pixelData2D.data[p]) {
      cToolsPixelData[p] = 1;
    } else {
      cToolsPixelData[p] = 0;
    }
  }
}

/**
 * getImageIdOfSourceImage - Returns the Cornerstone imageId of the source image.
 *
 * @param  {Object} SourceImageSequence Sequence describing the source image.
 * @param  {String[]} imageIds          A list of imageIds.
 * @param  {Object} metadataProvider    A Cornerstone metadataProvider to query
 *                                      metadata from imageIds.
 * @return {String}                     The corresponding imageId.
 */
function getImageIdOfSourceImage(
  SourceImageSequence,
  imageIds,
  metadataProvider
) {
  const { ReferencedSOPInstanceUID, ReferencedFrameNumber } =
    SourceImageSequence;

  return ReferencedFrameNumber
    ? getImageIdOfReferencedFrame(
        ReferencedSOPInstanceUID,
        ReferencedFrameNumber,
        imageIds,
        metadataProvider
      )
    : getImageIdOfReferencedSingleFramedSOPInstance(
        ReferencedSOPInstanceUID,
        imageIds,
        metadataProvider
      );
}

/**
 * getImageIdOfReferencedSingleFramedSOPInstance - Returns the imageId
 * corresponding to the specified sopInstanceUid for single-frame images.
 *
 * @param  {String} sopInstanceUid   The sopInstanceUid of the desired image.
 * @param  {String[]} imageIds         The list of imageIds.
 * @param  {Object} metadataProvider The metadataProvider to obtain sopInstanceUids
 *                                 from the cornerstone imageIds.
 * @return {String}                  The imageId that corresponds to the sopInstanceUid.
 */
function getImageIdOfReferencedSingleFramedSOPInstance(
  sopInstanceUid,
  imageIds,
  metadataProvider
) {
  return imageIds.find((imageId) => {
    const sopCommonModule = metadataProvider.get('sopCommonModule', imageId);
    if (!sopCommonModule) {
      return;
    }

    return sopCommonModule.sopInstanceUID === sopInstanceUid;
  });
}

/**
 * getImageIdOfReferencedFrame - Returns the imageId corresponding to the
 * specified sopInstanceUid and frameNumber for multi-frame images.
 *
 * @param  {String} sopInstanceUid   The sopInstanceUid of the desired image.
 * @param  {Number} frameNumber      The frame number.
 * @param  {String} imageIds         The list of imageIds.
 * @param  {Object} metadataProvider The metadataProvider to obtain sopInstanceUids
 *                                   from the cornerstone imageIds.
 * @return {String}                  The imageId that corresponds to the sopInstanceUid.
 */
function getImageIdOfReferencedFrame(
  sopInstanceUid,
  frameNumber,
  imageIds,
  metadataProvider
) {
  const imageId = imageIds.find((imageId) => {
    const sopCommonModule = metadataProvider.get('sopCommonModule', imageId);
    if (!sopCommonModule) {
      return;
    }

    const imageIdFrameNumber = Number(imageId.split('frame=')[1]);

    return (
      //frameNumber is zero indexed for cornerstoneDICOMImageLoader image Ids.
      sopCommonModule.sopInstanceUID === sopInstanceUid &&
      imageIdFrameNumber === frameNumber - 1
    );
  });

  return imageId;
}

function getSegmentMetadata(multiframe) {
  const data = [];

  const segmentSequence = multiframe.SegmentSequence;

  if (Array.isArray(segmentSequence)) {
    for (let segIdx = 0; segIdx < segmentSequence.length; segIdx++) {
      data.push(segmentSequence[segIdx]);
    }
  } else {
    // Only one segment, will be stored as an object.
    data.push(segmentSequence);
  }

  return {
    seriesInstanceUid: multiframe.ReferencedSeriesSequence.SeriesInstanceUID,
    data,
  };
}
