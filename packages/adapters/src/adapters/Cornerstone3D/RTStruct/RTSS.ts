import { metaData } from "@cornerstonejs/core";
import { utilities, annotation as toolsAnnotation } from "@cornerstonejs/tools";
import type { Types } from "@cornerstonejs/tools";

import dcmjs from "dcmjs";
import getReferencedFrameOfReferenceSequence from "./utilities/getReferencedFrameOfReferenceSequence";
import getReferencedSeriesSequence from "./utilities/getReferencedSeriesSequence";
import getRTROIObservationsSequence from "./utilities/getRTROIObservationsSequence";
import getRTSeriesModule from "./utilities/getRTSeriesModule";
import getStructureSetModule from "./utilities/getStructureSetModule";
import { metaRTSSContour as _meta } from "../constants";
import { copyStudyTags } from "../../helpers";
import {
    INSTANCE_DEFAULTS,
    instanceSuccessor
} from "../../helpers/instanceSuccessor";

type Segmentation = Types.Segmentation;

const { generateContourSetsFromLabelmap, AnnotationToPointData } =
    utilities.contours;
const { DicomMetaDictionary } = dcmjs.data;

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
        _DicomMetadataStore
    });
}

export async function generateRTSSFromLabelmap(
    segmentations: Segmentation,
    options
) {
    const { metadataProvider = metaData } = options;

    // Convert segmentations to ROIContours
    const roiContours = [];

    const contourSets = await generateContourSetsFromLabelmap({
        segmentations
    });

    contourSets.forEach((contourSet, segIndex) => {
        // Check contour set isn't undefined
        if (contourSet) {
            const contourSequence = [];
            contourSet.sliceContours.forEach(sliceContour => {
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
                const sopCommon = metadataProvider.get(
                    "sopCommonModule",
                    sliceContour.referencedImageId
                );
                const ReferencedSOPClassUID = sopCommon.sopClassUID;
                const ReferencedSOPInstanceUID = sopCommon.sopInstanceUID;
                const ContourImageSequence = [
                    { ReferencedSOPClassUID, ReferencedSOPInstanceUID } // NOTE: replace in dcmjs?
                ];

                const { points: polyDataPoints } = sliceContour.polyData;

                sliceContour.contours.forEach((contour, index) => {
                    const ContourGeometricType = contour.type;
                    const NumberOfContourPoints = contour.contourPoints.length;
                    const ContourData = [];

                    contour.contourPoints.forEach(point => {
                        const pointData = polyDataPoints[point];
                        ContourData.push(...pointData.map(v => v.toFixed(2)));
                    });

                    contourSequence.push({
                        ContourImageSequence,
                        ContourGeometricType,
                        NumberOfContourPoints,
                        ContourNumber: index + 1,
                        ContourData
                    });
                });
            });

            const segLabel = contourSet.label || `Segment ${segIndex + 1}`;

            const ROIContour = {
                name: segLabel,
                description: segLabel,
                contourSequence,
                color: contourSet.color,
                metadata: contourSet.metadata
            };

            roiContours.push(ROIContour);
        }
    });

    const dataset = _initializeDataset(
        segmentations,
        options,
        roiContours[0].metadata,
        metadataProvider
    );

    roiContours.forEach((contour, index) => {
        const roiContour = {
            ROIDisplayColor: contour.color || [255, 0, 0],
            ContourSequence: contour.contourSequence,
            ReferencedROINumber: index + 1
        };

        dataset.StructureSetROISequence.push(
            getStructureSetModule(contour, index)
        );

        dataset.ROIContourSequence.push(roiContour);

        // ReferencedSeriesSequence
        dataset.ReferencedSeriesSequence = getReferencedSeriesSequence(
            contour.metadata,
            index,
            metadataProvider
        );

        // ReferencedFrameOfReferenceSequence
        dataset.ReferencedFrameOfReferenceSequence =
            getReferencedFrameOfReferenceSequence(
                contour.metadata,
                metadataProvider,
                dataset
            );
    });

    return dataset;
}

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
    segmentation,
    annotations,
    options
) {
    const { metadataProvider, DicomMetadataStore } = options;
    const dataset = _initializeDataset(
        segmentation,
        options,
        annotations[0].metadata,
        metadataProvider
    );

    annotations.forEach((annotation, index) => {
        const ContourSequence = AnnotationToPointData.convert(
            annotation,
            index,
            metadataProvider
        );

        dataset.StructureSetROISequence.push(
            getStructureSetModule(annotation, index)
        );

        dataset.ROIContourSequence.push(ContourSequence);
        dataset.RTROIObservationsSequence.push(
            getRTROIObservationsSequence(annotation, index)
        );

        // ReferencedSeriesSequence
        // Todo: handle more than one series
        dataset.ReferencedSeriesSequence = getReferencedSeriesSequence(
            annotation.metadata,
            index,
            metadataProvider,
            DicomMetadataStore
        );

        // ReferencedFrameOfReferenceSequence
        dataset.ReferencedFrameOfReferenceSequence =
            getReferencedFrameOfReferenceSequence(
                annotation.metadata,
                metadataProvider,
                dataset
            );
    });

    return dataset;
}

// /**
//  * Generate Cornerstone tool state from dataset
//  * @param {object} dataset dataset
//  * @param {object} hooks
//  * @param {function} hooks.getToolClass Function to map dataset to a tool class
//  * @returns
//  */
// //static generateToolState(_dataset, _hooks = {}) {
// function generateToolState() {
//     // Todo
//     console.warn("RTSS.generateToolState not implemented");
// }

function _initializeDataset(
    segmentation: Segmentation,
    rtMetadata,
    imgMetadata,
    metadataProvider
) {
    // get the first annotation data
    const { referencedImageId: imageId, FrameOfReferenceUID } = imgMetadata;
    const { predecessorImageId } = rtMetadata;

    const predecessorInstance =
        predecessorImageId &&
        metadataProvider.get("instance", predecessorImageId);
    // If no existing series, then will have to use the instance data
    const instanceForStudy =
        predecessorInstance || metadataProvider.get("instance", imageId);

    const studyData = copyStudyTags(instanceForStudy);

    const previous = getRTSeriesModule(rtMetadata, {
        predecessorImageId,
        imageId
    });

    return instanceSuccessor(
        {
            ...INSTANCE_DEFAULTS,
            ...studyData,
            StructureSetROISequence: [],
            ROIContourSequence: [],
            RTROIObservationsSequence: [],
            ReferencedSeriesSequence: [],
            ReferencedFrameOfReferenceSequence: [],
            Modality: "RTSTRUCT",
            SOPClassUID: "1.2.840.10008.5.1.4.1.1.481.3", // RT Structure Set Storage
            FrameOfReferenceUID,
            PositionReferenceIndicator: "",
            StructureSetLabel: segmentation.label || "",
            StructureSetName: segmentation.label || "",
            StructureSetDate: DicomMetaDictionary.date(),
            StructureSetTime: DicomMetaDictionary.time(),
            _meta
        },
        previous,
        rtMetadata
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
            const annotation =
                toolsAnnotation.state.getAnnotation(annotationUID);
            if (!annotation) {
                console.error(
                    "Unable to find an annotation for UID",
                    annotationUID
                );
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
    console.warn("segmentations", segmentations);
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
