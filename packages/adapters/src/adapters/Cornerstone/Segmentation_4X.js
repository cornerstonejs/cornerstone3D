import log from "loglevelnext";
import ndarray from "ndarray";
import { BitArray } from "../../bitArray.js";
import { datasetToBlob } from "../../datasetToBlob.js";
import { DicomMessage } from "../../DicomMessage.js";
import { DicomMetaDictionary } from "../../DicomMetaDictionary.js";
import { Normalizer } from "../../normalizers.js";
import { Segmentation as SegmentationDerivation } from "../../derivations/index.js";
import {
    rotateDirectionCosinesInPlane,
    flipImageOrientationPatient as flipIOP,
    flipMatrix2D,
    rotateMatrix902D
} from "../../utilities/orientation/index.js";

const Segmentation = {
    generateSegmentation,
    generateToolState
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
 * @param  {Object|Object[]} labelmaps3D The cornerstone `Labelmap3D` object, or an array of objects.
 * @returns {type}           description
 */
function generateSegmentation(
    images,
    labelmaps3D,
    options = { includeSliceSpacing: true }
) {
    // If one Labelmap3D, convert to Labelmap3D array of length 1.
    if (!Array.isArray(labelmaps3D)) {
        labelmaps3D = [labelmaps3D];
    }

    // Calculate the dimensions of the data cube.
    const image0 = images[0];

    const dims = {
        x: image0.columns,
        y: image0.rows,
        z: images.length
    };

    dims.xy = dims.x * dims.y;

    let numberOfFrames = 0;
    const referencedFramesPerLabelmap = [];

    for (
        let labelmapIndex = 0;
        labelmapIndex < labelmaps3D.length;
        labelmapIndex++
    ) {
        const labelmap3D = labelmaps3D[labelmapIndex];
        const { labelmaps2D, metadata } = labelmap3D;

        const referencedFramesPerSegment = [];

        for (let i = 1; i < metadata.length; i++) {
            if (metadata[i]) {
                referencedFramesPerSegment[i] = [];
            }
        }

        for (let i = 0; i < labelmaps2D.length; i++) {
            const labelmap2D = labelmaps2D[i];

            if (labelmaps2D[i]) {
                const { segmentsOnLabelmap } = labelmap2D;

                segmentsOnLabelmap.forEach(segmentIndex => {
                    if (segmentIndex !== 0) {
                        referencedFramesPerSegment[segmentIndex].push(i);
                        numberOfFrames++;
                    }
                });
            }
        }

        referencedFramesPerLabelmap[labelmapIndex] = referencedFramesPerSegment;
    }

    // - For each labelmap:
    // -- Get number of segments DING
    // -- Get frames per segment. DING
    //
    // - Allocate enough memory. DING
    // - Set metadata per segment:
    // -- Segment Index - increment from 1 to N through labelmap 0..N.
    // - Per frame:
    // -- Set perFrameFunctionalGroupSequence for each segment (frame any labelmap) on this frame.
    // - Boom done.

    const isMultiframe = image0.imageId.includes("?frame");
    const seg = _createSegFromImages(images, isMultiframe, options);

    seg.setNumberOfFrames(numberOfFrames);

    // TODO -> Rewrite adding each segment at a time.

    for (
        let labelmapIndex = 0;
        labelmapIndex < labelmaps3D.length;
        labelmapIndex++
    ) {
        const referencedFramesPerSegment =
            referencedFramesPerLabelmap[labelmapIndex];

        const labelmap3D = labelmaps3D[labelmapIndex];
        const { metadata } = labelmap3D;

        for (
            let segmentIndex = 1;
            segmentIndex < referencedFramesPerSegment.length;
            segmentIndex++
        ) {
            const referencedFrameIndicies =
                referencedFramesPerSegment[segmentIndex];

            if (referencedFrameIndicies) {
                // Frame numbers start from 1.
                const referencedFrameNumbers = referencedFrameIndicies.map(
                    element => {
                        return element + 1;
                    }
                );
                const segmentMetadata = metadata[segmentIndex];
                const labelmaps = _getLabelmapsFromRefernecedFrameIndicies(
                    labelmap3D,
                    referencedFrameIndicies
                );

                seg.addSegmentFromLabelmap(
                    segmentMetadata,
                    labelmaps,
                    segmentIndex,
                    referencedFrameNumbers
                );
            }
        }
    }

    seg.bitPackPixelData();

    const segBlob = datasetToBlob(seg.dataset);

    return segBlob;
}

function _getLabelmapsFromRefernecedFrameIndicies(
    labelmap3D,
    referencedFrameIndicies
) {
    const { labelmaps2D } = labelmap3D;

    const labelmaps = [];

    for (let i = 0; i < referencedFrameIndicies.length; i++) {
        const frame = referencedFrameIndicies[i];

        labelmaps.push(labelmaps2D[frame].pixelData);
    }

    return labelmaps;
}

/**
 * _createSegFromImages - description
 *
 * @param  {Object[]} images    An array of the cornerstone image objects.
 * @param  {Boolean} isMultiframe Whether the images are multiframe.
 * @returns {Object}              The Seg derived dataSet.
 */
function _createSegFromImages(images, isMultiframe, options) {
    const datasets = [];

    if (isMultiframe) {
        const image = images[0];
        const arrayBuffer = image.data.byteArray.buffer;

        const dicomData = DicomMessage.readFile(arrayBuffer);
        const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);

        dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);

        datasets.push(dataset);
    } else {
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            const arrayBuffer = image.data.byteArray.buffer;
            const dicomData = DicomMessage.readFile(arrayBuffer);
            const dataset = DicomMetaDictionary.naturalizeDataset(
                dicomData.dict
            );

            dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);
            datasets.push(dataset);
        }
    }

    const multiframe = Normalizer.normalizeToDataset(datasets);

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
        "imagePlaneModule",
        imageIds[0]
    );

    console.warn(
        "Note the cornerstoneTools 4.0 currently assumes the labelmaps are non-overlapping. Overlapping segments will allocate incorrectly. Feel free to submit a PR to improve this behaviour!"
    );

    if (!imagePlaneModule) {
        console.warn("Insufficient metadata, imagePlaneModule missing.");
    }

    const ImageOrientationPatient = Array.isArray(imagePlaneModule.rowCosines)
        ? [...imagePlaneModule.rowCosines, ...imagePlaneModule.columnCosines]
        : [
              imagePlaneModule.rowCosines.x,
              imagePlaneModule.rowCosines.y,
              imagePlaneModule.rowCosines.z,
              imagePlaneModule.columnCosines.x,
              imagePlaneModule.columnCosines.y,
              imagePlaneModule.columnCosines.z
          ];

    // Get IOP from ref series, compute supported orientations:
    const validOrientations = getValidOrientations(ImageOrientationPatient);

    const SharedFunctionalGroupsSequence =
        multiframe.SharedFunctionalGroupsSequence;

    const sharedImageOrientationPatient = SharedFunctionalGroupsSequence.PlaneOrientationSequence
        ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
              .ImageOrientationPatient
        : undefined;

    const sliceLength = multiframe.Columns * multiframe.Rows;
    const segMetadata = getSegmentMetadata(multiframe);
    const pixelData = unpackPixelData(multiframe);

    const arrayBufferLength = sliceLength * imageIds.length * 2; // 2 bytes per label voxel in cst4.
    const labelmapBuffer = new ArrayBuffer(arrayBufferLength);

    const PerFrameFunctionalGroupsSequence =
        multiframe.PerFrameFunctionalGroupsSequence;

    const segmentsOnFrame = [];

    let inPlane = true;

    for (let i = 0; i < PerFrameFunctionalGroupsSequence.length; i++) {
        const PerFrameFunctionalGroups = PerFrameFunctionalGroupsSequence[i];

        const ImageOrientationPatientI =
            sharedImageOrientationPatient ||
            PerFrameFunctionalGroups.PlaneOrientationSequence
                .ImageOrientationPatient;

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
            console.warn(
                "This segmentation object is not in-plane with the source data. Bailing out of IO. It'd be better to render this with vtkjs. "
            );
            inPlane = false;
            break;
        }

        const segmentIndex =
            PerFrameFunctionalGroups.SegmentIdentificationSequence
                .ReferencedSegmentNumber;

        let SourceImageSequence;
        if (
            SharedFunctionalGroupsSequence.DerivationImageSequence &&
            SharedFunctionalGroupsSequence.DerivationImageSequence
                .SourceImageSequence
        ) {
            SourceImageSequence =
                SharedFunctionalGroupsSequence.DerivationImageSequence
                    .SourceImageSequence[i];
        } else {
            SourceImageSequence =
                PerFrameFunctionalGroups.DerivationImageSequence
                    .SourceImageSequence;
        }

        const imageId = getImageIdOfSourceImage(
            SourceImageSequence,
            imageIds,
            metadataProvider
        );

        if (!imageId) {
            // Image not present in stack, can't import this frame.
            continue;
        }

        const imageIdIndex = imageIds.findIndex(element => element === imageId);
        const byteOffset = sliceLength * 2 * imageIdIndex; // 2 bytes/pixel

        const labelmap2DView = new Uint16Array(
            labelmapBuffer,
            byteOffset,
            sliceLength
        );

        const data = alignedPixelDataI.data;

        for (let j = 0; j < alignedPixelDataI.data.length; j++) {
            if (data[j]) {
                labelmap2DView[j] = segmentIndex;
            }
        }

        if (!segmentsOnFrame[imageIdIndex]) {
            segmentsOnFrame[imageIdIndex] = [];
        }

        segmentsOnFrame[imageIdIndex].push(segmentIndex);
    }

    if (!inPlane) {
        return;
    }

    return { labelmapBuffer, segMetadata, segmentsOnFrame };
}

/**
 * unpackPixelData - Unpacks bitpacked pixelData if the Segmentation is BINARY.
 *
 * @param  {Object} multiframe The multiframe dataset.
 * @return {Uint8Array}      The unpacked pixelData.
 */
function unpackPixelData(multiframe) {
    const segType = multiframe.SegmentationType;

    if (segType === "BINARY") {
        return BitArray.unpack(multiframe.PixelData);
    }

    const pixelData = new Uint8Array(multiframe.PixelData);

    const max = multiframe.MaximumFractionalValue;
    const onlyMaxAndZero =
        pixelData.find(element => element !== 0 && element !== max) ===
        undefined;

    if (!onlyMaxAndZero) {
        log.warn(
            "This is a fractional segmentation, which is not currently supported."
        );
        return;
    }

    log.warn(
        "This segmentation object is actually binary... processing as such."
    );

    return pixelData;
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
    const {
        ReferencedSOPInstanceUID,
        ReferencedFrameNumber
    } = SourceImageSequence;

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
    return imageIds.find(imageId => {
        const sopCommonModule = metadataProvider.get(
            "sopCommonModule",
            imageId
        );
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
    const imageId = imageIds.find(imageId => {
        const sopCommonModule = metadataProvider.get(
            "sopCommonModule",
            imageId
        );
        if (!sopCommonModule) {
            return;
        }

        const imageIdFrameNumber = Number(imageId.split("frame=")[1]);

        return (
            //frameNumber is zero indexed for cornerstoneWADOImageLoader image Ids.
            sopCommonModule.sopInstanceUID === sopInstanceUid &&
            imageIdFrameNumber === frameNumber - 1
        );
    });

    return imageId;
}

/**
 * getValidOrientations - returns an array of valid orientations.
 *
 * @param  {Number[6]} iop The row (0..2) an column (3..5) direction cosines.
 * @return {Number[8][6]} An array of valid orientations.
 */
function getValidOrientations(iop) {
    const orientations = [];

    // [0,  1,  2]: 0,   0hf,   0vf
    // [3,  4,  5]: 90,  90hf,  90vf
    // [6, 7]:      180, 270

    orientations[0] = iop;
    orientations[1] = flipIOP.h(iop);
    orientations[2] = flipIOP.v(iop);

    const iop90 = rotateDirectionCosinesInPlane(iop, Math.PI / 2);

    orientations[3] = iop90;
    orientations[4] = flipIOP.h(iop90);
    orientations[5] = flipIOP.v(iop90);

    orientations[6] = rotateDirectionCosinesInPlane(iop, Math.PI);
    orientations[7] = rotateDirectionCosinesInPlane(iop, 1.5 * Math.PI);

    return orientations;
}

/**
 * alignPixelDataWithSourceData -
 *
 * @param {Ndarray} pixelData2D The data to align.
 * @param  {Number[6]} iop The orientation of the image slice.
 * @param  {Number[8][6]} orientations   An array of valid imageOrientationPatient values.
 * @return {Ndarray}                         The aligned pixelData.
 */
function alignPixelDataWithSourceData(pixelData2D, iop, orientations) {
    if (compareIOP(iop, orientations[0])) {
        //Same orientation.
        return pixelData2D;
    } else if (compareIOP(iop, orientations[1])) {
        //Flipped vertically.
        return flipMatrix2D.v(pixelData2D);
    } else if (compareIOP(iop, orientations[2])) {
        //Flipped horizontally.
        return flipMatrix2D.h(pixelData2D);
    } else if (compareIOP(iop, orientations[3])) {
        //Rotated 90 degrees.
        return rotateMatrix902D(pixelData2D);
    } else if (compareIOP(iop, orientations[4])) {
        //Rotated 90 degrees and fliped horizontally.
        return flipMatrix2D.h(rotateMatrix902D(pixelData2D));
    } else if (compareIOP(iop, orientations[5])) {
        //Rotated 90 degrees and fliped vertically.
        return flipMatrix2D.v(rotateMatrix902D(pixelData2D));
    } else if (compareIOP(iop, orientations[6])) {
        //Rotated 180 degrees. // TODO -> Do this more effeciently, there is a 1:1 mapping like 90 degree rotation.
        return rotateMatrix902D(rotateMatrix902D(pixelData2D));
    } else if (compareIOP(iop, orientations[7])) {
        //Rotated 270 degrees.  // TODO -> Do this more effeciently, there is a 1:1 mapping like 90 degree rotation.
        return rotateMatrix902D(
            rotateMatrix902D(rotateMatrix902D(pixelData2D))
        );
    }
}

const dx = 1e-5;

/**
 * compareIOP - Returns true if iop1 and iop2 are equal
 * within a tollerance, dx.
 *
 * @param  {Number[6]} iop1 An ImageOrientationPatient array.
 * @param  {Number[6]} iop2 An ImageOrientationPatient array.
 * @return {Boolean}      True if iop1 and iop2 are equal.
 */
function compareIOP(iop1, iop2) {
    return (
        Math.abs(iop1[0] - iop2[0]) < dx &&
        Math.abs(iop1[1] - iop2[1]) < dx &&
        Math.abs(iop1[2] - iop2[2]) < dx &&
        Math.abs(iop1[3] - iop2[3]) < dx &&
        Math.abs(iop1[4] - iop2[4]) < dx &&
        Math.abs(iop1[5] - iop2[5]) < dx
    );
}

function getSegmentMetadata(multiframe) {
    const segmentSequence = multiframe.SegmentSequence;
    let data = [];

    if (Array.isArray(segmentSequence)) {
        data = [undefined, ...segmentSequence];
    } else {
        // Only one segment, will be stored as an object.
        data = [undefined, segmentSequence];
    }

    return {
        seriesInstanceUid:
            multiframe.ReferencedSeriesSequence.SeriesInstanceUID,
        data
    };
}
