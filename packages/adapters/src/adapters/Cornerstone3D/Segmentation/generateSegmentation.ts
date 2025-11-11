import { normalizers, derivations } from 'dcmjs';
import { fillSegmentation } from '../../Cornerstone/Segmentation_4X';

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
  const datasets = images.map((image) => {
    // add the sopClassUID to the dataset
    const instance = metadata.get('instance', image.imageId);
    return {
      ...image,
      ...instance,
      // Todo: move to dcmjs tag style
      SOPClassUID: '1.2.840.10008.5.1.4.1.1.66.4',
      SOPInstanceUID: instance.SopInstanceUID || instance.SOPInstanceUID,
      Modality: 'SEG',
      SamplesPerPixel: '1',
      PhotometricInterpretation: 'MONOCHROME2',
      BitsAllocated: '1',
      BitsStored: '1',
      HighBit: '0',
      PixelRepresentation: '0',
      LossyImageCompression: '00',
      SegmentationType: 'BINARY',
      ContentLabel: 'SEGMENTATION',
      PixelData: image.voxelManager.getScalarData(),
      _vrMap: {
        PixelData: 'OW',
      },
      _meta: {},
    };
  });

  const multiframe = Normalizer.normalizeToDataset(datasets);

  if (!multiframe) {
    throw new Error(
      'Failed to normalize the multiframe dataset, the data is not multi-frame.'
    );
  }

  multiframe.SharedFunctionalGroupsSequence ||= {};
  multiframe.SharedFunctionalGroupsSequence.PixelMeasuresSequence = {};
  multiframe.PerFrameFunctionalGroupsSequence ||= [];
  return new SegmentationDerivation([multiframe], options);
}

export { generateSegmentation };
