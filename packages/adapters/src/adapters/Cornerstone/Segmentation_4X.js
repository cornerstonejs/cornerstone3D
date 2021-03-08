import log from "../../log.js";
import ndarray from "ndarray";
import { BitArray } from "../../bitArray.js";
import { datasetToBlob } from "../../datasetToBlob.js";
import { DicomMessage } from "../../DicomMessage.js";
import { DicomMetaDictionary } from "../../DicomMetaDictionary.js";
import { Normalizer } from "../../normalizers.js";
import { Segmentation as SegmentationDerivation } from "../../derivations/index.js";
import { mat4 } from "gl-matrix";
import {
    rotateDirectionCosinesInPlane,
    flipImageOrientationPatient as flipIOP,
    flipMatrix2D,
    rotateMatrix902D
} from "../../utilities/orientation/index.js";
import {
    encode,
    decode
} from "../../utilities/compression/rleSingleSamplePerPixel";
import cloneDeep from "lodash.clonedeep";

const Segmentation = {
    generateSegmentation,
    generateToolState,
    fillSegmentation
};

export default Segmentation;

/**
 *
 * @typedef {Object} BrushData
 * @property {Object} toolState - The cornerstoneTools global toolState.
 * @property {Object[]} segments - The cornerstoneTools segment metadata that corresponds to the
 *                                 seriesInstanceUid.
 */

const generateSegmentationDefaultOptions = {
    includeSliceSpacing: true,
    rleEncode: true
};

/**
 * generateSegmentation - Generates cornerstoneTools brush data, given a stack of
 * imageIds, images and the cornerstoneTools brushData.
 *
 * @param  {object[]} images An array of cornerstone images that contain the source
 *                           data under `image.data.byteArray.buffer`.
 * @param  {Object|Object[]} inputLabelmaps3D The cornerstone `Labelmap3D` object, or an array of objects.
 * @param  {Object} userOptions Options to pass to the segmentation derivation and `fillSegmentation`.
 * @returns {Blob}
 */
function generateSegmentation(images, inputLabelmaps3D, userOptions = {}) {
    const isMultiframe = images[0].imageId.includes("?frame");
    const segmentation = _createSegFromImages(
        images,
        isMultiframe,
        userOptions
    );

    return fillSegmentation(segmentation, inputLabelmaps3D, userOptions);
}

/**
 * fillSegmentation - Fills a derived segmentation dataset with cornerstoneTools `LabelMap3D` data.
 *
 * @param  {object[]} segmentation An empty segmentation derived dataset.
 * @param  {Object|Object[]} inputLabelmaps3D The cornerstone `Labelmap3D` object, or an array of objects.
 * @param  {Object} userOptions Options object to override default options.
 * @returns {Blob}           description
 */
function fillSegmentation(segmentation, inputLabelmaps3D, userOptions = {}) {
    const options = Object.assign(
        {},
        generateSegmentationDefaultOptions,
        userOptions
    );

    // Use another variable so we don't redefine labelmaps3D.
    const labelmaps3D = Array.isArray(inputLabelmaps3D)
        ? inputLabelmaps3D
        : [inputLabelmaps3D];

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

    segmentation.setNumberOfFrames(numberOfFrames);

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

                segmentation.addSegmentFromLabelmap(
                    segmentMetadata,
                    labelmaps,
                    segmentIndex,
                    referencedFrameNumbers
                );
            }
        }
    }

    if (options.rleEncode) {
        const rleEncodedFrames = encode(
            segmentation.dataset.PixelData,
            numberOfFrames,
            segmentation.dataset.Rows,
            segmentation.dataset.Columns
        );

        // Must use fractional now to RLE encode, as the DICOM standard only allows BitStored && BitsAllocated
        // to be 1 for BINARY. This is not ideal and there should be a better format for compression in this manner
        // added to the standard.
        segmentation.assignToDataset({
            BitsAllocated: "8",
            BitsStored: "8",
            HighBit: "7",
            SegmentationType: "FRACTIONAL",
            SegmentationFractionalType: "PROBABILITY",
            MaximumFractionalValue: "255"
        });

        segmentation.dataset._meta.TransferSyntaxUID = {
            Value: ["1.2.840.10008.1.2.5"],
            vr: "UI"
        };
        segmentation.dataset._vrMap.PixelData = "OB";
        segmentation.dataset.PixelData = rleEncodedFrames;
    } else {
        // If no rleEncoding, at least bitpack the data.
        segmentation.bitPackPixelData();
    }

    const segBlob = datasetToBlob(segmentation.dataset);

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
 * @param  {*} metadataProvider
 *
 * @return {[]ArrayBuffer}a list of array buffer for each labelMap
 * @return {Object} an object from which the segment metadata can be derived
 * @return {[][][]} 2D list containing the track of segments per frame
 * @return {[][][]} 3D list containing the track of segments per frame for each labelMap
 *                  (available only for the overlapping case).
 */
function generateToolState(
    imageIds,
    arrayBuffer,
    metadataProvider,
    skipOverlapping = false
) {
    const dicomData = DicomMessage.readFile(arrayBuffer);
    const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);
    dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);
    const multiframe = Normalizer.normalizeToDataset([dataset]);

    const imagePlaneModule = metadataProvider.get(
        "imagePlaneModule",
        imageIds[0]
    );

    const generalSeriesModule = metadataProvider.get(
        "generalSeriesModule",
        imageIds[0]
    );

    const SeriesInstanceUID = generalSeriesModule.seriesInstanceUID;

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

    const sliceLength = multiframe.Columns * multiframe.Rows;
    const segMetadata = getSegmentMetadata(multiframe, SeriesInstanceUID);

    const TransferSyntaxUID = multiframe._meta.TransferSyntaxUID.Value[0];

    let pixelData;

    if (TransferSyntaxUID === "1.2.840.10008.1.2.5") {
        const rleEncodedFrames = Array.isArray(multiframe.PixelData)
            ? multiframe.PixelData
            : [multiframe.PixelData];

        pixelData = decode(
            rleEncodedFrames,
            multiframe.Rows,
            multiframe.Columns
        );

        if (multiframe.BitsStored === 1) {
            console.warn("No implementation for rle + bitbacking.");

            return;
        }
    } else {
        pixelData = unpackPixelData(multiframe);

        if (!pixelData) {
            throw new Error("Fractional segmentations are not yet supported");
        }
    }

    const orientation = checkOrientation(multiframe, validOrientations, [
        imagePlaneModule.rows,
        imagePlaneModule.columns,
        imageIds.length
    ]);

    let overlapping = false;
    if (!skipOverlapping) {
        overlapping = checkSEGsOverlapping(
            pixelData,
            multiframe,
            imageIds,
            validOrientations,
            metadataProvider
        );
    }

    let insertFunction;

    switch (orientation) {
        case "Planar":
            if (overlapping) {
                insertFunction = insertOverlappingPixelDataPlanar;
            } else {
                insertFunction = insertPixelDataPlanar;
            }
            break;
        case "Perpendicular":
            //insertFunction = insertPixelDataPerpendicular;
            throw new Error(
                "Segmentations orthogonal to the acquisition plane of the source data are not yet supported."
            );
            break;
        case "Oblique":
            throw new Error(
                "Segmentations oblique to the acquisition plane of the source data are not yet supported."
            );
    }

    /* if SEGs are overlapping:
    1) the labelmapBuffer will contain M volumes which have non-overlapping segments;
    2) segmentsOnFrame will have M * numberOfFrames values to track in which labelMap are the segments;
    3) insertFunction will return the number of LabelMaps
    4) generateToolState return is an array*/

    const segmentsOnFrameArray = [];
    segmentsOnFrameArray[0] = [];
    const segmentsOnFrame = [];

    const arrayBufferLength = sliceLength * imageIds.length * 2; // 2 bytes per label voxel in cst4.
    const labelmapBufferArray = [];
    labelmapBufferArray[0] = new ArrayBuffer(arrayBufferLength);

    insertFunction(
        segmentsOnFrame,
        segmentsOnFrameArray,
        labelmapBufferArray,
        pixelData,
        multiframe,
        imageIds,
        validOrientations,
        metadataProvider
    );

    return {
        labelmapBufferArray,
        segMetadata,
        segmentsOnFrame,
        segmentsOnFrameArray
    };
}

function insertPixelDataPerpendicular(
    segmentsOnFrame,
    labelmapBuffer,
    pixelData,
    multiframe,
    imageIds,
    validOrientations,
    metadataProvider
) {
    const {
        SharedFunctionalGroupsSequence,
        PerFrameFunctionalGroupsSequence,
        Rows,
        Columns
    } = multiframe;

    const firstImagePlaneModule = metadataProvider.get(
        "imagePlaneModule",
        imageIds[0]
    );

    const lastImagePlaneModule = metadataProvider.get(
        "imagePlaneModule",
        imageIds[imageIds.length - 1]
    );

    console.log(firstImagePlaneModule);
    console.log(lastImagePlaneModule);

    const corners = [
        ...getCorners(firstImagePlaneModule),
        ...getCorners(lastImagePlaneModule)
    ];

    console.log(`corners:`);
    console.log(corners);

    debugger;

    const indexToWorld = mat4.create();

    const ippFirstFrame = firstImagePlaneModule.imagePositionPatient;
    const rowCosines = Array.isArray(firstImagePlaneModule.rowCosines)
        ? [...firstImagePlaneModule.rowCosines]
        : [
              firstImagePlaneModule.rowCosines.x,
              firstImagePlaneModule.rowCosines.y,
              firstImagePlaneModule.rowCosines.z
          ];

    const columnCosines = Array.isArray(firstImagePlaneModule.columnCosines)
        ? [...firstImagePlaneModule.columnCosines]
        : [
              firstImagePlaneModule.columnCosines.x,
              firstImagePlaneModule.columnCosines.y,
              firstImagePlaneModule.columnCosines.z
          ];

    const { pixelSpacing } = firstImagePlaneModule;

    mat4.set(
        indexToWorld,
        // Column 1
        0,
        0,
        0,
        ippFirstFrame[0],
        // Column 2
        0,
        0,
        0,
        ippFirstFrame[1],
        // Column 3
        0,
        0,
        0,
        ippFirstFrame[2],
        // Column 4
        0,
        0,
        0,
        1
    );

    // TODO -> Get origin and (x,y,z) increments to build a translation matrix:
    // TODO -> Equation C.7.6.2.1-1

    // | cx*di rx* Xx 0 |  |x|
    // | cy*di ry Xy 0 |  |y|
    // | cz*di rz Xz 0 |  |z|
    // | tx ty tz 1 |  |1|

    // const [
    //     0, 0 , 0 , 0,
    //     0, 0 , 0 , 0,
    //     0, 0 , 0 , 0,
    //     ipp[0], ipp[1] , ipp[2] , 1,
    // ]

    // Each frame:

    // Find which corner the first voxel lines up with (one of 8 corners.)

    // Find how i,j,k orient with respect to source volume.
    // Go through each frame, find location in source to start, and whether to increment +/ix,+/-y,+/-z
    //   through each voxel.

    // [1,0,0,0,1,0]

    // const [

    // ]

    // Invert transformation matrix to get worldToIndex

    // Apply world to index on each point to fill up the matrix.

    // const sharedImageOrientationPatient = SharedFunctionalGroupsSequence.PlaneOrientationSequence
    //     ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
    //           .ImageOrientationPatient
    //     : undefined;
    // const sliceLength = Columns * Rows;
}

function getCorners(imagePlaneModule) {
    // console.log(imagePlaneModule);

    const {
        rows,
        columns,
        rowCosines,
        columnCosines,
        imagePositionPatient: ipp,
        rowPixelSpacing,
        columnPixelSpacing
    } = imagePlaneModule;

    const rowLength = columns * columnPixelSpacing;
    const columnLength = rows * rowPixelSpacing;

    const entireRowVector = [
        rowLength * columnCosines[0],
        rowLength * columnCosines[1],
        rowLength * columnCosines[2]
    ];

    const entireColumnVector = [
        columnLength * rowCosines[0],
        columnLength * rowCosines[1],
        columnLength * rowCosines[2]
    ];

    // console.log(
    //     `entireRowVector: ${(entireRowVector[0],
    //     entireRowVector[1],
    //     entireRowVector[2])}`
    // );

    // console.log(
    //     `entireColumnVector: ${(entireColumnVector[0],
    //     entireColumnVector[1],
    //     entireColumnVector[2])}`
    // );

    const topLeft = [ipp[0], ipp[1], ipp[2]];
    const topRight = [
        topLeft[0] + entireRowVector[0],
        topLeft[1] + entireRowVector[1],
        topLeft[2] + entireRowVector[2]
    ];
    const bottomLeft = [
        topLeft[0] + entireColumnVector[0],
        topLeft[1] + entireColumnVector[1],
        topLeft[2] + entireColumnVector[2]
    ];

    const bottomRight = [
        bottomLeft[0] + entireRowVector[0],
        bottomLeft[1] + entireRowVector[1],
        bottomLeft[2] + entireRowVector[2]
    ];

    return [topLeft, topRight, bottomLeft, bottomRight];
}

/**
 * Checks if there is any overlapping segmentations. The check is performed frame by frame.
 *  Two assumptions are used in the loop:
 *  1) numberOfSegs * numberOfFrames = groupsLen,
 *     i.e. for each frame we have a N PerFrameFunctionalGroupsSequence, where N is the number of segmentations (numberOfSegs).
 *  2) the order of the group sequence is = numberOfFrames of segmentation 1 +  numberOfFrames of segmentation 2 + ... + numberOfFrames of segmentation numberOfSegs
 *
 *  -------------------
 *
 *  TO DO: We could check the ImagePositionPatient and working in 3D coordinates (instead of indexes) and remove the assumptions,
 *  but this would greatly increase the computation time (i.e. we would have to sort the data before running checkSEGsOverlapping).
 *
 *  @returns {boolean} Returns a flag if segmentations overlapping
 */

function checkSEGsOverlapping(
    pixelData,
    multiframe,
    imageIds,
    validOrientations,
    metadataProvider
) {
    const {
        SharedFunctionalGroupsSequence,
        PerFrameFunctionalGroupsSequence,
        Rows,
        Columns
    } = multiframe;

    const sharedImageOrientationPatient = SharedFunctionalGroupsSequence.PlaneOrientationSequence
        ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
              .ImageOrientationPatient
        : undefined;
    const sliceLength = Columns * Rows;

    var firstSegIndex = -1;
    var previousimageIdIndex = -1;
    var temp2DArray = new Uint16Array(sliceLength).fill(0);
    var groupsLen = PerFrameFunctionalGroupsSequence.length;
    var numberOfSegs = multiframe.SegmentSequence.length;
    var numberOfFrames = imageIds.length;

    if (numberOfSegs * numberOfFrames !== groupsLen) {
        console.warn(
            "Failed to check for overlap of segments: missing frames in PerFrameFunctionalGroupsSequence."
        );
        return false;
    }

    const refSegFrame0 = getSegmentIndex(multiframe, 0);
    const refSegFrame1 = getSegmentIndex(multiframe, 1);
    if (
        refSegFrame0 === undefined ||
        refSegFrame1 === undefined ||
        refSegFrame0 !== refSegFrame1
    ) {
        console.warn(
            "Failed to check for overlap of segments: frames in PerFrameFunctionalGroupsSequence are not sorted."
        );
        return false;
    }

    var i = 0;
    while (i < groupsLen) {
        const PerFrameFunctionalGroups = PerFrameFunctionalGroupsSequence[i];

        const ImageOrientationPatientI =
            sharedImageOrientationPatient ||
            PerFrameFunctionalGroups.PlaneOrientationSequence
                .ImageOrientationPatient;

        const pixelDataI2D = ndarray(
            new Uint8Array(pixelData.buffer, i * sliceLength, sliceLength),
            [Rows, Columns]
        );

        const alignedPixelDataI = alignPixelDataWithSourceData(
            pixelDataI2D,
            ImageOrientationPatientI,
            validOrientations
        );

        if (!alignedPixelDataI) {
            // Individual SEG frames are out of plane with respect to the first SEG frame, this is not yet supported
            i = i + numberOfFrames;
            if (i >= groupsLen) {
                i = i - numberOfFrames * numberOfSegs + 1;
                if (i >= numberOfFrames) {
                    break;
                }
            }

            continue;
        }

        const segmentIndex = getSegmentIndex(multiframe, i);

        if (segmentIndex === undefined) {
            console.warn(
                "Could not retrieve the segment index, skipping this frame. "
            );

            i = i + numberOfFrames;
            if (i >= groupsLen) {
                i = i - numberOfFrames * numberOfSegs + 1;
                if (i >= numberOfFrames) {
                    break;
                }
            }

            continue;
        }

        let SourceImageSequence;

        if (multiframe.SourceImageSequence) {
            SourceImageSequence = multiframe.SourceImageSequence[i];
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

            i = i + numberOfFrames;
            if (i >= groupsLen) {
                i = i - numberOfFrames * numberOfSegs + 1;
                if (i >= numberOfFrames) {
                    break;
                }
            }

            continue;
        }

        const data = alignedPixelDataI.data;
        const imageIdIndex = imageIds.findIndex(element => element === imageId);

        if (i === 0) {
            firstSegIndex = segmentIndex;
        }

        if (
            segmentIndex === firstSegIndex &&
            imageIdIndex > previousimageIdIndex
        ) {
            temp2DArray.fill(0);
            previousimageIdIndex = imageIdIndex;
        }

        for (let j = 0, len = alignedPixelDataI.data.length; j < len; ++j) {
            if (data[j]) {
                temp2DArray[j]++;
                if (temp2DArray[j] > 1) {
                    return true;
                }
            }
        }

        i = i + numberOfFrames;
        if (i >= groupsLen) {
            i = i - numberOfFrames * numberOfSegs + 1;
            if (i >= numberOfFrames) {
                break;
            }
        }
    }

    return false;
}

function insertOverlappingPixelDataPlanar(
    segmentsOnFrame,
    segmentsOnFrameArray,
    labelmapBufferArray,
    pixelData,
    multiframe,
    imageIds,
    validOrientations,
    metadataProvider
) {
    const {
        SharedFunctionalGroupsSequence,
        PerFrameFunctionalGroupsSequence,
        Rows,
        Columns
    } = multiframe;

    const sharedImageOrientationPatient = SharedFunctionalGroupsSequence.PlaneOrientationSequence
        ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
              .ImageOrientationPatient
        : undefined;
    const sliceLength = Columns * Rows;
    const arrayBufferLength = sliceLength * imageIds.length * 2; // 2 bytes per label voxel in cst4.

    // indicate the number of labelMaps
    var M = 1;

    // indicate the current labelMap array index;
    var m = 0;

    // temp array for checking overlaps
    var tempBuffer = labelmapBufferArray[m].slice(0);

    // temp list for checking overlaps
    var tempSegmentsOnFrame = cloneDeep(segmentsOnFrameArray[m]);

    /* split overlapping SEGs algorithm for each segment: 
    A) copy the labelmapBuffer in the array with index 0
    B) add the segment pixel per pixel on the copied buffer from (A)
    C) if no overlap, copy the results back on the orignal array from (A)
    D) if overlap, repeat increasing the index m up to M (if out of memory, add new buffer in the array and M++); 
    */

    var numberOfSegs = multiframe.SegmentSequence.length;
    for (
        let segmentIndexToProcess = 1;
        segmentIndexToProcess <= numberOfSegs;
        ++segmentIndexToProcess
    ) {
        for (
            let i = 0, groupsLen = PerFrameFunctionalGroupsSequence.length;
            i < groupsLen;
            ++i
        ) {
            const PerFrameFunctionalGroups =
                PerFrameFunctionalGroupsSequence[i];

            const segmentIndex = getSegmentIndex(multiframe, i);
            if (segmentIndex === undefined) {
                console.warn(
                    "Could not retrieve the segment index, skipping this frame. "
                );
                continue;
            }

            if (segmentIndex !== segmentIndexToProcess) {
                continue;
            }

            const ImageOrientationPatientI =
                sharedImageOrientationPatient ||
                PerFrameFunctionalGroups.PlaneOrientationSequence
                    .ImageOrientationPatient;

            const pixelDataI2D = ndarray(
                new Uint8Array(pixelData.buffer, i * sliceLength, sliceLength),
                [Rows, Columns]
            );

            const alignedPixelDataI = alignPixelDataWithSourceData(
                pixelDataI2D,
                ImageOrientationPatientI,
                validOrientations
            );

            if (!alignedPixelDataI) {
                console.warn(
                    "Individual SEG frames are out of plane with respect to the first SEG frame, this is not yet supported, skipping this frame."
                );

                inPlane = false;
                break;
            }

            let SourceImageSequence;

            if (multiframe.SourceImageSequence) {
                SourceImageSequence = multiframe.SourceImageSequence[i];
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

            const imageIdIndex = imageIds.findIndex(
                element => element === imageId
            );
            const byteOffset = sliceLength * 2 * imageIdIndex; // 2 bytes/pixel

            const labelmap2DView = new Uint16Array(
                tempBuffer,
                byteOffset,
                sliceLength
            );

            const data = alignedPixelDataI.data;

            let segmentOnFrame = false;
            for (let j = 0, len = alignedPixelDataI.data.length; j < len; ++j) {
                if (data[j]) {
                    if (labelmap2DView[j] !== 0) {
                        m++;
                        if (m >= M) {
                            labelmapBufferArray[m] = new ArrayBuffer(
                                arrayBufferLength
                            );
                            segmentsOnFrameArray[m] = [];
                            M++;
                        }
                        tempBuffer = labelmapBufferArray[m].slice(0);
                        tempSegmentsOnFrame = cloneDeep(
                            segmentsOnFrameArray[m]
                        );

                        i = 0;
                        break;
                    } else {
                        labelmap2DView[j] = segmentIndex;
                        segmentOnFrame = true;
                    }
                }
            }

            if (segmentOnFrame) {
                if (!tempSegmentsOnFrame[imageIdIndex]) {
                    tempSegmentsOnFrame[imageIdIndex] = [];
                }

                tempSegmentsOnFrame[imageIdIndex].push(segmentIndex);

                if (!segmentsOnFrame[imageIdIndex]) {
                    segmentsOnFrame[imageIdIndex] = [];
                }

                segmentsOnFrame[imageIdIndex].push(segmentIndex);
            }
        }

        labelmapBufferArray[m] = tempBuffer.slice(0);
        segmentsOnFrameArray[m] = cloneDeep(tempSegmentsOnFrame);

        // reset temp variables/buffers for new segment
        m = 0;
        tempBuffer = labelmapBufferArray[m].slice(0);
        tempSegmentsOnFrame = cloneDeep(segmentsOnFrameArray[m]);
    }
}

const getSegmentIndex = (multiframe, frame) => {
    const {
        PerFrameFunctionalGroupsSequence,
        SharedFunctionalGroupsSequence
    } = multiframe;
    const PerFrameFunctionalGroups = PerFrameFunctionalGroupsSequence[frame];
    return PerFrameFunctionalGroups &&
        PerFrameFunctionalGroups.SegmentIdentificationSequence
        ? PerFrameFunctionalGroups.SegmentIdentificationSequence
              .ReferencedSegmentNumber
        : SharedFunctionalGroupsSequence.SegmentIdentificationSequence
        ? SharedFunctionalGroupsSequence.SegmentIdentificationSequence
              .ReferencedSegmentNumber
        : undefined;
};

function insertPixelDataPlanar(
    segmentsOnFrame,
    segmentsOnFrameArray,
    labelmapBufferArray,
    pixelData,
    multiframe,
    imageIds,
    validOrientations,
    metadataProvider
) {
    const {
        SharedFunctionalGroupsSequence,
        PerFrameFunctionalGroupsSequence,
        Rows,
        Columns
    } = multiframe;

    const sharedImageOrientationPatient = SharedFunctionalGroupsSequence.PlaneOrientationSequence
        ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
              .ImageOrientationPatient
        : undefined;
    const sliceLength = Columns * Rows;

    for (
        let i = 0, groupsLen = PerFrameFunctionalGroupsSequence.length;
        i < groupsLen;
        ++i
    ) {
        const PerFrameFunctionalGroups = PerFrameFunctionalGroupsSequence[i];

        const ImageOrientationPatientI =
            sharedImageOrientationPatient ||
            PerFrameFunctionalGroups.PlaneOrientationSequence
                .ImageOrientationPatient;

        const pixelDataI2D = ndarray(
            new Uint8Array(pixelData.buffer, i * sliceLength, sliceLength),
            [Rows, Columns]
        );

        const alignedPixelDataI = alignPixelDataWithSourceData(
            pixelDataI2D,
            ImageOrientationPatientI,
            validOrientations
        );

        if (!alignedPixelDataI) {
            console.warn(
                "Individual SEG frames are out of plane with respect to the first SEG frame, this is not yet supported, skipping this frame."
            );

            inPlane = false;
            break;
        }

        const segmentIndex = getSegmentIndex(multiframe, i);
        if (segmentIndex === undefined) {
            console.warn(
                "Could not retrieve the segment index, skipping this frame. "
            );
            break;
        }

        let SourceImageSequence;

        if (multiframe.SourceImageSequence) {
            SourceImageSequence = multiframe.SourceImageSequence[i];
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
            labelmapBufferArray[0],
            byteOffset,
            sliceLength
        );

        const data = alignedPixelDataI.data;

        //
        for (let j = 0, len = alignedPixelDataI.data.length; j < len; ++j) {
            if (data[j]) {
                for (let x = j + 1; x < len; ++x) {
                    if (data[x]) {
                        labelmap2DView[x] = segmentIndex;
                    }
                }

                if (!segmentsOnFrame[imageIdIndex]) {
                    segmentsOnFrame[imageIdIndex] = [];
                }

                segmentsOnFrame[imageIdIndex].push(segmentIndex);

                break;
            }
        }
    }
}

function checkOrientation(multiframe, validOrientations, sourceDataDimensions) {
    const {
        SharedFunctionalGroupsSequence,
        PerFrameFunctionalGroupsSequence
    } = multiframe;

    const sharedImageOrientationPatient = SharedFunctionalGroupsSequence.PlaneOrientationSequence
        ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
              .ImageOrientationPatient
        : undefined;

    // Check if in plane.
    const PerFrameFunctionalGroups = PerFrameFunctionalGroupsSequence[0];

    const iop =
        sharedImageOrientationPatient ||
        PerFrameFunctionalGroups.PlaneOrientationSequence
            .ImageOrientationPatient;

    const inPlane = validOrientations.some(operation =>
        compareIOP(iop, operation)
    );

    if (inPlane) {
        return "Planar";
    }

    if (
        checkIfPerpendicular(iop, validOrientations[0]) &&
        sourceDataDimensions.includes(multiframe.Rows) &&
        sourceDataDimensions.includes(multiframe.Rows)
    ) {
        // Perpendicular and fits on same grid.
        return "Perpendicular";
    }

    return "Oblique";
}

/**
 * compareIOP - Returns true if iop1 and iop2 are equal
 * within a tollerance, dx.
 *
 * @param  {Number[6]} iop1 An ImageOrientationPatient array.
 * @param  {Number[6]} iop2 An ImageOrientationPatient array.
 * @return {Boolean}      True if iop1 and iop2 are equal.
 */
function checkIfPerpendicular(iop1, iop2) {
    const absDotColumnCosines = Math.abs(
        iop1[0] * iop2[0] + iop1[1] * iop2[1] + iop1[2] * iop2[2]
    );
    const absDotRowCosines = Math.abs(
        iop1[3] * iop2[3] + iop1[4] * iop2[4] + iop1[5] * iop2[5]
    );

    return (
        (absDotColumnCosines < dx || Math.abs(absDotColumnCosines - 1) < dx) &&
        (absDotRowCosines < dx || Math.abs(absDotRowCosines - 1) < dx)
    );
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
        // This is a fractional segmentation, which is not currently supported.
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
        return pixelData2D;
    } else if (compareIOP(iop, orientations[1])) {
        // Flipped vertically.

        // Undo Flip
        return flipMatrix2D.v(pixelData2D);
    } else if (compareIOP(iop, orientations[2])) {
        // Flipped horizontally.

        // Unfo flip
        return flipMatrix2D.h(pixelData2D);
    } else if (compareIOP(iop, orientations[3])) {
        //Rotated 90 degrees

        // Rotate back
        return rotateMatrix902D(pixelData2D);
    } else if (compareIOP(iop, orientations[4])) {
        //Rotated 90 degrees and fliped horizontally.

        // Undo flip and rotate back.
        return rotateMatrix902D(flipMatrix2D.h(pixelData2D));
    } else if (compareIOP(iop, orientations[5])) {
        // Rotated 90 degrees and fliped vertically

        // Unfo flip and rotate back.
        return rotateMatrix902D(flipMatrix2D.v(pixelData2D));
    } else if (compareIOP(iop, orientations[6])) {
        // Rotated 180 degrees. // TODO -> Do this more effeciently, there is a 1:1 mapping like 90 degree rotation.

        return rotateMatrix902D(rotateMatrix902D(pixelData2D));
    } else if (compareIOP(iop, orientations[7])) {
        // Rotated 270 degrees

        // Rotate back.
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

function getSegmentMetadata(multiframe, seriesInstanceUid) {
    const segmentSequence = multiframe.SegmentSequence;
    let data = [];

    if (Array.isArray(segmentSequence)) {
        data = [undefined, ...segmentSequence];
    } else {
        // Only one segment, will be stored as an object.
        data = [undefined, segmentSequence];
    }

    return {
        seriesInstanceUid,
        data
    };
}
