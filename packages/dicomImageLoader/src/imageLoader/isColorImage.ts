export default function (photoMetricInterpretation) {
  return (
    photoMetricInterpretation === 'RGB' ||
    photoMetricInterpretation === 'PALETTE COLOR' ||
    photoMetricInterpretation === 'YBR_FULL' ||
    photoMetricInterpretation === 'YBR_FULL_422' ||
    photoMetricInterpretation === 'YBR_PARTIAL_422' ||
    photoMetricInterpretation === 'YBR_PARTIAL_420' ||
    photoMetricInterpretation === 'YBR_RCT' ||
    photoMetricInterpretation === 'YBR_ICT'
  );
}
