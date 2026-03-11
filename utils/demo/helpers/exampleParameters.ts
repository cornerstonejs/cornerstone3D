type DemoConfig = {
  core?: {
    rendering?: {
      planar?: {
        cpuThresholds?: {
          image?: number;
          volume?: number;
        };
      };
    };
  };
};

export function getBooleanUrlParam(name: string): boolean {
  const searchParams = new URLSearchParams(window.location.search);
  const value = searchParams.get(name);

  return value === 'true' || value === '1';
}

export function applyUrlParameterOverridesToDemoConfig(
  config: DemoConfig = {}
): DemoConfig {
  if (!getBooleanUrlParam('cpu')) {
    return config;
  }

  return {
    ...config,
    core: {
      ...config.core,
      rendering: {
        ...config.core?.rendering,
        planar: {
          ...config.core?.rendering?.planar,
          cpuThresholds: {
            ...config.core?.rendering?.planar?.cpuThresholds,
            image: 0,
            volume: 0,
          },
        },
      },
    },
  };
}
