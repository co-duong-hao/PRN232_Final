using Exe.NotiService.Email;
using Exe.NotiService.Options;
using Exe.NotiService.Workers;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.Configure<KafkaOptions>(builder.Configuration.GetSection("Kafka"));
builder.Services.Configure<SmtpOptions>(builder.Configuration.GetSection("Smtp"));
builder.Services.AddSingleton<IDeadLetterPublisher, DeadLetterPublisher>();
builder.Services.AddSingleton<EmailTemplateRenderer>();
builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();
builder.Services.AddSingleton<EventProcessor>();
builder.Services.AddHostedService<EventConsumerWorker>();
var host = builder.Build();
host.Run();
