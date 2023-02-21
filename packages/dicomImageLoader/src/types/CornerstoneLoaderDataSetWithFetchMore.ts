import { DataSet } from 'dicom-parser';

export interface CornerstoneLoaderDataSetWithFetchMore extends DataSet {
  fetchMore?: (fetchOptions: {
    uri: string;
    imageId: string;
    fetchedLength: number;
    lengthToFetch: number;
  }) => Promise<CornerstoneLoaderDataSetWithFetchMore>;
}
