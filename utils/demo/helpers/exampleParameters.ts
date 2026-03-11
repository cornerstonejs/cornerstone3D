import { utilities } from '@cornerstonejs/core';

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

  return utilities.deepMerge(config, {
    core: {
      rendering: {
        planar: {
          cpuThresholds: {
            image: 0,
            volume: 0,
          },
        },
      },
    },
  });
}
