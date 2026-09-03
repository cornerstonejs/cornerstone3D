export interface DicomDimensions {
  rows: number;
  columns: number;
}

export const dicomDimensions: Record<string, DicomDimensions> = {
  'CTImage.dcm_JPEG2000LosslessOnlyTransferSyntax_1.2.840.10008.1.2.4.90.dcm': {
    rows: 512,
    columns: 512,
  },
  'CTImage.dcm_JPEG2000TransferSyntax_1.2.840.10008.1.2.4.91.dcm': {
    rows: 512,
    columns: 512,
  },
  'CTImage.dcm_JPEGLSLosslessTransferSyntax_1.2.840.10008.1.2.4.80.dcm': {
    rows: 512,
    columns: 512,
  },
  'CTImage.dcm_JPEGLSLossyTransferSyntax_1.2.840.10008.1.2.4.81.dcm': {
    rows: 512,
    columns: 512,
  },
  'CTImage.dcm_JPEGProcess14SV1TransferSyntax_1.2.840.10008.1.2.4.70.dcm': {
    rows: 512,
    columns: 512,
  },
  'CTImage.dcm_JPEGProcess14TransferSyntax_1.2.840.10008.1.2.4.57.dcm': {
    rows: 512,
    columns: 512,
  },
  'CTImage.dcm_JPEGProcess1TransferSyntax_1.2.840.10008.1.2.4.50.dcm': {
    rows: 512,
    columns: 512,
  },
  'CTImage.dcm_RLELosslessTransferSyntax_1.2.840.10008.1.2.5.dcm': {
    rows: 512,
    columns: 512,
  },
  'TestPattern_JPEG-Baseline_YBR422.dcm': { rows: 400, columns: 640 },
  'TestPattern_JPEG-Baseline_YBRFull.dcm': { rows: 400, columns: 640 },
  'TestPattern_JPEG-Lossless_RGB.dcm': { rows: 400, columns: 640 },
  'TestPattern_JPEG-LS-Lossless.dcm': { rows: 400, columns: 640 },
  'TestPattern_JPEG-LS-NearLossless.dcm': { rows: 400, columns: 640 },
  'TestPattern_Palette_16.dcm': { rows: 400, columns: 640 },
  'TestPattern_Palette.dcm': { rows: 400, columns: 640 },
  'TestPattern_RGB.dcm': { rows: 400, columns: 640 },
  'TG_18-luminance-1K/TG18-AD/TG18-AD-1k-01.dcm': { rows: 1024, columns: 1024 },
  'TG_18-luminance-1K/TG18-CT/TG18-CT-1k-01.dcm': { rows: 1024, columns: 1024 },
  'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-01.dcm': { rows: 1024, columns: 1024 },
  'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-04.dcm': { rows: 1024, columns: 1024 },
  'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-09.dcm': { rows: 1024, columns: 1024 },
  'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-13.dcm': { rows: 1024, columns: 1024 },
  'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-18.dcm': { rows: 1024, columns: 1024 },
  'TG_18-luminance-1K/TG18-MP/TG18-MP-1k-01.dcm': { rows: 1024, columns: 1024 },
  'TG_18-luminance-1K/TG18-UN/TG18-UN-1k-01.dcm': { rows: 1024, columns: 1024 },
  'TG_18-luminance-1K/TG18-UNL/TG18-UNL-1k-01.dcm': {
    rows: 1024,
    columns: 1024,
  },
  'TG_18-multi-1K/TG18-BR/TG18-BR-1k-01.dcm': { rows: 1024, columns: 1024 },
  'TG_18-multi-1K/TG18-pQC/TG18-PQC-1k-01.dcm': { rows: 1024, columns: 1024 },
  'TG_18-multi-1K/TG18-QC/TG18-QC-1k-01.dcm': { rows: 1024, columns: 1024 },
  'TG_18-noise-1k/TG18-AFC/TG18-AFC-1k-01.dcm': { rows: 1024, columns: 1024 },
  'TG_18-noise-1k/TG18-NS/TG18-NS-1k-01.dcm': { rows: 1024, columns: 1024 },
  'TG_18-noise-1k/TG18-NS/TG18-NS-1k-02.dcm': { rows: 1024, columns: 1024 },
  'TG_18-noise-1k/TG18-NS/TG18-NS-1k-03.dcm': { rows: 1024, columns: 1024 },
  'TG_18-resolution-2k/TG18-CX/TG18-CX-2k-01.dcm': {
    rows: 2048,
    columns: 2048,
  },
  'TG_18-resolution-2k/TG18-LPH/TG18-LPH-2k-01.dcm': {
    rows: 2048,
    columns: 2048,
  },
  'TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-01.dcm': {
    rows: 2048,
    columns: 2048,
  },
  'TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-02.dcm': {
    rows: 2048,
    columns: 2048,
  },
  'TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-03.dcm': {
    rows: 2048,
    columns: 2048,
  },
  'TG_18-resolution-2k/TG18-PX/TG18-PX-2k-01.dcm': {
    rows: 2048,
    columns: 2048,
  },
  'TG_18-resolution-2k/TG18-RH/TG18-RH-2k-01.dcm': {
    rows: 2048,
    columns: 2048,
  },
  'TG_18-resolution-2k/TG18-RH/TG18-RH-2k-02.dcm': {
    rows: 2048,
    columns: 2048,
  },
  'TG_18-resolution-2k/TG18-RH/TG18-RH-2k-03.dcm': {
    rows: 2048,
    columns: 2048,
  },
  'TG_18-resolution-2k/TG18-RV/TG18-RV-2k-01.dcm': {
    rows: 2048,
    columns: 2048,
  },
  'TG_18-resolution-2k/TG18-RV/TG18-RV-2k-02.dcm': {
    rows: 2048,
    columns: 2048,
  },
  'TG_18-resolution-2k/TG18-RV/TG18-RV-2k-03.dcm': {
    rows: 2048,
    columns: 2048,
  },
};
