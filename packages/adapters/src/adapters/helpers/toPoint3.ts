import type { Types } from "@cornerstonejs/core";

export function toPoint3(flatPoints: number[]): Types.Point3[] {
    const points = [];
    if (!flatPoints?.length) {
        return points;
    }
    const { length: n } = flatPoints;
    if (n % 3 !== 0) {
        throw new Error(
            `Points array should be divisible by 3 for SCOORD3D, but contents are: ${JSON.stringify(
                flatPoints
            )} of length ${n}`
        );
    }
    for (let i = 0; i < n; i += 3) {
        points.push([flatPoints[i], flatPoints[i + 1], flatPoints[i + 2]]);
    }
    return points;
}

export default toPoint3;
