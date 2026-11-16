// Mirrors the backend DTOs. Source of truth: docs/design/api-contract.md and src/*/Dtos.
// Dates are ISO 8601 strings (UTC).

export type Role = "Admin" | "HeadOfDepartment" | "Lecturer" | "Student";

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** Common list parameters accepted by every list endpoint. */
export interface PageParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  q?: string;
}

// ---------- Auth Service ----------

export interface LoginUser {
  id: string;
  email: string;
  fullName: string;
  roles: Role[];
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresAt: string;
  user: LoginUser;
}

export type UserStatus = "Active" | "Inactive";

export interface User {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  roles: Role[];
  createdAt: string;
}

export interface UserListParams extends PageParams {
  role?: Role;
  status?: UserStatus;
}

export interface CreateUserRequest {
  email: string;
  fullName: string;
  password: string;
  roles: Role[];
}

export interface UpdateUserRequest {
  fullName: string;
  status: UserStatus;
  roles: Role[];
}

export interface RoleInfo {
  id: string;
  code: Role;
  name: string;
}

// ---------- Team Service: reference data ----------

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

export type CourseStatus = "Planned" | "Forming" | "Closed";

export interface Course {
  id: string;
  code: string;
  semesterId: string;
  subjectId: string;
  groupTypeId: string;
  groupTypeName: string;
  status: CourseStatus;
  startTime: string;
  deadline: string;
  studentCount: number;
}

export interface MyCourse extends Course {
  myRoom: Room | null;
  myGroup: Group | null;
}

export interface CourseListParams extends PageParams {
  semesterId?: string;
  subjectId?: string;
  status?: CourseStatus;
}

export interface CreateCourseRequest {
  semesterId: string;
  subjectId: string;
  groupTypeId: string;
  startTime: string;
  deadline: string;
}

export interface UpdateCourseRequest {
  groupTypeId: string;
  startTime: string;
  deadline: string;
}

export interface CourseStudent {
  id: string;
  studentCode: string;
  fullName: string;
  email: string;
  majorId: string;
  majorCode: string;
  hasRoom: boolean;
  gpa: number | null;
  roles: TeamRole[];
}

export interface CourseStudentParams extends PageParams {
  majorId?: string;
  hasRoom?: boolean;
}

export interface CourseStats {
  totalStudents: number;
  studentsInRoom: number;
  studentsInGroup: number;
  roomsByStatus: Record<string, number>;
  groupCount: number;
}

export interface EnrollmentResult {
  added: number;
  skipped: number;
}

// ---------- Team Service: rooms, applies, groups ----------

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
