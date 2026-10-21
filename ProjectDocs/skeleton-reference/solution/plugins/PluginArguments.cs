// PluginArguments.cs — the argument-unpacking helpers the five handlers share.
//
// Small on purpose. A custom API's InputParameters collection omits an optional parameter
// entirely rather than carrying a null, and `(Guid)context.InputParameters["X"]` on an
// absent key throws a KeyNotFoundException that surfaces to the caller as an opaque
// platform fault. Every handler here therefore names the parameter it is missing.

using System;
using Microsoft.Xrm.Sdk;

namespace VSB.Cloud.Plugins
{
    internal static class PluginArguments
    {
        internal static T Require<T>(this IPluginExecutionContext context, string name)
        {
            if (!context.InputParameters.Contains(name) || context.InputParameters[name] == null)
            {
                throw new InvalidPluginExecutionException(
                    $"{name} is a required parameter of this custom API and was not supplied.");
            }
            return (T)context.InputParameters[name];
        }

        internal static T? Optional<T>(this IPluginExecutionContext context, string name)
            where T : struct
        {
            return context.InputParameters.Contains(name) && context.InputParameters[name] != null
                ? (T?)context.InputParameters[name]
                : null;
        }

        internal static string OptionalString(this IPluginExecutionContext context, string name)
        {
            return context.InputParameters.Contains(name)
                ? context.InputParameters[name] as string
                : null;
        }

        /// <summary>
        /// Refuse to run outside the platform transaction. Every message in this assembly
        /// exists because a sequence of writes has to be atomic; a step registered
        /// asynchronously, or on a pre/post stage instead of the main operation, silently
        /// reintroduces exactly the partial-write window the message was created to close.
        /// </summary>
        internal static void RequireTransaction(this IPluginExecutionContext context, string message)
        {
            if (context.IsInTransaction) return;
            throw new InvalidPluginExecutionException(
                $"{message} must be registered as a SYNCHRONOUS step on the main operation so " +
                "its writes share one transaction. It is not currently running in a " +
                "transaction, which means a partial outcome is possible. Re-register the step.");
        }
    }
}
