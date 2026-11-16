import { Tag } from "antd";
import type { ApplyStatus, CourseStatus, RoomStatus } from "@/api/types";
import { applyStatusLabel, courseStatusLabel, roomStatusLabel } from "./labels";

export function RoomStatusTag({ status }: { status: RoomStatus }) {
  const s = roomStatusLabel[status];
  return <Tag color={s.color}>{s.text}</Tag>;
}

export function ApplyStatusTag({ status }: { status: ApplyStatus }) {
  const s = applyStatusLabel[status];
  return <Tag color={s.color}>{s.text}</Tag>;
}

export function CourseStatusTag({ status }: { status: CourseStatus }) {
  const s = courseStatusLabel[status];
  return <Tag color={s.color}>{s.text}</Tag>;
}

/** "SE: 2", "AI: 1" as clean tags without special multiplication symbols. */
export function MajorCounts({ majors }: { majors: { majorCode: string; count: number }[] }) {
  if (majors.length === 0) return <span>—</span>;
  return (
    <>
      {majors.map((m) => (
        <Tag key={m.majorCode}>
          {m.majorCode}: {m.count}
        </Tag>
      ))}
    </>
  );
}
