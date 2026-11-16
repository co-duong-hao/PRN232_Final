# Migration dữ liệu tuyển thành viên

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Migration `Recruitment` bổ sung GPA, mô tả dự án và liên kết vai trò mong muốn hoặc vai trò cần tuyển.

Các trường hồ sơ mới cho phép null khi tương thích với bản ghi trước đó. Bảng nối có khóa ghép để mỗi cặp chỉ có một liên kết.

Khi nâng database cũ, hãy tách kiểm tra migration khỏi hành vi bổ sung seed. Seeder hiện có đường gán `Forming` cho `FA26-EXE201` trong lần tạo danh mục vai trò đầu tiên.

## Cách kiểm tra

1. Kiểm tra schema và `__EFMigrationsHistory` trong TeamDb sau khi áp dụng migration.
2. Trên bản sao SQL thử nghiệm, so sánh trạng thái Course và số lượng ghi danh trước và sau khi khởi động v0.4.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### 20261116010438_Recruitment.cs

Các thay đổi Up và Down của migration.

[src/TeamService/Data/Migrations/20261116010438_Recruitment.cs dòng 1–174](../../src/TeamService/Data/Migrations/20261116010438_Recruitment.cs#L1-L174)

~~~csharp
using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Exe.TeamService.Data.Migrations
{
    /// <inheritdoc />
    public partial class Recruitment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "Gpa",
                table: "Students",
                type: "decimal(3,2)",
                precision: 3,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IdeaDescription",
                table: "Rooms",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Name",
                table: "Rooms",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProjectName",
                table: "Rooms",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "RequiredGpa",
                table: "Rooms",
                type: "decimal(3,2)",
                precision: 3,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TargetGrade",
                table: "Rooms",
                type: "decimal(4,2)",
                precision: 4,
                scale: 2,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TeamRoles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamRoles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RoomNeededRoles",
                columns: table => new
                {
                    RoomId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TeamRoleId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RoomNeededRoles", x => new { x.RoomId, x.TeamRoleId });
                    table.ForeignKey(
                        name: "FK_RoomNeededRoles_Rooms_RoomId",
                        column: x => x.RoomId,
                        principalTable: "Rooms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RoomNeededRoles_TeamRoles_TeamRoleId",
                        column: x => x.TeamRoleId,
                        principalTable: "TeamRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StudentTeamRoles",
                columns: table => new
                {
                    StudentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TeamRoleId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudentTeamRoles", x => new { x.StudentId, x.TeamRoleId });
                    table.ForeignKey(
                        name: "FK_StudentTeamRoles_Students_StudentId",
                        column: x => x.StudentId,
                        principalTable: "Students",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudentTeamRoles_TeamRoles_TeamRoleId",
                        column: x => x.TeamRoleId,
                        principalTable: "TeamRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RoomNeededRoles_TeamRoleId",
                table: "RoomNeededRoles",
                column: "TeamRoleId");

            migrationBuilder.CreateIndex(
                name: "IX_StudentTeamRoles_TeamRoleId",
                table: "StudentTeamRoles",
                column: "TeamRoleId");

            migrationBuilder.CreateIndex(
                name: "IX_TeamRoles_Code",
                table: "TeamRoles",
                column: "Code",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RoomNeededRoles");

            migrationBuilder.DropTable(
                name: "StudentTeamRoles");

            migrationBuilder.DropTable(
                name: "TeamRoles");

            migrationBuilder.DropColumn(
                name: "Gpa",
                table: "Students");

            migrationBuilder.DropColumn(
                name: "IdeaDescription",
                table: "Rooms");

            migrationBuilder.DropColumn(
                name: "Name",
                table: "Rooms");

            migrationBuilder.DropColumn(
                name: "ProjectName",
                table: "Rooms");

            migrationBuilder.DropColumn(
                name: "RequiredGpa",
                table: "Rooms");

            migrationBuilder.DropColumn(
                name: "TargetGrade",
                table: "Rooms");
        }
    }
}
~~~

### TeamDbContextFactory.cs

Cấu hình DbContext dùng lúc thao tác migration từ công cụ EF.

[src/TeamService/Data/TeamDbContextFactory.cs dòng 1–17](../../src/TeamService/Data/TeamDbContextFactory.cs#L1-L17)

~~~csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Exe.TeamService.Data;

public class TeamDbContextFactory : IDesignTimeDbContextFactory<TeamDbContext>
{
    public TeamDbContext CreateDbContext(string[] args)
    {
        var configuration = new ConfigurationBuilder().SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: true).AddEnvironmentVariables().Build();
        return new TeamDbContext(new DbContextOptionsBuilder<TeamDbContext>()
            .UseSqlServer(configuration.GetConnectionString("Default") ?? "Server=localhost;Database=ExeTeam;Integrated Security=true;TrustServerCertificate=true")
            .Options);
    }
}
~~~
