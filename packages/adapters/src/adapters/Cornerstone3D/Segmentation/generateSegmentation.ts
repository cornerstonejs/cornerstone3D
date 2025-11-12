import { normalizers, derivations } from 'dcmjs';
import { Enums } from '@cornerstonejs/core';
import { fillSegmentation } from '../../Cornerstone/Segmentation_4X';

const { MetadataModules } = Enums;
const { SEGImageNormalizer } = normalizers;
const { Segmentation: SegmentationDerivation } = derivations;

interface IOptions {
  predecessorImageId?: string;
}

type Options = IOptions & {
  [key: string]: number | boolean | unknown | string;
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
  options: Options = {}
) {
  const segmentation = _createMultiframeSegmentationFromReferencedImages(
    images,
    metadata,
    options
  );
  const segmentationResult = fillSegmentation(segmentation, labelmaps, options);
  const predecessorImageId = options?.predecessorImageId;
  if (predecessorImageId) {
    const predecessor = metadata.get(
      MetadataModules.PREDECESSOR_SEQUENCE,
      predecessorImageId
    );
    Object.assign(segmentationResult, predecessor);
  }
  return segmentationResult;
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
  const studyData = images[0].imageId;
  const datasets = images.map((image) => {
    const { imageId } = image;
    const seriesData = metadata.get(MetadataModules.SERIES_DATA, imageId);
    const imageData = metadata.get(MetadataModules.IMAGE_DATA, imageId);
    return {
      ...studyData,
      ...seriesData,
      ...imageData,
      PixelData: image.voxelManager.getScalarData(),
      // Declaring it as 16 bits allows the normalizer to work on 8 bit data
      BitsPerPixel: 16,
      _vrMap: {
        PixelData: 'OW',
      },
      _meta: {},
    };
  });

  const isSingleNonMultiFrame =
    datasets.length === 1 && !(datasets[0].NumberOfFrames > 1);
  if (isSingleNonMultiFrame) {
    // The normalizer doesn't handle just a single image correctly, but
    // the segmentation version needs a multiframe object even for a single
    // frame instance, so duplicate the object temporarily
    datasets.push(datasets[0]);
  }
  // Directly use the SEGImageNormalizer to allow creating a SEG virtual instance consisting of
  // whatever instance data we happen to have since this isn't actually creating
  // a real multiframe, but rather a reference object
  const normalizer = new SEGImageNormalizer(datasets);
  normalizer.normalize();
  const { dataset: multiframe } = normalizer;

  if (!multiframe) {
    throw new Error(
      'Failed to normalize the multiframe dataset, the data is not multi-frame.'
    );
  }

  multiframe.SharedFunctionalGroupsSequence ||= {};
  multiframe.SharedFunctionalGroupsSequence.PixelMeasuresSequence = {};
  multiframe.PerFrameFunctionalGroupsSequence ||= [];
  for (let index = 0; index < images.length; index++) {
    multiframe.PerFrameFunctionalGroupsSequence[index] ||= {
      PlanePositionSequence: {},
      PlaneOrientationSequence: {},
    };
  }
  if (isSingleNonMultiFrame) {
    multiframe.PerFrameFunctionalGroupsSequence = [
      multiframe.PerFrameFunctionalGroupsSequence[0],
    ];
    multiframe.NumberOfFrames = 1;
  }
  return new SegmentationDerivation([multiframe], options);
}

export { generateSegmentation };
