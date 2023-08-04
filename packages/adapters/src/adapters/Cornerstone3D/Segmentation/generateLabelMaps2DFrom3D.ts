/**
 * Generates 2D label maps from a 3D label map.
 * @param labelmap3D - The 3D label map object to generate 2D label maps from. It is derived
 * from the volume labelmap.
 * @returns The label map object containing the 2D label maps and segments on label maps.
 */
function generateLabelMaps2DFrom3D(labelmap3D): {
    scalarData: number[];
    dimensions: number[];
    segmentsOnLabelmap: number[];
    labelmaps2D: {
        segmentsOnLabelmap: number[];
        pixelData: number[];
        rows: number;
        columns: number;
    }[];
} {
    // 1. we need to generate labelmaps2D from labelmaps3D, a labelmap2D is for each
    // slice
    const { scalarData, dimensions } = labelmap3D;

    // scalarData is a flat array of all the pixels in the volume.
    const labelmaps2D = [];
    const segmentsOnLabelmap3D = new Set();

    // X-Y are the row and column dimensions, Z is the number of slices.
    for (let z = 0; z < dimensions[2]; z++) {
        const pixelData = scalarData.slice(
            z * dimensions[0] * dimensions[1],
            (z + 1) * dimensions[0] * dimensions[1]
        );

        const segmentsOnLabelmap = [];

        for (let i = 0; i < pixelData.length; i++) {
            const segment = pixelData[i];
            if (!segmentsOnLabelmap.includes(segment) && segment !== 0) {
                segmentsOnLabelmap.push(segment);
            }
        }

        const labelmap2D = {
            segmentsOnLabelmap,
            pixelData,
            rows: dimensions[1],
            columns: dimensions[0]
        };

        if (segmentsOnLabelmap.length === 0) {
            continue;
        }

        segmentsOnLabelmap.forEach(segmentIndex => {
            segmentsOnLabelmap3D.add(segmentIndex);
        });

        labelmaps2D[dimensions[2] - 1 - z] = labelmap2D;
    }

    // remove segment 0 from segmentsOnLabelmap3D
    labelmap3D.segmentsOnLabelmap = Array.from(segmentsOnLabelmap3D);

    labelmap3D.labelmaps2D = labelmaps2D;

    return labelmap3D;
}

export { generateLabelMaps2DFrom3D };
