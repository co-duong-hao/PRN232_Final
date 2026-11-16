# Build và image Docker

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Các dự án backend dùng .NET 8, với phiên bản SDK từ `global.json` và phụ thuộc khai báo tập trung.

Dockerfile cho .NET dùng giai đoạn SDK để publish rồi sao chép kết quả sang image runtime. Dockerfile frontend chạy npm/Vite trước khi chuyển sang Nginx.

Phiên bản image ứng dụng có thể cố định theo `IMAGE_TAG`. Thông tin trong tag nên được kiểm tra khi so sánh kết quả chạy với mã nguồn.

## Cách kiểm tra

1. Xác định phiên bản SDK và build solution bằng `dotnet build ExeTeamMatching.sln`.
2. Chạy `npm run build` trong `frontend/` để kiểm tra TypeScript và Vite trước khi đóng gói.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### global.json

Chính sách chọn phiên bản .NET SDK.

[global.json dòng 1–6](../../global.json#L1-L6)

~~~json
{
  "sdk": {
    "version": "8.0.400",
    "rollForward": "latestFeature"
  }
}
~~~

### Directory.Build.props

Các thuộc tính build áp dụng cho dự án .NET.

[Directory.Build.props dòng 1–8](../../Directory.Build.props#L1-L8)

~~~xml
<Project>
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <LangVersion>12.0</LangVersion>
  </PropertyGroup>
</Project>
~~~

### Directory.Packages.props

Các phiên bản NuGet dùng chung.

[Directory.Packages.props dòng 1–33](../../Directory.Packages.props#L1-L33)

~~~xml
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>
  <ItemGroup>
    <!-- ASP.NET Core / EF Core -->
    <PackageVersion Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="8.0.11" />
    <PackageVersion Include="Microsoft.AspNetCore.Mvc.Testing" Version="8.0.11" />
    <PackageVersion Include="Microsoft.EntityFrameworkCore" Version="8.0.11" />
    <PackageVersion Include="Microsoft.EntityFrameworkCore.Design" Version="8.0.11" />
    <PackageVersion Include="Microsoft.EntityFrameworkCore.SqlServer" Version="8.0.11" />
    <PackageVersion Include="Microsoft.EntityFrameworkCore.Sqlite" Version="8.0.11" />
    <PackageVersion Include="Microsoft.Extensions.Hosting" Version="8.0.1" />
    <PackageVersion Include="Swashbuckle.AspNetCore" Version="6.9.0" />
    <PackageVersion Include="Yarp.ReverseProxy" Version="2.2.0" />
    <!-- gRPC -->
    <PackageVersion Include="Google.Protobuf" Version="3.28.3" />
    <PackageVersion Include="Grpc.AspNetCore" Version="2.67.0" />
    <PackageVersion Include="Grpc.Net.Client" Version="2.67.0" />
    <PackageVersion Include="Grpc.Net.ClientFactory" Version="2.67.0" />
    <PackageVersion Include="Grpc.Tools" Version="2.67.0" />
    <!-- Messaging / cache / mail -->
    <PackageVersion Include="Confluent.Kafka" Version="2.16.0" />
    <PackageVersion Include="Microsoft.Extensions.Caching.StackExchangeRedis" Version="8.0.34" />
    <PackageVersion Include="StackExchange.Redis" Version="2.8.16" />
    <PackageVersion Include="MailKit" Version="4.18.2" />
    <!-- Tests -->
    <PackageVersion Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />
    <PackageVersion Include="Moq" Version="4.20.72" />
    <PackageVersion Include="xunit" Version="2.9.2" />
    <PackageVersion Include="xunit.runner.visualstudio" Version="2.8.2" />
  </ItemGroup>
</Project>
~~~

### Dockerfile

Image AuthService.

[src/AuthService/Dockerfile dòng 1–13](../../src/AuthService/Dockerfile#L1-L13)

~~~dockerfile
# Build context: repository root (set by docker-compose.yml).
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/Shared/ src/Shared/
COPY src/AuthService/ src/AuthService/
RUN dotnet publish src/AuthService/Exe.AuthService.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .
USER app
ENTRYPOINT ["dotnet", "Exe.AuthService.dll"]
~~~

### Dockerfile

Image TeamService.

[src/TeamService/Dockerfile dòng 1–13](../../src/TeamService/Dockerfile#L1-L13)

~~~dockerfile
# Build context: repository root (set by docker-compose.yml).
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/Shared/ src/Shared/
COPY src/TeamService/ src/TeamService/
RUN dotnet publish src/TeamService/Exe.TeamService.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .
USER app
ENTRYPOINT ["dotnet", "Exe.TeamService.dll"]
~~~

### Dockerfile

Image MatchingService.

[src/MatchingService/Dockerfile dòng 1–13](../../src/MatchingService/Dockerfile#L1-L13)

~~~dockerfile
# Build context: repository root (set by docker-compose.yml).
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/Shared/ src/Shared/
COPY src/MatchingService/ src/MatchingService/
RUN dotnet publish src/MatchingService/Exe.MatchingService.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .
USER app
ENTRYPOINT ["dotnet", "Exe.MatchingService.dll"]
~~~

### Dockerfile

Image NotiService.

[src/NotiService/Dockerfile dòng 1–13](../../src/NotiService/Dockerfile#L1-L13)

~~~dockerfile
# Build context: repository root (set by docker-compose.yml).
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/Shared/ src/Shared/
COPY src/NotiService/ src/NotiService/
RUN dotnet publish src/NotiService/Exe.NotiService.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/runtime:8.0
WORKDIR /app
COPY --from=build /app/publish .
USER app
ENTRYPOINT ["dotnet", "Exe.NotiService.dll"]
~~~

### Dockerfile

Image Gateway.

[src/Gateway/Dockerfile dòng 1–13](../../src/Gateway/Dockerfile#L1-L13)

~~~dockerfile
# Build context: repository root (set by docker-compose.yml).
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/Shared/ src/Shared/
COPY src/Gateway/ src/Gateway/
RUN dotnet publish src/Gateway/Exe.Gateway.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .
USER app
ENTRYPOINT ["dotnet", "Exe.Gateway.dll"]
~~~

### Dockerfile

Image frontend hai giai đoạn.

[frontend/Dockerfile dòng 1–11](../../frontend/Dockerfile#L1-L11)

~~~dockerfile
# Build context: frontend/ (set by docker-compose.yml).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
~~~

### package.json

Lệnh kiểm tra kiểu, build và phụ thuộc web.

[frontend/package.json dòng 1–30](../../frontend/package.json#L1-L30)

~~~json
{
  "name": "exe-team-matching-web",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b",
    "format": "prettier --write src",
    "format:check": "prettier --check src",
    "preview": "vite preview"
  },
  "dependencies": {
    "@ant-design/icons": "5.6.1",
    "antd": "5.29.3",
    "dayjs": "1.11.23",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router-dom": "6.30.6"
  },
  "devDependencies": {
    "@types/react": "18.3.31",
    "@types/react-dom": "18.3.7",
    "@vitejs/plugin-react": "4.7.0",
    "prettier": "3.10.1",
    "typescript": "5.9.3",
    "vite": "5.4.21"
  }
}
~~~

### vite.config.ts

Cổng phát triển và proxy API.

[frontend/vite.config.ts dòng 1–19](../../frontend/vite.config.ts#L1-L19)

~~~typescript
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev server proxies /api to the API Gateway, so the browser never makes a cross-origin call.
// Start the backend first (docker compose up -d), then `npm run dev`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: { chunkSizeWarningLimit: 1500 },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
});
~~~
