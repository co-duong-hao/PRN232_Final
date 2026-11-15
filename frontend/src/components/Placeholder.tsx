import { Result } from "antd";

/** Temporary page body until the task that owns the page replaces it. */
export function Placeholder({ title, task }: { title: string; task: string }) {
  return <Result status="info" title={title} subTitle={`Trang này sẽ được hoàn thiện trong task ${task}.`} />;
}
