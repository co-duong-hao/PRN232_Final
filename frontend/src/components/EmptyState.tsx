import type { ReactNode } from "react";

/** Clean text-only empty state without default cartoon SVG illustrations or emojis. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="app-empty-state">
      <div className="app-empty-state__title">{title}</div>
      {description && <div className="app-empty-state__desc">{description}</div>}
      {action && <div className="app-empty-state__action">{action}</div>}
    </div>
  );
}
