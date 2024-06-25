const importedInstances = new Map<string, any>();

export type BrowserImportOptions = {
  /** The URL path to import this module */
  importPath: string;
  /** A globalThis name to fetch for the imported data */
  globalName?: string;
  /** An import name on the imported instance to fetch */
  importName?: string;
  /**
   * For the default imported value, this provides an already imported instance.
   * This can be used to package in existing binaries if needed.
   */
  imported?;
};

const defaultImportOptionsMap = new Map<string, BrowserImportOptions>();

const MISSING_IMPORT: BrowserImportOptions = { importPath: null };

/**
 * Performs a browser import using the browserImportFunction that is just
 * a straight map to import in the browser, without webpack bugs being applied to it.
 */
export async function browserImport(
  moduleId: string,
  options: BrowserImportOptions = MISSING_IMPORT
) {
  let imported = options?.imported || importedInstances.get(moduleId);
  const defaultOptions =
    defaultImportOptionsMap.get(moduleId) || MISSING_IMPORT;
  if (!imported) {
    const importPath = options.importPath || defaultOptions.importPath;
    if (!importPath) {
      throw new Error(`Can't find import path for ${moduleId}`);
    }
    imported = await (window as any).browserImportFunction(importPath);
    importedInstances.set(moduleId, imported);
  }
  const importName = options?.importName ?? defaultOptions.importName;
  if (importName) {
    return imported[importName];
  }

  const globalName = options?.globalName ?? defaultOptions.globalName;
  if (globalName) {
    return window[globalName];
  }

  return imported;
}

/** Sets import options for later use */
export function setDefaultBrowserImportOptions(
  moduleId: string,
  options: BrowserImportOptions
) {
  defaultImportOptionsMap.set(moduleId, options);
  if (options.imported) {
    importedInstances.set(moduleId, options.imported);
  }
}
