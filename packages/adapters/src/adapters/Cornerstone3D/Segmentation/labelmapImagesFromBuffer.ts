import { imageLoader } from "@cornerstonejs/core";
import { data as dcmjsData, normalizers, utilities } from "dcmjs";
import ndarray from "ndarray";
import checkOrientation from "../../helpers/checkOrientation";
import {
    alignPixelDataWithSourceData,
    calculateCentroid,
    checkSEGsOverlapping,
    findReferenceSourceImageId,
    getSegmentIndex,
    getSegmentMetadata,
    getValidOrientations,
    readFromUnpackedChunks,
    unpackPixelData
} from "../../Cornerstone/Segmentation_4X";

const { DicomMessage, DicomMetaDictionary } = dcmjsData;
const { Normalizer } = normalizers;
const { decode } = utilities.compression;

async function createLabelmapsFromBufferInternal(
    referencedImageIds,
    arrayBuffer,
    metadataProvider,
    options
) {
    const {
        skipOverlapping = false,
        tolerance = 1e-3,
        TypedArrayConstructor = Uint8Array,
        maxBytesPerChunk = 199000000
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
            console.warn("No implementation for rle + bit packing.");

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
                throw new Error(
                    "Overlapping segmentations are not yet supported."
                );
            } else {
                insertFunction = insertPixelDataPlanar;
            }
            break;
        case "Perpendicular":
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

    const imageIdMaps = { indices: {}, metadata: {} };
    const labelMapImages = [];

    for (let i = 0; i < referencedImageIds.length; i++) {
        const referenceImageId = referencedImageIds[i];
        imageIdMaps.indices[referenceImageId] = i;
        imageIdMaps.metadata[referenceImageId] = metadataProvider.get(
            "instance",
            referenceImageId
        );
        const labelMapImage =
            imageLoader.createAndCacheDerivedLabelmapImage(referenceImageId);
        labelMapImages.push(labelMapImage);
    }

    // This is the centroid calculation for each segment Index, the data structure
    // is a Map with key = segmentIndex and value = {imageIdIndex: centroid, ...}
    // later on we will use this data structure to calculate the centroid of the
    // segment in the labelmapBuffer
    const segmentsPixelIndices = new Map();

    const overlappingSegments = await insertFunction(
        segmentsOnFrame,
        labelMapImages,
        pixelDataChunks,
        multiframe,
        referencedImageIds,
        validOrientations,
        metadataProvider,
        tolerance,
        segmentsPixelIndices,
        sopUIDImageIdIndexMap,
        imageIdMaps
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
        // array of array since there might be overlapping segments
        labelMapImages: [labelMapImages],
        segMetadata,
        segmentsOnFrame,
        segmentsOnFrameArray,
        centroids: centroidXYZ,
        overlappingSegments
    };
}

export function insertPixelDataPlanar(
    segmentsOnFrame,
    labelMapImages,
    pixelData,
    multiframe,
    imageIds,
    validOrientations,
    metadataProvider,
    tolerance,
    segmentsPixelIndices,
    sopUIDImageIdIndexMap,
    imageIdMaps
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

    const groupsLen = PerFrameFunctionalGroupsSequence.length;

    let overlapping = false;
    // Below, we chunk the processing of the frames to avoid blocking the main thread
    // if the segmentation is large. We also use a promise to allow the caller to
    // wait for the processing to finish.
    return new Promise(resolve => {
        for (let i = 0; i < groupsLen; ++i) {
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
            const labelmapImage = labelMapImages[imageIdIndex];
            const labelmap2DView = labelmapImage.getPixelData();

            const data = alignedPixelDataI.data;

            const indexCache = [];
            for (let j = 0, len = alignedPixelDataI.data.length; j < len; ++j) {
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

            const segmentIndexObject = segmentsPixelIndices.get(segmentIndex);
            segmentIndexObject[imageIdIndex] = indexCache;
            segmentsPixelIndices.set(segmentIndex, segmentIndexObject);
        }
        resolve(overlapping);
    });
}

export { createLabelmapsFromBufferInternal };
