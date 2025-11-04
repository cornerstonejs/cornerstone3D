import type { Point3 } from "@cornerstonejs/core/types";

export interface Contour {
    type?:
        | "POINT"
        | "OPEN_PLANAR"
        | "OPEN_NONPLANAR"
        | "CLOSED_PLANAR"
        | "CLOSED_PLANAR_XOR";
    contourPoints?: number[];
}

export interface SliceContour {
    referencedImageId: string;
    polyData: {
        points: Point3[];
    };
    contours: Contour[];
}

export interface ContourSet {
    sliceContours: SliceContour[];
    label?: string;
    color?: number[];
    metadata: {
        referencedImageId: string;
        FrameOfReferenceUID: string;
    };
}
