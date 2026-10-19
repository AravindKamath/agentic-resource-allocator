# Gmail resource requests

Gmail ingestion is an optional adapter around the existing resource-request automation pipeline. It is disabled by default and does not change the authenticated requester or administrator workflows.

## Configuration

Copy the placeholders from `server/.env.example` into the local server environment:

- `GMAIL_ENABLED=true`
- `ADMIN_EMAIL=<registered administrator email>`
- `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`
- `GMAIL_REDIRECT_URI`
- `GMAIL_REFRESH_TOKEN`
- `GMAIL_USER_EMAIL`
- `GMAIL_POLL_INTERVAL_MS` and optional `GMAIL_LABEL`

Create an OAuth 2.0 Web/Desktop client in a Google Cloud project, enable the Gmail API, and add the configured redirect URI. The OAuth flow requests only these scopes:

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`

The configured redirect URI must be the exact backend callback URL, for local development:
`http://localhost:8080/api/gmail/oauth/callback`.

Complete the OAuth consent flow outside this application, store the resulting refresh token in the local secret environment, and never commit it. The application refreshes short-lived access tokens through Google's token endpoint; it does not log tokens or message bodies.

## Processing behavior

When enabled, the server starts a configurable polling loop after MongoDB connects. It:

1. Reads unread messages matching the configured Gmail label.
2. Uses the trusted `From` header to require an existing `User.email`.
3. Stores the Gmail message ID and thread ID before processing, so polling retries cannot create duplicate requests.
4. Creates a normal `ResourceRequest` with the subject and readable body, then invokes the existing worker extraction, deterministic matching, and transactional allocation services.
5. Stores acknowledgement/result/escalation messages in a durable outbox and retries failed delivery up to five attempts.
6. Uses durable message IDs for deduplication; it does not call Gmail's label-modification endpoint, so the read-only scope is sufficient.

Replies in a known clarification thread update the existing request rather than creating another request. A sender cannot perform administrator actions through email; escalation only notifies `ADMIN_EMAIL`, while allocation remains in the existing authorized service/dashboard.

Set `GMAIL_ENABLED=false` to stop ingestion while leaving manual web workflows unchanged. Restart the server after changing environment variables. For testing, mock `gmailClient` and use `STUB_MODE=true` for the extraction worker; do not use a real mailbox in the normal automated test suite.

## Troubleshooting

- `Gmail integration is not fully configured`: check the client ID, client secret, refresh token, and mailbox email without printing their values.
- Polling errors: inspect structured server logs for the action and HTTP status; transient failures are retried on the next interval.
- A message is ignored: its trusted sender is not registered; register the user through the normal flow and resend.
- Delivery remains failed: inspect the outbox record's attempt count and last error, then correct OAuth or mailbox configuration and let the next poll retry it.

## Local authorization

Keep `GMAIL_ENABLED=false` while authorizing. Set the OAuth values in `server/.env` (do not commit them), including:

```dotenv
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REDIRECT_URI=http://localhost:8080/api/gmail/oauth/callback
GMAIL_USER_EMAIL=your-mailbox@example.com
GMAIL_WRITE_REFRESH_TOKEN=true
GMAIL_ENABLED=false
```

Then run:

```bash
cd server
npm start
```

Open this URL in the same machine's browser:
`http://localhost:8080/api/gmail/oauth`

Approve the two displayed Gmail scopes while signed into the account configured by `GMAIL_USER_EMAIL`. The callback verifies the Google account before accepting the token. In local development, `GMAIL_WRITE_REFRESH_TOKEN=true` updates only `server/.env`; an existing refresh token is never replaced when Google omits a new one. The callback page reports only the verified mailbox and whether storage was updated, never the token.

Verify without exposing credentials:

1. Confirm the callback page says the configured mailbox was verified.
2. Confirm `server/.env` contains a non-empty `GMAIL_REFRESH_TOKEN` without printing its value, for example:
   `grep -q '^GMAIL_REFRESH_TOKEN=.' server/.env && echo "refresh token present"`
3. Restart the server and keep `GMAIL_ENABLED=false` until you are ready to begin polling.

## One-time connectivity diagnostic

The diagnostic uses the configured refresh token to obtain a short-lived access token and calls Gmail's read-only `users.getProfile` endpoint. It does not send or modify mail, start polling, or change `GMAIL_ENABLED`. It prints only sanitized JSON:

```bash
cd server
npm run diagnose:gmail
```

On success, the output includes `profileRequestSucceeded`, the authenticated mailbox address, whether it matches `GMAIL_USER_EMAIL`, and the current `enabled` flag. On failure, it includes only `stage`, a sanitized `code`, HTTP `status`, and (when Google provides them) bounded `message`, `reason`, `domain`, and provider `status` fields. A missing refresh token or an invalid refresh token is never printed.

The command's result is environment-dependent and must be run locally for live verification; mocked automated tests do not prove mailbox connectivity.
