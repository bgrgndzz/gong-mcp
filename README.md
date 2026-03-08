# gong-mcp

MCP server for the [Gong](https://www.gong.io/) API. Search calls, get transcripts, attendees, next steps, and more — directly from Claude or any MCP client.

## Setup

### 1. Get Gong API Credentials

1. Log into Gong as an admin
2. Go to **Company Settings > Ecosystem > API > API Keys**
3. Click **Create** to generate an Access Key and Access Key Secret
4. Copy both values (the secret is shown only once)

### 2. Configure your MCP client

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`) or Claude Code settings:

```json
{
  "mcpServers": {
    "gong": {
      "command": "npx",
      "args": ["-y", "@bgrgndzz/gong-mcp@latest"],
      "env": {
        "GONG_ACCESS_KEY": "your-access-key",
        "GONG_ACCESS_KEY_SECRET": "your-access-key-secret"
      }
    }
  }
}
```

If your Gong instance uses a custom API base URL (e.g., `https://us-0000.api.gong.io`), add it:

```json
"env": {
  "GONG_ACCESS_KEY": "your-access-key",
  "GONG_ACCESS_KEY_SECRET": "your-access-key-secret",
  "GONG_BASE_URL": "https://us-0000.api.gong.io"
}
```

## Tools

| Tool | Description |
|------|-------------|
| `list-calls` | List calls within a date range with attendee info |
| `get-call-details` | Get full call details: attendees, topics, highlights, next steps, key points, outcome |
| `get-call-transcript` | Get speaker-attributed transcripts with timestamps |
| `search-calls` | Search calls by date range, user, workspace, or call IDs |
| `list-users` | List all Gong users (for mapping IDs to names) |
| `get-user` | Get details for a specific user |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GONG_ACCESS_KEY` | Yes | Gong API access key |
| `GONG_ACCESS_KEY_SECRET` | Yes | Gong API access key secret |
| `GONG_BASE_URL` | No | Custom API base URL (default: `https://api.gong.io`) |

## License

MIT
