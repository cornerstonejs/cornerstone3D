import {
  utilities,
  Enums,
  RenderingEngine,
  type Types,
} from '@cornerstonejs/core';

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

function getUrlParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function getBooleanUrlParam(name: string): boolean {
  const value = getUrlParam(name);
  return value === 'true' || value === '1';
}

const VIEWPORT_TYPE_REMAP: Partial<
  Record<Enums.ViewportType, Enums.ViewportType>
> = {
  [Enums.ViewportType.STACK]: Enums.ViewportType.PLANAR_V2,
  [Enums.ViewportType.ORTHOGRAPHIC]: Enums.ViewportType.PLANAR_V2,
};

function remapViewportType(
  input: Types.PublicViewportInput
): Types.PublicViewportInput {
  const replacement = VIEWPORT_TYPE_REMAP[input.type];
  if (replacement) {
    return { ...input, type: replacement };
  }
  return input;
}

/**
 * Installs a transparent interceptor on RenderingEngine so that
 * `?type=planar` in the URL rewrites STACK / ORTHOGRAPHIC to PLANAR_V2
 * without touching any individual example.
 */
export function applyViewportTypeOverride(): void {
  if (getUrlParam('type') !== 'planar') {
    return;
  }

  const origEnable = RenderingEngine.prototype.enableElement;
  RenderingEngine.prototype.enableElement = function (
    input: Types.PublicViewportInput
  ) {
    return origEnable.call(this, remapViewportType(input));
  };

  const origSetViewports = RenderingEngine.prototype.setViewports;
  RenderingEngine.prototype.setViewports = function (
    inputs: Types.PublicViewportInput[]
  ) {
    return origSetViewports.call(this, inputs.map(remapViewportType));
  };
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
