export default function getStructureSetModule(contour, index) {
    const { FrameOfReferenceUID } = contour.metadata;

    return {
        ROINumber: index + 1,
        ROIName: contour.name || `Todo: name ${index + 1}`,
        ROIDescription: "OHIF Generated ROI",
        ROIGenerationAlgorithm: "MANUAL",
        ReferencedFrameOfReferenceUID: FrameOfReferenceUID
    };
}
