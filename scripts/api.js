/** JSON requests shared by the store and its authenticated admin area. */
export async function request(path, { method = "GET", body, csrf } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrf) headers["X-CSRF-Token"] = csrf;
  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("Cannot reach the store. Check the server and try again.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.error || `Request failed (${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
