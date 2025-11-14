import { metaData, Enums } from '@cornerstonejs/core';
import { utilities, annotation as toolsAnnotation } from '@cornerstonejs/tools';
import type { Types } from '@cornerstonejs/tools';

import getReferencedFrameOfReferenceSequence from './utilities/getReferencedFrameOfReferenceSequence';
import getReferencedSeriesSequence from './utilities/getReferencedSeriesSequence';
import getRTROIObservationsSequence from './utilities/getRTROIObservationsSequence';
import getStructureSetModule from './utilities/getStructureSetModule';
import { createInstance } from '../../../utilities';
import type {
  NormalModule,
  RtssModule,
} from '../../../utilities/InstanceTypes';
import '../../../utilities/referencedMetadataProvider';

type Segmentation = Types.Segmentation;

const { generateContourSetsFromLabelmap, AnnotationToPointData } =
  utilities.contours;
const { MetadataModules } = Enums;

/**
 * Convert handles to RTSS report containing the dcmjs dicom dataset.
 *
 * Note: current WIP and using segmentation to contour conversion,
 * routine that is not fully tested
 *
 * @param segmentation - Cornerstone tool segmentations data
 * @param metadataProvider - Metadata provider
 * @param DicomMetadataStore - metadata store instance
 * @param cs - cornerstone instance
 * @param csTools - cornerstone tool instance
 * @returns Report object containing the dataset
 *
 * @deprecated in favour of generateRTSSFromLabelmap which has options
 *    parameter.
 */
export function generateRTSSFromSegmentations(
  segmentation: Segmentation,
  metadataProvider,
  _DicomMetadataStore
) {
  return generateRTSSFromLabelmap(segmentation, {
    metadataProvider,
    _DicomMetadataStore,
  });
}

/**
 * Generates an RTSS instance given a labelmap segmentations object,
 * plus a set of options to apply.
 * This will convert the RTSS to a contour object first, then will
 * continue running to generate the actual RTSS.
 */
export async function generateRTSSFromLabelmap(
  segmentations: Segmentation,
  options
) {
  const { metadataProvider = metaData } = options;

  // Convert segmentations to ROIContours
  const roiContours = [];

  const contourSets = await generateContourSetsFromLabelmap({
    segmentations,
  });

  contourSets.forEach((contourSet, segIndex) => {
    // Check contour set isn't undefined
    if (contourSet) {
      const contourSequence = [];
      contourSet.sliceContours.forEach((sliceContour) => {
        /**
         * addContour - Adds a new ROI with related contours to ROIContourSequence
         *
         * @param newContour - cornerstoneTools `ROIContour` object
         *
         * newContour = {
         *   name: string,
         *   description: string,
         *   contourSequence: array[contour]
         *   color: array[number],
         *   metadata: {
         *       referencedImageId: string,
         *       FrameOfReferenceUID: string
         *     }
         * }
         *
         * contour = {
         *   ContourImageSequence: array[
         *       { ReferencedSOPClassUID: string, ReferencedSOPInstanceUID: string}
         *     ]
         *   ContourGeometricType: string,
         *   NumberOfContourPoints: number,
         *   ContourData: array[number]
         * }
         */
        // Note: change needed if support non-planar contour representation is needed
        const ContourImageSequence = metadataProvider.get(
          'ImageSopInstanceReference',
          sliceContour.referencedImageId
        );

        const { points: polyDataPoints } = sliceContour.polyData;

        sliceContour.contours.forEach((contour, index) => {
          const ContourGeometricType = contour.type;
          const NumberOfContourPoints = contour.contourPoints.length;
          const ContourData = [];

          contour.contourPoints.forEach((point) => {
            const pointData = polyDataPoints[point];
            ContourData.push(...pointData.map((v) => v.toFixed(2)));
          });

          contourSequence.push({
            ContourImageSequence,
            ContourGeometricType,
            NumberOfContourPoints,
            ContourNumber: index + 1,
            ContourData,
          });
        });
      });

      const segLabel = contourSet.label || `Segment ${segIndex + 1}`;

      const ROIContour = {
        name: segLabel,
        description: segLabel,
        contourSequence,
        color: contourSet.color.slice(0, 3),
        metadata: contourSet.metadata,
      };

      roiContours.push(ROIContour);
    }
  });

  const dataset = _initializeDataset(
    segmentations,
    roiContours[0].metadata,
    options
  );

  roiContours.forEach((contour, index) => {
    const roiContour = {
      ROIDisplayColor: contour.color || [255, 0, 0],
      ContourSequence: contour.contourSequence,
      ReferencedROINumber: index + 1,
    };

    const segment = segmentations.segments[index + 1];
    dataset.StructureSetROISequence.push(
      getStructureSetModule(contour, segment)
    );
    dataset.RTROIObservationsSequence.push(
      getRTROIObservationsSequence(segment, index, options)
    );

    dataset.ROIContourSequence.push(roiContour);

    // ReferencedSeriesSequence
    dataset.ReferencedSeriesSequence = getReferencedSeriesSequence(
      dataset.ReferencedSeriesSequence,
      contour.metadata,
      options
    );

    // ReferencedFrameOfReferenceSequence
    dataset.ReferencedFrameOfReferenceSequence =
      getReferencedFrameOfReferenceSequence(
        dataset.ReferencedFrameOfReferenceSequence,
        contour.metadata,
        options
      );
  });

  if (dataset.ReferencedFrameOfReferenceSequence?.length === 1) {
    dataset.FrameOfReferenceUID =
      dataset.ReferencedFrameOfReferenceSequence[0].FrameOfReferenceUID;
  }

  return dataset;
}

type SegmentAnnotation = {
  annotations: Types.Annotation[];
  segmentationUID: string;
  segmentIndex: number;
  roiContourSequence: ReturnType<typeof AnnotationToPointData.convert>;
  segment;
  structureSetModule: ReturnType<typeof getStructureSetModule>;
};

/**
 * Convert handles to RTSSReport report object containing the dcmjs dicom dataset.
 *
 * Note: The tool data needs to be formatted in a specific way, and currently
 * it is limited to the RectangleROIStartEndTool in the Cornerstone.
 *
 * @param annotations - Array of Cornerstone tool annotation data
 * @param metadataProvider -  Metadata provider
 * @returns Report object containing the dataset
 */
export function generateRTSSFromAnnotations(
  segmentations,
  annotations,
  options
) {
  const dataset = _initializeDataset(
    segmentations,
    annotations[0].metadata,
    options
  );

  const segmentsContour = new Map<string, SegmentAnnotation>();

  annotations.forEach((annotation, index) => {
    const {
      data: { segmentation },
    } = annotation;
    if (!segmentation) {
      console.warn('Annotation is not a segmentation:', annotation);
      return;
    }
    const { segmentationId, segmentIndex } = segmentation;
    const key = `${segmentationId}:${segmentIndex}`;
    let segmentAnnotation = segmentsContour.get(key);
    if (!segmentAnnotation) {
      const segment = segmentations.segments[segmentIndex];
      const structureSetModule = getStructureSetModule(annotation, segment);
      dataset.StructureSetROISequence.push(structureSetModule);
      dataset.RTROIObservationsSequence.push(
        getRTROIObservationsSequence(segment, index, options)
      );
      segmentAnnotation = {
        ...segmentation,
        annotations: [],
        structureSetModule,
        segment,
        roiContourSequence: null,
      };
      segmentsContour.set(key, segmentAnnotation);
    }

    const roiContourSequence = AnnotationToPointData.convert(
      annotation,
      segmentAnnotation.segment,
      metaData
    );
    if (segmentAnnotation.roiContourSequence) {
      segmentAnnotation.roiContourSequence.ContourSequence.push(
        ...roiContourSequence.ContourSequence
      );
    } else {
      dataset.ROIContourSequence.push(
        roiContourSequence as unknown as NormalModule
      );
      segmentAnnotation.roiContourSequence = roiContourSequence;
    }

    // May update the existing referenced series sequence in place
    dataset.ReferencedSeriesSequence = getReferencedSeriesSequence(
      dataset.ReferencedSeriesSequence,
      annotation.metadata,
      options
    );

    // ReferencedFrameOfReferenceSequence gets updated for each new sop instance
    dataset.ReferencedFrameOfReferenceSequence =
      getReferencedFrameOfReferenceSequence(
        dataset.ReferencedFrameOfReferenceSequence,
        annotation.metadata,
        options
      );
  });

  if (dataset.ReferencedFrameOfReferenceSequence?.length === 1) {
    dataset.FrameOfReferenceUID =
      dataset.ReferencedFrameOfReferenceSequence[0].FrameOfReferenceUID;
  }

  return dataset;
}

function _initializeDataset(segmentation: Segmentation, imgMetadata, options) {
  // get the first annotation data
  const { referencedImageId: studyExemplarImageId } = imgMetadata;

  return createInstance<RtssModule>(
    MetadataModules.RTSS_INSTANCE_DATA,
    studyExemplarImageId,
    {
      // FrameOfReferenceUID,
      StructureSetLabel: segmentation.label,
      StructureSetName: segmentation.label,
      SeriesDescription: options.predecessorImageId
        ? undefined
        : segmentation.label,
      _meta: metaData.get(MetadataModules.RTSS_CONTOUR, studyExemplarImageId),
    },
    options
  );
}

/**
 * Generates an RTSS metadata representation of a contour annotation
 * by looking up the annotation UIDS in the annotation state and
 * then converting those to RTSS format.
 */
export function generateRTSSFromContour(segmentations: Segmentation, options) {
  const { annotationUIDsMap } = segmentations.representationData.Contour;

  const annotations = [];

  for (const annotationSet of annotationUIDsMap.values()) {
    for (const annotationUID of annotationSet.values()) {
      const annotation = toolsAnnotation.state.getAnnotation(annotationUID);
      if (!annotation) {
        console.error('Unable to find an annotation for UID', annotationUID);
        continue;
      }
      annotations.push(annotation);
    }
  }

  return generateRTSSFromAnnotations(segmentations, annotations, options);
}

/**
 * Representation will be either a .Labelmap or a .Contour
 */
export function generateRTSSFromRepresentation(
  segmentations: Types.Segmentation,
  options = {}
) {
  if (segmentations.representationData.Labelmap) {
    return generateRTSSFromLabelmap(segmentations, options);
  }
  if (segmentations.representationData.Contour) {
    return generateRTSSFromContour(segmentations, options);
  }
  throw new Error(
    `No representation available to save to RTSS: ${Object.keys(
      segmentations.representationData
    )}`
  );
}
