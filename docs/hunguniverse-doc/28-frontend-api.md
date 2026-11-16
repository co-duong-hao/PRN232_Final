# HTTP client và kiểu dữ liệu web

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Client tạo URL `/api` cùng query string và gửi bearer token khi có phiên. Danh sách `roleIds` được lặp thành nhiều mục query.

Các wrapper phân nhóm endpoint theo chức năng. Kiểu dữ liệu TypeScript giữ giao diện và backend thống nhất ở mức mô hình dùng trên web.

Header, HTTP status và mã nghiệp vụ hữu ích khi chẩn đoán. Cùng một thông báo UI có thể xuất phát từ lỗi mạng hoặc lỗi xác thực khác nhau.

## Cách kiểm tra

1. Đọc một request `rooms` trong Network và đối chiếu tham số lọc với type phía web.
2. Thử thao tác có lỗi nghiệp vụ và xem mã lỗi được truyền qua `ApiError`.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### client.ts

Query builder, lưu token cục bộ và gọi HTTP.

[frontend/src/api/client.ts dòng 1–120](../../frontend/src/api/client.ts#L1-L120)

~~~typescript
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

type Scalar = string | number | boolean | undefined | null;
type Query = Record<string, Scalar | Scalar[]>;

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    // Arrays become repeated keys: roleIds=a&roleIds=b (what ASP.NET Core binds to a list).
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v !== undefined && v !== null && v !== "") params.append(key, String(v));
    }
  }
  const qs = params.toString();
  return `/api${path}${qs ? `?${qs}` : ""}`;
}

async function request<T>(
  method: string,
  path: string,
  options: { query?: Query; body?: unknown } = {},
): Promise<T> {
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
~~~

### index.ts

Các wrapper API được dùng bởi trang web.

[frontend/src/api/index.ts dòng 54–125](../../frontend/src/api/index.ts#L54-L125)

~~~typescript
  roles: () => http.get<RoleInfo[]>("/roles"),
};

export const referenceApi = {
  semesters: (params?: PageParams) => http.get<Paged<Lookup>>("/semesters", q({ pageSize: 100, ...params })),
  subjects: (params?: PageParams) => http.get<Paged<Lookup>>("/subjects", q({ pageSize: 100, ...params })),
  majors: (params?: PageParams) => http.get<Paged<Lookup>>("/majors", q({ pageSize: 100, ...params })),
  teamRoles: (params?: PageParams) =>
    http.get<Paged<TeamRole>>("/team-roles", q({ pageSize: 100, ...params })),
  groupTypes: (params?: PageParams) =>
    http.get<Paged<GroupType>>("/group-types", q({ pageSize: 100, ...params })),
  students: (params?: PageParams & { majorId?: string }) => http.get<Paged<Student>>("/students", q(params)),
};

export const coursesApi = {
  list: (params?: CourseListParams) => http.get<Paged<Course>>("/courses", q(params)),
  get: (id: string) => http.get<Course>(`/courses/${id}`),
  create: (body: CreateCourseRequest) => http.post<Course>("/courses", body),
  update: (id: string, body: UpdateCourseRequest) => http.put<Course>(`/courses/${id}`, body),
  remove: (id: string) => http.delete(`/courses/${id}`),
  open: (id: string) => http.post<Course>(`/courses/${id}/open`),
  close: (id: string) => http.post<Course>(`/courses/${id}/close`),
  students: (id: string, params?: CourseStudentParams) =>
    http.get<Paged<CourseStudent>>(`/courses/${id}/students`, q(params)),
  enroll: (id: string, studentIds: string[]) =>
    http.post<EnrollmentResult>(`/courses/${id}/students`, { studentIds }),
  removeStudent: (id: string, studentId: string) => http.delete(`/courses/${id}/students/${studentId}`),
  stats: (id: string) => http.get<CourseStats>(`/courses/${id}/stats`),
  rooms: (id: string, params?: RoomListParams) =>
    http.get<Paged<RoomSummary>>(`/courses/${id}/rooms`, q(params)),
  groups: (id: string, params?: PageParams) => http.get<Paged<Group>>(`/courses/${id}/groups`, q(params)),
  /** QT01. The recruitment profile is optional (BR22). */
  createRoom: (id: string, body?: RoomProfileRequest) => http.post<Room>(`/courses/${id}/rooms`, body ?? {}),
  recommendations: (id: string, limit = 5) =>
    http.get<RoomRecommendation[]>(`/courses/${id}/rooms/recommendations`, { limit }),
};

export const meApi = {
  /** Student profile of the signed-in user (only for role Student). */
  student: () => http.get<Student>("/me/student"),
  /** BR21: the student fills in GPA and 1–3 roles. */
  updateProfile: (body: StudentProfileRequest) => http.put<Student>("/me/student/profile", body),
  courses: (params?: PageParams) => http.get<Paged<MyCourse>>("/me/courses", q(params)),
  applies: (params?: ApplyListParams) => http.get<Paged<RoomApply>>("/me/applies", q(params)),
};

export const roomsApi = {
  get: (id: string) => http.get<Room>(`/rooms/${id}`),
  join: (id: string) => http.post<Room>(`/rooms/${id}/join`),
  leave: (id: string) => http.post<void>(`/rooms/${id}/leave`),
  changeLeader: (id: string, studentId: string) => http.put<Room>(`/rooms/${id}/leader`, { studentId }),
  /** Leader edits the recruitment profile (BR22). */
  updateProfile: (id: string, body: RoomProfileRequest) => http.put<Room>(`/rooms/${id}/profile`, body),
  composition: (id: string) => http.get<CompositionAnalysis>(`/rooms/${id}/composition`),
  complete: (id: string) => http.post<Group>(`/rooms/${id}/complete`),
  apply: (id: string, message: string) => http.post<RoomApply>(`/rooms/${id}/applies`, { message }),
  applies: (id: string, params?: ApplyListParams) =>
    http.get<Paged<RoomApply>>(`/rooms/${id}/applies`, q(params)),
};

export const appliesApi = {
  approve: (id: string) => http.post<RoomApply>(`/room-applies/${id}/approve`),
  reject: (id: string) => http.post<RoomApply>(`/room-applies/${id}/reject`),
  cancel: (id: string) => http.post<RoomApply>(`/room-applies/${id}/cancel`),
};

export const groupsApi = {
  get: (id: string) => http.get<Group>(`/groups/${id}`),
};

export { ApiError } from "./client";
export type * from "./types";
~~~

### types.ts

Kiểu dữ liệu nền, hồ sơ sinh viên và loại nhóm.

[frontend/src/api/types.ts dòng 76–120](../../frontend/src/api/types.ts#L76-L120)

~~~typescript
export interface Lookup {
  id: string;
  code: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
}

/** A role a student can play in a team, e.g. "FE" Frontend. Fixed list managed by Admin. */
export interface TeamRole {
  id: string;
  code: string;
  name: string;
}

export interface Student {
  id: string;
  userId: string;
  studentCode: string;
  fullName: string;
  email: string;
  majorId: string;
  majorCode: string;
  /** 0.00–4.00; null when the student has not filled it in. */
  gpa: number | null;
  roles: TeamRole[];
}

export interface GroupTypeMajor {
  majorId: string;
  majorCode: string;
  minQuantity: number;
  maxQuantity: number;
}

export interface GroupType {
  id: string;
  name: string;
  minMemberCount: number;
  maxMemberCount: number;
  minMajorCount: number;
  majors: GroupTypeMajor[];
}

// ---------- Team Service: courses ----------
~~~

### types.ts

Kiểu dữ liệu phòng, đơn, kết quả ghép nhóm và bộ lọc.

[frontend/src/api/types.ts dòng 194–330](../../frontend/src/api/types.ts#L194-L330)

~~~typescript
export type RoomStatus = "Open" | "Locked" | "Completed" | "Cancelled";

export interface MajorCount {
  majorCode: string;
  count: number;
}

export interface RoomSummary {
  id: string;
  code: string;
  status: RoomStatus;
  memberCount: number;
  leaderName: string;
  majors: MajorCount[];
  createdAt: string;
  /** Recruitment profile (all optional). */
  name: string | null;
  projectName: string | null;
  ideaDescription: string | null;
  /** Minimum GPA to join directly (BR19); null = no requirement. */
  requiredGpa: number | null;
  targetGrade: number | null;
  neededRoles: TeamRole[];
}

export interface RoomMember {
  studentId: string;
  studentCode: string;
  fullName: string;
  majorCode: string;
  isLeader: boolean;
  joinedAt: string;
  gpa: number | null;
  roles: TeamRole[];
}

export interface Room extends RoomSummary {
  courseId: string;
  courseCode: string;
  /** Student id (not user id) of the leader. Compare with `useAuth().student?.id`. */
  leaderId: string;
  members: RoomMember[];
}

export interface RoomListParams extends PageParams {
  status?: RoomStatus;
  /** Only rooms this GPA can join directly: requiredGpa empty or <= gpa. */
  gpa?: number;
  /** Rooms needing at least one of these roles. */
  roleIds?: string[];
}

/** Body of POST /courses/{id}/rooms and PUT /rooms/{id}/profile. Every field is optional. */
export interface RoomProfileRequest {
  name?: string | null;
  projectName?: string | null;
  ideaDescription?: string | null;
  requiredGpa?: number | null;
  targetGrade?: number | null;
  neededRoleIds?: string[];
}

/** Body of PUT /me/student/profile (BR21). */
export interface StudentProfileRequest {
  gpa: number | null;
  roleIds: string[];
}

export interface MajorGap {
  majorCode: string;
  current: number;
  required: number;
}

export interface CompositionAnalysis {
  satisfied: boolean;
  memberCount: number;
  missingMemberCount: number;
  distinctMajorCount: number;
  missingMajorCount: number;
  missingMajors: MajorGap[];
  exceedingMajors: MajorGap[];
  violations: string[];
}

export interface RoomRecommendation {
  roomId: string;
  roomCode: string;
  score: number;
  canJoin: boolean;
  reasons: string[];
}

export type ApplyStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";

export interface RoomApply {
  id: string;
  roomId: string;
  roomCode: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  majorCode: string;
  message: string;
  status: ApplyStatus;
  decidedAt: string | null;
  createdAt: string;
  /** Applicant's GPA and roles, so the leader can decide. */
  gpa: number | null;
  roles: TeamRole[];
}

export interface ApplyListParams extends PageParams {
  status?: ApplyStatus;
  courseId?: string;
}

export interface GroupMember {
  studentId: string;
  studentCode: string;
  fullName: string;
  majorCode: string;
  isLeader: boolean;
}

export interface Group {
  id: string;
  code: string;
  name: string;
  courseId: string;
  courseCode: string;
  roomId: string;
  groupTypeId: string;
  groupTypeName: string;
  createdAt: string;
  members: GroupMember[];
}
~~~

### useApiAction.ts

Trình gọi API và trình bày lỗi.

[frontend/src/components/useApiAction.ts dòng 1–51](../../frontend/src/components/useApiAction.ts#L1-L51)

~~~typescript
import { App } from "antd";
import { useCallback, useState } from "react";
import { ApiError } from "@/api/client";

/** Shows a backend error as a toast, with the rule code when there is one (e.g. "BR05"). */
export function useShowError() {
  const { message } = App.useApp();
  return useCallback(
    (error: unknown) => {
      if (error instanceof ApiError) {
        const showCode = /^BR\d+$/.test(error.code);
        message.error(showCode ? `[${error.code}] ${error.message}` : error.message, 5);
      } else {
        message.error("Đã có lỗi xảy ra. Vui lòng thử lại.");
      }
    },
    [message],
  );
}

/**
 * Wraps a mutation: tracks loading, shows the error toast, and shows `success` when it resolves.
 * Usage: const [join, joining] = useApiAction(() => roomsApi.join(id), "Đã vào phòng");
 */
export function useApiAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  success?: string,
): [(...args: TArgs) => Promise<TResult | undefined>, boolean] {
  const { message } = App.useApp();
  const showError = useShowError();
  const [running, setRunning] = useState(false);

  const run = useCallback(
    async (...args: TArgs) => {
      setRunning(true);
      try {
        const result = await action(...args);
        if (success) message.success(success);
        return result;
      } catch (error) {
        showError(error);
        return undefined;
      } finally {
        setRunning(false);
      }
    },
    [action, success, message, showError],
  );

  return [run, running];
}
~~~
