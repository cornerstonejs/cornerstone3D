type ConfigurationType = {
  autoRenderOnLoad?: boolean;
  autoRenderPercentage?: number;
};

const configuration = {
  autoRenderOnLoad: true,
  autoRenderPercentage: 2,
};

const configurationInterface = {
  get: (): ConfigurationType => {
    return JSON.parse(JSON.stringify(configuration));
  },
  set: (newConfiguration: ConfigurationType) => {
    Object.assign(configuration, newConfiguration);
  },
};

export default configurationInterface;
