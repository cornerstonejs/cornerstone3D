/* eslint import/extensions:0 */

let cornerstone;
let dicomParser;

const external = {
  set cornerstone(cs) {
    cornerstone = cs;
  },
  get cornerstone() {
    if (!cornerstone) {
      cornerstone = window && (window as any).cornerstone;

      if (!cornerstone) {
        throw new Error(
          'cornerstoneDICOMImageLoader requires a copy of Cornerstone to work properly. Please add cornerstoneDICOMImageLoader.external.cornerstone = cornerstone; to your application.'
        );
      }
    }

    return cornerstone;
  },
  set dicomParser(dp) {
    dicomParser = dp;
  },
  get dicomParser() {
    if (!dicomParser) {
      if (window && (window as any).dicomParser) {
        dicomParser = (window as any).dicomParser;
      } else {
        throw new Error(
          'cornerstoneDICOMImageLoader requires a copy of dicomParser to work properly. Please add cornerstoneDICOMImageLoader.external.dicomParser = dicomParser; to your application.'
        );
      }
    }

    return dicomParser;
  },
};

export default external;
