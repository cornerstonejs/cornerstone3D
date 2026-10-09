import { decodeMultipartRelated } from '../src/utilities/decodeMultipartRelated';
import { buildEcgModuleFromInstance } from '../src/utilities/metadataProvider/ecgFromInstance';

const encoder = new TextEncoder();

// Two channels, two samples, interleaved: ch0=[1, -2], ch1=[3, 4].
const SAMPLES = new Int16Array([1, 3, -2, 4]);

function samplesBuffer() {
  return SAMPLES.buffer.slice(0);
}

function multipart(boundary, payload) {
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const out = new Uint8Array(head.length + payload.byteLength + tail.length);
  out.set(head, 0);
  out.set(new Uint8Array(payload), head.length);
  out.set(tail, head.length + payload.byteLength);
  return out.buffer;
}

function makeInstance(WaveformData) {
  return {
    WaveformSequence: [
      {
        NumberOfWaveformChannels: 2,
        NumberOfWaveformSamples: 2,
        SamplingFrequency: 500,
        WaveformBitsAllocated: 16,
        WaveformSampleInterpretation: 'SS',
        ChannelDefinitionSequence: [{}, {}],
        WaveformData,
      },
    ],
  };
}

function channelsOf(channels) {
  return channels.map((channel) => Array.from(channel));
}

describe('decodeMultipartRelated', () => {
  it('returns the part body with the boundary from Content-Type', () => {
    const [part] = decodeMultipartRelated(
      multipart('abc', samplesBuffer()),
      'multipart/related; type="application/octet-stream"; boundary=abc'
    );

    expect(Array.from(new Int16Array(part))).toEqual(Array.from(SAMPLES));
  });

  it('reads the boundary from the body when Content-Type has none', () => {
    const [part] = decodeMultipartRelated(
      multipart('BOUNDARY_6e2d', samplesBuffer()),
      'multipart/related'
    );

    expect(Array.from(new Int16Array(part))).toEqual(Array.from(SAMPLES));
  });

  it('returns a single-part body unchanged', () => {
    const body = samplesBuffer();

    expect(decodeMultipartRelated(body, 'application/octet-stream')).toEqual([
      body,
    ]);
  });
});

describe('buildEcgModuleFromInstance bulkdata', () => {
  afterEach(() => {
    delete global.fetch;
  });

  it('decodes a multipart BulkDataURI response and sends the auth headers', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'multipart/related' },
      arrayBuffer: async () => multipart('b1', samplesBuffer()),
    });
    const module = buildEcgModuleFromInstance(
      makeInstance({ BulkDataURI: 'https://example.org/bulk/1' }),
      undefined,
      { getHeaders: () => ({ Authorization: 'Bearer t' }) }
    );

    const channels = await module.waveformData.retrieveBulkData();

    expect(channelsOf(channels)).toEqual([
      [1, -2],
      [3, 4],
    ]);
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer t'
    );
  });

  it('decodes the ArrayBuffer that a data source retrieveBulkData returns', async () => {
    const module = buildEcgModuleFromInstance(
      makeInstance({
        BulkDataURI: 'https://example.org/bulk/1',
        retrieveBulkData: async () => samplesBuffer(),
      })
    );

    const channels = await module.waveformData.retrieveBulkData();

    expect(channelsOf(channels)).toEqual([
      [1, -2],
      [3, 4],
    ]);
  });
});
