export default function getTagValue(tag, justElement = true) {
  if (tag && tag.Value) {
    if (tag.Value[0] && justElement) {
      return tag.Value[0];
    }

    return tag.Value;
  }

  return tag;
}
