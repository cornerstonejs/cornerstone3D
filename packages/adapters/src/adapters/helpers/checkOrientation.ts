import checkIfPerpendicular from "./checkIfPerpendicular";
import compareArrays from "./compareArrays";

export default function checkOrientation(
    multiframe,
    validOrientations,
    sourceDataDimensions,
    tolerance
) {
    const { SharedFunctionalGroupsSequence, PerFrameFunctionalGroupsSequence } =
        multiframe;

    const sharedImageOrientationPatient =
        SharedFunctionalGroupsSequence.PlaneOrientationSequence
            ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
                  .ImageOrientationPatient
            : undefined;

    // Check if in plane.
    const PerFrameFunctionalGroups = PerFrameFunctionalGroupsSequence[0];

    const iop =
        sharedImageOrientationPatient ||
        PerFrameFunctionalGroups.PlaneOrientationSequence
            .ImageOrientationPatient;

    const inPlane = validOrientations.some(operation =>
        compareArrays(iop, operation, tolerance)
    );

    if (inPlane) {
        return "Planar";
    }

    if (
        checkIfPerpendicular(iop, validOrientations[0], tolerance) &&
        sourceDataDimensions.includes(multiframe.Rows) &&
        sourceDataDimensions.includes(multiframe.Columns)
    ) {
        // Perpendicular and fits on same grid.
        return "Perpendicular";
    }

    return "Oblique";
}
