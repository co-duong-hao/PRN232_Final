using Exe.Shared.Web.Observability;
using Exe.NotiService;
using Exe.NotiService.Email;
using Exe.NotiService.Options;
using Exe.NotiService.Workers;

var builder = WebApplication.CreateBuilder(args);
builder.Services.Configure<KafkaOptions>(builder.Configuration.GetSection("Kafka"));
builder.Services.Configure<SmtpOptions>(builder.Configuration.GetSection("Smtp"));
builder.Services.AddSingleton<IDeadLetterPublisher, DeadLetterPublisher>();
builder.Services.AddSingleton<EmailTemplateRenderer>();
builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();
builder.Services.AddSingleton<EventProcessor>();
builder.Services.AddHostedService<EventConsumerWorker>();
builder.Services.AddExeMetrics("noti-service", NotiMetrics.MeterName);
builder.Services.AddSingleton<NotiMetrics>();
builder.Services.AddHealthChecks();
var app = builder.Build();
app.MapHealthChecks("/health");
app.MapExeMetrics();
app.Run();

/// <summary>Exposed for WebApplicationFactory in tests.</summary>
public partial class Program;
