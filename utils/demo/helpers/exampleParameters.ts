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
      useViewportNext?: boolean;
    };
  };
};

type DemoWindow = Window & {
  __DEMO_USE_VIEWPORT_NEXT__?: boolean;
};

function getUrlParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function getBooleanUrlParam(name: string): boolean {
  const value = getUrlParam(name);
  return value === 'true' || value === '1';
}

export function getStringUrlParam(name: string): string | null {
  return getUrlParam(name);
}

function getGlobalViewportNextOverride(): boolean {
  return Boolean((window as DemoWindow).__DEMO_USE_VIEWPORT_NEXT__);
}

function getViewportNextOverrideActive(): boolean {
  return getGlobalViewportNextOverride() || getUrlParam('type') === 'next';
}

/**
 * Reads the ViewportNext override from either `?type=next` or a dedicated
 * example global and merges `useViewportNext: true` into the demo config so
 * that the RenderingEngine automatically remaps legacy viewport types to their
 * V2 equivalents.
 */
export function applyViewportTypeOverride(config: DemoConfig = {}): DemoConfig {
  if (getViewportNextOverrideActive()) {
    console.log('[exampleParameters] ViewportNext override active');
    return utilities.deepMerge(config, {
      core: {
        rendering: {
          useViewportNext: true,
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
