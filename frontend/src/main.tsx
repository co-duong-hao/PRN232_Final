import { App as AntApp, ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import viVN from "antd/locale/vi_VN";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { LanguageProvider, useI18n } from "./i18n";
import "./styles.css";

function RootApp() {
  const { language } = useI18n();
  const antdLocale = language === "en" ? enUS : viVN;

  return (
    <ConfigProvider
      locale={antdLocale}
      theme={{
        token: {
          colorPrimary: "#C2410C",
          colorLink: "#C2410C",
          colorLinkHover: "#9A3412",
          colorBgLayout: "#F8FAFC",
          colorBorderSecondary: "#E2E8F0",
          colorText: "#0F172A",
          colorTextSecondary: "#475569",
          borderRadius: 8,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
        },
        components: {
          Menu: {
            itemSelectedBg: "#FFF7ED",
            itemSelectedColor: "#C2410C",
            itemHoverBg: "#F8FAFC",
          },
          Table: {
            headerBg: "#F1F5F9",
            headerColor: "#334155",
            rowHoverBg: "#FFFBF7",
          },
          Card: {
            headerFontSize: 15,
          },
        },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <RootApp />
    </LanguageProvider>
  </StrictMode>,
);
