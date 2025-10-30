import { utilities } from '@cornerstonejs/core';
import type { ITag, IModule, IModules } from '../types/TagTypes';
import { tagToCamel } from './tagCase';
import getNumberValues from '../imageLoader/wadouri/metaData/getNumberValues';

const { toNumber } = utilities;

export class Module<T> implements IModule<T> {
  name: string;
  tags = new Array<ITag<unknown>>();

  constructor(name) {
    this.name = name;
  }

  /**
   * Adds a tag to the set of tags
   */
  public addTag(tagData: ITag<unknown>) {
    this.tags.push(tagData);
  }

  public fromDataset(dataset) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = {};
    for (const tag of this.tags) {
      const value = tag.fromDataset(dataset);
      if (value === undefined) {
        continue;
      }
      result[tag.lowerName] = value;
    }
    return result as T;
  }

  public fromMetadata(metadata) {
    const result = {} as T;
    for (const tag of this.tags) {
      const value = tag.fromMetadata(metadata);
      if (value === undefined) {
        continue;
      }
      result[tag.lowerName] = value;
    }
    return result as T;
  }

  public fromNatural(natural) {
    const result = {} as T;
    for (const tag of this.tags) {
      const value = tag.fromNatural(natural);
      if (value === undefined) {
        continue;
      }
      result[tag.lowerName] = value;
    }
    return result;
  }
}

export const Modules: IModules = {};

function bindFromDataset<T>(method, defaultIndex = 0) {
  return function (dataSet, _index = defaultIndex) {
    return dataSet[method](this.xTag) as T;
  };
}

export const stringDataset = bindFromDataset<string>('string');
export const floatStringDataset = bindFromDataset<number>('floatString');
export const floatStringsDataset = function (dataSet) {
  return getNumberValues(dataSet, this.xTag, 0);
};

export function singleMetadata(metadata, index = 0) {
  const value = metadata[this.tag];
  return value?.Value?.[index];
}

export function arrayMetadata(metadata, index = 0) {
  const value = metadata[this.tag];
  return value?.Value;
}

export function numberMetadata(metadata, index = 0) {
  return toNumber(this.singleMetadata(metadata, index));
}

export function singleNatural<T>(metadata) {
  const value = metadata[this.lowerName];
  return (Array.isArray(value) ? value[index] : value) as T;
}

export function arrayNatural<T>(natural) {
  const value = natural[this.lowerName];
  if (Array.isArray(value) || value === null || value === undefined) {
    return value;
  }
  return [value];
}

export function numberNatural(metadata, index = 0) {
  return toNumber(this.singleMetadata(metadata, index));
}

export const TagsAny: Record<string, ITag<unknown>> = {};

function createModules(tagValue: ITag<unknown>) {
  if (!tagValue.modules) {
    return;
  }
  for (const module of tagValue.modules) {
    Modules[module] ||= new Module(module);
    Modules[module].addTag(tagValue);
  }
}
const newVrType = (fromDataset, options?) => {
  // const postProcess = options?.postProcess;
  const isArray = options?.array !== true;
  let fromMetadata = isArray ? arrayMetadata : singleMetadata;
  const fromNatural = isArray ? arrayNatural : singleNatural;
  return (name, tag, ...modules) => {
    const tagValue = {
      fromDataset,
      fromMetadata,
      fromNatural,
      tag,
      xTag: `x${tag}`,
      lowerName: tagToCamel(name),
      name,
      modules,
    };
    TagsAny[name] = tagValue;
    createModules(tagValue);
    return tagValue;
  };
};
const vrString = newVrType(stringDataset);

const vrFloatString = newVrType(floatStringDataset);
const vrFloatsString = newVrType(floatStringsDataset, {
  array: true,
});

export const vrUI = vrString;
export const vrCS = vrString;
export const vrDS = vrFloatString;
export const vrDSs = vrFloatsString;
