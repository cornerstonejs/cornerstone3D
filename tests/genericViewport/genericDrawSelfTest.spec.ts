import { expect, test, type Page } from '@playwright/test';
import { createExampleUrl } from '../utils/index';

const EXAMPLE = 'genericDrawSelfTest';
const STORAGE_KEY = 'cornerstone3D.renderingCapabilities';
const PROBE_VERSION = 2;
const MAX_GREY_ERROR = 1;
const RUN_TIMEOUT_MS = 60000;
const DATA_TYPES = ['Int16', 'Uint16', 'Float32'];

type FormatFlags = {
  norm16: boolean;
  norm16Linear: boolean;
  float: boolean;
  floatLinear: boolean;
  halfFloat: boolean;
  halfFloatLinear: boolean;
};

type SelfTestResult = {
  passed: boolean;
  durationMs: number;
  probeDurationMs: number;
  norm16Hidden: boolean;
  capabilities: FormatFlags & { renderer: string };
  probe: {
    formats: FormatFlags;
    probes: Array<{
      internalFormat: string;
      filter: string;
      available: boolean;
      passed: boolean;
      maxError: number;
      failedSamples: number;
      sampleCount: number;
    }>;
  } | null;
  cases: Array<{
    dataType: string;
    passed: boolean;
    textureFormat: string;
    filter: string;
    note?: string;
    formatUsable: boolean;
    maxError: number;
    pixelsOff: number;
    pixelsChecked: number;
    draws: Array<{
      name: string;
      textureFormat: string;
      filter: string;
      pixelsOff: number;
    }>;
    error?: string;
  }>;
  error?: string;
};

/** Opens the example and waits until the tests that run on load are done. */
async function openAndWait(page: Page): Promise<SelfTestResult> {
  await page.goto(createExampleUrl(EXAMPLE + '.html').toString());
  await page.waitForFunction(
    () => document.body.dataset.drawSelfTest === 'done',
    undefined,
    { timeout: RUN_TIMEOUT_MS }
  );

  return page.evaluate(
    () =>
      (window as unknown as { drawSelfTestResult: SelfTestResult })
        .drawSelfTestResult
  );
}

/**
 * The texture probe of cornerstone 5.18 (before value checks): one point from
 * a 5 x 1 texture, read as 8-bit RGBA, passes when the pixel is a grey that
 * is not black. Used to check that the new probe keeps every pass of it.
 */
function runPreviousProbe(): FormatFlags | null {
  const canvas = document.createElement('canvas');

  canvas.width = 4;
  canvas.height = 4;

  const gl = canvas.getContext('webgl2');

  if (!gl) {
    return null;
  }

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    return shader;
  };
  const program = gl.createProgram();

  gl.attachShader(
    program,
    compile(
      gl.VERTEX_SHADER,
      `#version 300 es
      void main() { gl_PointSize = 4.0; gl_Position = vec4(0, 0, 0, 1); }`
    )
  );
  gl.attachShader(
    program,
    compile(
      gl.FRAGMENT_SHADER,
      `#version 300 es
      precision highp float;
      uniform sampler2D u_image;
      out vec4 color;
      void main() {
        vec4 v = texture(u_image, gl_PointCoord.xy);
        color = vec4(vec3(v.rrr), 1);
      }`
    )
  );
  gl.linkProgram(program);
  gl.useProgram(program);

  const probe = (
    extensionName: string | undefined,
    linear: boolean,
    data: ArrayBufferView,
    internalFormat: (extension) => number,
    type: number
  ) => {
    const extension = extensionName ? gl.getExtension(extensionName) : null;

    if (extensionName && !extension) {
      return false;
    }

    const texture = gl.createTexture();
    const filter = linear ? gl.LINEAR : gl.NEAREST;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat(extension),
      5,
      1,
      0,
      gl.RED,
      type,
      data
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, 1);

    const pixel = new Uint8Array(4);

    gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    gl.deleteTexture(texture);

    return pixel[0] === pixel[1] && pixel[1] === pixel[2] && pixel[0] !== 0;
  };
  const norm16 = new Int16Array([
    32767, 2000, 3000, 4000, 5000, 16784, 7000, 8000, 9000, 32767,
  ]);
  const float = new Float32Array([0.3, 0.2, 0.3, 0.4, 0.5]);
  const half = new Uint16Array([13517, 12902, 13517, 13926, 14336]);
  const result = {
    norm16: probe(
      'EXT_texture_norm16',
      false,
      norm16,
      (e) => e.R16_SNORM_EXT,
      gl.SHORT
    ),
    norm16Linear: probe(
      'EXT_texture_norm16',
      true,
      norm16,
      (e) => e.R16_SNORM_EXT,
      gl.SHORT
    ),
    float: probe(undefined, false, float, () => gl.R32F, gl.FLOAT),
    floatLinear: probe(
      'OES_texture_float_linear',
      true,
      float,
      () => gl.R32F,
      gl.FLOAT
    ),
    halfFloat: probe(undefined, false, half, () => gl.R16F, gl.HALF_FLOAT),
    halfFloatLinear: probe(undefined, true, half, () => gl.R16F, gl.HALF_FLOAT),
  };

  gl.getExtension('WEBGL_lose_context')?.loseContext();

  return result;
}

/** Stores a capability profile for the next load of the page. */
async function storeProfile(
  page: Page,
  renderer: string,
  formats: FormatFlags
): Promise<void> {
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, value),
    {
      key: STORAGE_KEY,
      value: JSON.stringify({
        probeVersion: PROBE_VERSION,
        renderer,
        formats,
      }),
    }
  );
}

/** Checks that every data type drew within one grey level. */
function expectDrawsPass(result: SelfTestResult): void {
  expect(result.error).toBeUndefined();
  expect(result.cases.map((testCase) => testCase.dataType)).toEqual(DATA_TYPES);

  result.cases.forEach((testCase) => {
    expect(testCase.error, testCase.dataType).toBeUndefined();
    expect(testCase.pixelsOff, testCase.dataType).toBe(0);
    expect(testCase.maxError, testCase.dataType).toBeLessThanOrEqual(
      MAX_GREY_ERROR
    );
    expect(testCase.passed, testCase.dataType).toBe(true);
  });
  expect(result.passed).toBe(true);
}

test.describe('Draw self-test', () => {
  test('the value probe keeps every pass of the previous probe and the draws read back right', async ({
    page,
  }) => {
    const result = await openAndWait(page);
    const previous = await page.evaluate(runPreviousProbe);

    console.log(
      'draw self-test:',
      JSON.stringify(
        {
          renderer: result.capabilities.renderer,
          previousProbe: previous,
          probe: result.probe,
          cases: result.cases.map(
            ({
              dataType,
              textureFormat,
              maxError,
              pixelsOff,
              pixelsChecked,
            }) => ({
              dataType,
              textureFormat,
              maxError,
              pixelsOff,
              pixelsChecked,
            })
          ),
          durationMs: result.durationMs,
          probeDurationMs: result.probeDurationMs,
        },
        null,
        1
      )
    );

    expect(previous).not.toBeNull();
    expect(result.probe).not.toBeNull();

    Object.entries(previous).forEach(([flag, passed]) => {
      if (passed) {
        expect(result.probe.formats[flag], flag).toBe(true);
        expect(result.capabilities[flag], flag).toBe(true);
      }
    });

    expect(result.norm16Hidden).toBe(
      !(result.capabilities.norm16 && result.capabilities.norm16Linear)
    );
    expectDrawsPass(result);
    await expect(page.locator('#status')).toHaveText(/^PASS/);
  });

  test('a profile without norm16 keeps norm16 out of the image mapper', async ({
    page,
  }) => {
    const first = await openAndWait(page);
    const formats = {
      ...first.probe.formats,
      norm16: false,
      norm16Linear: false,
    };

    await page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, value),
      {
        key: STORAGE_KEY,
        value: JSON.stringify({
          probeVersion: PROBE_VERSION,
          renderer: first.capabilities.renderer,
          formats,
        }),
      }
    );

    const result = await openAndWait(page);

    console.log(
      'draw self-test without norm16:',
      JSON.stringify(
        result.cases.map(({ dataType, textureFormat, maxError }) => ({
          dataType,
          textureFormat,
          maxError,
        }))
      )
    );

    expect(result.capabilities.norm16).toBe(false);
    expect(result.norm16Hidden).toBe(true);
    result.cases.forEach((testCase) => {
      expect(['R16_SNORM', 'R16']).not.toContain(testCase.textureFormat);
    });

    if (formats.floatLinear) {
      expectDrawsPass(result);
    }

    await page.evaluate(
      (key) => window.localStorage.removeItem(key),
      STORAGE_KEY
    );
  });

  test('a profile without float linear filtering draws Float32 with right values, not smoothed', async ({
    page,
  }) => {
    const first = await openAndWait(page);

    await storeProfile(page, first.capabilities.renderer, {
      ...first.probe.formats,
      floatLinear: false,
    });

    const result = await openAndWait(page);
    const float32 = result.cases.find(
      (testCase) => testCase.dataType === 'Float32'
    );

    console.log(
      'draw self-test without float linear filtering:',
      JSON.stringify(
        result.cases.map(({ dataType, textureFormat, filter, draws }) => ({
          dataType,
          textureFormat,
          filter,
          draws: draws.map((draw) => [
            draw.name,
            draw.textureFormat,
            draw.filter,
            draw.pixelsOff,
          ]),
        }))
      )
    );

    expect(result.capabilities.floatLinear).toBe(false);
    expect(float32.textureFormat).toBe('R32F');
    expect(float32.filter).toBe('nearest');
    expect(float32.formatUsable).toBe(true);
    expect(float32.note).toBe(
      'right values, not smoothed on this device, because it cannot filter float textures'
    );
    expect(
      float32.draws.filter((draw) => draw.textureFormat === 'R32F').length
    ).toBeGreaterThan(0);
    float32.draws
      .filter((draw) => draw.textureFormat === 'R32F')
      .forEach((draw) => expect(draw.filter, draw.name).toBe('nearest'));
    float32.draws
      .filter((draw) => draw.textureFormat === 'R16F')
      .forEach((draw) => expect(draw.filter, draw.name).toBe('linear'));
    expectDrawsPass(result);
    await expect(page.locator('#status')).toHaveText(/^PASS/);
    await expect(page.locator('#results')).toContainText(
      'Float32: right values, not smoothed on this device, because it cannot filter float textures'
    );

    await page.evaluate(
      (key) => window.localStorage.removeItem(key),
      STORAGE_KEY
    );
  });
});
