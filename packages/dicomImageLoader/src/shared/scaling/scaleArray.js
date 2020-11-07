export default function scaleArray(array, scalingParameters) {
  const arrayLength = array.length;

  if (scalingParameters.modality === 'PT') {
    const {
      rescaleSlope,
      rescaleIntercept,
      patientWeight,
      correctedDose,
    } = scalingParameters;

    // Pre compute as much as possible
    const patientWeightTimes1000OverCorrectedDose =
      (patientWeight * 1000) / correctedDose;

    for (let i = 0; i < arrayLength; i++) {
      array[i] =
        patientWeightTimes1000OverCorrectedDose *
        (array[i] * rescaleSlope + rescaleIntercept);
    }
  } else {
    const { rescaleSlope, rescaleIntercept } = scalingParameters;

    for (let i = 0; i < arrayLength; i++) {
      array[i] = array[i] * rescaleSlope + rescaleIntercept;
    }
  }
}
