import type { Types } from "@cornerstonejs/core";

export function toScoord(
    { worldToImageCoords, is3DMeasurement, referencedImageId },
    point
) {
    if (is3DMeasurement) {
        return { x: point[0], y: point[1], z: point[2] };
    }
    const point2 = worldToImageCoords(referencedImageId, point);
    return { x: point2[0], y: point2[1] };
}

export function toScoords(scoordArgs, points: Array<Types.Point3>) {
    return points.map(point => toScoord(scoordArgs, point));
}
