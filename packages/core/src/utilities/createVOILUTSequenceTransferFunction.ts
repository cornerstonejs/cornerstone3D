import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import type { CPUFallbackLUT, VOIRange } from '../types';

// VTK.js builds its own sampled table from the nodes we hand it, so there is
// nothing to gain from emitting a node per entry of a 16k or 64k entry LUT.
// Matches the sampled sigmoid's node count: humans perceive no more than ~900
// shades of gray (doi: 10.1007/s10278-006-1052-3), and every node costs on each
// rebuild, which a window level drag triggers on every mouse move.
const DEFAULT_MAX_NODES = 1024;

// How far a skipped entry may sit from the line drawn through the entries that
// were kept, as a fraction of the output range, before nodes are added to
// reproduce it. 1/512 is half a step of the 8 bit display path, so anything
// under it cannot show up on screen anyway.
const TOLERANCE = 1 / 512;

/**
 * A VOI LUT Sequence item (0028,3010) that can be rendered, i.e. one that has
 * both LUT Data and a usable LUT Descriptor.
 */
type RenderableVOILUT = CPUFallbackLUT & { firstValueMapped: number };

/**
 * Returns true when the given VOI LUT Sequence item holds enough data to build
 * a transfer function from.
 */
export function isRenderableVOILUT(
  voiLUT: CPUFallbackLUT | undefined
): voiLUT is RenderableVOILUT {
  return (
    !!voiLUT &&
    !!voiLUT.lut &&
    voiLUT.lut.length > 1 &&
    Number.isFinite(voiLUT.firstValueMapped)
  );
}

/**
 * The range of input (modality LUT output) values a VOI LUT Sequence maps.
 * Values outside it clamp to the first/last entry, which is what both the DICOM
 * standard and VTK.js's clamping do.
 */
export function getVOILUTSequenceRange(voiLUT: RenderableVOILUT): VOIRange {
  return {
    lower: voiLUT.firstValueMapped,
    upper: voiLUT.firstValueMapped + voiLUT.lut.length - 1,
  };
}

/**
 * The input range to lay the curve over: the requested one, or the LUT's own
 * domain when no range was requested. A zero width range would collapse every
 * node onto one input value, so it falls back to the domain too.
 */
function resolveDomain(
  voiLUT: RenderableVOILUT,
  voiRange: VOIRange | undefined
): VOIRange {
  if (!voiRange || voiRange.upper === voiRange.lower) {
    return getVOILUTSequenceRange(voiLUT);
  }

  // Allow for a swapped range, which window level tools can produce
  return voiRange.upper > voiRange.lower
    ? voiRange
    : { lower: voiRange.upper, upper: voiRange.lower };
}

/**
 * Builds a grayscale `vtkColorTransferFunction` from a DICOM VOI LUT Sequence
 * (0028,3010).
 *
 * When a VOI LUT Sequence is present it *is* the VOI transformation, replacing
 * the window width/center and the VOI LUT Function entirely (C.11.2.1). Without
 * this the GPU path fell back to a linear window over the stored values, so
 * images that rely on their VOI LUT (typically CR, DX and MG, whose curves are
 * strongly non linear) rendered far too flat.
 *
 * The output entries are normalized the way the legacy cornerstone
 * `getVOILut.js` did: the number of significant bits is taken from the largest
 * entry rather than from LUT Descriptor's declared bit depth, because that
 * declared depth cannot be trusted in real world data.
 *
 * `voiRange` stretches the curve over a different input range than the LUT's own
 * domain, which is what keeps window level interaction working: the shape the
 * file specified is preserved and only the range it spans changes, exactly as
 * the sampled sigmoid is rebuilt from a new window. Pass the LUT's own domain
 * (see {@link getVOILUTSequenceRange}), or nothing, for an unmodified curve.
 *
 * @param voiLUT - a VOI LUT Sequence item
 * @param options.voiRange - input range to stretch the curve over
 * @param options.maxNodes - upper bound on the number of transfer function nodes
 * @returns the transfer function, or undefined when the LUT cannot be used
 */
export default function createVOILUTSequenceTransferFunction(
  voiLUT: CPUFallbackLUT,
  options: { voiRange?: VOIRange; maxNodes?: number } = {}
): vtkColorTransferFunction | undefined {
  if (!isRenderableVOILUT(voiLUT)) {
    return undefined;
  }

  const { voiRange, maxNodes = DEFAULT_MAX_NODES } = options;
  const { lut } = voiLUT;
  const length = lut.length;
  const domain = resolveDomain(voiLUT, voiRange);
  // Input value the entry at `index` maps, in the (possibly stretched) domain
  const inputAt = (index: number) =>
    domain.lower + (index / (length - 1)) * (domain.upper - domain.lower);

  let maxEntry = -Infinity;
  for (let i = 0; i < length; i++) {
    if (lut[i] > maxEntry) {
      maxEntry = lut[i];
    }
  }

  // An all zero LUT carries no curve to render
  if (maxEntry <= 0) {
    return undefined;
  }

  // Same "don't trust numBitsPerEntry" heuristic as the CPU path: derive the
  // bit depth from the data so a LUT whose entries only use part of its
  // declared depth still spans the full display range.
  const bitsPerEntry = Math.ceil(Math.log2(maxEntry + 1));
  const scale = Math.pow(2, bitsPerEntry) - 1;

  const step = Math.max(1, Math.ceil(length / maxNodes));
  const table: number[] = [];
  let lastPushed = -1;

  const pushNode = (index: number) => {
    // Entries are visited in order, and a repeated node would give VTK.js two
    // outputs for one input
    if (index <= lastPushed || index < 0 || index > length - 1) {
      return;
    }

    // Sharpness 0 gives linear interpolation between the sampled entries
    const y = Math.min(Math.max(lut[index] / scale, 0), 1);
    table.push(inputAt(index), y, y, y, 0.5, 0.0);
    lastPushed = index;
  };

  /**
   * Sampling every `step`th entry and interpolating between them assumes the
   * skipped entries lie on that line. A VOI LUT that steps rather than ramps
   * (a threshold curve, or the flat toe and shoulder of a CR/DX presentation
   * curve) breaks that assumption: the transition gets smeared across the whole
   * skipped span and lands up to `step` entries away from where the file put
   * it. So the span is checked against the line it would be drawn as, and the
   * entries on both sides of its sharpest transition are kept when it deviates.
   */
  const refineSpan = (start: number, end: number) => {
    const spread = lut[end] - lut[start];
    let worstIndex = -1;
    let worstDeviation = 0;

    for (let i = start + 1; i < end; i++) {
      const interpolated = lut[start] + (spread * (i - start)) / (end - start);
      const deviation = Math.abs(lut[i] - interpolated);

      if (deviation > worstDeviation) {
        worstDeviation = deviation;
        worstIndex = i;
      }
    }

    if (worstIndex < 0 || worstDeviation / scale <= TOLERANCE) {
      return;
    }

    // Both sides, so a step stays a step: the ramp between the kept pair is
    // then one entry wide, which is as sharp as the LUT itself is
    pushNode(worstIndex - 1);
    pushNode(worstIndex);
    pushNode(worstIndex + 1);
  };

  for (let i = 0; i < length; i += step) {
    pushNode(i);

    if (step > 1) {
      refineSpan(i, Math.min(i + step, length - 1));
    }
  }

  // Always anchor the last entry so the upper end of the LUT domain is exact
  pushNode(length - 1);

  const cfun = vtkColorTransferFunction.newInstance();

  cfun.buildFunctionFromArray(
    vtkDataArray.newInstance({
      values: table,
      numberOfComponents: 6,
    })
  );

  return cfun;
}
