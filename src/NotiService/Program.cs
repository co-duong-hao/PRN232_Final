using Exe.NotiService.Email;
using Exe.NotiService.Options;
using Exe.NotiService.Workers;
using Microsoft.Extensions.Options;
using StackExchange.Redis;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.Configure<RedisOptions>(builder.Configuration.GetSection("Redis"));
builder.Services.Configure<SmtpOptions>(builder.Configuration.GetSection("Smtp"));
builder.Services.AddSingleton<IConnectionMultiplexer>(services =>
{
    var settings = services.GetRequiredService<IOptions<RedisOptions>>().Value;
    var options = ConfigurationOptions.Parse(settings.ConnectionString);
    options.AbortOnConnectFail = false;
    return ConnectionMultiplexer.Connect(options);
});
builder.Services.AddSingleton<EmailTemplateRenderer>();
builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();
builder.Services.AddSingleton<EventProcessor>();
builder.Services.AddHostedService<EventConsumerWorker>();
var host = builder.Build();
host.Run();
