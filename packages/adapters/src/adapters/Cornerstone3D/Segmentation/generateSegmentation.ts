import { normalizers, derivations } from 'dcmjs';
import { Enums } from '@cornerstonejs/core';
import { fillSegmentation } from '../../Cornerstone/Segmentation_4X';

const { MetadataModules } = Enums;
const { SEGImageNormalizer } = normalizers;
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
    console.warn('image=', image);
    const { imageId } = image;
    const seriesData = metadata.get(MetadataModules.SERIES_DATA, imageId);
    const imageData = metadata.get(MetadataModules.IMAGE_DATA, imageId);
    return {
      // ...image,
      ...studyData,
      ...seriesData,
      ...imageData,
      PixelData: image.voxelManager.getScalarData(),
      _vrMap: {
        PixelData: 'OW',
      },
      _meta: {},
    };
  });

  // const multiframe = Normalizer.normalizeToDataset(datasets);
  const isSingleSingleFrame =
    datasets.length === 1 && !(datasets[0].NumberOfFrames > 1);
  if (isSingleSingleFrame) {
    datasets.push(datasets[0]);
  }
  // Directly use the SEGImageNormalizer to allow creating a SEG virtual instance consisting of
  // whatever instance data we happen to have.
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
  if (isSingleSingleFrame) {
    multiframe.PerFrameFunctionalGroupsSequence = [
      multiframe.PerFrameFunctionalGroupsSequence[0],
    ];
    multiframe.NumberOfFrames = 1;
  }
  return new SegmentationDerivation([multiframe], options);
}

export { generateSegmentation };
