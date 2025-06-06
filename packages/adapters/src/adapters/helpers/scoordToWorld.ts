import { type Types } from "@cornerstonejs/core";

export function scoordToWorld(
    { isMeasurement3d, referencedImageId, imageToWorldCoords },
    scoord
): Types.Point3[] {
    const worldCoords = [];
    if (isMeasurement3d) {
        const { GraphicData } = scoord;
        for (let i = 0; i < GraphicData.length; i += 2) {
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
