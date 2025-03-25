import {
    log,
    data as dcmjsData,
    utilities,
    normalizers,
    derivations
} from "dcmjs";
import ndarray from "ndarray";
import getDatasetsFromImages from "../helpers/getDatasetsFromImages";
import checkOrientation from "../helpers/checkOrientation";
import compareArrays from "../helpers/compareArrays";

import { Events } from "../enums";

const {
    rotateDirectionCosinesInPlane,
    flipImageOrientationPatient: flipIOP,
    flipMatrix2D,
    rotateMatrix902D
} = utilities.orientation;

const { BitArray, DicomMessage, DicomMetaDictionary } = dcmjsData;

const { Normalizer } = normalizers;
const { Segmentation: SegmentationDerivation } = derivations;
const { encode, decode } = utilities.compression;

/**
 *
 * @typedef {Object} BrushData
 * @property {Object} toolState - The cornerstoneTools global toolState.
 * @property {Object[]} segments - The cornerstoneTools segment metadata that corresponds to the
 *                                 seriesInstanceUid.
 */
const generateSegmentationDefaultOptions = {
    includeSliceSpacing: true,
    rleEncode: false
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
export function generateSegmentation(
    images,
    inputLabelmaps3D,
    userOptions = {}
) {
    const isMultiframe = images[0].imageId.includes("?frame");
    const segmentation = _createSegFromImages(
        images,
        isMultiframe,
        userOptions
    );

    return fillSegmentation(segmentation, inputLabelmaps3D, userOptions);
}

/**
 * Fills a given segmentation object with data from the input labelmaps3D
 *
 * @param segmentation - The segmentation object to be filled.
 * @param inputLabelmaps3D - An array of 3D labelmaps, or a single 3D labelmap.
 * @param userOptions - Optional configuration settings. Will override the default options.
 *
 * @returns {object} The filled segmentation object.
 */
export function fillSegmentation(
    segmentation,
    inputLabelmaps3D,
    userOptions = {}
) {
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
                const labelmaps = _getLabelmapsFromReferencedFrameIndicies(
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
        segmentation.dataset.SpecificCharacterSet = "ISO_IR 192";
        segmentation.dataset._vrMap.PixelData = "OB";
        segmentation.dataset.PixelData = rleEncodedFrames;
    } else {
        // If no rleEncoding, at least bitpack the data.
        segmentation.bitPackPixelData();
    }

    return segmentation;
}

export function _getLabelmapsFromReferencedFrameIndicies(
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
export function _createSegFromImages(images, isMultiframe, options) {
    const multiframe = getDatasetsFromImages(images, isMultiframe);

    return new SegmentationDerivation([multiframe], options);
}

/**
 * generateToolState - Given a set of cornerstoneTools imageIds and a Segmentation buffer,
 * derive cornerstoneTools toolState and brush metadata.
 *
 * @param  {string[]} referencedImageIds - An array for referenced image imageIds.
 * @param  {ArrayBuffer} arrayBuffer - The SEG arrayBuffer.
 * @param  {*} metadataProvider.
 * @param  {obj} options - Options object.
 *
 * @return {[]ArrayBuffer}a list of array buffer for each labelMap
 * @return {Object} an object from which the segment metadata can be derived
 * @return {[][][]} 2D list containing the track of segments per frame
 * @return {[][][]} 3D list containing the track of segments per frame for each labelMap
 *                  (available only for the overlapping case).
 */
export async function generateToolState(
    referencedImageIds,
    arrayBuffer,
    metadataProvider,
    options
) {
    const {
        skipOverlapping = false,
        tolerance = 1e-3,
        TypedArrayConstructor = Uint8Array,
        maxBytesPerChunk = 199000000,
        eventTarget = null,
        triggerEvent = null
    } = options;
    const dicomData = DicomMessage.readFile(arrayBuffer);
    const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);
    dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);
    const multiframe = Normalizer.normalizeToDataset([dataset]);

    const imagePlaneModule = metadataProvider.get(
        "imagePlaneModule",
        referencedImageIds[0]
    );

    const generalSeriesModule = metadataProvider.get(
        "generalSeriesModule",
        referencedImageIds[0]
    );

    const SeriesInstanceUID = generalSeriesModule.seriesInstanceUID;

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
    let pixelDataChunks;

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

        // Todo: need to test this with rle data
        pixelDataChunks = [pixelData];
    } else {
        pixelDataChunks = unpackPixelData(multiframe, { maxBytesPerChunk });

        if (!pixelDataChunks) {
            throw new Error("Fractional segmentations are not yet supported");
        }
    }

    const orientation = checkOrientation(
        multiframe,
        validOrientations,
        [
            imagePlaneModule.rows,
            imagePlaneModule.columns,
            referencedImageIds.length
        ],
        tolerance
    );

    // Pre-compute the sop UID to imageId index map so that in the for loop
    // we don't have to call metadataProvider.get() for each imageId over
    // and over again.
    const sopUIDImageIdIndexMap = referencedImageIds.reduce((acc, imageId) => {
        const { sopInstanceUID } = metadataProvider.get(
            "generalImageModule",
            imageId
        );
        acc[sopInstanceUID] = imageId;
        return acc;
    }, {});

    let overlapping = false;
    if (!skipOverlapping) {
        overlapping = checkSEGsOverlapping(
            pixelDataChunks,
            multiframe,
            referencedImageIds,
            validOrientations,
            metadataProvider,
            tolerance,
            TypedArrayConstructor,
            sopUIDImageIdIndexMap
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

    const arrayBufferLength =
        sliceLength *
        referencedImageIds.length *
        TypedArrayConstructor.BYTES_PER_ELEMENT;
    const labelmapBufferArray = [];
    labelmapBufferArray[0] = new ArrayBuffer(arrayBufferLength);

    // Pre-compute the indices and metadata so that we don't have to call
    // a function for each imageId in the for loop.
    const imageIdMaps = referencedImageIds.reduce(
        (acc, curr, index) => {
            acc.indices[curr] = index;
            acc.metadata[curr] = metadataProvider.get("instance", curr);
            return acc;
        },
        { indices: {}, metadata: {} }
    );

    // This is the centroid calculation for each segment Index, the data structure
    // is a Map with key = segmentIndex and value = {imageIdIndex: centroid, ...}
    // later on we will use this data structure to calculate the centroid of the
    // segment in the labelmapBuffer
    const segmentsPixelIndices = new Map();

    const overlappingSegments = await insertFunction(
        segmentsOnFrame,
        segmentsOnFrameArray,
        labelmapBufferArray,
        pixelDataChunks,
        multiframe,
        referencedImageIds,
        validOrientations,
        metadataProvider,
        tolerance,
        TypedArrayConstructor,
        segmentsPixelIndices,
        sopUIDImageIdIndexMap,
        imageIdMaps,
        eventTarget,
        triggerEvent
    );

    // calculate the centroid of each segment
    const centroidXYZ = new Map();

    segmentsPixelIndices.forEach((imageIdIndexBufferIndex, segmentIndex) => {
        const centroids = calculateCentroid(
            imageIdIndexBufferIndex,
            multiframe,
            metadataProvider,
            referencedImageIds
        );

        centroidXYZ.set(segmentIndex, centroids);
    });

    return {
        labelmapBufferArray,
        segMetadata,
        segmentsOnFrame,
        segmentsOnFrameArray,
        centroids: centroidXYZ,
        overlappingSegments
    };
}

// function insertPixelDataPerpendicular(
//     segmentsOnFrame,
//     labelmapBuffer,
//     pixelData,
//     multiframe,
//     imageIds,
//     validOrientations,
//     metadataProvider
// ) {
//     const {
//         SharedFunctionalGroupsSequence,
//         PerFrameFunctionalGroupsSequence,
//         Rows,
//         Columns
//     } = multiframe;

//     const firstImagePlaneModule = metadataProvider.get(
//         "imagePlaneModule",
//         imageIds[0]
//     );

//     const lastImagePlaneModule = metadataProvider.get(
//         "imagePlaneModule",
//         imageIds[imageIds.length - 1]
//     );

//     console.log(firstImagePlaneModule);
//     console.log(lastImagePlaneModule);

//     const corners = [
//         ...getCorners(firstImagePlaneModule),
//         ...getCorners(lastImagePlaneModule)
//     ];

//     console.log(`corners:`);
//     console.log(corners);

//     const indexToWorld = mat4.create();

//     const ippFirstFrame = firstImagePlaneModule.imagePositionPatient;
//     const rowCosines = Array.isArray(firstImagePlaneModule.rowCosines)
//         ? [...firstImagePlaneModule.rowCosines]
//         : [
//               firstImagePlaneModule.rowCosines.x,
//               firstImagePlaneModule.rowCosines.y,
//               firstImagePlaneModule.rowCosines.z
//           ];

//     const columnCosines = Array.isArray(firstImagePlaneModule.columnCosines)
//         ? [...firstImagePlaneModule.columnCosines]
//         : [
//               firstImagePlaneModule.columnCosines.x,
//               firstImagePlaneModule.columnCosines.y,
//               firstImagePlaneModule.columnCosines.z
//           ];

//     const { pixelSpacing } = firstImagePlaneModule;

//     mat4.set(
//         indexToWorld,
//         // Column 1
//         0,
//         0,
//         0,
//         ippFirstFrame[0],
//         // Column 2
//         0,
//         0,
//         0,
//         ippFirstFrame[1],
//         // Column 3
//         0,
//         0,
//         0,
//         ippFirstFrame[2],
//         // Column 4
//         0,
//         0,
//         0,
//         1
//     );

//     // TODO -> Get origin and (x,y,z) increments to build a translation matrix:
//     // TODO -> Equation C.7.6.2.1-1

//     // | cx*di rx* Xx 0 |  |x|
//     // | cy*di ry Xy 0 |  |y|
//     // | cz*di rz Xz 0 |  |z|
//     // | tx ty tz 1 |  |1|

//     // const [
//     //     0, 0 , 0 , 0,
//     //     0, 0 , 0 , 0,
//     //     0, 0 , 0 , 0,
//     //     ipp[0], ipp[1] , ipp[2] , 1,
//     // ]

//     // Each frame:

//     // Find which corner the first voxel lines up with (one of 8 corners.)

//     // Find how i,j,k orient with respect to source volume.
//     // Go through each frame, find location in source to start, and whether to increment +/ix,+/-y,+/-z
//     //   through each voxel.

//     // [1,0,0,0,1,0]

//     // const [

//     // ]

//     // Invert transformation matrix to get worldToIndex

//     // Apply world to index on each point to fill up the matrix.

//     // const sharedImageOrientationPatient = SharedFunctionalGroupsSequence.PlaneOrientationSequence
//     //     ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
//     //           .ImageOrientationPatient
//     //     : undefined;
//     // const sliceLength = Columns * Rows;
// }

// function getCorners(imagePlaneModule) {
//     // console.log(imagePlaneModule);

//     const {
//         rows,
//         columns,
//         rowCosines,
//         columnCosines,
//         imagePositionPatient: ipp,
//         rowPixelSpacing,
//         columnPixelSpacing
//     } = imagePlaneModule;

//     const rowLength = columns * columnPixelSpacing;
//     const columnLength = rows * rowPixelSpacing;

//     const entireRowVector = [
//         rowLength * columnCosines[0],
//         rowLength * columnCosines[1],
//         rowLength * columnCosines[2]
//     ];

//     const entireColumnVector = [
//         columnLength * rowCosines[0],
//         columnLength * rowCosines[1],
//         columnLength * rowCosines[2]
//     ];

//     const topLeft = [ipp[0], ipp[1], ipp[2]];
//     const topRight = [
//         topLeft[0] + entireRowVector[0],
//         topLeft[1] + entireRowVector[1],
//         topLeft[2] + entireRowVector[2]
//     ];
//     const bottomLeft = [
//         topLeft[0] + entireColumnVector[0],
//         topLeft[1] + entireColumnVector[1],
//         topLeft[2] + entireColumnVector[2]
//     ];

//     const bottomRight = [
//         bottomLeft[0] + entireRowVector[0],
//         bottomLeft[1] + entireRowVector[1],
//         bottomLeft[2] + entireRowVector[2]
//     ];

//     return [topLeft, topRight, bottomLeft, bottomRight];
// }

/**
 * Find the reference frame of the segmentation frame in the source data.
 *
 * @param  {Object}      multiframe        dicom metadata
 * @param  {Int}         frameSegment      frame dicom index
 * @param  {String[]}    imageIds          A list of imageIds.
 * @param  {Object}      sopUIDImageIdIndexMap  A map of SOPInstanceUID to imageId
 * @param  {Float}       tolerance         The tolerance parameter
 *
 * @returns {String}     Returns the imageId
 */
export function findReferenceSourceImageId(
    multiframe,
    frameSegment,
    imageIds,
    metadataProvider,
    tolerance,
    sopUIDImageIdIndexMap
) {
    let imageId = undefined;

    if (!multiframe) {
        return imageId;
    }

    const {
        FrameOfReferenceUID,
        PerFrameFunctionalGroupsSequence,
        SourceImageSequence,
        ReferencedSeriesSequence
    } = multiframe;

    if (
        !PerFrameFunctionalGroupsSequence ||
        PerFrameFunctionalGroupsSequence.length === 0
    ) {
        return imageId;
    }

    const PerFrameFunctionalGroup =
        PerFrameFunctionalGroupsSequence[frameSegment];

    if (!PerFrameFunctionalGroup) {
        return imageId;
    }

    let frameSourceImageSequence = undefined;
    if (PerFrameFunctionalGroup.DerivationImageSequence) {
        let DerivationImageSequence =
            PerFrameFunctionalGroup.DerivationImageSequence;
        if (Array.isArray(DerivationImageSequence)) {
            if (DerivationImageSequence.length !== 0) {
                DerivationImageSequence = DerivationImageSequence[0];
            } else {
                DerivationImageSequence = undefined;
            }
        }

        if (DerivationImageSequence) {
            frameSourceImageSequence =
                DerivationImageSequence.SourceImageSequence;
            if (Array.isArray(frameSourceImageSequence)) {
                if (frameSourceImageSequence.length !== 0) {
                    frameSourceImageSequence = frameSourceImageSequence[0];
                } else {
                    frameSourceImageSequence = undefined;
                }
            }
        }
    } else if (SourceImageSequence && SourceImageSequence.length !== 0) {
        console.warn(
            "DerivationImageSequence not present, using SourceImageSequence assuming SEG has the same geometry as the source image."
        );
        frameSourceImageSequence = SourceImageSequence[frameSegment];
    }

    if (frameSourceImageSequence) {
        imageId = getImageIdOfSourceImageBySourceImageSequence(
            frameSourceImageSequence,
            sopUIDImageIdIndexMap
        );
    }

    if (imageId === undefined && ReferencedSeriesSequence) {
        const referencedSeriesSequence = Array.isArray(ReferencedSeriesSequence)
            ? ReferencedSeriesSequence[0]
            : ReferencedSeriesSequence;
        const ReferencedSeriesInstanceUID =
            referencedSeriesSequence.SeriesInstanceUID;

        imageId = getImageIdOfSourceImagebyGeometry(
            ReferencedSeriesInstanceUID,
            FrameOfReferenceUID,
            PerFrameFunctionalGroup,
            imageIds,
            metadataProvider,
            tolerance
        );
    }

    return imageId;
}

/**
 * Checks if there is any overlapping segmentations.
 *  @returns {boolean} Returns a flag if segmentations overlapping
 */

export function checkSEGsOverlapping(
    pixelData,
    multiframe,
    imageIds,
    validOrientations,
    metadataProvider,
    tolerance,
    TypedArrayConstructor,
    sopUIDImageIdIndexMap
) {
    const {
        SharedFunctionalGroupsSequence,
        PerFrameFunctionalGroupsSequence,
        SegmentSequence,
        Rows,
        Columns
    } = multiframe;

    let numberOfSegs = SegmentSequence.length;
    if (numberOfSegs < 2) {
        return false;
    }

    const sharedImageOrientationPatient =
        SharedFunctionalGroupsSequence.PlaneOrientationSequence
            ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
                  .ImageOrientationPatient
            : undefined;
    const sliceLength = Columns * Rows;
    const groupsLen = PerFrameFunctionalGroupsSequence.length;

    /** sort groupsLen to have all the segments for each frame in an array
     * frame 2 : 1, 2
     * frame 4 : 1, 3
     * frame 5 : 4
     */

    let frameSegmentsMapping = new Map();
    for (let frameSegment = 0; frameSegment < groupsLen; ++frameSegment) {
        const segmentIndex = getSegmentIndex(multiframe, frameSegment);
        if (segmentIndex === undefined) {
            console.warn(
                "Could not retrieve the segment index for frame segment " +
                    frameSegment +
                    ", skipping this frame."
            );
            continue;
        }

        const imageId = findReferenceSourceImageId(
            multiframe,
            frameSegment,
            imageIds,
            metadataProvider,
            tolerance,
            sopUIDImageIdIndexMap
        );

        if (!imageId) {
            console.warn(
                "Image not present in stack, can't import frame : " +
                    frameSegment +
                    "."
            );
            continue;
        }

        const imageIdIndex = imageIds.findIndex(element => element === imageId);

        if (frameSegmentsMapping.has(imageIdIndex)) {
            let segmentArray = frameSegmentsMapping.get(imageIdIndex);
            if (!segmentArray.includes(frameSegment)) {
                segmentArray.push(frameSegment);
                frameSegmentsMapping.set(imageIdIndex, segmentArray);
            }
        } else {
            frameSegmentsMapping.set(imageIdIndex, [frameSegment]);
        }
    }

    for (let [, role] of frameSegmentsMapping.entries()) {
        let temp2DArray = new TypedArrayConstructor(sliceLength).fill(0);

        for (let i = 0; i < role.length; ++i) {
            const frameSegment = role[i];

            const PerFrameFunctionalGroups =
                PerFrameFunctionalGroupsSequence[frameSegment];

            const ImageOrientationPatientI =
                sharedImageOrientationPatient ||
                PerFrameFunctionalGroups.PlaneOrientationSequence
                    .ImageOrientationPatient;

            const view = readFromUnpackedChunks(
                pixelData,
                frameSegment * sliceLength,
                sliceLength
            );

            const pixelDataI2D = ndarray(view, [Rows, Columns]);

            const alignedPixelDataI = alignPixelDataWithSourceData(
                pixelDataI2D,
                ImageOrientationPatientI,
                validOrientations,
                tolerance
            );

            if (!alignedPixelDataI) {
                console.warn(
                    "Individual SEG frames are out of plane with respect to the first SEG frame, this is not yet supported, skipping this frame."
                );
                continue;
            }

            const data = alignedPixelDataI.data;
            for (let j = 0, len = data.length; j < len; ++j) {
                if (data[j] !== 0) {
                    temp2DArray[j]++;
                    if (temp2DArray[j] > 1) {
                        return true;
                    }
                }
            }
        }
    }

    return false;
}

export function insertOverlappingPixelDataPlanar(
    segmentsOnFrame,
    segmentsOnFrameArray,
    labelmapBufferArray,
    pixelData,
    multiframe,
    imageIds,
    validOrientations,
    metadataProvider,
    tolerance,
    TypedArrayConstructor,
    segmentsPixelIndices,
    sopUIDImageIdIndexMap
) {
    const {
        SharedFunctionalGroupsSequence,
        PerFrameFunctionalGroupsSequence,
        Rows,
        Columns
    } = multiframe;

    const sharedImageOrientationPatient =
        SharedFunctionalGroupsSequence.PlaneOrientationSequence
            ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
                  .ImageOrientationPatient
            : undefined;
    const sliceLength = Columns * Rows;
    const arrayBufferLength =
        sliceLength * imageIds.length * TypedArrayConstructor.BYTES_PER_ELEMENT;
    // indicate the number of labelMaps
    let M = 1;

    // indicate the current labelMap array index;
    let m = 0;

    // temp array for checking overlaps
    let tempBuffer = labelmapBufferArray[m].slice(0);

    // temp list for checking overlaps
    let tempSegmentsOnFrame = structuredClone(segmentsOnFrameArray[m]);

    /** split overlapping SEGs algorithm for each segment:
     *  A) copy the labelmapBuffer in the array with index 0
     *  B) add the segment pixel per pixel on the copied buffer from (A)
     *  C) if no overlap, copy the results back on the orignal array from (A)
     *  D) if overlap, repeat increasing the index m up to M (if out of memory, add new buffer in the array and M++);
     */

    let numberOfSegs = multiframe.SegmentSequence.length;
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
                throw new Error(
                    "Could not retrieve the segment index. Aborting segmentation loading."
                );
            }

            if (segmentIndex !== segmentIndexToProcess) {
                continue;
            }

            const ImageOrientationPatientI =
                sharedImageOrientationPatient ||
                PerFrameFunctionalGroups.PlaneOrientationSequence
                    .ImageOrientationPatient;

            // Since we moved to the chunks approach, we need to read the data
            // and handle scenarios where the portion of data is in one chunk
            // and the other portion is in another chunk
            const view = readFromUnpackedChunks(
                pixelData,
                i * sliceLength,
                sliceLength
            );

            const pixelDataI2D = ndarray(view, [Rows, Columns]);

            const alignedPixelDataI = alignPixelDataWithSourceData(
                pixelDataI2D,
                ImageOrientationPatientI,
                validOrientations,
                tolerance
            );

            if (!alignedPixelDataI) {
                throw new Error(
                    "Individual SEG frames are out of plane with respect to the first SEG frame. " +
                        "This is not yet supported. Aborting segmentation loading."
                );
            }

            const imageId = findReferenceSourceImageId(
                multiframe,
                i,
                imageIds,
                metadataProvider,
                tolerance,
                sopUIDImageIdIndexMap
            );

            if (!imageId) {
                console.warn(
                    "Image not present in stack, can't import frame : " +
                        i +
                        "."
                );
                continue;
            }

            const sourceImageMetadata = metadataProvider.get(
                "instance",
                imageId
            );
            if (
                Rows !== sourceImageMetadata.Rows ||
                Columns !== sourceImageMetadata.Columns
            ) {
                throw new Error(
                    "Individual SEG frames have different geometry dimensions (Rows and Columns) " +
                        "respect to the source image reference frame. This is not yet supported. " +
                        "Aborting segmentation loading. "
                );
            }

            const imageIdIndex = imageIds.findIndex(
                element => element === imageId
            );
            const byteOffset =
                sliceLength *
                imageIdIndex *
                TypedArrayConstructor.BYTES_PER_ELEMENT;

            const labelmap2DView = new TypedArrayConstructor(
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
                        tempSegmentsOnFrame = structuredClone(
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
        segmentsOnFrameArray[m] = structuredClone(tempSegmentsOnFrame);

        // reset temp variables/buffers for new segment
        m = 0;
        tempBuffer = labelmapBufferArray[m].slice(0);
        tempSegmentsOnFrame = structuredClone(segmentsOnFrameArray[m]);
    }
}

export const getSegmentIndex = (multiframe, frame) => {
    const { PerFrameFunctionalGroupsSequence, SharedFunctionalGroupsSequence } =
        multiframe;
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

export function insertPixelDataPlanar(
    segmentsOnFrame,
    segmentsOnFrameArray,
    labelmapBufferArray,
    pixelData,
    multiframe,
    imageIds,
    validOrientations,
    metadataProvider,
    tolerance,
    TypedArrayConstructor,
    segmentsPixelIndices,
    sopUIDImageIdIndexMap,
    imageIdMaps,
    eventTarget,
    triggerEvent
) {
    const {
        SharedFunctionalGroupsSequence,
        PerFrameFunctionalGroupsSequence,
        Rows,
        Columns
    } = multiframe;

    const sharedImageOrientationPatient =
        SharedFunctionalGroupsSequence.PlaneOrientationSequence
            ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
                  .ImageOrientationPatient
            : undefined;
    const sliceLength = Columns * Rows;

    let i = 0;
    const groupsLen = PerFrameFunctionalGroupsSequence.length;
    const chunkSize = Math.ceil(groupsLen / 10); // 10% of total length

    const shouldTriggerEvent = triggerEvent && eventTarget;

    let overlapping = false;
    // Below, we chunk the processing of the frames to avoid blocking the main thread
    // if the segmentation is large. We also use a promise to allow the caller to
    // wait for the processing to finish.
    return new Promise(resolve => {
        function processInChunks() {
            // process one chunk
            for (let end = Math.min(i + chunkSize, groupsLen); i < end; ++i) {
                const PerFrameFunctionalGroups =
                    PerFrameFunctionalGroupsSequence[i];

                const ImageOrientationPatientI =
                    sharedImageOrientationPatient ||
                    PerFrameFunctionalGroups.PlaneOrientationSequence
                        .ImageOrientationPatient;

                const view = readFromUnpackedChunks(
                    pixelData,
                    i * sliceLength,
                    sliceLength
                );

                const pixelDataI2D = ndarray(view, [Rows, Columns]);

                const alignedPixelDataI = alignPixelDataWithSourceData(
                    pixelDataI2D,
                    ImageOrientationPatientI,
                    validOrientations,
                    tolerance
                );

                if (!alignedPixelDataI) {
                    throw new Error(
                        "Individual SEG frames are out of plane with respect to the first SEG frame. " +
                            "This is not yet supported. Aborting segmentation loading."
                    );
                }

                const segmentIndex = getSegmentIndex(multiframe, i);

                if (segmentIndex === undefined) {
                    throw new Error(
                        "Could not retrieve the segment index. Aborting segmentation loading."
                    );
                }

                if (!segmentsPixelIndices.has(segmentIndex)) {
                    segmentsPixelIndices.set(segmentIndex, {});
                }

                const imageId = findReferenceSourceImageId(
                    multiframe,
                    i,
                    imageIds,
                    metadataProvider,
                    tolerance,
                    sopUIDImageIdIndexMap
                );

                if (!imageId) {
                    console.warn(
                        "Image not present in stack, can't import frame : " +
                            i +
                            "."
                    );
                    continue;
                }

                const sourceImageMetadata = imageIdMaps.metadata[imageId];
                if (
                    Rows !== sourceImageMetadata.Rows ||
                    Columns !== sourceImageMetadata.Columns
                ) {
                    throw new Error(
                        "Individual SEG frames have different geometry dimensions (Rows and Columns) " +
                            "respect to the source image reference frame. This is not yet supported. " +
                            "Aborting segmentation loading. "
                    );
                }

                const imageIdIndex = imageIdMaps.indices[imageId];

                const byteOffset =
                    sliceLength *
                    imageIdIndex *
                    TypedArrayConstructor.BYTES_PER_ELEMENT;

                const labelmap2DView = new TypedArrayConstructor(
                    labelmapBufferArray[0],
                    byteOffset,
                    sliceLength
                );

                const data = alignedPixelDataI.data;

                const indexCache = [];
                for (
                    let j = 0, len = alignedPixelDataI.data.length;
                    j < len;
                    ++j
                ) {
                    if (data[j]) {
                        for (let x = j; x < len; ++x) {
                            if (data[x]) {
                                if (!overlapping && labelmap2DView[x] !== 0) {
                                    overlapping = true;
                                }
                                labelmap2DView[x] = segmentIndex;
                                indexCache.push(x);
                            }
                        }

                        if (!segmentsOnFrame[imageIdIndex]) {
                            segmentsOnFrame[imageIdIndex] = [];
                        }

                        segmentsOnFrame[imageIdIndex].push(segmentIndex);

                        break;
                    }
                }

                const segmentIndexObject =
                    segmentsPixelIndices.get(segmentIndex);
                segmentIndexObject[imageIdIndex] = indexCache;
                segmentsPixelIndices.set(segmentIndex, segmentIndexObject);
            }

            // trigger an event after each chunk
            if (shouldTriggerEvent) {
                const percentComplete = Math.round((i / groupsLen) * 100);
                triggerEvent(eventTarget, Events.SEGMENTATION_LOAD_PROGRESS, {
                    percentComplete
                });
            }

            // schedule next chunk
            if (i < groupsLen) {
                setTimeout(processInChunks, 0);
            } else {
                // resolve the Promise when all chunks have been processed
                resolve(overlapping);
            }
        }

        processInChunks();
    });
}

/**
 * unpackPixelData - Unpacks bit packed pixelData if the Segmentation is BINARY.
 *
 * @param  {Object} multiframe The multiframe dataset.
 * @param  {Object} options    Options for the unpacking.
 * @return {Uint8Array}      The unpacked pixelData.
 */
export function unpackPixelData(multiframe, options) {
    const segType = multiframe.SegmentationType;

    let data;
    if (Array.isArray(multiframe.PixelData)) {
        data = multiframe.PixelData[0];
    } else {
        data = multiframe.PixelData;
    }

    if (data === undefined) {
        log.error("This segmentation pixelData is undefined.");
    }

    if (segType === "BINARY") {
        // For extreme big data, we can't unpack the data at once and we need to
        // chunk it and unpack each chunk separately.
        // MAX 2GB is the limit right now to allocate a buffer
        return getUnpackedChunks(data, options.maxBytesPerChunk);
    }

    const pixelData = new Uint8Array(data);

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

export function getUnpackedChunks(data, maxBytesPerChunk) {
    var bitArray = new Uint8Array(data);
    var chunks = [];

    var maxBitsPerChunk = maxBytesPerChunk * 8;
    var numberOfChunks = Math.ceil((bitArray.length * 8) / maxBitsPerChunk);

    for (var i = 0; i < numberOfChunks; i++) {
        var startBit = i * maxBitsPerChunk;
        var endBit = Math.min(startBit + maxBitsPerChunk, bitArray.length * 8);

        var startByte = Math.floor(startBit / 8);
        var endByte = Math.ceil(endBit / 8);

        var chunk = bitArray.slice(startByte, endByte);
        var unpackedChunk = BitArray.unpack(chunk);

        chunks.push(unpackedChunk);
    }

    return chunks;
}

/**
 * getImageIdOfSourceImageBySourceImageSequence - Returns the Cornerstone imageId of the source image.
 *
 * @param  {Object}   SourceImageSequence  Sequence describing the source image.
 * @param  {String[]} imageIds             A list of imageIds.
 * @param  {Object}   sopUIDImageIdIndexMap A map of SOPInstanceUIDs to imageIds.
 * @return {String}                        The corresponding imageId.
 */
export function getImageIdOfSourceImageBySourceImageSequence(
    SourceImageSequence,
    sopUIDImageIdIndexMap
) {
    const { ReferencedSOPInstanceUID, ReferencedFrameNumber } =
        SourceImageSequence;

    const baseImageId = sopUIDImageIdIndexMap[ReferencedSOPInstanceUID];

    if (!baseImageId) {
        console.warn(
            `No imageId found for SOPInstanceUID: ${ReferencedSOPInstanceUID}`
        );
        return undefined;
    }

    if (ReferencedFrameNumber !== undefined) {
        if (baseImageId.includes("frames/")) {
            return baseImageId.replace(
                /frames\/\d+/,
                `frames/${ReferencedFrameNumber}`
            );
        } else if (baseImageId.includes("frame=")) {
            return baseImageId.replace(
                /frame=\d+/,
                `frame=${ReferencedFrameNumber - 1}`
            );
        } else {
            if (baseImageId.includes("wadors:")) {
                return `${baseImageId}/frames/${ReferencedFrameNumber}`;
            } else {
                return `${baseImageId}?frame=${ReferencedFrameNumber - 1}`;
            }
        }
    }

    return baseImageId;
}

/**
 * Determines if an image is a multiframe image based on its metadata.
 *
 * @param {Object} imageMetadata - The metadata object for the image
 * @param {number} [imageMetadata.NumberOfFrames] - The number of frames in the image
 * @returns {boolean} True if the image is a multiframe image (NumberOfFrames > 1)
 */
function isMultiframeImage(imageMetadata) {
    return imageMetadata && imageMetadata.NumberOfFrames > 1;
}

/**
 * getImageIdOfSourceImagebyGeometry - Returns the Cornerstone imageId of the source image.
 *
 * @param  {String}    ReferencedSeriesInstanceUID    Referenced series of the source image.
 * @param  {String}    FrameOfReferenceUID            Frame of reference.
 * @param  {Object}    PerFrameFunctionalGroup        Sequence describing segmentation reference attributes per frame.
 * @param  {String[]}  imageIds                       A list of imageIds.
 * @param  {Object}    sopUIDImageIdIndexMap          A map of SOPInstanceUIDs to imageIds.
 * @param  {Float}     tolerance                      The tolerance parameter
 *
 * @return {String}                                   The corresponding imageId.
 */
export function getImageIdOfSourceImagebyGeometry(
    ReferencedSeriesInstanceUID,
    FrameOfReferenceUID,
    PerFrameFunctionalGroup,
    imageIds,
    metadataProvider,
    tolerance
) {
    if (
        !ReferencedSeriesInstanceUID ||
        !PerFrameFunctionalGroup.PlanePositionSequence?.[0]
            ?.ImagePositionPatient
    ) {
        return undefined;
    }

    const segFramePosition =
        PerFrameFunctionalGroup.PlanePositionSequence[0].ImagePositionPatient;

    for (let imageId of imageIds) {
        const sourceImageMetadata = metadataProvider.get("instance", imageId);

        if (!sourceImageMetadata) {
            continue;
        }

        // Check if this is a multiframe image using the corrected function
        const isMultiframe = sourceImageMetadata.NumberOfFrames > 1;

        if (
            !sourceImageMetadata.ImagePositionPatient ||
            sourceImageMetadata.FrameOfReferenceUID !== FrameOfReferenceUID ||
            sourceImageMetadata.SeriesInstanceUID !==
                ReferencedSeriesInstanceUID
        ) {
            continue;
        }

        // For multiframe images, check each frame's position
        if (isMultiframe) {
            const framePosition = metadataProvider.get(
                "imagePlaneModule",
                imageId
            )?.imagePositionPatient;

            if (
                framePosition &&
                compareArrays(segFramePosition, framePosition, tolerance)
            ) {
                return imageId;
            }
        } else if (
            compareArrays(
                segFramePosition,
                sourceImageMetadata.ImagePositionPatient,
                tolerance
            )
        ) {
            return imageId;
        }
    }

    return undefined;
}

/**
 * getImageIdOfReferencedFrame - Returns the imageId corresponding to the
 * specified sopInstanceUid and frameNumber for multi-frame images.
 *
 * @param  {String} sopInstanceUid   The sopInstanceUid of the desired image.
 * @param  {Number} frameNumber      The frame number.
 * @param  {String} imageIds         The list of imageIds.
 * @param  {Object} sopUIDImageIdIndexMap A map of SOPInstanceUIDs to imageIds.
 * @return {String}                  The imageId that corresponds to the sopInstanceUid.
 */
export function getImageIdOfReferencedFrame(
    sopInstanceUid,
    frameNumber,
    sopUIDImageIdIndexMap
) {
    const baseImageId = sopUIDImageIdIndexMap[sopInstanceUid];

    if (!baseImageId) {
        console.warn(`No imageId found for SOPInstanceUID: ${sopInstanceUid}`);
        return undefined;
    }

    // Handle wadors format differently from others
    if (baseImageId.includes("wadors:")) {
        return `${baseImageId}/frames/${frameNumber}`;
    }

    // For all other formats use frame parameter
    return `${baseImageId}?frame=${frameNumber - 1}`;
}

/**
 * getValidOrientations - returns an array of valid orientations.
 *
 * @param  {Number[6]} iop The row (0..2) an column (3..5) direction cosines.
 * @return {Number[8][6]} An array of valid orientations.
 */
export function getValidOrientations(iop) {
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
 * @param {Ndarray} pixelData2D - The data to align.
 * @param {Number[6]} iop - The orientation of the image slice.
 * @param {Number[8][6]} orientations - An array of valid imageOrientationPatient values.
 * @param {Number} tolerance.
 * @return {Ndarray} The aligned pixelData.
 */
export function alignPixelDataWithSourceData(
    pixelData2D,
    iop,
    orientations,
    tolerance
) {
    if (compareArrays(iop, orientations[0], tolerance)) {
        return pixelData2D;
    } else if (compareArrays(iop, orientations[1], tolerance)) {
        // Flipped vertically.

        // Undo Flip
        return flipMatrix2D.v(pixelData2D);
    } else if (compareArrays(iop, orientations[2], tolerance)) {
        // Flipped horizontally.

        // Unfo flip
        return flipMatrix2D.h(pixelData2D);
    } else if (compareArrays(iop, orientations[3], tolerance)) {
        //Rotated 90 degrees

        // Rotate back
        return rotateMatrix902D(pixelData2D);
    } else if (compareArrays(iop, orientations[4], tolerance)) {
        //Rotated 90 degrees and fliped horizontally.

        // Undo flip and rotate back.
        return rotateMatrix902D(flipMatrix2D.h(pixelData2D));
    } else if (compareArrays(iop, orientations[5], tolerance)) {
        // Rotated 90 degrees and fliped vertically

        // Unfo flip and rotate back.
        return rotateMatrix902D(flipMatrix2D.v(pixelData2D));
    } else if (compareArrays(iop, orientations[6], tolerance)) {
        // Rotated 180 degrees. // TODO -> Do this more effeciently, there is a 1:1 mapping like 90 degree rotation.

        return rotateMatrix902D(rotateMatrix902D(pixelData2D));
    } else if (compareArrays(iop, orientations[7], tolerance)) {
        // Rotated 270 degrees

        // Rotate back.
        return rotateMatrix902D(
            rotateMatrix902D(rotateMatrix902D(pixelData2D))
        );
    }
}

export function getSegmentMetadata(multiframe, seriesInstanceUid) {
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

/**
 * Reads a range of bytes from an array of ArrayBuffer chunks and
 * aggregate them into a new Uint8Array.
 *
 * @param {ArrayBuffer[]} chunks - An array of ArrayBuffer chunks.
 * @param {number} offset - The offset of the first byte to read.
 * @param {number} length - The number of bytes to read.
 * @returns {Uint8Array} A new Uint8Array containing the requested bytes.
 */
export function readFromUnpackedChunks(chunks, offset, length) {
    const mapping = getUnpackedOffsetAndLength(chunks, offset, length);

    // If all the data is in one chunk, we can just slice that chunk
    if (mapping.start.chunkIndex === mapping.end.chunkIndex) {
        return new Uint8Array(
            chunks[mapping.start.chunkIndex].buffer,
            mapping.start.offset,
            length
        );
    } else {
        // If the data spans multiple chunks, we need to create a new Uint8Array and copy the data from each chunk
        let result = new Uint8Array(length);
        let resultOffset = 0;

        for (
            let i = mapping.start.chunkIndex;
            i <= mapping.end.chunkIndex;
            i++
        ) {
            let start =
                i === mapping.start.chunkIndex ? mapping.start.offset : 0;
            let end =
                i === mapping.end.chunkIndex
                    ? mapping.end.offset
                    : chunks[i].length;

            result.set(
                new Uint8Array(chunks[i].buffer, start, end - start),
                resultOffset
            );
            resultOffset += end - start;
        }

        return result;
    }
}

export function getUnpackedOffsetAndLength(chunks, offset, length) {
    var totalBytes = chunks.reduce((total, chunk) => total + chunk.length, 0);

    if (offset < 0 || offset + length > totalBytes) {
        throw new Error("Offset and length out of bounds");
    }

    var startChunkIndex = 0;
    var startOffsetInChunk = offset;

    while (startOffsetInChunk >= chunks[startChunkIndex].length) {
        startOffsetInChunk -= chunks[startChunkIndex].length;
        startChunkIndex++;
    }

    var endChunkIndex = startChunkIndex;
    var endOffsetInChunk = startOffsetInChunk + length;

    while (endOffsetInChunk > chunks[endChunkIndex].length) {
        endOffsetInChunk -= chunks[endChunkIndex].length;
        endChunkIndex++;
    }

    return {
        start: { chunkIndex: startChunkIndex, offset: startOffsetInChunk },
        end: { chunkIndex: endChunkIndex, offset: endOffsetInChunk }
    };
}

export function calculateCentroid(
    imageIdIndexBufferIndex,
    multiframe,
    metadataProvider,
    imageIds
) {
    let xAcc = 0;
    let yAcc = 0;
    let zAcc = 0;
    let worldXAcc = 0;
    let worldYAcc = 0;
    let worldZAcc = 0;
    let count = 0;

    for (const [imageIdIndex, bufferIndices] of Object.entries(
        imageIdIndexBufferIndex
    )) {
        const z = Number(imageIdIndex);

        if (!bufferIndices || bufferIndices.length === 0) {
            continue;
        }

        // Get metadata for this slice
        const imageId = imageIds[z];
        const imagePlaneModule = metadataProvider.get(
            "imagePlaneModule",
            imageId
        );

        if (!imagePlaneModule) {
            console.debug(
                "Missing imagePlaneModule metadata for centroid calculation"
            );
            continue;
        }

        const {
            imagePositionPatient,
            rowCosines,
            columnCosines,
            rowPixelSpacing,
            columnPixelSpacing
        } = imagePlaneModule;

        for (const bufferIndex of bufferIndices) {
            const y = Math.floor(bufferIndex / multiframe.Rows);
            const x = bufferIndex % multiframe.Rows;

            // Image coordinates
            xAcc += x;
            yAcc += y;
            zAcc += z;

            // Calculate world coordinates
            // P(world) = P(image) * IOP * spacing + IPP
            const worldX =
                imagePositionPatient[0] +
                x * rowCosines[0] * columnPixelSpacing +
                y * columnCosines[0] * rowPixelSpacing;

            const worldY =
                imagePositionPatient[1] +
                x * rowCosines[1] * columnPixelSpacing +
                y * columnCosines[1] * rowPixelSpacing;

            const worldZ =
                imagePositionPatient[2] +
                x * rowCosines[2] * columnPixelSpacing +
                y * columnCosines[2] * rowPixelSpacing;

            worldXAcc += worldX;
            worldYAcc += worldY;
            worldZAcc += worldZ;

            count++;
        }
    }

    return {
        image: {
            x: Math.floor(xAcc / count),
            y: Math.floor(yAcc / count),
            z: Math.floor(zAcc / count)
        },
        world: {
            x: worldXAcc / count,
            y: worldYAcc / count,
            z: worldZAcc / count
        },
        count
    };
}

const Segmentation = {
    generateSegmentation,
    generateToolState,
    fillSegmentation
};

export default Segmentation;
