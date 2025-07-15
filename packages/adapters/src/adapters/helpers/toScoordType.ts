import { type Types, utilities } from "@cornerstonejs/core";

const { worldToImageCoords: globalWorldToImageCoords } = utilities;

/**
 * Converts a Point2 or a Point3 into a SCOORD { x,y, z? } point.
 */
export function toScoord(
    {
        worldToImageCoords = globalWorldToImageCoords,
        is3DMeasurement,
        referencedImageId
    },
    point
) {
    if (is3DMeasurement) {
        return { x: point[0], y: point[1], z: point[2] };
    }
    const point2 = worldToImageCoords(referencedImageId, point);
    return { x: point2[0], y: point2[1] };
}

/**
 * Converts an array of Scoord points to 3d
 */
export function toScoords(scoordArgs, points: Array<Types.Point3>) {
    return points.map(point => toScoord(scoordArgs, point));
}
