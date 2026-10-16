const request = async (path, options = {}) => {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "The request could not be completed.");
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  return data;
};

const post = (path, payload) => request(path, { method: "POST", body: JSON.stringify(payload) });
const patch = (path, payload) => request(path, { method: "PATCH", body: JSON.stringify(payload) });

export { patch, post, request };
