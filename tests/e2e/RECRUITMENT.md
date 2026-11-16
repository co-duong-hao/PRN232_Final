# Recruitment and notification tests

Use a fresh Compose project with separate volumes. The overlay publishes the Gateway at `127.0.0.1:18080` and Mailpit at `127.0.0.1:18025`. The scenario exercises both demo courses.

## Local test suites

From the repository root in PowerShell:

```powershell
dotnet test ExeTeamMatching.sln -c Release
python -m unittest discover -s tests/e2e -p test_recruitment_notifications.py
```

The Gateway integration tests start the real host and substitute responses for upstream services. TeamService tests use SQLite with a fresh seed for each test. The offline Python tests do not need Docker.

## Full workflow

Copy `.env.example` to `.env.recruitment`. Use it only for this test project and exclude it from version control. Set `MSSQL_ACCEPT_EULA=Y` if you accept the SQL Server license. Use distinct local image tags to avoid replacing any existing local images.

```powershell
$env:IMAGE_PREFIX = 'prn232-recruitment-local'
$env:IMAGE_TAG = 'e2e'
$compose = @('-p', 'prn232-recruitment-e2e', '--env-file', '.env.recruitment', '-f', 'docker-compose.yml', '-f', 'tests/e2e/compose.recruitment.yml')
docker compose @compose up -d --build gateway noti-service
docker compose @compose ps
```

Give AuthService and TeamService time to migrate and seed SQL Server before running the scenario.

```powershell
python tests/e2e/recruitment_notifications.py `
  --gateway http://127.0.0.1:18080 `
  --mailpit http://127.0.0.1:18025 `
  --env-file .env.recruitment `
  --confirm-disposable-stack
```

The script checks both courses for existing rooms before it writes data. For another run, use a fresh test project or recreate the dedicated test project's database and Kafka volumes.

## Expected results

| Stage | Evidence |
| --- | --- |
| Student profile | Updated GPA and roles appear on the applicant's own profile and in the leader's application list. |
| Discovery | Role and GPA filters find the room at the threshold. Below the threshold, direct join fails and the search excludes the room. |
| Room locking | The first three members receive the lock notification. |
| Application permissions | Duplicate pending applications and decisions by non-leaders are rejected. |
| Approval and rejection | The applicant receives a personalized decision. Existing members are told when the approved applicant joins. |
| Course isolation | An application in the other course stays pending and its stats cache stays warm. |
| Stats cache | After approval, Gateway returns the refreshed count from TeamService. |
| Group formation | MatchingService accepts the majors, the new leader completes the room, and members receive the group email. The remaining application is cancelled. |

## Diagnose failures

- For login errors, check `SEED_DEFAULT_PASSWORD` in the scenario's env file and whether AuthService has finished seeding.
- For a `502` during startup, check that AuthService and TeamService are available using the dedicated project's `docker compose @compose ps` and `docker compose @compose logs auth-service team-service`.
- For a timeout waiting on email, inspect `docker compose @compose logs noti-service kafka` and compare the delivered subject, recipients, and body in Mailpit.
- The Gateway currently has no rate-limit policy. The integration suite covers routing and JWT.

## Coverage

Run the same collector as the CI backend job.

```powershell
dotnet test ExeTeamMatching.sln -c Release --collect 'Code Coverage' --settings tests/coverage.runsettings --logger trx --results-directory TestResults
```

The `test-results` CI artifact contains the execution logs (`.trx`) and the Cobertura reports per test project. The coverage settings include the application and shared assemblies.
