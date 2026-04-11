# Apple MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that connects Claude to your Apple iCloud account — Mail, Calendar, Contacts, and Reminders — using standard protocols (IMAP, SMTP, CalDAV, CardDAV).

No Apple Developer account required. No OAuth. Just an app-specific password.

---

## What You Can Do

Once connected, you can ask Claude things like:

- _"What emails did I receive today?"_
- _"Search my inbox for messages from John"_
- _"What's on my calendar this week?"_
- _"Create a reminder to call the dentist tomorrow at 9am"_
- _"Find the contact details for Sarah"_
- _"Send an email to team@example.com with the meeting notes"_

---

## Prerequisites

Before you start:

1. **Node.js 18+** — check with `node --version`
2. **An iCloud account** with two-factor authentication enabled
3. **An app-specific password** — see [Step 1](#step-1-generate-an-app-specific-password) below

---

## Setup Guide

### Step 1 — Generate an App-Specific Password

Apple requires an app-specific password (not your regular Apple ID password) for third-party apps to access iCloud over IMAP/CalDAV.

1. Go to [appleid.apple.com](https://appleid.apple.com) and sign in
2. Navigate to **Sign-In and Security → App-Specific Passwords**
3. Click **"+"** to generate a new password
4. Name it something like `Apple MCP Server`
5. Copy the generated password — it looks like `xxxx-xxxx-xxxx-xxxx`

> **Important:** Two-factor authentication must be enabled on your Apple ID. If it isn't, the app-specific password option won't appear.

---

### Step 2 — Clone and Install

```bash
git clone https://github.com/stevenang/apple-mcp-server.git
cd apple-mcp-server
npm install
```

---

### Step 3 — Configure Credentials

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

Open `.env` and set the two required values:

```env
ICLOUD_EMAIL=you@icloud.com
ICLOUD_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

| Variable              | Description                                              |
|-----------------------|----------------------------------------------------------|
| `ICLOUD_EMAIL`        | Your full iCloud email address (e.g. `you@icloud.com`)  |
| `ICLOUD_APP_PASSWORD` | The app-specific password generated in Step 1            |
| `MCP_PORT`            | _(Optional)_ Host port for Docker Compose (default: `8000`) |

> **Never commit `.env` to Git.** It is already listed in `.gitignore`.

---

### Step 4 — Build

```bash
npm run build
```

This compiles TypeScript to `dist/`. You only need to re-run this when you change source files.

---

## Running the Server

There are three ways to run the server depending on your use case.

---

### Option A — Claude Code (stdio, recommended for local use)

This is the simplest option if you're using [Claude Code](https://claude.ai/code) on your own machine.

Add the server to your Claude Code MCP config. The config file is at:
- **macOS/Linux:** `~/.claude/claude_code_config.json`
- **Windows:** `%APPDATA%\Claude\claude_code_config.json`

```json
{
  "mcpServers": {
    "apple": {
      "command": "node",
      "args": ["/absolute/path/to/apple-mcp-server/dist/index.js"],
      "env": {
        "ICLOUD_EMAIL": "you@icloud.com",
        "ICLOUD_APP_PASSWORD": "xxxx-xxxx-xxxx-xxxx"
      }
    }
  }
}
```

Replace `/absolute/path/to/apple-mcp-server` with the actual path on your machine. Then restart Claude Code — the Apple tools will appear automatically.

---

### Option B — HTTP server (for remote access or multiple clients)

Run the server as a persistent HTTP process that any MCP client can connect to over the network.

```bash
node dist/index.js --transport http --port 8000
```

The MCP endpoint is available at:

```
http://localhost:8000/mcp
```

A health check endpoint is also available (used by Docker/load balancers):

```
GET http://localhost:8000/health  →  200 OK
```

To connect Claude Code to a remote HTTP server, update your MCP config:

```json
{
  "mcpServers": {
    "apple": {
      "url": "http://your-server-address:8000/mcp"
    }
  }
}
```

---

### Option C — Docker (self-hosted, production)

The easiest way to deploy to a VPS, home server, or any machine with Docker.

**1. Build and start:**

```bash
cp .env.example .env   # fill in your credentials first
docker compose up -d
```

**2. Check it's running:**

```bash
docker compose ps
docker compose logs -f
```

**3. Test the health endpoint:**

```bash
curl http://localhost:8000/health
# → OK
```

**4. Stop:**

```bash
docker compose down
```

**To change the port**, set `MCP_PORT` in your `.env`:

```env
MCP_PORT=3000
```

Then restart: `docker compose up -d`

**To build without Docker Compose** (e.g. on a CI server):

```bash
docker build -t apple-mcp-server .
docker run -d -p 8000:8000 --env-file .env apple-mcp-server
```

---

## Available Tools

### Mail (6 tools)

| Tool | Description |
|------|-------------|
| `apple_mail_list` | List recent emails from a folder (default: INBOX) |
| `apple_mail_search` | Search emails by subject, body, or sender |
| `apple_mail_read` | Read the full content of an email by ID |
| `apple_mail_folders` | List all available IMAP folders |
| `apple_mail_send` | Send a new email via SMTP |
| `apple_mail_move` | Move an email to another folder (e.g. archive, trash) |

### Calendar (6 tools)

| Tool | Description |
|------|-------------|
| `apple_cal_list` | List all calendars |
| `apple_cal_events` | Get events within a date range |
| `apple_cal_get_event` | Get full details of a specific event |
| `apple_cal_create` | Create a new calendar event |
| `apple_cal_update` | Update an existing event |
| `apple_cal_delete` | Delete an event |

### Contacts (5 tools)

| Tool | Description |
|------|-------------|
| `apple_contacts_list` | List all contacts (paginated) |
| `apple_contacts_search` | Search by name, email, phone, or organization |
| `apple_contacts_get` | Get full details of a contact |
| `apple_contacts_create` | Create a new contact |
| `apple_contacts_update` | Update an existing contact |

### Reminders (5 tools)

| Tool | Description |
|------|-------------|
| `apple_reminders_lists` | List all reminder lists |
| `apple_reminders_items` | Get reminders from a list |
| `apple_reminders_create` | Create a new reminder |
| `apple_reminders_complete` | Mark a reminder as completed |
| `apple_reminders_delete` | Delete a reminder |

All tools support a `response_format` parameter: `"markdown"` (default) or `"json"`.

---

## Troubleshooting

### Authentication failed / Command failed

**Symptom:** `Authentication failed for apple_mail_list. Make sure you are using an app-specific password...`

**Fix:**
- Confirm you are using an **app-specific password**, not your Apple ID password
- Go to [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords and generate a new one
- Make sure two-factor authentication is enabled on your Apple ID

---

### Cannot connect / Connection refused

**Symptom:** `Connection refused` or `Cannot resolve hostname`

**Fix:**
- Check your internet connection
- Verify iCloud services are reachable: [www.apple.com/support/systemstatus](https://www.apple.com/support/systemstatus/)

---

### Folder not found

**Symptom:** `Mailbox not found`

**Fix:**
- iCloud folder names use exact casing with spaces: `INBOX`, `Sent Messages`, `Drafts`, `Deleted Messages`, `Junk`, `Archive`
- Use `apple_mail_folders` to list the exact folder names on your account

---

### Calendar or reminder list not found

**Symptom:** `Calendar "Work" not found. Available calendars: ...`

**Fix:**
- Use `apple_cal_list` or `apple_reminders_lists` to see the exact names, then pass the name exactly as shown

---

### Docker: server starts but tools fail

**Symptom:** Server is healthy but all tool calls return auth errors

**Fix:**
- Confirm your `.env` file has the correct values
- Run `docker compose down && docker compose up -d` to reload env vars (they are read at startup, not live-reloaded)

---

## Development

```bash
npm run dev        # Watch mode with tsx (no build step needed)
npm run typecheck  # Type-check without building
npm run build      # Compile to dist/
npm run test       # Run unit tests with vitest
npm run lint       # ESLint
npm run inspect    # Open MCP Inspector against dist/index.js
```

### Project Structure

```
src/
├── index.ts              # Entry point — transport setup, tool registration
├── config.ts             # Credential loading from .env (only file that reads process.env)
├── auth.ts               # Auth helpers for IMAP/SMTP/CalDAV/CardDAV
├── constants.ts          # Server endpoints and defaults
├── types.ts              # Shared TypeScript interfaces
├── services/
│   ├── imap-client.ts    # IMAP operations (imapflow)
│   ├── smtp-client.ts    # SMTP send (nodemailer)
│   ├── caldav-client.ts  # Calendar + Reminders (tsdav)
│   └── carddav-client.ts # Contacts (tsdav)
├── tools/                # MCP tool registrations (one file per service)
├── schemas/              # Zod input schemas (one file per service)
└── utils/
    ├── formatters.ts     # Markdown/JSON response formatting
    ├── errors.ts         # Error handling and stderr logging
    └── pagination.ts     # Shared pagination logic
```

---

## Security Notes

- **Never commit `.env`** — it contains your app-specific password. It is gitignored by default.
- The app-specific password grants access to your iCloud Mail, Calendar, Contacts, and Reminders. Treat it like a sensitive credential.
- When running with Docker, credentials are passed via environment variables, not baked into the image.
- The Docker container runs with a read-only filesystem and no privilege escalation (`no-new-privileges`).
- Credentials are never logged, even to stderr.

---

## License

MIT
