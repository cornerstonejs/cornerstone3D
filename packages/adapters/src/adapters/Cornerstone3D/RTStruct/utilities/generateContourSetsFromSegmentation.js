import { removeDuplicatePoints } from "./mergePoints";
import { findContoursFromReducedSet } from "./contourFinder";

async function generateContourSetsFromSegmentation({
    segmentations,
    cornerstoneCache,
    cornerstoneToolsEnums,
    vtkUtils
}) {
    const LABELMAP = cornerstoneToolsEnums.SegmentationRepresentations.Labelmap;

    const { representationData, segments } = segmentations;
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
    //const uniqueSegmentIndices = new Set();
    const pixelsPerSlice = vol.dimensions[0] * vol.dimensions[1];

    for (let z = 0; z < numSlices; z++) {
        for (let y = 0; y < vol.dimensions[1]; y++) {
            for (let x = 0; x < vol.dimensions[0]; x++) {
                const index = x + y * vol.dimensions[0] + z * pixelsPerSlice;

                // If border pixel of slice, set pixel to 0
                //if (segData[index] !== 0) {
                //    uniqueSegmentIndices.add(segData[index]);
                //}

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
    const ContourSets = [];

    // Iterate through all segments in current segmentation set
    segments.forEach((segment, segIndex) => {
        // Skip empty segments
        if (!segment) {
            return;
        }
        const contourSequence = [];

        for (let sliceIndex = 0; sliceIndex < numSlices; sliceIndex++) {
            try {
                const mSquares = vtkUtils.vtkImageMarchingSquares.newInstance({
                    slice: sliceIndex
                });

                // filter out the scalar data so that only it has background and
                // the current segment index
                const imageDataCopy = vtkUtils.vtkImageData.newInstance();

                imageDataCopy.shallowCopy(vol.imageData);

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
                cValues[0] = 1;
                mSquares.setContourValues(cValues);
                mSquares.setMergePoints(false);

                // Perform marching squares
                const msOutput = mSquares.getOutputData();

                // Clean up output from marching squares
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
                //}
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
            label: segment.label,
            color: segment.color,
            metadata,
            sliceContours: contourSequence
        };

        ContourSets.push(ContourSet);
    });

    return ContourSets;
}

export { generateContourSetsFromSegmentation };
