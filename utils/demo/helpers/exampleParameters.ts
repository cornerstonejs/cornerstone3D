import {
  utilities,
  resetRenderingCapabilities,
  setGpuMemoryLimit,
} from '@cornerstonejs/core';

type DemoConfig = {
  core?: {
    rendering?: {
      useCPURendering?: boolean;
      planar?: {
        renderBackend?: 'auto' | 'gpu' | 'cpu';
      };
      useGenericViewport?: boolean;
      lossyDownsampling?: {
        final?: boolean;
        interactive?: boolean;
        interleavedLoading?: boolean;
      };
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

export function getGenericViewportOverrideActive(): boolean {
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

/** The bytes of each unit that `parseByteSize` reads. */
const BYTES_OF_UNIT = {
  MB: 1024 ** 2,
  GB: 1024 ** 3,
};

/**
 * Reads a size such as `512MB`, `1.5GB` or `2gb` as bytes. A number with no
 * unit counts as megabytes.
 *
 * @returns the bytes, or `undefined` when the text is not a size
 */
export function parseByteSize(text: string | null): number | undefined {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(MB|GB)?\s*$/i.exec(text ?? '');

  if (!match) {
    return undefined;
  }

  const unit = (match[2] ?? 'MB').toUpperCase() as keyof typeof BYTES_OF_UNIT;

  return Math.round(Number(match[1]) * BYTES_OF_UNIT[unit]);
}

/**
 * Applies the GPU memory parameters of an example, in this order:
 *
 * - `?gpuReset=1` clears the stored record of the device and the memory limit
 *   of the user, so the device is probed again.
 * - `?gpuMemory=512MB` sets the memory limit as the user would in a dialog
 *   (`MB` or `GB`). `?gpuMemoryHard=1` makes it a hard limit. The limit is
 *   stored, so it stays after the parameter goes, until a reset.
 *
 * Call it after `initDemo`.
 *
 * @returns what was applied, for the log of the example, or an empty list
 */
export function applyGpuMemoryUrlParameters(): string[] {
  const applied: string[] = [];

  if (getBooleanUrlParam('gpuReset')) {
    resetRenderingCapabilities({ clearStorage: true });
    applied.push(
      'gpuReset: the record of the device and the limit are cleared'
    );
  }

  const sizeText = getUrlParam('gpuMemory');

  if (sizeText === null) {
    return applied;
  }

  const bytes = parseByteSize(sizeText);
  const hard = getBooleanUrlParam('gpuMemoryHard');

  try {
    if (bytes === undefined) {
      throw new Error(`"${sizeText}" is not a size such as 512MB or 2GB`);
    }

    setGpuMemoryLimit({ bytes, hard });
    applied.push(`gpuMemory: the limit is ${sizeText}${hard ? ', hard' : ''}`);
  } catch (error) {
    applied.push(`gpuMemory: ignored, ${(error as Error).message}`);
  }

  return applied;
}
