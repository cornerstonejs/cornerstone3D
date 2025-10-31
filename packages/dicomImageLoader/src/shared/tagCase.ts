export const capitalizeTag = (tag: string) => {
  if (tag.startsWith('sop')) {
    return `SOP${tag.substring(3)}`;
  }
  return tag.charAt(0).toUpperCase() + tag.slice(1);
};

export const tagToCamel = (name: string) => {
  if (name.startsWith('SOP')) {
    return `sop${name.substring(3)}`;
  }
  return name[0].toLowerCase() + name.substring(1);
};
