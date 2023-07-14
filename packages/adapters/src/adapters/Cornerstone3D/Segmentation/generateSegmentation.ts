import { utilities, normalizers, derivations, data as dcmjsData } from "dcmjs";
import { Buffer } from "buffer";

const { Normalizer } = normalizers;
const { Segmentation: SegmentationDerivation } = derivations;
const { datasetToDict } = dcmjsData;

const { encode } = utilities.compression;

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
 * generateSegmentation - Generates a DICOM Segmentation object given cornerstoneTools data.
 *
 * @param images - An array of the cornerstone image objects, which includes imageId and metadata
 * @param labelmaps - An array of the 3D Volumes that contain the segmentation data.
 */
function generateSegmentation(
    images,
    labelmaps,
    metadata,
    options = { includeSliceSpacing: true }
) {
    const segmentation = _createMultiframeSegmentationFromReferencedImages(
        images,
        metadata,
        options
    );
    return fillSegmentation(segmentation, labelmaps, options);
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
        const { metadata, labelmaps2D } = labelmap3D;

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
            const referencedFrameIndices =
                referencedFramesPerSegment[segmentIndex];

            if (referencedFrameIndices) {
                // Frame numbers start from 1.
                const referencedFrameNumbers = referencedFrameIndices.map(
                    element => {
                        return element + 1;
                    }
                );
                const segmentMetadata = metadata[segmentIndex];
                const labelmaps = _getLabelmapsFromReferencedFrameIndices(
                    labelmap3D,
                    referencedFrameIndices
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

    // const segBlob = dcmjsData.datasetToBlob(segmentation.dataset);
    const buffer = Buffer.from(datasetToDict(segmentation.dataset).write());
    const segBlob = new Blob([buffer], { type: "application/dicom" });

    return segBlob;
}

function _getLabelmapsFromReferencedFrameIndices(
    labelmap3D,
    referencedFrameIndices
) {
    const { labelmaps2D } = labelmap3D;

    const labelmaps = [];

    for (let i = 0; i < referencedFrameIndices.length; i++) {
        const frame = referencedFrameIndices[i];

        labelmaps.push(labelmaps2D[frame].pixelData);
    }

    return labelmaps;
}

/**
 * _createMultiframeSegmentationFromReferencedImages - description
 *
 * @param images - An array of the cornerstone image objects.
 * @param options - the options object for the SegmentationDerivation.
 * @returns The Seg derived dataSet.
 */
function _createMultiframeSegmentationFromReferencedImages(
    images,
    metadata,
    options
) {
    // for (let i = 0; i < images.length; i++) {
    //     const image = images[i];
    //     const arrayBuffer = image.data.byteArray.buffer;
    //     const dicomData = DicomMessage.readFile(arrayBuffer);
    //     const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);

    //     dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);
    //     datasets.push(dataset);
    // }

    const datasets = images.map(image => {
        // add the sopClassUID to the dataset
        const allMetadataModules = metadata.get("dataset", image.imageId);

        return {
            ...image,
            ...allMetadataModules,
            // Todo: move to dcmjs tag style
            SOPClassUID: allMetadataModules.SopClassUID,
            SOPInstanceUID: allMetadataModules.SopInstanceUID,
            PixelData: image.getPixelData(),
            _vrMap: {
                PixelData: "OW"
            },
            _meta: {}
        };
    });

    const multiframe = Normalizer.normalizeToDataset(datasets);

    return new SegmentationDerivation([multiframe], options);
}

export { generateSegmentation };
