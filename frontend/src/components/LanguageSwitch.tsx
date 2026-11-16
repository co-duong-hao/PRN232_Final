import { Segmented } from "antd";
import { useI18n, type Language } from "@/i18n";

export function LanguageSwitch({ className }: { className?: string }) {
  const { language, setLanguage } = useI18n();

  return (
    <div className={`app-lang-switch ${className ?? ""}`.trim()}>
      <Segmented<Language>
        size="small"
        value={language}
        onChange={(val) => setLanguage(val)}
        options={[
          { label: "VN", value: "vi" },
          { label: "EN", value: "en" },
        ]}
      />
    </div>
  );
}
