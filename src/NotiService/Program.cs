using Exe.NotiService.Workers;

// Worker process: no HTTP endpoints. Consumes the event stream and sends emails.
var builder = Host.CreateApplicationBuilder(args);

// T3: register options, the Redis connection and the email sender here.
builder.Services.AddHostedService<EventConsumerWorker>();

var host = builder.Build();
host.Run();
