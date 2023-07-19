import { normalizers, derivations } from "dcmjs";
import { fillSegmentation } from "../../Cornerstone/Segmentation_4X";

const { Normalizer } = normalizers;
const { Segmentation: SegmentationDerivation } = derivations;

/**
 * generateSegmentation - Generates a DICOM Segmentation object given cornerstoneTools data.
 *
 * @param images - An array of the cornerstone image objects, which includes imageId and metadata
 * @param labelmaps - An array of the 3D Volumes that contain the segmentation data.
 */
function generateSegmentation(images, labelmaps, metadata, options) {
    const segmentation = _createMultiframeSegmentationFromReferencedImages(
        images,
        metadata,
        options
    );
    return fillSegmentation(segmentation, labelmaps, options);
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
