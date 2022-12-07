/* eslint import/extensions:0 */
import registerLoaders from './imageLoader/registerLoaders';
import * as cornerstoneImport from '@cornerstonejs/core';
import * as dicomParserImport from 'dicom-parser';

let cornerstone: typeof cornerstoneImport;

let dicomParser: typeof dicomParserImport;

const external = {
  set cornerstone(cs: typeof cornerstoneImport) {
    cornerstone = cs;

    registerLoaders(cornerstone);
  },
  get cornerstone(): typeof cornerstoneImport {
    if (!cornerstone) {
      if (window && (window as any).cornerstone) {
        cornerstone = (window as any).cornerstone;

        registerLoaders(cornerstone);
      } else {
        throw new Error(
          'cornerstoneWADOImageLoader requires a copy of Cornerstone to work properly. Please add cornerstoneWADOImageLoader.external.cornerstone = cornerstone; to your application.'
        );
      }
    }

    return cornerstone;
  },
  set dicomParser(dp: typeof dicomParserImport) {
    dicomParser = dp;
  },
  get dicomParser(): typeof dicomParserImport {
    if (!dicomParser) {
      if (window && (window as any).dicomParser) {
        dicomParser = (window as any).dicomParser;
      } else {
        throw new Error(
          'cornerstoneWADOImageLoader requires a copy of dicomParser to work properly. Please add cornerstoneWADOImageLoader.external.dicomParser = dicomParser; to your application.'
        );
      }
    }

    return dicomParser;
  },
};

export default external;
