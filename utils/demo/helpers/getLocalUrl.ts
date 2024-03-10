/**
 *  Gets a local Url for testing against localhost
 * Parameters are useLocal=true or useLocal=<httpPortNumber>
 * localPort=https or localPort=http
 * Defaults to http on port 5000.
 */
export default function getLocalUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const useLocal = urlParams.get('useLocal');
  if (!useLocal) {
    return;
  }
  const localPort = useLocal === 'true' ? '5000' : Number(localPort);
  const useProtocol =
    urlParams.get('useProtocol') === 'https' ? 'https' : 'http';
  return `${useProtocol}://localhost:${localPort}/dicomweb`;
}
