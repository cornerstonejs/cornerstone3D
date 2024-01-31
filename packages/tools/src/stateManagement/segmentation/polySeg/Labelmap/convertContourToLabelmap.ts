import {
  StackViewport,
  Types,
  VolumeViewport,
  cache,
  utilities,
  getWebWorkerManager,
  volumeLoader,
  imageLoader,
  metaData,
  Enums,
  triggerEvent,
  eventTarget,
} from '@cornerstonejs/core';
import { Annotation, ContourSegmentationData } from '../../../../types';
import { getAnnotation } from '../../..';
import { vec3 } from 'gl-matrix';
import { Events } from '../../../../enums';

const workerManager = getWebWorkerManager();

export async function convertContourToVolumeLabelmap(
  contourRepresentationData: ContourSegmentationData,
  options: {
    segmentIndices?: number[];
    segmentationRepresentationUID?: string;
    viewport?: Types.IViewport;
  } = {}
) {
  const { viewport } = options;

  let imageIds;
  if (viewport instanceof VolumeViewport) {
    const defaultActor = viewport.getDefaultActor();
    const volumeId = defaultActor.uid;
    const volume = cache.getVolume(volumeId);
    imageIds = volume.imageIds;
  } else if (viewport instanceof StackViewport) {
    imageIds = viewport.getImageIds();
  }

  if (!imageIds) {
    throw new Error(
      'No imageIds found, labelmap computation from contour requires viewports with imageIds'
    );
  }

  const segmentationVolumeId = utilities.uuidv4();

  const volumeProps = utilities.generateVolumePropsFromImageIds(
    imageIds,
    segmentationVolumeId
  );

  const { metadata, dimensions, origin, direction, spacing, scalarData } =
    volumeProps;

  const segmentationVolume = await volumeLoader.createLocalSegmentationVolume(
    {
      dimensions,
      origin,
      direction,
      spacing,
      metadata,
      imageIds: imageIds.map((imageId) => `generated://${imageId}`),
      referencedImageIds: imageIds,
    },
    segmentationVolumeId
  );

  const { segmentIndices, annotationUIDsInSegmentMap } =
    _getAnnotationMapFromSegmentation(contourRepresentationData, options);

  triggerEvent(eventTarget, Events.POLYSEG_CONVERSION, { progress: 0 });

  const newScalarData = await workerManager.executeTask(
    'polySeg',
    'convertContourToVolumeLabelmap',
    {
      segmentIndices,
      dimensions,
      scalarData,
      origin,
      direction,
      spacing,
      annotationUIDsInSegmentMap,
    },
    {
      callbacks: [
        (progress) => {
          triggerEvent(eventTarget, Events.POLYSEG_CONVERSION, { progress });
        },
      ],
    }
  );

  triggerEvent(eventTarget, Events.POLYSEG_CONVERSION, { progress: 100 });

  segmentationVolume.imageData
    .getPointData()
    .getScalars()
    .setData(newScalarData);
  segmentationVolume.imageData.modified();

  // update the scalarData in the volume as well
  segmentationVolume.modified();

  return {
    volumeId: segmentationVolume.volumeId,
  };
}

export async function convertContourToStackLabelmap(
  contourRepresentationData: ContourSegmentationData,
  options: {
    segmentIndices?: number[];
    segmentationRepresentationUID?: string;
    viewport?: Types.IViewport;
  } = {}
) {
  if (!options.viewport) {
    throw new Error(
      'No viewport provided, labelmap computation from contour requires viewports'
    );
  }

  const viewport = options.viewport as Types.IStackViewport;

  const imageIds = viewport.getImageIds();

  if (!imageIds) {
    throw new Error(
      'No imageIds found, labelmap computation from contour requires viewports with imageIds'
    );
  }

  // check if the imageIds are already cached
  imageIds.forEach((imageId) => {
    if (!cache.getImageLoadObject(imageId)) {
      throw new Error(
        'ImageIds must be cached before converting contour to labelmap'
      );
    }
  });

  // create
  const { imageIds: segmentationImageIds } =
    await imageLoader.createAndCacheDerivedSegmentationImages(imageIds);

  const { segmentIndices, annotationUIDsInSegmentMap } =
    _getAnnotationMapFromSegmentation(contourRepresentationData, options);

  // information for the referenced to the segmentation image
  // Define constant to hold segmentation information
  const segmentationsInfo = new Map();

  // Loop through each segmentation image ID
  segmentationImageIds.forEach((segImageId, index) => {
    // Fetch the image from cache
    const segImage = cache.getImage(segImageId);

    // Fetch metadata for the image
    const imagePlaneModule = metaData.get(
      Enums.MetadataModules.IMAGE_PLANE,
      segImageId
    );

    // Extract properties from image metadata
    let {
      columnCosines,
      rowCosines,
      rowPixelSpacing,
      columnPixelSpacing,
      imagePositionPatient,
    } = imagePlaneModule;

    // Set defaults if necessary
    columnCosines = columnCosines ?? [0, 1, 0];
    rowCosines = rowCosines ?? [1, 0, 0];
    rowPixelSpacing = rowPixelSpacing ?? 1;
    columnPixelSpacing = columnPixelSpacing ?? 1;
    imagePositionPatient = imagePositionPatient ?? [0, 0, 0];

    // Create vector from row and column cosines
    const rowCosineVec = vec3.fromValues(
      rowCosines[0],
      rowCosines[1],
      rowCosines[2]
    );
    const colCosineVec = vec3.fromValues(
      columnCosines[0],
      columnCosines[1],
      columnCosines[2]
    );

    // Calculate scan axis normal
    const scanAxisNormal = vec3.create();
    vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);

    // Define direction and spacing
    const direction = [...rowCosineVec, ...colCosineVec, ...scanAxisNormal];
    const spacing = [rowPixelSpacing, columnPixelSpacing, 1];

    // Set origin
    const origin = imagePositionPatient;

    // Store segmentation information
    segmentationsInfo.set(imageIds[index], {
      direction,
      spacing,
      origin,
      scalarData: segImage.getPixelData(),
      imageId: segImageId,
      dimensions: [segImage.width, segImage.height, 1],
    });
  });

  triggerEvent(eventTarget, Events.POLYSEG_CONVERSION_STARTED, {});
  const newSegmentationsScalarData = await workerManager.executeTask(
    'polySeg',
    'convertContourToStackLabelmap',
    {
      segmentationsInfo,
      annotationUIDsInSegmentMap,
      segmentIndices,
    },
    {
      callbacks: [
        (progress) => {
          console.debug('progress', progress);
        },
      ],
    }
  );

  debugger;

  triggerEvent(eventTarget, Events.POLYSEG_CONVERSION_COMPLETED);

  const imageIdReferenceMap = new Map();
  newSegmentationsScalarData.forEach(({ scalarData }, referencedImageId) => {
    const segmentationInfo = segmentationsInfo.get(referencedImageId);
    const { imageId: segImageId } = segmentationInfo;

    const segImage = cache.getImage(segImageId);
    segImage.getPixelData().set(scalarData);
    segImage.imageFrame?.pixelData?.set(scalarData);

    imageIdReferenceMap.set(referencedImageId, segImageId);
  });

  return {
    imageIdReferenceMap,
  };
}

function _getAnnotationMapFromSegmentation(
  contourRepresentationData: ContourSegmentationData,
  options: {
    segmentIndices?: number[];
    segmentationRepresentationUID?: string;
    viewport?: Types.IViewport;
  } = {}
) {
  const annotationMap = contourRepresentationData.annotationUIDsMap;

  const segmentIndices = options.segmentIndices?.length
    ? options.segmentIndices
    : Array.from(annotationMap.keys());

  const annotationUIDsInSegmentMap = new Map<number, Annotation[]>();
  segmentIndices.forEach((index) => {
    const annotationUIDsInSegment = annotationMap.get(index);

    const annotations = Array.from(annotationUIDsInSegment).map((uid) => {
      const annotation = getAnnotation(uid);

      return annotation;
    });

    annotationUIDsInSegmentMap.set(index, annotations);
  });

  return { segmentIndices, annotationUIDsInSegmentMap };
}
