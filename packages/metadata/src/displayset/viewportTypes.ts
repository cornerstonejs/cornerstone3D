import type {
  GroupedInstanceBucket,
  SplitRule,
  ViewportTypeHint,
} from './types';

const DEFAULT_VIEWPORT_TYPES: readonly ViewportTypeHint[] = ['stack'];

/**
 * Resolves viewport types for a matched split rule.
 * `viewportTypes[0]` is the preferred viewport type.
 */
export function getViewportTypesForRule(
  rule: SplitRule
): readonly ViewportTypeHint[] {
  if (rule.viewportTypes?.length) {
    return rule.viewportTypes;
  }
  return DEFAULT_VIEWPORT_TYPES;
}

export function getPreferredViewportType(
  viewportTypes: readonly ViewportTypeHint[]
): ViewportTypeHint {
  return viewportTypes[0] ?? 'stack';
}

export function getViewportTypesForGroup(
  group: GroupedInstanceBucket
): readonly ViewportTypeHint[] {
  return getViewportTypesForRule(group.matchedRule);
}
