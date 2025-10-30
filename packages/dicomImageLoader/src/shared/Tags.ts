import { Enums, utilities } from '@cornerstonejs/core';

const { toNumber } = utilities;

const { GENERAL_IMAGE, SOP_COMMON } = Enums.MetadataModules;

function bindFromDataset<T>(method, defaultIndex = 0) {
  return function (dataSet, _index = defaultIndex) {
    if (!this.xTag) {
      if (!this.tag) {
        throw new Error(`No tag defined in this: ${this}`);
      }
      this.xTag = `x${this.tag}`;
    }
    return dataSet[method](this.xTag) as T;
  };
}

export const stringDataset = bindFromDataset<string>('string');
export const floatStringDataset = bindFromDataset<number>('floatString');

export function singleMetadata(metadata, index = 0) {
  const value = metadata[this.tag];
  return value?.Value?.[index];
}

export function numberMetadata(metadata, index = 0) {
  return toNumber(this.singleMetadata(metadata, index));
}

export function singleNatural<T>(
  metadata,
  index = 0,
  name: string = this.name
) {
  const value = metadata[name];
  return (Array.isArray(value) ? value[index] : value) as T;
}

export const lowerCamel = (name: string) => {
  if (name.startsWith('SOP')) {
    return `sop${name.substring(3)}`;
  }
  return name[0].toLowerCase() + name.substring(1);
};

export interface ITag<T> {
  tag: string;
  xTag?: string;
  lowerName: string;
  fromDataset: (dataset, index?) => T;
  modules?: string[];
}

export interface IModule<T> {
  name: string;
  tags: ITag<unknown>[];
  fromDataset: (dataset) => T;
  fromNatural: (natural) => T;
  fromMetadata: (metadata) => T;
}

export const TagsAny: Record<string, ITag<unknown>> = {};

export interface IModules {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [GENERAL_IMAGE]?: IModule<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [SOP_COMMON]?: IModule<any>;
}

export const Modules: IModules = {};

function fromDatasetList(dataset) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {};
  for (const tag of this.tags) {
    result[tag.lowerName] = tag.fromDataset(dataset);
  }
  return result;
}

function fromMetadataList(metadata) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {};
  for (const tag of this.tags) {
    const value = tag.fromMetadata(metadata);
    if (value === undefined) {
      continue;
    }
    result[tag.lowerName] = value;
  }
  return result;
}

function createModules(tagValue: ITag<unknown>) {
  if (!tagValue.modules) {
    return;
  }
  for (const module of tagValue.modules) {
    if (!Modules[module]) {
      Modules[module] = {
        fromDataset: fromDatasetList,
        fromMetadata: fromMetadataList,
        tags: [],
      };
    }
    Modules[module].tags.push(tagValue);
  }
}

const vrString = (name, tag, ...modules) => {
  const tagValue = {
    fromDataset: stringDataset,
    fromMetadata: singleMetadata,
    tag,
    lowerName: lowerCamel(name),
    name,
    modules,
  };
  TagsAny[name] = tagValue;
  createModules(tagValue);
  return tagValue;
};

const vrFloatString = (name, tag, ...modules) => {
  const tagValue = {
    fromDataset: floatStringDataset,
    fromMetadata: numberMetadata,
    tag,
    lowerName: lowerCamel(name),
    name,
    modules,
  };
  TagsAny[name] = tagValue;
  createModules(tagValue);
  return tagValue;
};

export const vrUI = vrString;
export const vrCS = vrString;
export const vrDS = vrFloatString;

export const TagsArray = [
  vrUI('SOPInstanceUID', '00080018', GENERAL_IMAGE, SOP_COMMON),
  vrUI('SOPClassUID', '00080016', GENERAL_IMAGE, SOP_COMMON),
  vrCS('LossyImageCompression', '00282110', GENERAL_IMAGE),
  vrDS('LossyImageCompressionRatio', '00282112', GENERAL_IMAGE),
  vrCS('LossyImageCompressionMethod', '00282114', GENERAL_IMAGE),
];

export type FieldTags = (typeof TagsArray)[number]['tag'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TagsType = Record<FieldTags, ITag<any>>;

export function createTags(tagsArray): TagsType {
  const tags = {} as TagsType;
  for (const tag of tagsArray) {
    tags[tag.name] = tag;
  }
  return tags;
}

export const Tags: TagsType = createTags(TagsArray);
