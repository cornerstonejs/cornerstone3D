/**
 * Returns true if iop1 and iop2 are perpendicular within a tolerance.
 *
 * @param iop1 - First ImageOrientationPatient
 * @param iop2 - Second ImageOrientationPatient
 * @param tolerance - Tolerance
 * @returns True if iop1 and iop2 are equal.
 */
export default function checkIfPerpendicular(
    iop1: number[],
    iop2: number[],
    tolerance: number
): boolean {
    const absDotColumnCosines = Math.abs(
        iop1[0] * iop2[0] + iop1[1] * iop2[1] + iop1[2] * iop2[2]
    );
    const absDotRowCosines = Math.abs(
        iop1[3] * iop2[3] + iop1[4] * iop2[4] + iop1[5] * iop2[5]
    );

    return (
        (absDotColumnCosines < tolerance ||
            Math.abs(absDotColumnCosines - 1) < tolerance) &&
        (absDotRowCosines < tolerance ||
            Math.abs(absDotRowCosines - 1) < tolerance)
    );
}
