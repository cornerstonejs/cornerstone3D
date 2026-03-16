import {
  utilities,
  Enums,
  RenderingEngine,
  type Types,
} from '@cornerstonejs/core';
import viewportTypeToViewportClass from '../../../packages/core/src/RenderingEngine/helpers/viewportTypeToViewportClass';
import WSIViewportV2 from '../../../packages/core/src/RenderingEngine/ViewportV2/WSI/WSIViewportV2';

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

const V2_REMAPS: Record<string, Partial<Record<Enums.ViewportType, Enums.ViewportType>>> = {
  next: {
    [Enums.ViewportType.STACK]: Enums.ViewportType.PLANAR_V2,
    [Enums.ViewportType.ORTHOGRAPHIC]: Enums.ViewportType.PLANAR_V2,
    [Enums.ViewportType.VIDEO]: Enums.ViewportType.VIDEO_V2,
    [Enums.ViewportType.WHOLE_SLIDE]: Enums.ViewportType.WHOLE_SLIDE,
    [Enums.ViewportType.ECG]: Enums.ViewportType.ECG_V2,
  },
  video: {
    [Enums.ViewportType.VIDEO]: Enums.ViewportType.VIDEO_V2,
  },
  wsi: {
    [Enums.ViewportType.WHOLE_SLIDE]: Enums.ViewportType.WHOLE_SLIDE,
  },
  ecg: {
    [Enums.ViewportType.ECG]: Enums.ViewportType.ECG_V2,
  },
};

function remapViewportType(
  input: Types.PublicViewportInput,
  remap: Partial<Record<Enums.ViewportType, Enums.ViewportType>>
): Types.PublicViewportInput {
  const replacement = remap[input.type];
  if (replacement) {
    console.log(
      `[exampleParameters] Remapping viewport "${input.viewportId}" type: ${input.type} -> ${replacement}`
    );
    return { ...input, type: replacement };
  }
  return input;
}

/**
 * Installs a transparent interceptor on RenderingEngine so that
 * `?type=<key>` in the URL rewrites legacy viewport types to their V2
 * equivalents without touching any individual example.
 *
 * Supported values: next (all supported), video, wsi, ecg
 */
export function applyViewportTypeOverride(): void {
  const typeParam = getUrlParam('type');

  if (!typeParam) {
    return;
  }

  const remap = V2_REMAPS[typeParam];

  if (!remap) {
    console.log(
      `[exampleParameters] Unknown type param "${typeParam}", expected: ${Object.keys(V2_REMAPS).join(', ')}`
    );
    return;
  }

  console.log(
    `[exampleParameters] Viewport type override active: ?type=${typeParam}`,
    remap
  );

  if (typeParam === 'next' || typeParam === 'wsi') {
    viewportTypeToViewportClass[Enums.ViewportType.WHOLE_SLIDE] =
      WSIViewportV2 as unknown as typeof viewportTypeToViewportClass[Enums.ViewportType.WHOLE_SLIDE];
  }

  const origEnable = RenderingEngine.prototype.enableElement;
  RenderingEngine.prototype.enableElement = function (
    input: Types.PublicViewportInput
  ) {
    return origEnable.call(this, remapViewportType(input, remap));
  };

  const origSetViewports = RenderingEngine.prototype.setViewports;
  RenderingEngine.prototype.setViewports = function (
    inputs: Types.PublicViewportInput[]
  ) {
    return origSetViewports.call(
      this,
      inputs.map((i) => remapViewportType(i, remap))
    );
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
