using Exe.TeamService.Abstractions;
using Exe.TeamService.Infrastructure.Jobs;
using Exe.TeamService.Infrastructure.Matching;
using Exe.TeamService.Infrastructure.Messaging;
using Confluent.Kafka;
using Exe.TeamService.Infrastructure.Caching;
using Proto = Exe.Contracts.Grpc;

namespace Exe.TeamService.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddTeamInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddStackExchangeRedisCache(options =>
        {
            options.Configuration = configuration["Redis:ConnectionString"] ?? "localhost:6379";
            options.InstanceName = configuration["Redis:InstanceName"] ?? "exe-team:";
        });
        services.AddSingleton<ITeamCache, TeamCache>();
        services.AddSingleton<IProducer<string, string>>(_ => new ProducerBuilder<string, string>(new ProducerConfig
        {
            BootstrapServers = configuration["Kafka:BootstrapServers"] ?? "localhost:9094",
            Acks = Acks.All, EnableIdempotence = true, MessageTimeoutMs = 5000
        }).Build());
        services.AddSingleton<IEventPublisher, KafkaEventPublisher>();
        services.AddGrpcClient<Proto.Matching.MatchingClient>(options =>
        {
            options.Address = new Uri(configuration["Matching:Address"] ?? "http://localhost:5103");
        });
        services.AddScoped<IMatchingClient, GrpcMatchingClient>();
        services.AddScoped<ICourseCloseRepository, CourseCloseRepository>();
        services.AddScoped<CourseCloseProcessor>(sp => new CourseCloseProcessor(
            sp.GetRequiredService<ICourseCloseRepository>(), sp.GetRequiredService<IEventPublisher>(), sp.GetRequiredService<ITeamCache>()));
        services.AddHostedService<CourseCloseJob>();
        return services;
    }
}
