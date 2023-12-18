export default function getStructureSetModule(contour, index) {
    const { FrameOfReferenceUID } = contour.metadata;

    return {
        ROINumber: index + 1,
        ROIName: contour.name || `Todo: name ${index + 1}`,
        ROIDescription: `Todo: description ${index + 1}`,
        ROIGenerationAlgorithm: "Todo: algorithm",
        ReferencedFrameOfReferenceUID: FrameOfReferenceUID
    };
}
