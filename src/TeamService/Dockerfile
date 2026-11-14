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
