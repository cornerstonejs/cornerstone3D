import * as dicomParser from 'dicom-parser';

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

/**
 * The module class supports reading DICOM modules from various data sources
 * in a way that defines a single requirement for the source data, and generates
 * the same type of result data regardless of input.  This allows writing a single
 * module provider for the metadata provider system, which helps prevent bugs
 * when differing implementations load things in different ways.
 *
 * Currently there are three loaders:
 *  * fromDataset to load from DicomParser
 *  * fromNatural to load from dcmjs naturalized format
 *  * fromMetadata to load from standard DICOM part 18 metadata format
 *
 * The output format is always a module, although naming can be specified for
 * any of the Upper Camel Case, lower Camel Case, tag numbers or xTag numbers to
 * agree with Naturalized, metaData module, DICOM metadata or Dataset values.
 */
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

  public fromDataset(dataset: dicomParser.DataSet, options?) {
    const result: Record<string, unknown> = {};
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

  public static sqFromDataset(dataSet: dicomParser.DataSet, _options?) {
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

  public static createSqDataset<T>(
    tag: ITag<unknown>,
    dataSet: dicomParser.DataSet,
    options?
  ) {
    if (tag?.sqModule) {
      console.warn('dataSet');
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

/**
 * Creates a new VR type.
 * These are functions that register tag instances along with the reader
 * method for dataset, natural and metadata formats, along with other options
 * such as child tag names.
 */
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

/**
 * vr constructor elements to register a tag/name with the given vr information.
 * Format is vr <CODE> s?  where CODE is the 2 letter code, and s is included
 * for multiple value readers returning arrays.
 *
 * The general convention is to return an array all the time on any tag value
 * not in the vm range 0...1.
 * For sequences of vm 0...1, the returned object contains an object
 * with extra hidden attributes for an iterator, length and index 0 so that it
 * can almost be treated as an array, eg all of:
 * ```
 * module.sharedFunctionalGroupsSequence.segmentIdentificationSequence.referencedSegmentNumber
 *   === module.sharedFunctionalGroupsSequence[0].segmentIdentificationSequence[0].referencedSegmentNumber
 * and
 * module.sharedFunctionalGroupsSequence.length===1
 * module.sharedFunctionalGroupsSequence.segmentIdentificationSequence.iterator() returns an iterator containing
 *  exactly module.sharedFunctionalGroupsSequence.segmentIdentificationSequence[0]
 * ```
 */
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
