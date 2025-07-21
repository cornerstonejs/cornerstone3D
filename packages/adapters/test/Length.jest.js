import { describe, it, expect, beforeEach } from "@jest/globals";
import { utilities } from "@cornerstonejs/core";
import { Cornerstone3DSR } from "../src/adapters/Cornerstone3D";
import { setWorldToImageCoords } from "../src/adapters/helpers";

const { worldToImageCoords: globalWorldToImageCoords } = utilities;

const { Length } = Cornerstone3DSR;

function worldToImageCoords(referencedImageId, point3) {
    if (point3[2] !== parseInt(referencedImageId)) {
        throw new Error(
            `Trying to convert a point with the wrong index: ${point3[2]}!==${referencedImageId}`
        );
    }
    return [point3[0], point3[1]];
}

const tool2d = {
    metadata: {
        referencedImageId: "2"
    },

    data: {
        handles: {
            points: [
                [0, 1, 2],
                [10, 5, 2]
            ]
        }
    }
};

const tool3d = {
    metadata: {
        FrameOfReferenceUID: "1.2.3"
    },

    data: {
        handles: {
            points: [
                [0, 1, 2],
                [10, 5, 11]
            ]
        }
    }
};

describe("Length", () => {
    beforeEach(() => {
        setWorldToImageCoords(worldToImageCoords);
        // Setup adapters
    });

    afterEach(() => {
        setWorldToImageCoords(globalWorldToImageCoords);
    });

    it("Must define tool type", () => {
        expect(Length.toolType).toBe("Length");
    });

    it("Must use scoord for planar", () => {
        const tidArgs = Length.getTID300RepresentationArguments(tool2d, false);
        // Either x,y or [x,y] is allowed
        expect(tidArgs.point1).toEqual({ x: 0, y: 1 });
        expect(tidArgs.point2).toEqual({ x: 10, y: 5 });
    });

    it("Must use scoord3d for mpr points", () => {
        const tidArgs = Length.getTID300RepresentationArguments(tool3d, true);
        expect(tidArgs.point1).toEqual({ x: 0, y: 1, z: 2 });
        expect(tidArgs.point2).toEqual({ x: 10, y: 5, z: 11 });
    });

    it("Must convert tid1501 to tool data scoord", () => {});
});

//
