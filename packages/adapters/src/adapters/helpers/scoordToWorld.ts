import type { Types } from "@cornerstonejs/core";

/**
 * Converts flat listed 2d or 3d coordinates into Point3 world coordinates.
 * For 3d points, this will convert just the structure from flat, while for
 * 2d points, it will call image to world coords.
 */
export function scoordToWorld(
    { isMeasurement3d, referencedImageId, imageToWorldCoords },
    scoord
): Types.Point3[] {
    const worldCoords = [];
    if (isMeasurement3d) {
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
