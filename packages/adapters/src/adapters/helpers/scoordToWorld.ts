import { type Types, utilities } from "@cornerstonejs/core";

const { imageToWorldCoords } = utilities;

/**
 * Converts flat listed 2d or 3d coordinates into Point3 world coordinates.
 * For 3d points, this will convert just the structure from flat, while for
 * 2d points, it will convert image to to world coords.
 */
export function scoordToWorld(
    { is3DMeasurement, referencedImageId },
    scoord
): Types.Point3[] {
    const worldCoords = [];
    if (is3DMeasurement) {
        const { GraphicData } = scoord;
        for (let i = 0; i < GraphicData.length; i += 3) {
            const point = [
                GraphicData[i],
                GraphicData[i + 1],
                GraphicData[i + 2]
            ];
            worldCoords.push(point);
        }
    } else {
        const { GraphicData } = scoord;
        for (let i = 0; i < GraphicData.length; i += 2) {
            const point = imageToWorldCoords(referencedImageId, [
                GraphicData[i],
                GraphicData[i + 1]
            ]);
            worldCoords.push(point);
        }
    }
    return worldCoords;
}
