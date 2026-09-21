# Security

Please do not put keys or private conversations in public issues. Report security concerns privately to hello@kencox.com with reproduction steps and sanitized examples.

Keep the server behind HTTPS, provider keys in a protected environment file, and live endpoints behind the owner token. Never add credentials to public JavaScript. Rotate a credential if it is exposed. The public demo does not need live access.

This initial release is for a small owner-operated instance. Before offering public paid inference, add per-user authentication, durable quotas and appropriate operational monitoring. Schema validation is not protection against every semantic prompt-injection attack; inspect generated questions and do not use this app to execute consequential actions automatically.
