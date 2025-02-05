import { describe, it, expect } from "@jest/globals";
import { mergeNewArrayWithoutInformationLoss } from "../src/adapters/Cornerstone3D/Segmentation/mergeSegArray";

describe("mergeNewArrayWithoutInformationLoss", () => {
    it("should have defined mergeNewArrayWithoutInformationLoss", () => {
        expect(mergeNewArrayWithoutInformationLoss).toBeDefined();
    });

    it("should use new array as first item if there are no initial arrays", () => {
        const arrayOfLabelMapImages = [];
        const newArray = [
            [1, 2],
            [2, 3]
        ];

        mergeNewArrayWithoutInformationLoss({
            arrayOfLabelMapImages,
            newLabelMapImages: newArray
        });

        expect(arrayOfLabelMapImages).toEqual([newArray]);
    });

    it("should merge arrays when there's no overlapping", () => {
        const arrayOfLabelMapImages = [
            [
                [1, 0],
                [0, 1]
            ]
        ];
        const newArray = [
            [0, 2],
            [2, 0]
        ];

        mergeNewArrayWithoutInformationLoss({
            arrayOfLabelMapImages,
            newLabelMapImages: newArray
        });

        expect(arrayOfLabelMapImages).toEqual([
            [
                [1, 2],
                [2, 1]
            ]
        ]);
    });

    it("should not merge arrays when there is overlapping", () => {
        const arrayOfLabelMapImages = [
            [
                [1, 1],
                [0, 1]
            ]
        ];
        const newArray = [
            [0, 2],
            [2, 0]
        ];

        mergeNewArrayWithoutInformationLoss({
            arrayOfLabelMapImages,
            newLabelMapImages: newArray
        });

        expect(arrayOfLabelMapImages).toEqual([
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
        const arrayOfLabelMapImages = [
            [
                [1, 1],
                [0, 1]
            ],
            [
                [1, 0],
                [0, 1]
            ]
        ];
        const newArray = [
            [0, 2],
            [2, 0]
        ];

        mergeNewArrayWithoutInformationLoss({
            arrayOfLabelMapImages,
            newLabelMapImages: newArray
        });

        expect(arrayOfLabelMapImages).toEqual([
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
        const arrayOfLabelMapImages = [[undefined, [0, 1]]];
        const newArray = [undefined, [2, 0]];

        mergeNewArrayWithoutInformationLoss({
            arrayOfLabelMapImages,
            newLabelMapImages: newArray
        });

        expect(arrayOfLabelMapImages).toEqual([[undefined, [2, 1]]]);
    });

    it("should keep the original elements if the corresponding new position is undefined (empty)", () => {
        const arrayOfLabelMapImages = [[[0, 1]]];
        const newArray = [
            [0, 0],
            [2, 0]
        ];

        mergeNewArrayWithoutInformationLoss({
            arrayOfLabelMapImages,
            newLabelMapImages: newArray
        });

        expect(arrayOfLabelMapImages).toEqual([
            [
                [0, 1],
                [2, 0]
            ]
        ]);
    });

    it("should keep the new elements if the corresponding original position is undefined (empty)", () => {
        const arrayOfLabelMapImages = [[undefined, [0, 1]]];
        const newArray = [
            [2, 2],
            [2, 0]
        ];

        mergeNewArrayWithoutInformationLoss({
            arrayOfLabelMapImages,
            newLabelMapImages: newArray
        });

        expect(arrayOfLabelMapImages).toEqual([
            [
                [2, 2],
                [2, 1]
            ]
        ]);
    });
});
