async function readResponse(response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The login service could not complete the request.");
  return result;
}

export async function loginUser(username, password) {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const result = await readResponse(response);
  return { user: result.user, notificationSent: result.notificationSent };
}

export async function getCurrentUser() {
  const response = await fetch("/api/session", { cache: "no-store" });
  if (response.status === 401) return null;
  const result = await readResponse(response);
  return result.user || null;
}

export async function logoutUser() {
  const response = await fetch("/api/logout", { method: "POST" });
  await readResponse(response);
}
