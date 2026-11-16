import type { CSSProperties, ReactNode } from "react";
import { Card, Descriptions, List, Pagination, Skeleton, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";

export type SkeletonColumnKind =
  "code" | "text" | "longText" | "number" | "date" | "tag" | "tags" | "actions";

export interface SkeletonColumn {
  title: string;
  kind?: SkeletonColumnKind;
  actionWidths?: number[];
}

interface SkeletonRow {
  key: string;
  index: number;
}

const TEXT_WIDTHS = [118, 102, 132, 94, 112];
const LONG_TEXT_WIDTHS = [184, 152, 206, 168, 144];
const TAG_WIDTH_SETS = [[54, 68], [62, 52, 70], [58, 74], [66], [52, 64]];

/** Single shimmering bar matching a text line, pill, or container block. */
export function SkeletonBar({
  width = "100%",
  height = 16,
  radius,
  inline = false,
  className,
  style,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  inline?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className ? `workspace-skeleton-bar ${className}` : "workspace-skeleton-bar"}
      style={{ display: inline ? "inline-block" : "block", width, maxWidth: "100%", ...style }}
    >
      <Skeleton.Input active size="small" block style={{ height, borderRadius: radius }} />
    </span>
  );
}

/** Pill-shaped skeleton matching an Ant Design `Tag`. */
export function SkeletonTag({ width = 64 }: { width?: number }) {
  return <SkeletonBar inline width={width} height={22} radius={6} />;
}

/** Group of wrapping pill skeletons matching role or major-count tags. */
export function SkeletonTags({ widths = [56, 72] }: { widths?: number[] }) {
  return (
    <span className="workspace-skeleton-tags">
      {widths.map((width, index) => (
        <SkeletonTag key={index} width={width} />
      ))}
    </span>
  );
}

/** Button-shaped skeleton matching Ant Design action buttons and `.workspace-action-link`. */
export function SkeletonBtn({ width = 104, height = 32 }: { width?: number; height?: number }) {
  return <SkeletonBar inline width={width} height={height} radius={8} />;
}

/** Header skeleton matching `.workspace-heading` (back link, h1 title, subtitle/tag, actions). */
export function PageHeadingSkeleton({
  hasBackLink = false,
  hasSubtitle = false,
  hasTag = false,
  titleWidth = 190,
  actionWidths = [],
}: {
  hasBackLink?: boolean;
  hasSubtitle?: boolean;
  hasTag?: boolean;
  titleWidth?: number;
  actionWidths?: number[];
}) {
  return (
    <header className="workspace-heading" aria-busy="true" aria-label="Đang tải tiêu đề">
      <div aria-hidden="true">
        {hasBackLink && <SkeletonBar width={118} height={14} style={{ marginBottom: 10 }} />}
        <SkeletonBar width={titleWidth} height={30} />
        {hasSubtitle && <SkeletonBar width={144} height={16} style={{ marginTop: 8 }} />}
        {hasTag && (
          <div style={{ marginTop: 8 }}>
            <SkeletonTag width={110} />
          </div>
        )}
      </div>
      {actionWidths.length > 0 && (
        <Space wrap aria-hidden="true">
          {actionWidths.map((width, index) => (
            <SkeletonBtn key={index} width={width} />
          ))}
        </Space>
      )}
    </header>
  );
}

/** Four-column metric grid skeleton matching `.workspace-metrics` and `.workspace-metric`. */
export function MetricsSkeleton({ count = 4, withCards = true }: { count?: number; withCards?: boolean }) {
  const items = Array.from({ length: count }, (_, index) => {
    const content = (
      <div className="workspace-metric" aria-hidden="true">
        <div className="workspace-skeleton-stack">
          <SkeletonBar width={86} height={14} />
          <SkeletonBar width={48} height={28} />
        </div>
        {withCards && <Skeleton.Avatar active shape="square" size={36} style={{ borderRadius: 9 }} />}
      </div>
    );
    return withCards ? <Card key={index}>{content}</Card> : <div key={index}>{content}</div>;
  });

  return (
    <div className="workspace-metrics" aria-busy="true" aria-label="Đang tải số liệu">
      {items}
    </div>
  );
}

/** Course card grid skeleton matching `.workspace-course-grid` cards in `MyCoursesPage`. */
export function CourseGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="workspace-course-grid" aria-busy="true" aria-label="Đang tải danh sách Course">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} title={<SkeletonBar width={112} height={18} />} extra={<SkeletonTag width={104} />}>
          <Space direction="vertical" style={{ width: "100%" }} aria-hidden="true">
            <SkeletonBar width="74%" height={15} />
            <SkeletonBar width="84%" height={15} />
            <SkeletonBar width="48%" height={15} />
            <div className="workspace-skeleton-inline">
              <SkeletonBar inline width={128} height={15} />
              {index % 2 === 1 && <SkeletonTag width={72} />}
            </div>
            <SkeletonBtn width={122} height={34} />
          </Space>
        </Card>
      ))}
    </div>
  );
}

/** Key-value grid card skeleton matching `.workspace-facts` cards (Course, Room, Group details). */
export function FactsCardSkeleton({
  title,
  hasStatusTag = false,
  count = 3,
  hasDescription = false,
  hasTags = false,
  lastFactTags = false,
}: {
  title?: ReactNode;
  hasStatusTag?: boolean;
  count?: number;
  hasDescription?: boolean;
  hasTags?: boolean;
  lastFactTags?: boolean;
}) {
  const valueWidths = ["68%", "78%", "86%", "64%", "58%", "44%"];

  return (
    <Card
      title={title}
      extra={hasStatusTag ? <SkeletonTag width={84} /> : undefined}
      aria-busy="true"
      aria-label="Đang tải thông tin chi tiết"
    >
      <div className="workspace-facts" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div className="workspace-fact" key={index}>
            <SkeletonBar width={82} height={13} style={{ marginBottom: 6 }} />
            {lastFactTags && index === count - 1 ? (
              <SkeletonTags widths={[52, 52, 52]} />
            ) : (
              <SkeletonBar width={valueWidths[index % valueWidths.length]} height={18} />
            )}
          </div>
        ))}
      </div>
      {hasDescription && (
        <div className="workspace-section" aria-hidden="true">
          <SkeletonBar width={114} height={15} style={{ marginBottom: 8 }} />
          <SkeletonBar width="92%" height={15} style={{ marginBottom: 6 }} />
          <SkeletonBar width="66%" height={15} />
        </div>
      )}
      {hasTags && (
        <div className="workspace-section" aria-hidden="true">
          <SkeletonBar width={126} height={15} style={{ marginBottom: 8 }} />
          <SkeletonTags widths={[64, 82, 58]} />
        </div>
      )}
    </Card>
  );
}

/** Recommendation card skeleton matching `Gợi ý cho bạn` rows in `CourseRoomsPage`. */
export function RecommendationsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <Card title="Gợi ý cho bạn" style={{ marginTop: 16 }} aria-busy="true" aria-label="Đang tải gợi ý">
      <Space direction="vertical" size="middle" style={{ width: "100%" }} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="workspace-skeleton-inline">
            <SkeletonBar inline width={74} height={16} />
            <SkeletonBar inline width={186} height={15} />
            <SkeletonBar inline width={106} height={15} />
            <SkeletonBtn width={88} />
          </div>
        ))}
      </Space>
    </Card>
  );
}

/** Room summary card list skeleton matching `.workspace-room-list` in `CourseRoomsPage`. */
export function RoomListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="workspace-room-list" aria-busy="true" aria-label="Đang tải danh sách phòng">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} className="workspace-room-card">
          <div aria-hidden="true">
            <SkeletonBar width={164} height={20} />
            <SkeletonBar width={82} height={14} style={{ marginTop: 6 }} />
            <SkeletonBar width="74%" height={15} style={{ marginTop: 10 }} />
            <div style={{ marginTop: 10 }}>
              <SkeletonTags widths={TAG_WIDTH_SETS[index % TAG_WIDTH_SETS.length]} />
            </div>
            <SkeletonBar width="46%" height={15} style={{ marginTop: 10 }} />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Room preview pane skeleton matching `#room-preview` in `CourseRoomsPage`. */
export function RoomPreviewSkeleton() {
  return (
    <Space
      direction="vertical"
      size="middle"
      style={{ width: "100%" }}
      aria-busy="true"
      aria-label="Đang tải chi tiết phòng"
    >
      <SkeletonBar width={210} height={28} />
      <SkeletonTag width={80} />
      <SkeletonBar width="56%" height={16} />
      <div>
        <SkeletonBar width={106} height={16} style={{ marginBottom: 8 }} />
        <SkeletonBar width="94%" height={15} style={{ marginBottom: 6 }} />
        <SkeletonBar width="72%" height={15} />
      </div>
      <SkeletonBar width="46%" height={16} />
      <SkeletonBar width="40%" height={16} />
      <div className="workspace-skeleton-inline">
        <SkeletonBar inline width={120} height={16} />
        <SkeletonTags widths={[60, 76, 56]} />
      </div>
      <div className="workspace-skeleton-inline">
        <SkeletonBar inline width={96} height={16} />
        <SkeletonTags widths={[52, 52, 52]} />
      </div>
      <SkeletonBar width="76%" height={16} />
      <Space wrap>
        <SkeletonBar inline width={110} height={16} />
        <SkeletonBtn width={102} />
      </Space>
    </Space>
  );
}

/** Composition analysis skeleton matching `RoomCompositionSummary` (alert + criteria progress list). */
export function RoomCompositionSkeleton({ count = 3 }: { count?: number }) {
  const items = Array.from({ length: count }, (_, index) => index);
  return (
    <div role="status" aria-busy="true" aria-label="Đang kiểm tra cơ cấu nhóm">
      <div aria-hidden="true">
        <SkeletonBar width="100%" height={40} radius={8} />
        <List
          style={{ marginTop: 8 }}
          dataSource={items}
          renderItem={(index) => (
            <List.Item key={index}>
              <div style={{ width: "100%", minWidth: 0 }}>
                <div className="workspace-skeleton-inline">
                  <SkeletonBar inline width={128} height={16} />
                  <SkeletonTag width={70} />
                </div>
                <SkeletonBar width={204} height={14} style={{ marginTop: 6 }} />
                <SkeletonBar width="100%" height={6} radius={99} style={{ marginTop: 8 }} />
                <SkeletonBar width={156} height={14} style={{ marginTop: 6 }} />
              </div>
            </List.Item>
          )}
        />
      </div>
    </div>
  );
}

function renderCellSkeleton(column: SkeletonColumn, rowIndex: number): ReactNode {
  switch (column.kind ?? "text") {
    case "code":
      return <SkeletonBar width={76} height={16} />;
    case "longText":
      return <SkeletonBar width={LONG_TEXT_WIDTHS[rowIndex % LONG_TEXT_WIDTHS.length]} height={16} />;
    case "number":
      return <SkeletonBar width={40} height={16} />;
    case "date":
      return <SkeletonBar width={114} height={16} />;
    case "tag":
      return <SkeletonTag width={88} />;
    case "tags":
      return <SkeletonTags widths={TAG_WIDTH_SETS[rowIndex % TAG_WIDTH_SETS.length]} />;
    case "actions": {
      const widths = column.actionWidths ?? [84];
      return (
        <Space wrap>
          {widths.map((width, index) => (
            <SkeletonBtn key={index} width={width} />
          ))}
        </Space>
      );
    }
    case "text":
    default:
      return <SkeletonBar width={TEXT_WIDTHS[rowIndex % TEXT_WIDTHS.length]} height={16} />;
  }
}

/** Table skeleton keeping the exact real column headers, scroll width, expand column, and cell shapes. */
export function TableSkeleton({
  columns,
  rows = 5,
  size = "middle",
  scrollX,
  showExpandColumn = false,
  pagination,
}: {
  columns: SkeletonColumn[];
  rows?: number;
  size?: "small" | "middle" | "large";
  scrollX?: number | "max-content";
  showExpandColumn?: boolean;
  pagination?: { current?: number; pageSize?: number; total?: number };
}) {
  const dataSource: SkeletonRow[] = Array.from({ length: rows }, (_, index) => ({
    key: `skeleton-row-${index}`,
    index,
  }));

  const tableColumns: ColumnsType<SkeletonRow> = columns.map((column, columnIndex) => ({
    key: `${column.title}-${columnIndex}`,
    title: column.title,
    render: (_, row) => <div aria-hidden="true">{renderCellSkeleton(column, row.index)}</div>,
  }));

  return (
    <div aria-busy="true" aria-label="Đang tải bảng dữ liệu">
      <Table
        scroll={scrollX ? { x: scrollX } : undefined}
        size={size}
        rowKey="key"
        pagination={false}
        dataSource={dataSource}
        columns={tableColumns}
        expandable={
          showExpandColumn
            ? {
                expandedRowRender: () => null,
                rowExpandable: () => false,
                expandIcon: () => null,
              }
            : undefined
        }
      />
      {pagination && (pagination.total ?? 0) > 0 && (
        <div className="workspace-table-pagination">
          <Pagination
            current={pagination.current}
            pageSize={pagination.pageSize}
            total={pagination.total}
            showSizeChanger
            disabled
          />
        </div>
      )}
    </div>
  );
}

/** Bordered descriptions skeleton matching `CourseDetailPage` metadata block. */
export function CourseDescriptionsSkeleton() {
  const items = [
    { key: "type", label: "Loại nhóm", children: <SkeletonBar width={116} height={16} /> },
    { key: "rule", label: "Quy định", children: <SkeletonBar width="86%" height={16} /> },
    { key: "start", label: "Bắt đầu", children: <SkeletonBar width={126} height={16} /> },
    { key: "end", label: "Hạn", children: <SkeletonBar width={126} height={16} /> },
  ];

  return (
    <Descriptions
      bordered
      size="small"
      className="workspace-course-description"
      column={{ xs: 1, sm: 2, lg: 2, xl: 2, xxl: 2 }}
      items={items}
    />
  );
}

/** Stats card skeleton matching `Tiến độ ghép nhóm` in `CourseDetailPage`. */
export function CourseStatsSkeleton() {
  return (
    <Card
      title="Tiến độ ghép nhóm"
      className="workspace-section"
      aria-busy="true"
      aria-label="Đang tải thống kê"
    >
      <MetricsSkeleton count={4} withCards={false} />
      <div className="workspace-section" aria-hidden="true">
        <SkeletonBar width={122} height={15} style={{ marginBottom: 8 }} />
        <SkeletonBar width="100%" height={8} radius={99} />
      </div>
      <div className="workspace-section" aria-hidden="true">
        <SkeletonTags widths={[88, 92, 114, 78]} />
      </div>
    </Card>
  );
}

/** Full initial page skeleton for `CourseDetailPage`. */
export function CourseDetailSkeleton({ canManage, isAdmin }: { canManage: boolean; isAdmin: boolean }) {
  const studentColumns: SkeletonColumn[] = [
    { title: "Mã SV", kind: "code" },
    { title: "Họ tên", kind: "text" },
    { title: "Email", kind: "longText" },
    { title: "Ngành", kind: "code" },
    { title: "GPA", kind: "number" },
    { title: "Vai trò", kind: "tags" },
    { title: "Phòng", kind: "text" },
    ...(isAdmin ? [{ title: "Thao tác", kind: "actions" as const, actionWidths: [52] }] : []),
  ];

  return (
    <div className="workspace-page">
      <PageHeadingSkeleton
        hasBackLink
        hasTag
        titleWidth={168}
        actionWidths={canManage ? [116, 56] : undefined}
      />
      <CourseDescriptionsSkeleton />
      <CourseStatsSkeleton />
      <div className="workspace-section" aria-busy="true" aria-label="Đang tải danh sách trong Course">
        <div className="workspace-skeleton-tabs" aria-hidden="true">
          <SkeletonBar inline width={74} height={18} />
          <SkeletonBar inline width={56} height={18} />
          <SkeletonBar inline width={56} height={18} />
        </div>
        <Space wrap className="workspace-toolbar" aria-hidden="true">
          <SkeletonBar inline width={240} height={32} radius={8} />
          <SkeletonBar inline width={150} height={32} radius={8} />
          <SkeletonBar inline width={160} height={32} radius={8} />
          {isAdmin && <SkeletonBtn width={126} />}
        </Space>
        <TableSkeleton scrollX={840} rows={5} columns={studentColumns} />
      </div>
    </div>
  );
}

/** Full initial page skeleton for `RoomDetailPage`. */
export function RoomDetailSkeleton() {
  return (
    <>
      <PageHeadingSkeleton hasBackLink hasSubtitle titleWidth={210} actionWidths={[120, 148]} />
      <FactsCardSkeleton title="Thông tin tuyển" hasStatusTag count={6} hasDescription hasTags />
      <Typography.Title level={2}>Thành viên</Typography.Title>
      <TableSkeleton
        scrollX={650}
        rows={3}
        columns={[
          { title: "Mã SV", kind: "code" },
          { title: "Họ tên", kind: "text" },
          { title: "Ngành", kind: "code" },
          { title: "GPA", kind: "number" },
          { title: "Vai trò", kind: "tags" },
          { title: "Ngày vào", kind: "date" },
        ]}
      />
      <Card title="Cơ cấu nhóm" style={{ marginTop: 16 }}>
        <RoomCompositionSkeleton />
      </Card>
    </>
  );
}

/** Full initial page skeleton for `GroupDetailPage`. */
export function GroupDetailSkeleton() {
  return (
    <>
      <PageHeadingSkeleton hasBackLink hasSubtitle titleWidth={190} />
      <FactsCardSkeleton count={3} lastFactTags />
      <Typography.Title level={2}>Thành viên</Typography.Title>
      <TableSkeleton
        scrollX={390}
        rows={4}
        columns={[
          { title: "Mã SV", kind: "code" },
          { title: "Họ tên", kind: "text" },
          { title: "Ngành", kind: "code" },
        ]}
      />
    </>
  );
}
