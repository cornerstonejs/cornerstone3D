import { addTypedProvider, type TypedProvider } from '../../metaData';
import { mapModuleTags } from '../Tags';
import { dataLookup, INSTANCE_PRIORITY, instanceLookup } from './dataLookup';
import { makeArrayLike } from './makeArrayLike';

const mapModules = new Map<string, TypedProvider>();

export function tagModules(module: string, dataLookupName = 'instance') {
  if (!mapModuleTags.has(module)) {
    throw new Error(`No module found: ${module}`);
  }
  if (mapModules.has(module)) {
    return;
  }

  if (dataLookupName === 'instance') {
    addTypedProvider(module, instanceLookup, { priority: 25_000 });
  } else if (dataLookupName) {
    addTypedProvider(module, dataLookup(dataLookupName), { priority: 25_000 });
  }

  const moduleProvider = (next, query, data, options) => {
    const keys = mapModuleTags.get(module);
    const destName = options?.destName || 'lowerName';
    if (!data) {
      return next(query, data, options);
    }

    const result = {};
    for (const key of keys) {
      let value = data[key.name];
      if (value !== undefined) {
        if (mapModules.has(key.name)) {
          console.warn('Getting nested module', key.name);
          const newValue = [];
          for (const entry of value) {
            if (!entry) {
              continue;
            }
            newValue.push(
              mapModules.get(key.name)(null, query, entry, options?.[key.name])
            );
          }
          value = newValue.length === 1 ? makeArrayLike(newValue[0]) : newValue;
        }
        result[key[destName]] = value;
      }
    }
    return result;
  };

  mapModules.set(module, moduleProvider);

  return moduleProvider;
}

export const MODULE_PRIORITY = { priority: -1_000 };

for (const module of mapModuleTags.keys()) {
  addTypedProvider(module, tagModules(module), MODULE_PRIORITY);
  addTypedProvider(module, instanceLookup, INSTANCE_PRIORITY);
}
