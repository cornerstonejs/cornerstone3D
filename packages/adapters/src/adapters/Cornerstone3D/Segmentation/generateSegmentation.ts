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
function generateSegmentation(images, labelmaps, metadata, options = {}) {
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
 * @param images - An array of the cornerstone image objects related to the reference
 * series that the segmentation is derived from. You can use methods such as
 * volume.getCornerstoneImages() to get this array.
 *
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
        const instance = metadata.get("instance", image.imageId);
        return {
            ...image,
            ...instance,
            // Todo: move to dcmjs tag style
            SOPClassUID: instance.SopClassUID || instance.SOPClassUID,
            SOPInstanceUID: instance.SopInstanceUID || instance.SOPInstanceUID,
            PixelData: image.voxelManager.getScalarData(),
            _vrMap: {
                PixelData: "OW"
            },
            _meta: {}
        };
    });

    const multiframe = Normalizer.normalizeToDataset(datasets);

    if (!multiframe) {
        throw new Error(
            "Failed to normalize the multiframe dataset, the data is not multi-frame."
        );
    }

    return new SegmentationDerivation([multiframe], options);
}

export { generateSegmentation };
