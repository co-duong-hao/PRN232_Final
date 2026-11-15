// Thin fetch wrapper. Every call goes to /api on the same origin; Vite (dev) or Nginx (Docker)
// forwards it to the API Gateway.

const TOKEN_KEY = "exe.auth";

/** Error thrown for any non-2xx response. `code` is the backend's ProblemDetails code, e.g. "BR05". */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface StoredAuth {
  accessToken: string;
  expiresAt: string;
}

export function readStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const auth = JSON.parse(raw) as StoredAuth;
    return new Date(auth.expiresAt).getTime() > Date.now() ? auth.accessToken : null;
  } catch {
    return null;
  }
}

export function storeToken(auth: StoredAuth | null): void {
  try {
    if (auth) localStorage.setItem(TOKEN_KEY, JSON.stringify(auth));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable: the session simply won't survive a reload.
  }
}

/** Fired when the server answers 401 so AuthProvider can sign out. */
export const UNAUTHORIZED_EVENT = "exe:unauthorized";

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return `/api${path}${qs ? `?${qs}` : ""}`;
}

async function request<T>(method: string, path: string, options: { query?: Query; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = readStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Không kết nối được máy chủ. Kiểm tra backend đã chạy chưa.");
  }

  if (response.status === 401 && path !== "/auth/login") {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  const text = await response.text();
  const data = text ? safeJson(text) : undefined;

  if (!response.ok) {
    const problem = (data ?? {}) as { code?: string; title?: string; errors?: Record<string, string[]> };
    const validation = problem.errors ? Object.values(problem.errors).flat().join(" ") : "";
    throw new ApiError(
      response.status,
      problem.code ?? (response.status === 403 ? "FORBIDDEN" : `HTTP_${response.status}`),
      validation || problem.title || defaultMessage(response.status),
    );
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function defaultMessage(status: number): string {
  if (status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (status === 404) return "Không tìm thấy dữ liệu.";
  return "Đã có lỗi xảy ra. Vui lòng thử lại.";
}

export const http = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};
