import { utilities } from '@cornerstonejs/core';

type DemoConfig = {
  core?: {
    rendering?: {
      useCPURendering?: boolean;
      planar?: {
        cpuThresholds?: {
          image?: number;
          volume?: number;
        };
      };
      useViewportV2?: boolean;
    };
  };
};

function getUrlParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function getBooleanUrlParam(name: string): boolean {
  const value = getUrlParam(name);
  return value === 'true' || value === '1';
}

/**
 * Reads `?type=next` from the URL and merges `useViewportV2: true` into the
 * demo config so that the RenderingEngine automatically remaps legacy viewport
 * types to their V2 equivalents.
 */
export function applyViewportTypeOverride(config: DemoConfig = {}): DemoConfig {
  const typeParam = getUrlParam('type');

  if (typeParam === 'next') {
    console.log('[exampleParameters] Viewport V2 override active: ?type=next');
    return utilities.deepMerge(config, {
      core: {
        rendering: {
          useViewportV2: true,
        },
      },
    });
  }

  return config;
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
        useCPURendering: true,
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
