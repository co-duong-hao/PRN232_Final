using Exe.Contracts.Events;
namespace Exe.NotiService.Email;
public interface IEmailSender
{
    Task SendAsync(EventRecipient recipient, RenderedEmail email, CancellationToken cancellationToken);
}
