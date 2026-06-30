import type { InstanceGroup, SplitRule, ViewportTypeHint } from './types';

const DEFAULT_VIEWPORT_TYPES: readonly ViewportTypeHint[] = ['stack'];

/**
 * Resolves the allowed viewport types for a matched split rule, falling back to
 * a stack viewport when the rule declares none. `viewportTypes[0]` is the
 * preferred viewport type.
 *
 * @param rule - the split rule that matched the group.
 * @returns the rule's `viewportTypes`, or `['stack']` when unset.
 */
export function getViewportTypesForRule(
  rule: SplitRule
): readonly ViewportTypeHint[] {
  if (rule.viewportTypes?.length) {
    return rule.viewportTypes;
  }
  return DEFAULT_VIEWPORT_TYPES;
}

/**
 * Returns the preferred viewport type for a list of allowed viewport types,
 * which is its first entry (`'stack'` when the list is empty). Use this when
 * deciding which single viewport type to create for a display set.
 *
 * @param viewportTypes - the display set's allowed viewport types.
 * @returns the preferred (first) viewport type, defaulting to `'stack'`.
 */
export function getPreferredViewportType(
  viewportTypes: readonly ViewportTypeHint[]
): ViewportTypeHint {
  return viewportTypes[0] ?? 'stack';
}

/**
 * Resolves the allowed viewport types for an instance group from the rule that
 * produced it. Convenience wrapper around {@link getViewportTypesForRule} for an
 * {@link InstanceGroup}.
 *
 * @param group - the instance group (carries its `matchedRule`).
 * @returns the group's allowed viewport types; index 0 is preferred.
 */
export function getViewportTypesForGroup(
  group: InstanceGroup
): readonly ViewportTypeHint[] {
  return getViewportTypesForRule(group.matchedRule);
}
