import type { DataSet } from 'dicom-parser';

export interface DICOMLoaderDataSetWithFetchMore extends DataSet {
  fetchMore?: (fetchOptions: {
    uri: string;
    imageId: string;
    fetchedLength: number;
    lengthToFetch: number;
  }) => Promise<DICOMLoaderDataSetWithFetchMore>;
}
