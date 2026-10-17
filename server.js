import "dotenv/config";

import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8000);
const SESSION_COOKIE = "clearspring_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const SESSION_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 8;
const USERS = [
  { username: process.env.ADMIN_USERNAME || "admin", password: process.env.ADMIN_PASSWORD || "2468", name: "Alex Morgan", role: "Administrator" },
  { username: process.env.STAFF_USERNAME || "user", password: process.env.STAFF_PASSWORD || "1234", name: "Jamie Reed", role: "Staff" }
];
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};
const failedLogins = new Map();

if (process.env.VERCEL) {
  const requiredConfig = ["SESSION_SECRET", "ADMIN_PASSWORD", "STAFF_PASSWORD"];
  const missingConfig = requiredConfig.filter(name => !process.env[name]);
  if (missingConfig.length) {
    throw new Error(`Missing required Vercel environment variables: ${missingConfig.join(", ")}`);
  }
}

if (!process.env.SESSION_SECRET) {
  console.warn("SESSION_SECRET is not set; existing login sessions will expire when the server restarts.");
}

function sendJson(response, status, data, headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  response.end(JSON.stringify(data));
}

function cookieOptions(maxAge) {
  const options = [`${SESSION_COOKIE}=`, "HttpOnly", "SameSite=Strict", "Path=/", `Max-Age=${maxAge}`];
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) options.push("Secure");
  return options.join("; ");
}

function sign(value) {
  return createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function issueSession(user) {
  const payload = Buffer.from(JSON.stringify({
    username: user.username,
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function findSessionUser(request) {
  const cookies = request.headers.cookie || "";
  const sessionValue = cookies.split(";").map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!sessionValue) return null;
  const [payload, signature, extra] = sessionValue.split(".");
  if (!payload || !signature || extra) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const user = USERS.find(candidate => candidate.username === session.username);
    if (!user || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) return null;
    return { username: user.username, name: user.name, role: user.role };
  } catch (error) {
    console.error("Could not read a login session.", error);
    return null;
  }
}

function safeEqual(left, right) {
  const leftHash = createHash("sha256").update(String(left)).digest();
  const rightHash = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    if (request.body !== undefined) {
      const body = request.body;
      const serialized = typeof body === "string" ? body : JSON.stringify(body);
      if (serialized.length > 8192) return reject(new Error("Request body is too large."));
      try {
        const parsed = typeof body === "string" ? JSON.parse(body || "{}") : body;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return reject(new Error("Request body must be a JSON object."));
        }
        resolve(parsed);
      } catch {
        reject(new Error("Request body must contain valid JSON."));
      }
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 8192) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Request body must contain valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/session" && request.method === "GET") {
    const user = findSessionUser(request);
    if (!user) return sendJson(response, 401, { user: null });
    return sendJson(response, 200, { user });
  }

  if (url.pathname === "/api/login" && request.method === "POST") {
    const address = request.headers["x-forwarded-for"]?.split(",")[0].trim()
      || request.socket?.remoteAddress
      || "unknown";
    const now = Date.now();
    const previousAttempts = failedLogins.get(address);
    const attempts = previousAttempts && now - previousAttempts.startedAt < LOGIN_WINDOW_MS
      ? previousAttempts
      : { startedAt: now, count: 0 };
    if (attempts.count >= MAX_FAILED_LOGINS) {
      return sendJson(response, 429, { error: "Too many failed login attempts. Wait 15 minutes and try again." });
    }
    let credentials;
    try {
      credentials = await readJson(request);
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
    const username = String(credentials.username || "").trim();
    const password = String(credentials.password || "");
    const user = USERS.find(candidate =>
      safeEqual(username, candidate.username) && safeEqual(password, candidate.password)
    );
    if (!user) {
      attempts.count += 1;
      failedLogins.set(address, attempts);
      return sendJson(response, 401, { error: "Incorrect username or password." });
    }
    failedLogins.delete(address);
    const publicUser = { username: user.username, name: user.name, role: user.role };
    const headers = { "Set-Cookie": cookieOptions(SESSION_MAX_AGE_SECONDS).replace(`${SESSION_COOKIE}=`, `${SESSION_COOKIE}=${issueSession(publicUser)}`) };
    return sendJson(response, 200, { user: publicUser }, headers);
  }

  if (url.pathname === "/api/logout" && request.method === "POST") {
    return sendJson(response, 200, { ok: true }, { "Set-Cookie": cookieOptions(0) });
  }

  return sendJson(response, 404, { error: "API endpoint not found." });
}

function serveStatic(request, response, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request.");
    return;
  }
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(ROOT, `.${pathname}`);
  const relativePath = path.relative(ROOT, filePath);
  const publicPath = relativePath === "index.html" || relativePath.startsWith(`src${path.sep}`) || relativePath.startsWith(`assets${path.sep}`);
  if (!publicPath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found.");
    return;
  }
  response.writeHead(200, {
    "Cache-Control": "no-cache",
    "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff"
  });
  if (request.method === "HEAD") return response.end();
  createReadStream(filePath).pipe(response);
}

function handleApiRequest(request, response, url) {
  handleApi(request, response, url).catch(error => {
    console.error("Login API request failed.", error);
    if (!response.headersSent) sendJson(response, 500, { error: "The login service encountered an error." });
    else response.destroy();
  });
}

export default function vercelHandler(request, response) {
  const url = new URL(request.url || "/", `https://${request.headers.host || "localhost"}`);
  handleApiRequest(request, response, url);
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    handleApiRequest(request, response, url);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    return response.end("Method not allowed.");
  }
  serveStatic(request, response, url);
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    console.log(`ClearSpring POS running at http://localhost:${PORT}`);
  });
}
