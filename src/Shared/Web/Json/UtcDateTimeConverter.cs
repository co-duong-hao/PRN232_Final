using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.DependencyInjection;

namespace Exe.Shared.Web.Json;

/// <summary>
/// All timestamps in this system are UTC, but SQL Server <c>datetime2</c> does not store the kind, so values
/// read through EF Core come back as <see cref="DateTimeKind.Unspecified"/> and would be serialised without a
/// "Z". This converter writes every <see cref="DateTime"/> as UTC ("2026-11-15T08:21:33.433Z") and reads
/// incoming values as UTC, so clients never misread them as local time.
/// </summary>
public sealed class UtcDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.GetDateTime();
        return value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
        };
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        var utc = value.Kind switch
        {
            DateTimeKind.Local => value.ToUniversalTime(),
            DateTimeKind.Unspecified => DateTime.SpecifyKind(value, DateTimeKind.Utc),
            _ => value,
        };
        writer.WriteStringValue(utc.ToString("yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'", CultureInfo.InvariantCulture));
    }
}

public static class JsonExtensions
{
    /// <summary>Applies the shared JSON conventions to MVC controllers and minimal APIs.</summary>
    public static IServiceCollection AddExeJson(this IServiceCollection services)
    {
        services.Configure<Microsoft.AspNetCore.Mvc.JsonOptions>(o =>
            o.JsonSerializerOptions.Converters.Add(new UtcDateTimeConverter()));
        services.Configure<JsonOptions>(o => o.SerializerOptions.Converters.Add(new UtcDateTimeConverter()));
        return services;
    }
}
