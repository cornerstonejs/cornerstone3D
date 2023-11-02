/**
 * Get the current date/time ("YYYY-MM-DD hh:mm:ss.SSS")
 */
export function getFormatedDateTime() {
  const now = new Date();
  const day = `0${now.getDate()}`.slice(-2);
  const month = `0${now.getMonth() + 1}`.slice(-2);
  const year = now.getFullYear();
  const hours = `0${now.getHours()}`.slice(-2);
  const minutes = `0${now.getMinutes()}`.slice(-2);
  const seconds = `0${now.getSeconds()}`.slice(-2);
  const ms = `00${now.getMilliseconds()}`.slice(-3);

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}
