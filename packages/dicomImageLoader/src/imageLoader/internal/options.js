let options = {
  // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
  beforeSend: function (xhr) {
  },
  // callback allowing modification of newly created image objects
  imageCreated : function(image) {
  }
};

export function setOptions(newOptions) {
  options = newOptions;
}

export function getOptions() {
  return options;
}
