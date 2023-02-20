import imageIdToURI from '../imageIdToURI';
import { WadoRsMetaData } from './wado-rs-metadata';

let metadataByImageURI: WadoRsMetaData[] = [];

function add(imageId: string, metadata: WadoRsMetaData): void {
  const imageURI = imageIdToURI(imageId);

  metadataByImageURI[imageURI] = metadata;
}

function get(imageId: string): WadoRsMetaData {
  const imageURI = imageIdToURI(imageId);

  return metadataByImageURI[imageURI];
}

function remove(imageId: string): void {
  const imageURI = imageIdToURI(imageId);

  metadataByImageURI[imageURI] = undefined;
}

function purge(): void {
  metadataByImageURI = [];
}

export default {
  add,
  get,
  remove,
  purge,
};
