import { Alert, List, Progress, Tag, Typography } from "antd";
import type { CompositionAnalysis, GroupType, MajorCount } from "@/api";
import { useI18n } from "@/i18n";

type Criterion = {
  label: string;
  unit: string;
  current: number;
  minimum?: number;
  maximum?: number;
  missingMessage: (count: number) => string;
};

function CompositionCriterion({ label, unit, current, minimum, maximum, missingMessage }: Criterion) {
  const { t } = useI18n();
  const excess = maximum === undefined ? 0 : current - maximum;
  const missing = minimum === undefined ? 0 : minimum - current;
  const exceeded = excess > 0;
  const met = !exceeded && missing <= 0;
  const target = exceeded ? maximum : minimum;
  const percent = exceeded || met ? 100 : Math.round((current / (target || 1)) * 100);
  const detail = [
    t.composition.currentCount(current, unit),
    minimum !== undefined && minimum > 0 && t.composition.minLimit(minimum),
    maximum !== undefined && t.composition.maxLimit(maximum),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <List.Item>
      <div style={{ width: "100%", minWidth: 0 }}>
        <div style={{ display: "flex", gap: "4px 10px", alignItems: "center", flexWrap: "wrap" }}>
          <Typography.Text strong>{label}</Typography.Text>
          {exceeded ? (
            <Tag color="error">{t.composition.exceededTag}</Tag>
          ) : met ? (
            <Tag color="success">{t.composition.metTag}</Tag>
          ) : (
            <Tag color="warning">{t.composition.missingTag}</Tag>
          )}
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {detail}
        </Typography.Text>
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
          <Typography.Text style={{ fontSize: 13 }}>
            {exceeded ? t.composition.surplusMsg(excess, unit) : missingMessage(missing)}
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
  const { t, language } = useI18n();
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

  const memberLimitPattern = /^BR14: vượt số thành viên tối đa \(\d+\/(\d+)\)\.$/;
  const exceededMemberLimit = violations.map((violation) => memberLimitPattern.exec(violation)).find(Boolean);
  if (groupType || missingMemberCount > 0 || exceededMemberLimit) {
    criteria.push({
      label: t.composition.memberCountLabel,
      unit: t.composition.memberUnit,
      current: memberCount,
      minimum: missingMemberCount > 0 ? memberCount + missingMemberCount : groupType?.minMemberCount,
      maximum: exceededMemberLimit ? Number(exceededMemberLimit[1]) : groupType?.maxMemberCount,
      missingMessage: (count) => t.composition.missingMembersMsg(count),
    });
  }
  if (groupType || missingMajorCount > 0) {
    criteria.push({
      label: t.composition.distinctMajorsLabel,
      unit: t.composition.majorUnit,
      current: distinctMajorCount,
      minimum: missingMajorCount > 0 ? distinctMajorCount + missingMajorCount : groupType?.minMajorCount,
      missingMessage: (count) => t.composition.missingMajorsMsg(count),
    });
  }

  const countsByMajor = new Map(majorCounts.map(({ majorCode, count }) => [majorCode.toUpperCase(), count]));
  const majorCriteria = new Map<string, Criterion>();
  for (const { majorCode, minQuantity, maxQuantity } of groupType?.majors ?? []) {
    majorCriteria.set(majorCode.toUpperCase(), {
      label: t.composition.majorRequirementLabel(majorCode),
      unit: t.composition.studentUnit,
      current: countsByMajor.get(majorCode.toUpperCase()) ?? 0,
      minimum: minQuantity,
      maximum: maxQuantity,
      missingMessage: (count) => t.composition.missingSpecificMajorMsg(majorCode, count),
    });
  }
  for (const gap of [...missingMajors, ...exceedingMajors]) {
    const code = gap.majorCode.toUpperCase();
    const saved = majorCriteria.get(code);
    const belowMinimum = gap.current < gap.required;
    majorCriteria.set(code, {
      label: t.composition.majorRequirementLabel(gap.majorCode),
      unit: t.composition.studentUnit,
      current: gap.current,
      minimum: belowMinimum ? gap.required : saved?.minimum,
      maximum: belowMinimum ? saved?.maximum : gap.required,
      missingMessage: (count) => t.composition.missingSpecificMajorMsg(gap.majorCode, count),
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
        type={composition.satisfied ? "success" : "warning"}
        message={
          composition.satisfied
            ? language === "en"
              ? "Team composition requirements satisfied"
              : "Đã đạt đủ yêu cầu cơ cấu nhóm"
            : language === "en"
              ? "Team composition criteria not yet met"
              : "Nhóm chưa đủ điều kiện cơ cấu"
        }
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
