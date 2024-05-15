const waitForRequest = async (
  page,
  url = 'http://localhost:3000/5004fdc02f329ce53b69.wasm'
) => {
  const response = await page.waitForResponse(url);
  return response;
};

export { waitForRequest };
