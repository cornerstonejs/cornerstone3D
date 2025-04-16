import { describe, it, expect } from "@jest/globals";
import { compactMergeSegmentDataWithoutInformationLoss } from "../src/adapters/Cornerstone3D/Segmentation/compactMergeSegData";

describe("compactMergeSegmentDataWithoutInformationLoss", () => {
    it("should have defined compactMergeSegmentDataWithoutInformationLoss", () => {
        expect(compactMergeSegmentDataWithoutInformationLoss).toBeDefined();
    });

    it("should use new array as first item if there are no initial arrays", () => {
        const arrayOfSegmentData = [];
        const newSegmentData = [
            [1, 2],
            [2, 3]
        ];

        compactMergeSegmentDataWithoutInformationLoss({
            arrayOfSegmentData,
            newSegmentData: newSegmentData
        });

        expect(arrayOfSegmentData).toEqual([newSegmentData]);
    });

    it("should merge arrays when there's no overlapping", () => {
        const arrayOfSegmentData = [
            [
                [1, 0],
                [0, 1]
            ]
        ];
        const newSegmentData = [
            [0, 2],
            [2, 0]
        ];

        compactMergeSegmentDataWithoutInformationLoss({
            arrayOfSegmentData,
            newSegmentData: newSegmentData
        });

        expect(arrayOfSegmentData).toEqual([
            [
                [1, 2],
                [2, 1]
            ]
        ]);
    });

    it("should not merge arrays when there is overlapping", () => {
        const arrayOfSegmentData = [
            [
                [1, 1],
                [0, 1]
            ]
        ];
        const newSegmentData = [
            [0, 2],
            [2, 0]
        ];

        compactMergeSegmentDataWithoutInformationLoss({
            arrayOfSegmentData,
            newSegmentData: newSegmentData
        });

        expect(arrayOfSegmentData).toEqual([
            [
                [1, 1],
                [0, 1]
            ],

            [
                [0, 2],
                [2, 0]
            ]
        ]);
    });

    it("should merge with the second array when there is overlapping in the first but not in the second one", () => {
        const arrayOfSegmentData = [
            [
                [1, 1],
                [0, 1]
            ],
            [
                [1, 0],
                [0, 1]
            ]
        ];
        const newSegmentData = [
            [0, 2],
            [2, 0]
        ];

        compactMergeSegmentDataWithoutInformationLoss({
            arrayOfSegmentData,
            newSegmentData: newSegmentData
        });

        expect(arrayOfSegmentData).toEqual([
            [
                [1, 1],
                [0, 1]
            ],

            [
                [1, 2],
                [2, 1]
            ]
        ]);
    });

    it("should keep undefined (empty) elements if both new and original array have them in the same position", () => {
        const arrayOfSegmentData = [[undefined, [0, 1]]];
        const newSegmentData = [undefined, [2, 0]];

        compactMergeSegmentDataWithoutInformationLoss({
            arrayOfSegmentData,
            newSegmentData: newSegmentData
        });

        expect(arrayOfSegmentData).toEqual([[undefined, [2, 1]]]);
    });

    it("should keep the original elements if the corresponding new position is undefined (empty)", () => {
        const arrayOfSegmentData = [[[0, 1]]];
        const newSegmentData = [
            [0, 0],
            [2, 0]
        ];

        compactMergeSegmentDataWithoutInformationLoss({
            arrayOfSegmentData,
            newSegmentData: newSegmentData
        });

        expect(arrayOfSegmentData).toEqual([
            [
                [0, 1],
                [2, 0]
            ]
        ]);
    });

    it("should keep the new elements if the corresponding original position is undefined (empty)", () => {
        const arrayOfSegmentData = [[undefined, [0, 1]]];
        const newSegmentData = [
            [2, 2],
            [2, 0]
        ];

        compactMergeSegmentDataWithoutInformationLoss({
            arrayOfSegmentData,
            newSegmentData: newSegmentData
        });

        expect(arrayOfSegmentData).toEqual([
            [
                [2, 2],
                [2, 1]
            ]
        ]);
    });
});
