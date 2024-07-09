import { CornerstonePMAP } from "../../Cornerstone";

const { ParametricMap } = CornerstonePMAP;
const { generateToolState: generateToolStateCornerstone } = ParametricMap;

function generateToolState(
    imageIds,
    arrayBuffer,
    metadataProvider,
    skipOverlapping = false,
    tolerance = 1e-3
) {
    return generateToolStateCornerstone(
        imageIds,
        arrayBuffer,
        metadataProvider,
        skipOverlapping,
        tolerance
    );
}

export { generateToolState };
