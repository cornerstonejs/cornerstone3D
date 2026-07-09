import { utilities } from '@cornerstonejs/core';

type DemoConfig = {
  core?: {
    rendering?: {
      useCPURendering?: boolean;
      planar?: {
        renderBackend?: 'auto' | 'gpu' | 'cpu';
      };
      useGenericViewport?: boolean;
    };
  };
};

type DemoWindow = Window & {
  __DEMO_USE_GENERIC_VIEWPORT__?: boolean;
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

function getGlobalGenericViewportOverride(): boolean {
  return Boolean((window as DemoWindow).__DEMO_USE_GENERIC_VIEWPORT__);
}

function getGenericViewportOverrideActive(): boolean {
  return getGlobalGenericViewportOverride() || getUrlParam('type') === 'next';
}

/**
 * Reads the GenericViewport override from either `?type=next` or a dedicated
 * example global and merges `useGenericViewport: true` into the demo config so
 * that the RenderingEngine automatically remaps legacy viewport types to their
 * V2 equivalents.
 */
export function applyViewportTypeOverride(config: DemoConfig = {}): DemoConfig {
  if (getGenericViewportOverrideActive()) {
    console.log('[exampleParameters] GenericViewport override active');
    return utilities.deepMerge(config, {
      core: {
        rendering: {
          useGenericViewport: true,
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
        // useCPURendering forces the legacy viewports; the planar
        // renderBackend pin covers GenericViewport-based viewports (both
        // image and volume paths), so no threshold overrides are needed.
        useCPURendering: true,
        planar: {
          renderBackend: 'cpu',
        },
      },
    },
  });
}
