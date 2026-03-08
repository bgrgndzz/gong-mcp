#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// --- Authentication ---
const GONG_ACCESS_KEY = process.env.GONG_ACCESS_KEY;
const GONG_ACCESS_KEY_SECRET = process.env.GONG_ACCESS_KEY_SECRET;
const GONG_BASE_URL = (
  process.env.GONG_BASE_URL || "https://api.gong.io"
).replace(/\/$/, "");

if (!GONG_ACCESS_KEY || !GONG_ACCESS_KEY_SECRET) {
  console.error(
    "Error: GONG_ACCESS_KEY and GONG_ACCESS_KEY_SECRET environment variables are required"
  );
  process.exit(1);
}

const credentials = Buffer.from(
  `${GONG_ACCESS_KEY}:${GONG_ACCESS_KEY_SECRET}`
).toString("base64");

// --- API Helper ---
async function gongRequest(
  path: string,
  options: { method?: string; body?: Record<string, unknown> } = {}
) {
  const { method, body } = options;
  const response = await fetch(`${GONG_BASE_URL}${path}`, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gong API ${response.status}: ${text}`);
  }

  return response.json();
}

// Collect all pages from a paginated Gong endpoint
async function gongPaginatedRequest(
  path: string,
  body: Record<string, unknown>,
  dataKey: string,
  maxRecords?: number
) {
  let cursor: string | undefined;
  let allResults: unknown[] = [];

  do {
    const requestBody = cursor ? { ...body, cursor } : body;
    const data = await gongRequest(path, { body: requestBody });
    const pageResults = (data as Record<string, unknown>)[dataKey];

    if (Array.isArray(pageResults)) {
      allResults = allResults.concat(pageResults);
    }

    cursor = (data as { records?: { cursor?: string } }).records?.cursor;

    if (maxRecords && allResults.length >= maxRecords) {
      allResults = allResults.slice(0, maxRecords);
      break;
    }
  } while (cursor);

  return allResults;
}

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      },
    ],
    isError: true as const,
  };
}

// --- Server Setup ---
const server = new McpServer({
  name: "gong-mcp",
  version: "0.1.0",
});

// --- Tools ---

// 1. List Calls
server.tool(
  "list-calls",
  "List Gong call recordings within a date range. Returns call metadata including title, date, duration, and participants.",
  {
    fromDateTime: z
      .string()
      .describe(
        "Start date-time in ISO 8601 format (e.g. 2024-01-01T00:00:00Z)"
      ),
    toDateTime: z
      .string()
      .describe(
        "End date-time in ISO 8601 format (e.g. 2024-01-31T23:59:59Z)"
      ),
    workspaceId: z.string().optional().describe("Filter by workspace ID"),
    maxRecords: z
      .number()
      .optional()
      .describe("Maximum number of calls to return (default: all)"),
  },
  async ({ fromDateTime, toDateTime, workspaceId, maxRecords }) => {
    try {
      const filter: Record<string, unknown> = { fromDateTime, toDateTime };
      if (workspaceId) filter.workspaceId = workspaceId;

      const calls = await gongPaginatedRequest(
        "/v2/calls/extensive",
        {
          filter,
          contentSelector: {
            exposedFields: {
              parties: true,
            },
          },
        },
        "calls",
        maxRecords
      );

      const summary = (calls as Array<Record<string, unknown>>).map((call) => {
        const meta = call.metaData as Record<string, unknown>;
        const parties = call.parties as Array<Record<string, unknown>>;
        return {
          id: meta?.id,
          title: meta?.title,
          started: meta?.started,
          duration: meta?.duration,
          direction: meta?.direction,
          scope: meta?.scope,
          system: meta?.system,
          url: meta?.url,
          attendees: parties?.map((p) => ({
            name: p.name,
            email: p.emailAddress,
            title: p.title,
            affiliation: p.affiliation,
          })),
        };
      });

      return textResult(summary);
    } catch (err) {
      return errorResult(err);
    }
  }
);

// 2. Get Call Details (extensive)
server.tool(
  "get-call-details",
  "Get detailed information about specific Gong calls including attendees, topics, highlights, next steps, key points, and call outcome.",
  {
    callIds: z
      .array(z.string())
      .describe("Array of Gong call IDs to retrieve details for"),
  },
  async ({ callIds }) => {
    try {
      const data = await gongRequest("/v2/calls/extensive", {
        body: {
          filter: { callIds },
          contentSelector: {
            context: "Extended",
            exposedFields: {
              parties: true,
              content: {
                topics: true,
                trackers: true,
                brief: true,
                outline: true,
                highlights: true,
                callOutcome: true,
                keyPoints: true,
                pointsOfInterest: true,
                structure: true,
              },
              interaction: {
                personInteractionStats: true,
                questions: true,
              },
              collaboration: {
                publicComments: true,
              },
            },
          },
        },
      });

      return textResult(
        (data as { calls: unknown }).calls
      );
    } catch (err) {
      return errorResult(err);
    }
  }
);

// 3. Get Call Transcript
server.tool(
  "get-call-transcript",
  "Get the full transcript for one or more Gong calls. Returns speaker-attributed text with timestamps.",
  {
    callIds: z
      .array(z.string())
      .describe("Array of Gong call IDs to get transcripts for"),
  },
  async ({ callIds }) => {
    try {
      const transcripts = await gongPaginatedRequest(
        "/v2/calls/transcript",
        { filter: { callIds } },
        "callTranscripts"
      );

      return textResult(transcripts);
    } catch (err) {
      return errorResult(err);
    }
  }
);

// 4. Search Calls
server.tool(
  "search-calls",
  "Search for Gong calls by date range, user, workspace, or call IDs. Returns calls with full details including attendees, topics, highlights, and next steps.",
  {
    fromDateTime: z
      .string()
      .optional()
      .describe(
        "Start date-time in ISO 8601 format (e.g. 2024-01-01T00:00:00Z)"
      ),
    toDateTime: z
      .string()
      .optional()
      .describe(
        "End date-time in ISO 8601 format (e.g. 2024-01-31T23:59:59Z)"
      ),
    callIds: z
      .array(z.string())
      .optional()
      .describe("Specific call IDs to retrieve"),
    primaryUserIds: z
      .array(z.string())
      .optional()
      .describe("Filter by call owner user IDs"),
    workspaceId: z.string().optional().describe("Filter by workspace ID"),
    maxRecords: z
      .number()
      .optional()
      .describe("Maximum number of calls to return (default: all)"),
  },
  async ({
    fromDateTime,
    toDateTime,
    callIds,
    primaryUserIds,
    workspaceId,
    maxRecords,
  }) => {
    try {
      const filter: Record<string, unknown> = {};
      if (fromDateTime) filter.fromDateTime = fromDateTime;
      if (toDateTime) filter.toDateTime = toDateTime;
      if (callIds) filter.callIds = callIds;
      if (primaryUserIds) filter.primaryUserIds = primaryUserIds;
      if (workspaceId) filter.workspaceId = workspaceId;

      if (Object.keys(filter).length === 0) {
        return errorResult(
          "At least one filter parameter is required (fromDateTime, callIds, primaryUserIds, or workspaceId)"
        );
      }

      const calls = await gongPaginatedRequest(
        "/v2/calls/extensive",
        {
          filter,
          contentSelector: {
            context: "Extended",
            exposedFields: {
              parties: true,
              content: {
                topics: true,
                brief: true,
                highlights: true,
                callOutcome: true,
                keyPoints: true,
              },
              interaction: {
                personInteractionStats: true,
                questions: true,
              },
            },
          },
        },
        "calls",
        maxRecords
      );

      return textResult(calls);
    } catch (err) {
      return errorResult(err);
    }
  }
);

// 5. List Users
server.tool(
  "list-users",
  "List all Gong users in the account. Useful for mapping user IDs to names and emails.",
  {},
  async () => {
    try {
      const data = await gongRequest("/v2/users", { method: "GET" });
      return textResult((data as { users: unknown }).users);
    } catch (err) {
      return errorResult(err);
    }
  }
);

// 6. Get User
server.tool(
  "get-user",
  "Get details for a specific Gong user by their user ID.",
  {
    userId: z.string().describe("The Gong user ID"),
  },
  async ({ userId }) => {
    try {
      const data = await gongRequest(`/v2/users/${userId}`, { method: "GET" });
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

// --- Start ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gong MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
