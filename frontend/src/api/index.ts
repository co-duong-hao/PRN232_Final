// One function per backend endpoint used by the UI. Pages call these; they never call fetch directly.
import { http } from "./client";
import type {
  ApplyListParams,
  CompositionAnalysis,
  Course,
  CourseListParams,
  CourseStats,
  CourseStudent,
  CourseStudentParams,
  CreateCourseRequest,
  CreateUserRequest,
  EnrollmentResult,
  Group,
  GroupType,
  LoginResponse,
  LoginUser,
  Lookup,
  MyCourse,
  PageParams,
  Paged,
  Room,
  RoomApply,
  RoomListParams,
  RoomRecommendation,
  RoomSummary,
  RoleInfo,
  Student,
  UpdateCourseRequest,
  UpdateUserRequest,
  User,
  UserListParams,
} from "./types";

type Q = Record<string, string | number | boolean | undefined>;
const q = (params?: object) => params as Q | undefined;

export const authApi = {
  login: (email: string, password: string) => http.post<LoginResponse>("/auth/login", { email, password }),
  me: () => http.get<LoginUser>("/auth/me"),
};

export const usersApi = {
  list: (params?: UserListParams) => http.get<Paged<User>>("/users", q(params)),
  get: (id: string) => http.get<User>(`/users/${id}`),
  create: (body: CreateUserRequest) => http.post<User>("/users", body),
  update: (id: string, body: UpdateUserRequest) => http.put<User>(`/users/${id}`, body),
  resetPassword: (id: string, password: string) =>
    http.post<void>(`/users/${id}/reset-password`, { password }),
  deactivate: (id: string) => http.delete(`/users/${id}`),
  roles: () => http.get<RoleInfo[]>("/roles"),
};

export const referenceApi = {
  semesters: (params?: PageParams) => http.get<Paged<Lookup>>("/semesters", q({ pageSize: 100, ...params })),
  subjects: (params?: PageParams) => http.get<Paged<Lookup>>("/subjects", q({ pageSize: 100, ...params })),
  majors: (params?: PageParams) => http.get<Paged<Lookup>>("/majors", q({ pageSize: 100, ...params })),
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
  createRoom: (id: string) => http.post<Room>(`/courses/${id}/rooms`),
  recommendations: (id: string, limit = 5) =>
    http.get<RoomRecommendation[]>(`/courses/${id}/rooms/recommendations`, { limit }),
};

export const meApi = {
  /** Student profile of the signed-in user (only for role Student). */
  student: () => http.get<Student>("/me/student"),
  courses: (params?: PageParams) => http.get<Paged<MyCourse>>("/me/courses", q(params)),
  applies: (params?: ApplyListParams) => http.get<Paged<RoomApply>>("/me/applies", q(params)),
};

export const roomsApi = {
  get: (id: string) => http.get<Room>(`/rooms/${id}`),
  join: (id: string) => http.post<Room>(`/rooms/${id}/join`),
  leave: (id: string) => http.post<void>(`/rooms/${id}/leave`),
  changeLeader: (id: string, studentId: string) => http.put<Room>(`/rooms/${id}/leader`, { studentId }),
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
