let options = {
  // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
  beforeSend (/* xhr, imageId */) {
  },
  // callback allowing modification of newly created image objects
  imageCreated (/* image */) {
  },
  strict: false
};

export function setOptions (newOptions) {
  options = newOptions;
}

export function getOptions () {
  return options;
}
