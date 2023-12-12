import { removeDuplicatePoints } from "./mergePoints";
import { findContoursFromReducedSet } from "./contourFinder";

function generateContourSetsFromLabelmap({
    segmentations,
    cornerstoneCache,
    cornerstoneToolsEnums,
    vtkUtils
}) {
    const { Labelmap } = cornerstoneToolsEnums.SegmentationRepresentations;

    const { representationData, segments = [0, 1] } = segmentations;
    const { volumeId: segVolumeId } = representationData[Labelmap];

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
    const pixelsPerSlice = vol.dimensions[0] * vol.dimensions[1];

    for (let z = 0; z < numSlices; z++) {
        for (let y = 0; y < vol.dimensions[1]; y++) {
            const index = y * vol.dimensions[0] + z * pixelsPerSlice;
            segData[index] = 0;
            segData[index + vol.dimensions[0] - 1] = 0;
        }
    }

    // end workaround
    //
    //
    const ContourSets = [];

    const { FrameOfReferenceUID } = imageVol.metadata;
    // Iterate through all segments in current segmentation set
    const numSegments = segments.length;
    for (let segIndex = 0; segIndex < numSegments; segIndex++) {
        const segment = segments[segIndex];

        // Skip empty segments
        if (!segment) {
            continue;
        }

        const contourSequence = [];
        const scalars = vtkUtils.vtkDataArray.newInstance({
            name: "Scalars",
            numberOfComponents: 1,
            size: pixelsPerSlice * numSlices,
            dataType: "Uint8Array"
        });
        for (let sliceIndex = 0; sliceIndex < numSlices; sliceIndex++) {
            // Check if the slice is empty before running marching cube
            if (
                isSliceEmptyForSegment(
                    sliceIndex,
                    segData,
                    pixelsPerSlice,
                    segIndex
                )
            ) {
                continue;
            }
            const frameStart = sliceIndex * pixelsPerSlice;

            try {
                // Modify segData for this specific segment directly
                for (let i = 0; i < pixelsPerSlice; i++) {
                    const value = segData[i + frameStart];
                    if (value === segIndex) {
                        scalars.setValue(i + frameStart, 1);
                    } else {
                        scalars.setValue(i, 0);
                    }
                }

                const mSquares = vtkUtils.vtkImageMarchingSquares.newInstance({
                    slice: sliceIndex
                });

                // filter out the scalar data so that only it has background and
                // the current segment index
                const imageDataCopy = vtkUtils.vtkImageData.newInstance();

                imageDataCopy.shallowCopy(vol.imageData);
                imageDataCopy.getPointData().setScalars(scalars);

                // Connect pipeline
                mSquares.setInputData(imageDataCopy);
                const cValues = [1];
                mSquares.setContourValues(cValues);
                mSquares.setMergePoints(false);

                // Perform marching squares
                const msOutput = mSquares.getOutputData();

                // Clean up output from marching squares
                const reducedSet = removeDuplicatePoints(msOutput);
                if (reducedSet.points?.length) {
                    const contours = findContoursFromReducedSet(
                        reducedSet.lines,
                        reducedSet.points
                    );

                    contourSequence.push({
                        referencedImageId: imageVol.imageIds[sliceIndex],
                        contours,
                        polyData: reducedSet,
                        FrameNumber: sliceIndex + 1,
                        FrameOfReferenceUID
                    });
                }
            } catch (e) {
                console.warn(sliceIndex);
                console.warn(e);
            }
        }

        const metadata = {
            referencedImageId: imageVol.imageIds[0], // just use 0 for overall
            FrameOfReferenceUID
        };

        const ContourSet = {
            label: segment.label,
            color: segment.color,
            metadata,
            sliceContours: contourSequence
        };

        ContourSets.push(ContourSet);
    }

    return ContourSets;
}

function isSliceEmptyForSegment(sliceIndex, segData, pixelsPerSlice, segIndex) {
    const startIdx = sliceIndex * pixelsPerSlice;
    const endIdx = startIdx + pixelsPerSlice;

    for (let i = startIdx; i < endIdx; i++) {
        if (segData[i] === segIndex) {
            return false;
        }
    }

    return true;
}

export { generateContourSetsFromLabelmap };
