import type { FidelityIssue, IImage, IImageVolume } from '../../../types';
import { asArrayFirst } from '../../../utilities/asArray';
import { normalizeVOILUTFunction } from '../../../utilities/voiLUTFunction';

/**
 * The issue for a VOI LUT function that the display does not know
 * (FIDELITY-STATE-13). The display then uses LINEAR, so the image does not
 * show as its metadata specifies. No value is not an issue.
 */
export function voiLUTFunctionIssueOf(
  voiLUTFunction: unknown
): FidelityIssue | undefined {
  const value = asArrayFirst(voiLUTFunction);

  if (
    value === undefined ||
    value === null ||
    String(value).replace(/\0/g, '').trim() === '' ||
    normalizeVOILUTFunction(value)
  ) {
    return;
  }

  return {
    code: 'unknownVOILUTFunction',
    message: `The metadata gives an unknown VOI LUT function "${value}". The default display uses LINEAR.`,
  };
}

/**
 * The fidelity issues of a stack image: the issues that its loader set on
 * `image.fidelityIssues`, and the issues that core detects.
 */
export function fidelityIssuesOfImage(
  image: IImage | undefined
): FidelityIssue[] | undefined {
  return issuesOf(
    image?.fidelityIssues,
    voiLUTFunctionIssueOf(image?.voiLUTFunction)
  );
}

/** The fidelity issues of a volume, from the metadata of the volume. */
export function fidelityIssuesOfVolume(
  volume: Pick<IImageVolume, 'metadata'> | undefined
): FidelityIssue[] | undefined {
  return issuesOf(
    undefined,
    voiLUTFunctionIssueOf(volume?.metadata?.VOILUTFunction)
  );
}

function issuesOf(
  given: FidelityIssue[] | undefined,
  detected: FidelityIssue | undefined
): FidelityIssue[] | undefined {
  const issues = [...(given ?? []), ...(detected ? [detected] : [])];

  return issues.length ? issues : undefined;
}
