import * as metaData from '../metaData';
import dcmjs from 'dcmjs';
import {
  moduleDefinitions,
  USRegionChild,
  CLINICAL_TRIAL,
  RadiopharmaceuticalInfoModule,
} from './modules';
import type { ModuleTagEntry } from './modules';

const dicomDictionary = dcmjs.data.DicomMetaDictionary.dictionary;
const nameMap = dcmjs.data.DicomMetaDictionary.nameMap;

// Re-export custom module name constants for backward compatibility
export { USRegionChild, CLINICAL_TRIAL, RadiopharmaceuticalInfoModule };

export interface TagEntry {
  name: string;
  lowerName: string;
  xTag: string;
  vm: number;
  tag: string;
  vr: string;
  primaryGroup: string;
  groups: string[];
}

/**
 * Creates a tag entry defining module membership only.
 * VR and VM are resolved from the dcmjs dictionary in addTag().
 */
export function createTagEntry(hexTag: string, ...groups: string[]): TagEntry {
  return {
    tag: hexTag,
    groups,
    xTag: null,
    primaryGroup: null,
    name: null,
    lowerName: null,
    vr: null,
    vm: null,
  };
}

/**
 * Parses a DICOM VM string (e.g. "1", "1-n", "2") into a numeric value.
 * Returns 1 for single-valued, the exact count for fixed multi-valued,
 * or 0 for variable-length multi-valued.
 */
export function parseVm(vm: string | number | undefined): number | null {
  if (vm === undefined || vm === null) {
    return null;
  }
  if (typeof vm === 'number') {
    return vm;
  }
  const n = parseInt(vm, 10);
  // If the string is exactly a number (like "1", "2", "3"), return it
  if (String(n) === vm) {
    return n;
  }
  // Otherwise it's a range like "1-n", "2-n", "1-3" → multi-valued
  return 0;
}

/**
 * Looks up a tag in the dcmjs dictionary by hex string (e.g. "00080005").
 * Returns { name, vr, vm } or undefined if not found.
 */
export function dictionaryLookup(
  hexTag: string
): { name: string; vr: string; vm: string } | undefined {
  return dicomDictionary[hexTag.toUpperCase()];
}

/**
 * Looks up the hex tag code for a natural tag name (e.g. "SOPInstanceUID" → "00080018").
 * Uses the mapTagInfo registry which is populated from the Tags definitions.
 */
export function getTagCodeByName(name: string): string | undefined {
  return mapTagInfo.get(name)?.tag;
}

export const mapModuleTags = new Map<string, TagEntry[]>();

export const mapTagInfo = new Map<string, TagEntry>();

/**
 * Adds a tag name/type, resolving vr/vm from the dcmjs dictionary.
 */
export function addTag(name: string, value: TagEntry) {
  if (name && value.name && name !== value.name) {
    throw new Error(
      `Tag name provided and value don't match: ${name} !== ${value.name}`
    );
  }
  value.name ||= name;
  value.lowerName ||= metaData.toLowerCamelTag(name);
  Tags[name] = value;
  const { tag: hexTag } = value;
  value.primaryGroup ||= value.groups?.[0];
  const { groups } = value;
  mapTagInfo.set(name, value);
  if (hexTag) {
    value.xTag = `x${hexTag.toLowerCase()}`;
    value.tag = hexTag.toUpperCase();
    mapTagInfo.set(value.xTag, value);
    mapTagInfo.set(value.tag, value);

    // Resolve vr/vm from dcmjs dictionary if not already set
    if (!value.vr) {
      const dictEntry = dicomDictionary[value.tag];
      if (dictEntry) {
        value.vr = dictEntry.vr;
        value.vm = parseVm(dictEntry.vm);
      }
    }
  }
  if (groups?.length) {
    for (const group of groups) {
      let moduleEntries = mapModuleTags.get(group);
      if (!moduleEntries) {
        moduleEntries = [value];
        mapModuleTags.set(group, moduleEntries);
        return;
      }
      const foundIndex = moduleEntries.findIndex((it) => it.name === name);
      if (foundIndex === -1) {
        moduleEntries.push(value);
      } else {
        moduleEntries[foundIndex] = value;
      }
    }
  }
}

/**
 * Resolves a tag keyword to its hex code using dcmjs nameMap.
 * nameMap entries have tag in "(GGGG,EEEE)" format; we unpunctuate to "GGGGEEEE".
 */
function resolveHexFromKeyword(keyword: string): string | undefined {
  const entry = nameMap[keyword];
  if (!entry) {
    return undefined;
  }
  return entry.tag.substring(1, 5) + entry.tag.substring(6, 10);
}

/**
 * The Tags object. Built at module load time from moduleDefinitions
 * and dcmjs nameMap lookups.
 */
export const Tags: Record<string, TagEntry> = {};

// Accumulate groups per keyword across all module definitions.
// Tags appearing in multiple modules get all their groups collected.
const tagGroups = new Map<string, { hex: string; groups: string[] }>();

for (const [moduleName, keywords] of moduleDefinitions) {
  for (const entry of keywords as ModuleTagEntry[]) {
    const keyword = typeof entry === 'string' ? entry : entry[0];
    const hexOverride = typeof entry === 'string' ? undefined : entry[1];
    let data = tagGroups.get(keyword);
    if (!data) {
      const hex = hexOverride ?? resolveHexFromKeyword(keyword);
      data = { hex, groups: [] };
      tagGroups.set(keyword, data);
    }
    if (moduleName !== null) {
      data.groups.push(moduleName);
    }
  }
}

// Create TagEntry objects and register them
for (const [keyword, { hex, groups }] of tagGroups) {
  if (!hex) {
    console.warn(`Tags: keyword "${keyword}" not found in dcmjs nameMap`);
    continue;
  }
  addTag(keyword, createTagEntry(hex, ...groups));
}
