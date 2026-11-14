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
