import { utilities } from "@cornerstonejs/tools";
import dcmjs from "dcmjs";
import getPatientModule from "./utilities/getPatientModule";
import getReferencedFrameOfReferenceSequence from "./utilities/getReferencedFrameOfReferenceSequence";
import getReferencedSeriesSequence from "./utilities/getReferencedSeriesSequence";
import getRTROIObservationsSequence from "./utilities/getRTROIObservationsSequence";
import getRTSeriesModule from "./utilities/getRTSeriesModule";
import getStructureSetModule from "./utilities/getStructureSetModule";

const { generateContourSetsFromLabelmap, AnnotationToPointData } =
    utilities.rtstruct;
const { DicomMetaDictionary } = dcmjs.data;

/**
 * Convert handles to RTSS report containing the dcmjs dicom dataset.
 *
 * Note: current WIP and using segmentation to contour conversion,
 * routine that is not fully tested
 *
 * @param segmentations - Cornerstone tool segmentations data
 * @param metadataProvider - Metadata provider
 * @param DicomMetadataStore - metadata store instance
 * @param cs - cornerstone instance
 * @param csTools - cornerstone tool instance
 * @returns Report object containing the dataset
 */
function generateRTSSFromSegmentations(
    segmentations,
    metadataProvider,
    DicomMetadataStore
) {
    // Convert segmentations to ROIContours
    const roiContours = [];

    const contourSets = generateContourSetsFromLabelmap({
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

                const sliceContourPolyData = sliceContour.polyData;

                sliceContour.contours.forEach((contour, index) => {
                    const ContourGeometricType = contour.type;
                    const NumberOfContourPoints = contour.contourPoints.length;
                    const ContourData = [];

                    contour.contourPoints.forEach(point => {
                        const pointData = sliceContourPolyData.points[point];
                        pointData[0] = +pointData[0].toFixed(2);
                        pointData[1] = +pointData[1].toFixed(2);
                        pointData[2] = +pointData[2].toFixed(2);
                        ContourData.push(pointData[0]);
                        ContourData.push(pointData[1]);
                        ContourData.push(pointData[2]);
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

    const rtMetadata = {
        name: segmentations.label,
        label: segmentations.label
    };

    const dataset = _initializeDataset(
        rtMetadata,
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
            metadataProvider,
            DicomMetadataStore
        );

        // ReferencedFrameOfReferenceSequence
        dataset.ReferencedFrameOfReferenceSequence =
            getReferencedFrameOfReferenceSequence(
                contour.metadata,
                metadataProvider,
                dataset
            );
    });

    const fileMetaInformationVersionArray = new Uint8Array(2);
    fileMetaInformationVersionArray[1] = 1;

    const _meta = {
        FileMetaInformationVersion: {
            Value: [fileMetaInformationVersionArray.buffer],
            vr: "OB"
        },
        TransferSyntaxUID: {
            Value: ["1.2.840.10008.1.2.1"],
            vr: "UI"
        },
        ImplementationClassUID: {
            Value: [DicomMetaDictionary.uid()], // TODO: could be git hash or other valid id
            vr: "UI"
        },
        ImplementationVersionName: {
            Value: ["dcmjs"],
            vr: "SH"
        }
    };

    dataset._meta = _meta;

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
function generateRTSSFromAnnotations(
    annotations,
    metadataProvider,
    DicomMetadataStore
) {
    const rtMetadata = {
        name: "RTSS from Annotations",
        label: "RTSS from Annotations"
    };
    const dataset = _initializeDataset(
        rtMetadata,
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

    const fileMetaInformationVersionArray = new Uint8Array(2);
    fileMetaInformationVersionArray[1] = 1;

    const _meta = {
        FileMetaInformationVersion: {
            Value: [fileMetaInformationVersionArray.buffer],
            vr: "OB"
        },
        TransferSyntaxUID: {
            Value: ["1.2.840.10008.1.2.1"],
            vr: "UI"
        },
        ImplementationClassUID: {
            Value: [DicomMetaDictionary.uid()], // TODO: could be git hash or other valid id
            vr: "UI"
        },
        ImplementationVersionName: {
            Value: ["dcmjs"],
            vr: "SH"
        }
    };

    dataset._meta = _meta;

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

function _initializeDataset(rtMetadata, imgMetadata, metadataProvider) {
    const rtSOPInstanceUID = DicomMetaDictionary.uid();

    // get the first annotation data
    const { referencedImageId: imageId, FrameOfReferenceUID } = imgMetadata;

    const { studyInstanceUID } = metadataProvider.get(
        "generalSeriesModule",
        imageId
    );

    const patientModule = getPatientModule(imageId, metadataProvider);
    const rtSeriesModule = getRTSeriesModule(DicomMetaDictionary);

    return {
        StructureSetROISequence: [],
        ROIContourSequence: [],
        RTROIObservationsSequence: [],
        ReferencedSeriesSequence: [],
        ReferencedFrameOfReferenceSequence: [],
        ...patientModule,
        ...rtSeriesModule,
        StudyInstanceUID: studyInstanceUID,
        SOPClassUID: "1.2.840.10008.5.1.4.1.1.481.3", // RT Structure Set Storage
        SOPInstanceUID: rtSOPInstanceUID,
        Manufacturer: "dcmjs",
        Modality: "RTSTRUCT",
        FrameOfReferenceUID,
        PositionReferenceIndicator: "",
        StructureSetLabel: rtMetadata.label || "",
        StructureSetName: rtMetadata.name || "",
        ReferringPhysicianName: "",
        OperatorsName: "",
        StructureSetDate: DicomMetaDictionary.date(),
        StructureSetTime: DicomMetaDictionary.time(),
        _meta: null
    };
}

export { generateRTSSFromSegmentations, generateRTSSFromAnnotations };
