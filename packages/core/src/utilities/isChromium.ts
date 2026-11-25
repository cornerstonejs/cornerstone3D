/**
 * True for a Chromium browser (Chrome, Edge, Opera and the like). Chromium
 * reports a GPU out of memory as a context loss, waits in `getError()` for its
 * GPU process, and blocks WebGL for a site after repeated context losses.
 * Chrome on iOS uses WebKit, so it is not Chromium here.
 */
export default function isChromium(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const brands = (
    navigator as Navigator & {
      userAgentData?: { brands?: { brand: string }[] };
    }
  ).userAgentData?.brands;

  if (brands?.length) {
    return brands.some(({ brand }) => /chromium/i.test(brand));
  }

  return (
    /\b(Chrome|Chromium)\//.test(navigator.userAgent) &&
    !/\bCriOS\//.test(navigator.userAgent)
  );
}
