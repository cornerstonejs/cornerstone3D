/**
 * Generates a unique id that has limited chance of collision
 *
 * @see {@link https://stackoverflow.com/a/2117523/1867984|StackOverflow: Source}
 * @returns a v4 compliant GUID
 */
export default function uuidv4(): string {
  return crypto.randomUUID();
}
