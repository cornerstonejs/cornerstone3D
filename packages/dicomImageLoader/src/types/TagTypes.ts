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
  moduleStatic: IModuleStatic;
  modules: string[];
  /** Name of the module for the child types */
  sqModule?: string;
}

export interface IModuleStatic {
  modules: IModules;
  createSqDataset: <T>(tag: ITag<unknown>, dataSet, options) => T;
  createSqNatural: <T>(tag: ITag<unknown>, natural, options) => T;
  createSqMetadata: <T>(tag: ITag<unknown>, metadata, options) => T;
}

export interface IModule<T> {
  name: string;
  tags: ITag<unknown>[];
  fromDataset: (dataset, options?) => T;
  fromNatural: (natural, options?) => T;
  fromMetadata: (metadata, options?) => T;
}

export interface IModules {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [GENERAL_IMAGE]?: IModule<any>;
  [SOP_COMMON]?: IModule<Types.SopCommonModuleMetadata>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [PixelInstanceModule]?: IModule<any>;
  [IMAGE_PLANE]?: IModule<Types.ImagePlaneModule>;
}
