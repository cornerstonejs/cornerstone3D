import log from "loglevelnext";
import { BitArray } from "../../bitArray.js";
import { datasetToBlob } from "../../datasetToBlob.js";
import { DicomMessage } from "../../DicomMessage.js";
import { DicomMetaDictionary } from "../../DicomMetaDictionary.js";
import { Normalizer } from "../../normalizers.js";
import { Segmentation as SegmentationDerivation } from "../../derivations/index.js";

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

        console.log(segment);

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

    console.log(pixelData);

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
 * @returns {Object}  The toolState and an object from which the
 *                    segment metadata can be derived.
 */
function readToolState(imageIds, arrayBuffer) {
    const dicomData = DicomMessage.readFile(arrayBuffer);
    const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);
    dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);
    const multiframe = Normalizer.normalizeToDataset([dataset]);

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
