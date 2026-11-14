using Exe.Contracts.Events;
using Exe.NotiService.Options;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;
namespace Exe.NotiService.Email;
public sealed class SmtpEmailSender(IOptions<SmtpOptions> options) : IEmailSender
{
    public async Task SendAsync(EventRecipient recipient, RenderedEmail email, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(settings.FromName, settings.From));
        message.To.Add(new MailboxAddress(recipient.FullName, recipient.Email));
        message.Subject = email.Subject;
        message.Body = new TextPart("plain") { Text = email.Body };
        using var client = new SmtpClient();
        await client.ConnectAsync(settings.Host, settings.Port, SecureSocketOptions.None, cancellationToken);
        await client.SendAsync(message, cancellationToken);
        await client.DisconnectAsync(true, cancellationToken);
    }
}
