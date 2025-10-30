import { Enums, type Types } from '@cornerstonejs/core';

const { GENERAL_IMAGE, SOP_COMMON, IMAGE_PLANE } = Enums.MetadataModules;
export const PixelInstanceModule = 'PixelInstanceModule';

export interface ITag<T> {
  tag: string;
  xTag?: string;
  lowerName: string;
  fromDataset: (dataset, index?) => T;
  fromMetadata: (metadata, index?) => T;
  fromNatural: (natural, index?) => T;
  modules?: string[];
}

export interface IModule<T> {
  name: string;
  tags: ITag<unknown>[];
  fromDataset: (dataset) => T;
  fromNatural: (natural) => T;
  fromMetadata: (metadata) => T;
}

export interface IModules {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [GENERAL_IMAGE]?: IModule<any>;
  [SOP_COMMON]?: IModule<Types.SopCommonModuleMetadata>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [PixelInstanceModule]?: IModule<any>;
  [IMAGE_PLANE]?: IModule<Types.ImagePlaneModule>;
}
