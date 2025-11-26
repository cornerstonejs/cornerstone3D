import { data } from 'dcmjs';
const { datasetToBlob } = data;

interface DicomDataset {
  _meta?: unknown;
  // other properties
}

/**
 * Trigger file download from an array buffer
 * @param bufferOrDataset - ArrayBuffer or DicomDataset
 * @param filename - name of the file to download
 */
export function downloadDICOMData(
  bufferOrDataset: ArrayBuffer | DicomDataset,
  filename: string
) {
  let blob;
  if (bufferOrDataset instanceof ArrayBuffer) {
    blob = new Blob([bufferOrDataset], { type: 'application/dicom' });
  } else {
    if (!bufferOrDataset._meta) {
      throw new Error('Dataset must have a _meta property');
    }

    blob = datasetToBlob(bufferOrDataset);
  }

  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
