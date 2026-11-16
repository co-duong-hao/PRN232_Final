import { CheckCircleFilled } from "@ant-design/icons";
import { Alert, List, Progress, Tag, Typography } from "antd";
import type { CompositionAnalysis, GroupType, MajorCount } from "@/api";

type Criterion = {
  label: string;
  unit: string;
  current: number;
  minimum?: number;
  maximum?: number;
  missingMessage: (count: number) => string;
};

function CompositionCriterion({ label, unit, current, minimum, maximum, missingMessage }: Criterion) {
  const excess = maximum === undefined ? 0 : current - maximum;
  const missing = minimum === undefined ? 0 : minimum - current;
  const exceeded = excess > 0;
  const met = !exceeded && missing <= 0;
  const target = exceeded ? maximum : minimum;
  const percent = exceeded || met ? 100 : Math.round((current / (target || 1)) * 100);
  const detail = [
    `Hiện có ${current} ${unit}`,
    minimum !== undefined && minimum > 0 && `Tối thiểu ${minimum}`,
    maximum !== undefined && `Tối đa ${maximum}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <List.Item>
      <div style={{ width: "100%", minWidth: 0 }}>
        <div style={{ display: "flex", gap: "4px 12px", alignItems: "center", flexWrap: "wrap" }}>
          <Typography.Text strong>{label}</Typography.Text>
          {exceeded ? (
            <Tag color="error">Vượt giới hạn</Tag>
          ) : met ? (
            <Tag color="success" icon={<CheckCircleFilled />}>
              Đã đạt
            </Tag>
          ) : (
            <Tag color="warning">Còn thiếu</Tag>
          )}
        </div>
        <Typography.Text type="secondary">{detail}</Typography.Text>
        {(exceeded || (target !== undefined && target > 0)) && (
          <div aria-hidden="true">
            <Progress
              percent={percent}
              status={exceeded ? "exception" : met ? "success" : "normal"}
              showInfo={false}
              size="small"
            />
          </div>
        )}
        {!met && (
          <Typography.Text>
            {exceeded ? `Đang dư ${excess} ${unit}` : missingMessage(missing)}
          </Typography.Text>
        )}
      </div>
    </List.Item>
  );
}

export function RoomCompositionSummary({
  composition,
  groupType,
  majorCounts,
}: {
  composition: CompositionAnalysis;
  groupType?: GroupType;
  majorCounts: MajorCount[];
}) {
  const {
    memberCount,
    missingMemberCount,
    distinctMajorCount,
    missingMajorCount,
    missingMajors,
    exceedingMajors,
    violations,
  } = composition;
  const criteria: Criterion[] = [];

  // Without the group type, the overall upper limit is only reported in the violation text.
  const memberLimitPattern = /^BR14: vượt số thành viên tối đa \(\d+\/(\d+)\)\.$/;
  const exceededMemberLimit = violations.map((violation) => memberLimitPattern.exec(violation)).find(Boolean);
  if (groupType || missingMemberCount > 0 || exceededMemberLimit) {
    criteria.push({
      label: "Số thành viên",
      unit: "thành viên",
      current: memberCount,
      minimum: missingMemberCount > 0 ? memberCount + missingMemberCount : groupType?.minMemberCount,
      maximum: exceededMemberLimit ? Number(exceededMemberLimit[1]) : groupType?.maxMemberCount,
      missingMessage: (count) => `Cần thêm ${count} thành viên`,
    });
  }
  if (groupType || missingMajorCount > 0) {
    criteria.push({
      label: "Số ngành khác nhau",
      unit: "ngành",
      current: distinctMajorCount,
      minimum: missingMajorCount > 0 ? distinctMajorCount + missingMajorCount : groupType?.minMajorCount,
      missingMessage: (count) => `Cần thêm sinh viên từ ${count} ngành chưa có trong nhóm`,
    });
  }

  const countsByMajor = new Map(majorCounts.map(({ majorCode, count }) => [majorCode.toUpperCase(), count]));
  const majorCriteria = new Map<string, Criterion>();
  for (const { majorCode, minQuantity, maxQuantity } of groupType?.majors ?? []) {
    majorCriteria.set(majorCode.toUpperCase(), {
      label: `Ngành ${majorCode}`,
      unit: "sinh viên",
      current: countsByMajor.get(majorCode.toUpperCase()) ?? 0,
      minimum: minQuantity,
      maximum: maxQuantity,
      missingMessage: (count) => `Cần thêm ${count} sinh viên ngành ${majorCode}`,
    });
  }
  for (const gap of [...missingMajors, ...exceedingMajors]) {
    const code = gap.majorCode.toUpperCase();
    const saved = majorCriteria.get(code);
    const belowMinimum = gap.current < gap.required;
    majorCriteria.set(code, {
      label: `Ngành ${gap.majorCode}`,
      unit: "sinh viên",
      current: gap.current,
      minimum: belowMinimum ? gap.required : saved?.minimum,
      maximum: belowMinimum ? saved?.maximum : gap.required,
      missingMessage: (count) => `Cần thêm ${count} sinh viên ngành ${gap.majorCode}`,
    });
  }
  criteria.push(...majorCriteria.values());

  const otherViolations = violations.filter(
    (violation) =>
      !memberLimitPattern.test(violation) &&
      !/^BR14: thiếu \d+ (thành viên|ngành) \(\d+\/\d+\)\.$/.test(violation) &&
      !/^BR15: ngành .+ (thiếu \d+ sinh viên|vượt tối đa) \(\d+\/\d+\)\.$/.test(violation),
  );

  return (
    <>
      <Alert
        showIcon
        type={composition.satisfied ? "success" : "warning"}
        message={composition.satisfied ? "Đã đạt yêu cầu về cơ cấu nhóm" : "Nhóm chưa đủ điều kiện về cơ cấu"}
      />
      {criteria.length > 0 && (
        <List
          style={{ marginTop: 8 }}
          rowKey="label"
          dataSource={criteria}
          renderItem={(criterion) => <CompositionCriterion {...criterion} />}
        />
      )}
      {otherViolations.map((violation) => (
        <p key={violation}>{violation.replace(/^BR\d+:\s*/, "")}</p>
      ))}
    </>
  );
}
