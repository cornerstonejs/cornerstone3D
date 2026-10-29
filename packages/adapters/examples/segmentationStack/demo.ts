/* eslint-disable */
const dicomMap = new Map();

dicomMap.set(
  '1.3.6.1.4.1.14519.5.2.1.3671.4754.298665348758363466150039312520',
  {
    label: 'OHIF sample 1',
    fetchDicom: {
      StudyInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.3671.4754.298665348758363466150039312520',
      SeriesInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.3671.4754.235188122843915982710753948536',
      wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
    },
    fetchSegmentation: {
      StudyInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.3671.4754.298665348758363466150039312520',
      SeriesInstanceUID:
        '1.2.276.0.7230010.3.1.3.1426846371.15380.1513205183.303',
      SOPInstanceUID: '1.2.276.0.7230010.3.1.4.1426846371.15380.1513205183.304',
      wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
    },
  }
);

dicomMap.set(
  '1.3.6.1.4.1.14519.5.2.1.256467663913010332776401703474716742458',
  {
    label: 'OHIF sample 2',
    fetchDicom: {
      StudyInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.256467663913010332776401703474716742458',
      SeriesInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.40445112212390159711541259681923198035',
      wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
    },
    fetchSegmentation: {
      StudyInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.256467663913010332776401703474716742458',
      SeriesInstanceUID:
        '1.2.276.0.7230010.3.1.3.481034752.2667.1663086918.611582',
      SOPInstanceUID:
        '1.2.276.0.7230010.3.1.4.481034752.2667.1663086918.611583',
      wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
    },
  }
);

dicomMap.set('1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046', {
  label: 'OHIF sample 3',
  fetchDicom: {
    StudyInstanceUID:
      '1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046',
    SeriesInstanceUID:
      '1.3.12.2.1107.5.2.32.35162.1999123112191238897317963.0.0.0',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  },
  fetchSegmentation: {
    StudyInstanceUID:
      '1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046',
    SeriesInstanceUID: '1.2.276.0.7230010.3.1.3.296485376.8.1542816659.201008',
    SOPInstanceUID: '1.2.276.0.7230010.3.1.4.296485376.8.1542816659.201009',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  },
});

// Imaging Data Commons (IDC) SEGs stored with different in-plane orientations
// from their source series. See cornerstonejs/cornerstone3D#2959.
const idcWadoRsRoot =
  'https://proxy.imaging.datacommons.cancer.gov/current/viewer-only-no-downloads-see-tinyurl-dot-com-slash-3j3d9jyp/dicomWeb';

function addIdcExample(
  label,
  StudyInstanceUID,
  sourceSeriesInstanceUID,
  segSeriesInstanceUID,
  segSOPInstanceUID
) {
  dicomMap.set(StudyInstanceUID, {
    label,
    fetchDicom: {
      StudyInstanceUID,
      SeriesInstanceUID: sourceSeriesInstanceUID,
      wadoRsRoot: idcWadoRsRoot,
    },
    fetchSegmentation: {
      StudyInstanceUID,
      SeriesInstanceUID: segSeriesInstanceUID,
      SOPInstanceUID: segSOPInstanceUID,
      wadoRsRoot: idcWadoRsRoot,
    },
  });
}

addIdcExample(
  'IDC upenn_gbm MR, SEG rotated 180°',
  '1.3.6.1.4.1.14519.5.2.1.299765099515151706457065089228567233426',
  '1.3.6.1.4.1.14519.5.2.1.88442458185890417183040615754756360791',
  '1.2.276.0.7230010.3.1.3.17436516.587628.1722970760.659708',
  '1.2.276.0.7230010.3.1.4.17436516.587628.1722970760.659709'
);

addIdcExample(
  'IDC prostate_mri_us_biopsy MR, SEG rotated 180°',
  '1.3.6.1.4.1.14519.5.2.1.236064969661783320564597237575059835700',
  '1.3.6.1.4.1.14519.5.2.1.39971759089788980191620069875387467018',
  '1.2.276.0.7230010.3.1.3.296485376.151.1698113149.166117',
  '1.2.276.0.7230010.3.1.4.296485376.151.1698113149.166118'
);

addIdcExample(
  'IDC duke_breast_cancer_mri MR, SEG rotated 180°',
  '1.3.6.1.4.1.14519.5.2.1.286053427066014703681702163717632018125',
  '1.3.6.1.4.1.14519.5.2.1.205361186833560105168960801802077744186',
  '1.2.276.0.7230010.3.1.3.17436516.4065213.1714671531.535720',
  '1.2.276.0.7230010.3.1.4.17436516.4065213.1714671531.535721'
);

addIdcExample(
  'IDC NLST CT, SEG flipped vertically',
  '1.2.840.113654.2.55.192012426995727721871016249335309434385',
  '1.2.840.113654.2.55.305538394446738410906709753576946604022',
  '1.2.276.0.7230010.3.1.3.313263360.15787.1706310178.804490',
  '1.2.276.0.7230010.3.1.4.313263360.15787.1706310178.804491'
);

export { dicomMap };
