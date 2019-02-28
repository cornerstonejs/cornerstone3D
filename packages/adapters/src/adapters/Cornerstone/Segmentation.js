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
    rotateMatrix2D
} from "../../utilities/orientation/index.js";

const Segmentation = {
    generateToolState,
    readToolState
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
 * generateToolState - Generates cornerstoneTools brush data, given a stack of
 * imageIds, images and the cornerstoneTools brushData.
 *
 * @param  {object[]} images    An array of the cornerstone image objects.
 * @param  {BrushData} brushData and object containing the brushData.
 * @returns {type}           description
 */
function generateToolState(images, brushData) {
    // NOTE: here be dragons. Currently if a brush has been used and then erased,
    // This will flag up as a segmentation, even though its full of zeros.
    // Fixing this cleanly requires an update of cornerstoneTools?

    const { toolState, segments } = brushData;

    // Calculate the dimensions of the data cube.
    const image0 = images[0];

    const dims = {
        x: image0.columns,
        y: image0.rows,
        z: images.length
    };

    dims.xy = dims.x * dims.y;

    const numSegments = _getSegCount(seg, segments);

    if (!numSegments) {
        throw new Error("No segments to export!");
    }

    const isMultiframe = image0.imageId.includes("?frame");
    const seg = _createSegFromImages(images, isMultiframe);

    const {
        referencedFramesPerSegment,
        segmentIndicies
    } = _getNumberOfFramesPerSegment(toolState, images, segments);

    let NumberOfFrames = 0;

    for (let i = 0; i < referencedFramesPerSegment.length; i++) {
        NumberOfFrames += referencedFramesPerSegment[i].length;
    }

    seg.setNumberOfFrames(NumberOfFrames);

    for (let i = 0; i < segmentIndicies.length; i++) {
        const segmentIndex = segmentIndicies[i];
        const referenedFrameIndicies = referencedFramesPerSegment[i];

        // Frame numbers start from 1.
        const referencedFrameNumbers = referenedFrameIndicies.map(element => {
            return element + 1;
        });

        const segment = segments[segmentIndex];

        seg.addSegment(
            segment,
            _extractCornerstoneToolsPixelData(
                segmentIndex,
                referenedFrameIndicies,
                toolState,
                images,
                dims
            ),
            referencedFrameNumbers
        );
    }

    console.log(seg.dataset);

    const segBlob = datasetToBlob(seg.dataset);

    return segBlob;
}

function _extractCornerstoneToolsPixelData(
    segmentIndex,
    referenedFrames,
    toolState,
    images,
    dims
) {
    const pixelData = new Uint8Array(dims.xy * referenedFrames.length);

    let pixelDataIndex = 0;

    for (let i = 0; i < referenedFrames.length; i++) {
        const frame = referenedFrames[i];

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
        segmentIndicies.push(i);
        referencedFramesPerSegment.push([]);
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
                imageIdSpecificToolState.brush.data[segIdx]
            ) {
                referencedFramesPerSegment[i].push(z);
            }
        }
    }

    return {
        referencedFramesPerSegment,
        segmentIndicies
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
function _createSegFromImages(images, isMultiframe) {
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

    return new SegmentationDerivation([multiframe]);
}

/**
 * readToolState - Given a set of cornrstoneTools imageIds and a SEG, derive
 * cornerstoneTools toolState and brush metadata.
 *
 * @param  {string[]} imageIds    An array of the imageIds.
 * @param  {ArrayBuffer} arrayBuffer The SEG arrayBuffer.
 * @param {*} metadataProvider
 * @returns {Object}  The toolState and an object from which the
 *                    segment metadata can be derived.
 */
function readToolState(imageIds, arrayBuffer, metadataProvider) {
    const dicomData = DicomMessage.readFile(arrayBuffer);
    const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);
    dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);
    const multiframe = Normalizer.normalizeToDataset([dataset]);

    const imagePlaneModule = metadataProvider.get("imagePlane", imageIds[0]);
    const ImageOrientationPatient = [
        ...imagePlaneModule.rowCosines,
        ...imagePlaneModule.columnCosines
    ];

    // Get IOP from ref series, compute supported orientations:
    // 0, 90, 180, 270, & flip H, flip V.
    const orientations = getValidOrientations(ImageOrientationPatient);

    for (let i = 0; i < orientations.length; i++) {
        const iop = orientations[i];
        console.log(
            `(${iop[0]},${iop[1]},${iop[2]},${iop[3]},${iop[4]},${iop[5]})`
        );
    }

    const SharedFunctionalGroupsSequence =
        multiframe.SharedFunctionalGroupsSequence;

    let imageOrietnationPatientOfSegmentation;

    if (SharedFunctionalGroupsSequence.PlaneOrientationSequence) {
        imageOrietnationPatientOfSegmentation =
            SharedFunctionalGroupsSequence.PlaneOrientationSequence
                .ImageOrientationPatient;
    }

    console.log(imageOrietnationPatientOfSegmentation);

    const PerFrameFunctionalGroupsSequence =
        multiframe.PerFrameFunctionalGroupsSequence;

    const imagePlanePerSegmentationFrame = [];

    console.log(PerFrameFunctionalGroupsSequence);

    for (let i = 0; i < PerFrameFunctionalGroupsSequence.length; i++) {
        const PerFrameFunctionalGroups = PerFrameFunctionalGroupsSequence[i];

        const ImageOrientationPatientI =
            imageOrietnationPatientOfSegmentation ||
            PerFrameFunctionalGroups.PlaneOrientationSequence
                .ImageOrientationPatient;

        imagePlanePerSegmentationFrame[i] = {
            ImageOrientationPatient: ImageOrientationPatientI,
            ImagePositionPatient:
                PerFrameFunctionalGroups.PlanePositionSequence
                    .ImagePositionPatient
        };
    }

    console.log(imagePlanePerSegmentationFrame);

    const testArray = ndarray(new Uint8Array([1, 0, 0, 0, 0, 1, 0, 0, 0]), [
        3,
        3
    ]);

    /*
  console.log("h:");
  flipMatrix2D.h(testArray);

  console.log("v:");
  flipMatrix2D.v(testArray);
  */

    console.log("90");
    rotateMatrix2D(testArray, Math.PI / 2);
    console.log("180");
    rotateMatrix2D(testArray, Math.PI);
    console.log("270");
    rotateMatrix2D(testArray, 1.5 * Math.PI);

    return;

    //
    //
    // Get IOP -> Check SharedFunctionalGroupsSequence
    //
    // For each frame get IPP (and IOP if not in SharedFunctionalGroupsSequence)
    //
    // If IPP in frame does not match ref image, bail out, and say why.
    // If IOP matches one of supported orientations, good:
    // --
    // else: Not so good! Bail out.

    //
    // Compute normal of row and column cosines for both frame and ref'd image.
    // If dot product is not 1 bail out.

    const segType = multiframe.SegmentationType;

    const dims = {
        x: multiframe.Columns,
        y: multiframe.Rows,
        z: imageIds.length,
        xy: multiframe.Columns * multiframe.Rows,
        xyz: multiframe.Columns * multiframe.Rows * imageIds.length
    };

    const segmentSequence = multiframe.SegmentSequence;
    const pixelData = BitArray.unpack(multiframe.PixelData);

    if (segType === "FRACTIONAL") {
        let isActuallyBinary = false;

        const maximumFractionalValue = multiframe.MaximumFractionalValue;

        for (let i = 0; i < pixelData.length; i++) {
            if (pixelData[i] !== 0 && pixelData[i] !== maximumFractionalValue) {
                isActuallyBinary = true;
                break;
            }
        }

        if (!isActuallyBinary) {
            log.warn(
                "This is a fractional segmentation, which is not currently supported."
            );
            return;
        }

        log.warn(
            "This segmentation object is actually binary... processing as such."
        );
    }

    const segMetadata = {
        seriesInstanceUid: multiframe.SeriesInstanceUid,
        data: []
    };

    const toolState = {};

    if (Array.isArray(segmentSequence)) {
        const segCount = segmentSequence.length;

        for (let z = 0; z < imageIds.length; z++) {
            const imageId = imageIds[z];

            const imageIdSpecificToolState = {};

            imageIdSpecificToolState.brush = {};
            imageIdSpecificToolState.brush.data = [];

            const brushData = imageIdSpecificToolState.brush.data;

            for (let i = 0; i < segCount; i++) {
                brushData[i] = {
                    invalidated: true,
                    pixelData: new Uint8ClampedArray(dims.x * dims.y)
                };
            }

            toolState[imageId] = imageIdSpecificToolState;
        }

        for (let segIdx = 0; segIdx < segmentSequence.length; segIdx++) {
            segMetadata.data.push(segmentSequence[segIdx]);

            for (let z = 0; z < imageIds.length; z++) {
                const imageId = imageIds[z];

                const cToolsPixelData =
                    toolState[imageId].brush.data[segIdx].pixelData;

                for (let p = 0; p < dims.xy; p++) {
                    if (pixelData[segIdx * dims.xyz + z * dims.xy + p]) {
                        cToolsPixelData[p] = 1;
                    } else {
                        cToolsPixelData[p] = 0;
                    }
                }
            }
        }
    } else {
        // Only one segment, will be stored as an object.
        segMetadata.data.push(segmentSequence);

        const segIdx = 0;

        for (let z = 0; z < imageIds.length; z++) {
            const imageId = imageIds[z];
            const imageIdSpecificToolState = {};

            imageIdSpecificToolState.brush = {};
            imageIdSpecificToolState.brush.data = [];
            imageIdSpecificToolState.brush.data[segIdx] = {
                invalidated: true,
                pixelData: new Uint8ClampedArray(dims.x * dims.y)
            };

            const cToolsPixelData =
                imageIdSpecificToolState.brush.data[segIdx].pixelData;

            for (let p = 0; p < dims.xy; p++) {
                if (pixelData[segIdx * dims.xyz + z * dims.xy + p]) {
                    cToolsPixelData[p] = 1;
                } else {
                    cToolsPixelData[p] = 0;
                }
            }

            toolState[imageId] = imageIdSpecificToolState;
        }
    }

    return { toolState, segMetadata };
}

/**
 * getValidOrientations - returns an array of valid orientations.
 *
 * @param  {Number[6]} iop The row (0..2) an column (3..5) direction cosines.
 * @return {Number[16][6]} An array of valid orientations.
 */
function getValidOrientations(iop) {
    const orientations = [];

    const iop90 = rotateDirectionCosinesInPlane(iop, Math.PI / 2);
    const iop180 = rotateDirectionCosinesInPlane(iop, Math.PI);
    const iop270 = rotateDirectionCosinesInPlane(iop, 1.5 * Math.PI);

    // [0,  1,  2,  3 ]: 0,   0hf,   0vf
    // [4,  5,  6,  7 ]: 90,  90hf,  90vf
    // [8,  9,  10, 11]: 180, 180hf, 180vf
    // [12, 13, 14, 15]: 270, 270hf, 270vf

    orientations[0] = iop;
    orientations[1] = flipIOP.h(iop);
    orientations[2] = flipIOP.v(iop);

    orientations[3] = iop90;
    orientations[4] = flipIOP.h(iop90);
    orientations[5] = flipIOP.v(iop90);

    orientations[6] = iop180;
    orientations[7] = flipIOP.h(iop180);
    orientations[8] = flipIOP.v(iop180);

    orientations[9] = iop270;
    orientations[10] = flipIOP.h(iop270);
    orientations[11] = flipIOP.v(iop270);

    return orientations;
}
