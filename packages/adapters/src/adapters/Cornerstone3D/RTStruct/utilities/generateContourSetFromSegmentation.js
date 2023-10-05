import vtkImageMarchingSquares from "@kitware/vtk.js/Filters/General/ImageMarchingSquares";

import * as contourUtils from ".";

async function generateContourSetFromSegmentation(
    segmentation,
    cornerstoneCache,
    cornerstoneToolsEnums
) {
    const LABELMAP = cornerstoneToolsEnums.SegmentationRepresentations.Labelmap;

    const { representationData } = segmentation;
    const { volumeId: segVolumeId } = representationData[LABELMAP];

    // Get segmentation volume
    const vol = cornerstoneCache.getVolume(segVolumeId);
    if (!vol) {
        console.warn(`No volume found for ${segVolumeId}`);
        return;
    }

    const numSlices = vol.dimensions[2];

    // Get image volume segmentation references
    const imageVol = cornerstoneCache.getVolume(vol.referencedVolumeId);
    if (!imageVol) {
        console.warn(`No volume found for ${vol.referencedVolumeId}`);
        return;
    }

    // NOTE: Workaround for marching squares not finding closed contors at
    // boundary of image volume, clear pixels along x-y border of volume
    const segData = vol.imageData.getPointData().getArrays()[0].getData();
    const pixelsPerSlice = vol.dimensions[0] * vol.dimensions[1];
    for (let z = 0; z < numSlices; z++) {
        for (let y = 0; y < vol.dimensions[1]; y++) {
            for (let x = 0; x < vol.dimensions[0]; x++) {
                // If border pixel of slice, set pixel to 0
                if (
                    x === 0 ||
                    y === 0 ||
                    x === vol.dimensions[0] - 1 ||
                    y === vol.dimensions[1] - 1
                ) {
                    const index =
                        x + y * vol.dimensions[0] + z * pixelsPerSlice;
                    segData[index] = 0;
                }
            }
        }
    }

    // end workaround

    const contourSequence = [];

    for (let sliceIndex = 0; sliceIndex < numSlices; sliceIndex++) {
        try {
            const mSquares = vtkImageMarchingSquares.newInstance({
                slice: sliceIndex
            });

            // Connect pipeline
            mSquares.setInputData(vol.imageData);
            const cValues = [];
            cValues[0] = 1; // number for thresholding
            mSquares.setContourValues(cValues);
            mSquares.setMergePoints(false);

            // cleans up console output, otherwise will have lots of time data
            window["console"]["time"] = function () {
                // do nothing
            };
            window["console"]["timeEnd"] = function () {
                // do nothing
            };
            const msOutput = mSquares.getOutputData();
            window["console"]["time"] = console.time;
            window["console"]["timeEnd"] = console.timeEnd;

            const reducedSet =
                contourUtils.mergePoints.removeDuplicatePoints(msOutput);

            if (reducedSet.points && reducedSet.points.length > 0) {
                const contours =
                    contourUtils.contourFinder.findContoursFromReducedSet(
                        reducedSet.lines,
                        reducedSet.points
                    );

                contourSequence.push({
                    referencedImageId: imageVol.imageIds[sliceIndex],
                    contours,
                    polyData: reducedSet
                });
            }
        } catch (e) {
            console.warn(sliceIndex);
            console.warn(e);
        }
    }

    const metadata = {
        referencedImageId: imageVol.imageIds[0], // just use 0
        FrameOfReferenceUID: imageVol.metadata.FrameOfReferenceUID
    };

    const ContourSet = {
        label: segmentation.label,
        color: segmentation.color,
        metadata,
        sliceContours: contourSequence
    };

    return ContourSet;
}

export { generateContourSetFromSegmentation };
