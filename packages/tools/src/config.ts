interface Configuration {
  enablePolySeg: boolean;
  enableLabelmapInterpolation: boolean;
}

let config: Configuration = {
  enablePolySeg: false,
  enableLabelmapInterpolation: false,
};

export function getConfig(): Configuration {
  return config;
}

export function setConfig(newConfig: Configuration) {
  config = newConfig;
}
