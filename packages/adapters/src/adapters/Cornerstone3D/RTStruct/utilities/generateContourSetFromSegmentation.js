import { removeDuplicatePoints } from "./mergePoints";
import { findContoursFromReducedSet } from "./contourFinder";

async function generateContourSetFromSegmentation({
    segmentation,
    cornerstoneCache,
    cornerstoneToolsEnums,
    vtkUtils
}) {
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

    // NOTE: Workaround for marching squares not finding closed contours at
    // boundary of image volume, clear pixels along x-y border of volume
    const segData = vol.imageData.getPointData().getScalars().getData();
    const uniqueSegmentIndices = new Set();
    const pixelsPerSlice = vol.dimensions[0] * vol.dimensions[1];

    for (let z = 0; z < numSlices; z++) {
        for (let y = 0; y < vol.dimensions[1]; y++) {
            for (let x = 0; x < vol.dimensions[0]; x++) {
                const index = x + y * vol.dimensions[0] + z * pixelsPerSlice;

                // If border pixel of slice, set pixel to 0
                if (segData[index] !== 0) {
                    uniqueSegmentIndices.add(segData[index]);
                }

                if (
                    x === 0 ||
                    y === 0 ||
                    x === vol.dimensions[0] - 1 ||
                    y === vol.dimensions[1] - 1
                ) {
                    segData[index] = 0;
                }
            }
        }
    }

    // end workaround
    const contourSequence = [];

    for (let sliceIndex = 0; sliceIndex < numSlices; sliceIndex++) {
        try {
            const mSquares = vtkUtils.vtkImageMarchingSquares.newInstance({
                slice: sliceIndex
            });

            const scalarsForThisSlice = segData.slice(
                sliceIndex * pixelsPerSlice,
                (sliceIndex + 1) * pixelsPerSlice
            );

            const uniqueSegmentIndicesSlice = new Set(scalarsForThisSlice);

            if (uniqueSegmentIndicesSlice.size === 1) {
                // if there is only one segment index in this slice, then there
                // is no contour to be found
                continue;
            }

            // filter out the scalar data so that only it has background and
            // the current segment index
            for (const segIndex of uniqueSegmentIndices) {
                const imageDataCopy = vtkUtils.vtkImageData.newInstance();

                vol.imageData.shallowCopy(imageDataCopy);

                // modify the imagedDataCopy so that it only has the current
                // segment index and background

                const scalars = vtkUtils.vtkDataArray.newInstance({
                    name: "Scalars",
                    values: segData.map(val => (val === segIndex ? 1 : 0)),
                    numberOfComponents: 1
                });

                imageDataCopy.getPointData().setScalars(scalars);

                // Connect pipeline
                mSquares.setInputData(imageDataCopy);
                const cValues = [];
                cValues[0] = segIndex;
                mSquares.setContourValues(cValues);
                mSquares.setMergePoints(false);

                const msOutput = mSquares.getOutputData();

                const reducedSet = removeDuplicatePoints(msOutput);
                if (reducedSet.points && reducedSet.points.length > 0) {
                    const contours = findContoursFromReducedSet(
                        reducedSet.lines,
                        reducedSet.points
                    );

                    contourSequence.push({
                        referencedImageId: imageVol.imageIds[sliceIndex],
                        contours,
                        polyData: reducedSet
                    });
                }
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
