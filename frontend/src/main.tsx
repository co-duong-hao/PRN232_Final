import { App as AntApp, ConfigProvider } from "antd";
import viVN from "antd/locale/vi_VN";
import dayjs from "dayjs";
import "dayjs/locale/vi";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import "./styles.css";

dayjs.locale("vi");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider
      locale={viVN}
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
  </StrictMode>,
);
