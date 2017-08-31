let options = {
  // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
  beforeSend (/* xhr */) {
  },
  // callback allowing modification of newly created image objects
  imageCreated (/* image */) {
  },
  strict: true
};

export function setOptions (newOptions) {
  options = newOptions;
}

export function getOptions () {
  return options;
}
