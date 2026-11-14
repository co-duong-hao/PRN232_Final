using Exe.TeamService.Abstractions;
using Exe.TeamService.Infrastructure.Jobs;
using Exe.TeamService.Infrastructure.Matching;
using Exe.TeamService.Infrastructure.Messaging;
using StackExchange.Redis;
using Proto = Exe.Contracts.Grpc;

namespace Exe.TeamService.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddTeamInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<IConnectionMultiplexer>(_ =>
        {
            var options = ConfigurationOptions.Parse(configuration["Redis:ConnectionString"] ?? "localhost:6379");
            options.AbortOnConnectFail = false;
            return ConnectionMultiplexer.Connect(options);
        });
        services.AddSingleton<IEventPublisher, RedisStreamEventPublisher>();
        services.AddGrpcClient<Proto.Matching.MatchingClient>(options =>
        {
            options.Address = new Uri(configuration["Matching:Address"] ?? "http://localhost:5103");
        });
        services.AddScoped<IMatchingClient, GrpcMatchingClient>();
        services.AddScoped<ICourseCloseRepository, CourseCloseRepository>();
        services.AddScoped<CourseCloseProcessor>(sp => new CourseCloseProcessor(
            sp.GetRequiredService<ICourseCloseRepository>(), sp.GetRequiredService<IEventPublisher>()));
        services.AddHostedService<CourseCloseJob>();
        return services;
    }
}
