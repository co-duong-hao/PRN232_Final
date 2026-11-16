# Pipeline CI/CD

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Workflow xây backend, chạy test, kiểm tra định dạng frontend và build web. Job image phụ thuộc kết quả backend và frontend.

Matrix chạy riêng từng image. Điều kiện `PUSH` giới hạn việc xuất bản GHCR ở nhánh `main` và loại trừ pull request.

Khi điều tra một lần triển khai, ghi lại commit, trạng thái các job và tag image. Lỗi build image, lỗi test và lỗi runtime là ba giai đoạn khác nhau.

## Cách kiểm tra

1. Đối chiếu tên 6 image trong matrix với tên image trong Compose.
2. Tìm kết quả test `.trx` trong artifact của job backend khi workflow đã chạy.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### ci-cd.yml

Định nghĩa trigger, quyền, pipeline kiểm tra và matrix dựng image.

[.github/workflows/ci-cd.yml dòng 1–141](../../.github/workflows/ci-cd.yml#L1-L141)

~~~yaml
# CI: every push and pull request builds the .NET solution, runs the unit tests, checks and builds the web app,
#     and builds the six Docker images.
# CD: on a push to main (and on manual runs from main) the images are also pushed to GitHub Container Registry:
#     ghcr.io/<owner>/prn232-<service>:latest and :sha-<short commit>. `docker compose pull` then fetches them.
name: CI/CD

on:
  push:
    branches: [main, integration, "feat/**"]
  pull_request:
    branches: [main, integration]
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

env:
  DOTNET_NOLOGO: true
  DOTNET_CLI_TELEMETRY_OPTOUT: true

jobs:
  backend:
    name: Backend build and unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-dotnet@v4
        with:
          global-json-file: global.json

      - name: Restore
        run: dotnet restore ExeTeamMatching.sln

      - name: Build
        run: dotnet build ExeTeamMatching.sln -c Release --no-restore

      - name: Test
        run: >
          dotnet test ExeTeamMatching.sln -c Release --no-build
          --logger "trx;LogFilePrefix=results" --results-directory TestResults

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: TestResults/*.trx
          if-no-files-found: warn

  frontend:
    name: Frontend format check and build
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - run: npm ci --no-fund --no-audit
      - run: npm run format:check
      - run: npm run build

  images:
    name: Docker image ${{ matrix.service }}
    needs: [backend, frontend]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - service: auth-service
            context: .
            dockerfile: src/AuthService/Dockerfile
          - service: team-service
            context: .
            dockerfile: src/TeamService/Dockerfile
          - service: matching-service
            context: .
            dockerfile: src/MatchingService/Dockerfile
          - service: noti-service
            context: .
            dockerfile: src/NotiService/Dockerfile
          - service: gateway
            context: .
            dockerfile: src/Gateway/Dockerfile
          - service: web
            context: frontend
            dockerfile: frontend/Dockerfile
    env:
      # Push only from main; every other branch and pull request just proves the image builds.
      PUSH: ${{ github.ref == 'refs/heads/main' && github.event_name != 'pull_request' }}
    steps:
      - uses: actions/checkout@v4

      - name: Image name
        id: name
        run: echo "image=ghcr.io/${GITHUB_REPOSITORY_OWNER,,}/prn232-${{ matrix.service }}" >> "$GITHUB_OUTPUT"

      - uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        if: env.PUSH == 'true'
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Tags and labels
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ steps.name.outputs.image }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,prefix=sha-

      - name: Build (and push on main)
        uses: docker/build-push-action@v6
        with:
          context: ${{ matrix.context }}
          file: ${{ matrix.dockerfile }}
          push: ${{ env.PUSH == 'true' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha,scope=${{ matrix.service }}
          cache-to: type=gha,mode=max,scope=${{ matrix.service }}
~~~
