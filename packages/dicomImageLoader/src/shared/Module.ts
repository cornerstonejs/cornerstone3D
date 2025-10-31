import type { ITag, IModule, IModules } from '../types/TagTypes';
import { tagToCamel } from './tagCase';
import {
  stringDataset,
  floatStringDataset,
  floatStringsDataset,
  doubleDataset,
  uint16Dataset,
  int32Dataset,
  datasetSQ,
} from './datasetHelper';
import {
  arrayNatural,
  arrayMetadata,
  singleMetadata,
  singleNatural,
  sqNatural,
  sqMetadata,
} from './metadataHelper';

export class Module<T> implements IModule<T> {
  name: string;
  tags = new Array<ITag<unknown>>();

  public static OPTION_NATURAL_NAME = { keyName: 'name' };
  public static OPTION_MODULE_NAME = { keyName: 'lowerName' };

  /**
   * The modules that are registered globally are listed here.
   * Also exported as Modules for convenience below.
   */
  public static modules: IModules = {};

  constructor(name) {
    this.name = name;
  }

  /**
   * Adds a tag to the set of tags
   */
  public addTag(tagData: ITag<unknown>) {
    this.tags.push(tagData);
  }

  public fromDataset(dataset, options?) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = {};
    const keyName = options?.keyName || 'lowerName';
    for (const tag of this.tags) {
      const value = tag.fromDataset(dataset);
      if (value === undefined) {
        continue;
      }
      result[tag[keyName]] = value;
    }
    return result as T;
  }

  public fromMetadata(metadata, options?) {
    const result = {} as T;
    const keyName = options?.keyName || 'lowerName';
    for (const tag of this.tags) {
      const value = tag.fromMetadata(metadata, options);
      if (value === undefined) {
        continue;
      }
      result[tag[keyName]] = value;
    }
    return result as T;
  }

  public fromNatural(natural, options?) {
    const result = {} as T;
    const keyName = options?.keyName || 'lowerName';
    for (const tag of this.tags) {
      const value = tag.fromNatural(natural);
      if (value === undefined) {
        continue;
      }
      result[tag[keyName]] = value;
    }
    return result;
  }

  public static sqFromDataset(dataSet, options?) {
    console.warn('Parsing dataset', dataSet);
  }

  public static createModules(tagValue: ITag<unknown>) {
    if (!tagValue.modules) {
      return;
    }
    for (const module of tagValue.modules) {
      Modules[module] ||= new Module(module);
      Modules[module].addTag(tagValue);
    }
  }
  public static createSqNatural<T>(tag: ITag<unknown>, natural, options?) {
    if (options?.keyName === 'name') {
      return natural as T;
    }
    throw new Error('Unsupported');
  }

  public static createSqDataset<T>(tag: ITag<unknown>, dataSet, options?) {
    if (tag?.sqModule) {
      return Module.modules[tag.sqModule].fromDataset(dataSet, options) as T;
    }
    throw new Error('Not implemented yet');
  }

  public static createSqMetadata<T>(tag: ITag<unknown>, metadata, options?) {
    if (tag?.sqModule) {
      return Module.modules[tag.sqModule].fromMetadata(metadata, options) as T;
    }
    throw new Error('Not implemented yet');
  }
}

export const Modules = Module.modules;

export const TagsAny: Record<string, ITag<unknown>> = {};

const newVrType = (fromDataset, options?) => {
  const isArray = !!options?.array;
  const fromMetadata = isArray ? arrayMetadata : singleMetadata;
  const fromNatural = isArray ? arrayNatural : singleNatural;
  return (name, tag, ...modules) => {
    let extraOptions = null;
    let vm = isArray ? -1 : 1;
    while (modules?.length && typeof modules[0] !== 'string') {
      const [module] = modules;
      const typeModule = typeof module;
      if (typeModule === 'number') {
        vm = module;
      } else if (typeModule === 'object') {
        extraOptions = module;
      }
      modules.splice(0, 1);
    }
    const tagValue = {
      fromDataset,
      fromMetadata,
      fromNatural,
      tag,
      xTag: `x${tag.toLowerCase()}`,
      lowerName: tagToCamel(name),
      name,
      modules,
      ...options,
      vm,
      ...extraOptions,
      moduleStatic: Module,
    };
    TagsAny[name] = tagValue;
    Module.createModules(tagValue);
    return tagValue;
  };
};
const vrString = newVrType(stringDataset);

const vrFloatString = newVrType(floatStringDataset);
const vrFloatsString = newVrType(floatStringsDataset, {
  array: true,
});

export const vrUI = vrString;
export const vrLO = vrString;
export const vrCS = vrString;
export const vrDS = vrFloatString;
export const vrDSs = vrFloatsString;
export const vrFD = newVrType(doubleDataset);
export const vrUS = newVrType(uint16Dataset);
export const vrUL = newVrType(uint16Dataset);
export const vrSL = newVrType(int32Dataset);
export const vrSQs = newVrType(datasetSQ, {
  array: true,
  fromNatural: sqNatural,
  fromMetadata: sqMetadata,
});
