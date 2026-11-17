import { utilities } from '@cornerstonejs/core';

type DemoConfig = {
  core?: {
    rendering?: {
      useCPURendering?: boolean;
      planar?: {
        renderBackend?: 'auto' | 'gpu' | 'cpu';
        sliceFirst?: boolean;
      };
      lossyDownsampling?: {
        final?: boolean;
        interactive?: boolean;
        interleavedLoading?: boolean;
      };
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

export function getStringUrlParam(name: string): string | null {
  return getUrlParam(name);
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

/**
 * Reads `?finalDownsampling=true|false`, which turns final downsampling on or
 * off. Without the parameter, the example keeps its own value, and an example
 * that states none keeps the Cornerstone3D default, which is off.
 */
export function applyLossyDownsamplingOverride(
  config: DemoConfig = {}
): DemoConfig {
  const value = getUrlParam('finalDownsampling');

  if (value === null) {
    return config;
  }

  return utilities.deepMerge(config, {
    core: {
      rendering: {
        lossyDownsampling: { final: value === 'true' || value === '1' },
      },
    },
  });
}

/**
 * Reads `?sliceFirst=1|true|0|false`, which turns slice first on or off for
 * planar next viewports. Without the parameter, the example keeps its own
 * value, and an example that states none keeps the Cornerstone3D default,
 * which is off.
 */
export function applySliceFirstOverride(config: DemoConfig = {}): DemoConfig {
  const value = getUrlParam('sliceFirst');

  if (value === null) {
    return config;
  }

  return utilities.deepMerge(config, {
    core: {
      rendering: {
        planar: { sliceFirst: value === 'true' || value === '1' },
      },
    },
  });
}
