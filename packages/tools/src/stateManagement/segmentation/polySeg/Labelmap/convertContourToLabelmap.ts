import { vec3 } from 'gl-matrix';
import {
  Types,
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
import {
  Annotation,
  ContourAnnotation,
  ContourSegmentationData,
  PolySegConversionOptions,
} from '../../../../types';
import { getAnnotation } from '../../..';
import { WorkerTypes } from '../../../../enums';

const workerManager = getWebWorkerManager();

const triggerWorkerProgress = (eventTarget, progress) => {
  triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
    progress,
    type: WorkerTypes.POLYSEG_CONTOUR_TO_LABELMAP,
  });
};

export async function convertContourToVolumeLabelmap(
  contourRepresentationData: ContourSegmentationData,
  options: PolySegConversionOptions = {}
) {
  const { viewport } = options;

  const imageIds = utilities.getViewportImageIds(viewport);

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

  triggerWorkerProgress(eventTarget, 0);

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
          triggerWorkerProgress(eventTarget, progress);
        },
      ],
    }
  );

  triggerWorkerProgress(eventTarget, 1);

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
  options: PolySegConversionOptions = {}
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

  triggerWorkerProgress(eventTarget, 0);

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
          triggerWorkerProgress(eventTarget, progress);
        },
      ],
    }
  );

  triggerWorkerProgress(eventTarget, 1);

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
  options: PolySegConversionOptions = {}
) {
  const annotationMap = contourRepresentationData.annotationUIDsMap;

  const segmentIndices = options.segmentIndices?.length
    ? options.segmentIndices
    : Array.from(annotationMap.keys());

  const annotationUIDsInSegmentMap = new Map<number, any>();
  segmentIndices.forEach((index) => {
    const annotationUIDsInSegment = annotationMap.get(index);

    // Todo: there is a bug right now where the annotationUIDsInSegment has both
    // children and parent annotations, so we need to filter out the parent
    // annotations only

    let uids = Array.from(annotationUIDsInSegment);

    uids = uids.filter(
      (uid) => !(getAnnotation(uid) as Annotation).parentAnnotationUID
    );

    const annotations = uids.map((uid) => {
      const annotation = getAnnotation(uid) as ContourAnnotation;
      const hasChildAnnotations = annotation.childAnnotationUIDs?.length;

      return {
        polyline: annotation.data.contour.polyline,
        referencedImageId: annotation.metadata.referencedImageId,
        holesPolyline:
          hasChildAnnotations &&
          annotation.childAnnotationUIDs.map((childUID) => {
            const childAnnotation = getAnnotation(
              childUID
            ) as ContourAnnotation;
            return childAnnotation.data.contour.polyline;
          }),
      };
    });

    annotationUIDsInSegmentMap.set(index, annotations);
  });

  return { segmentIndices, annotationUIDsInSegmentMap };
}
