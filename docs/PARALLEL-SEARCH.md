# Optional web research with Parallel Search MCP

[Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/search-mcp)
provides web search and page extraction without a Parallel account or API key.
Anonymous searches use Fast mode, with free-tier rate limits. NanoPilot still
needs its normal GitHub Copilot authentication and a working container setup.

This is an optional customization for your fork, using NanoPilot's Copilot SDK
session configuration. It adds search and fetch only; it does not configure the
paid Parallel Task API used for deep research.

## Add the server to the container agent

In `container/agent-runner/src/index.ts`, find `sessionConfig.mcpServers`.
Add this entry alongside the existing `nanopilot` server. Keep `nanopilot` and
any other servers unchanged. If you already have a `parallel-search` entry,
review it before editing so you preserve any intentional authentication or
other settings.

```typescript
'parallel-search': {
  type: 'http' as const,
  url: 'https://search.parallel.ai/mcp',
  headers: {
    'User-Agent': 'nanopilot/2.0.0 (https://github.com/ridermw/nanopilot)',
  },
  tools: ['web_search', 'web_fetch'],
},
```

The `tools` list enables the two tools exposed by this server. The same
`sessionConfig` is passed to both `createSession` and `resumeSession`, so keep
the entry there rather than adding it to only one session-creation call.
The container runner supplies this configuration directly to the SDK; editing
the repository's `.mcp.json` alone does not add it to that configuration.

No `PARALLEL_API_KEY`, authorization header, or host credential-forwarding
change is needed for this anonymous endpoint. Leave any existing paid Parallel
configuration in place if you still use it.

## Start a new container

The existing agent image already has the Copilot SDK needed for this change.
NanoPilot compiles the mounted runner source when each container starts, so
this configuration-only edit needs no new package or image rebuild.

Let active work finish before restarting the NanoPilot service. Use the command
for your installation:

```bash
# macOS (launchd)
launchctl kickstart -k gui/$(id -u)/com.nanopilot

# Linux (systemd)
systemctl --user restart nanopilot
```

NanoPilot mounts a per-group source copy from
`data/sessions/<group-folder>/agent-runner-src`. On the next container launch,
the host refreshes that copy when the shared `index.ts` has a newer modification
time. Check the group's copy contains the new entry if it does not appear.
If the group has its own newer runner customizations, merge the entry into that
copy while preserving those edits. Back up custom runners before updating the
shared template; an automatic refresh copies the shared source over them.

## Verify search and page extraction

Send an explicit request through one of your configured channels, using your
assistant's trigger word. For example:

```text
@Andy use the parallel-search web_search tool to find the latest Node.js LTS
release on nodejs.org. Cite the source URL.
```

Then ask it to use the server's `web_fetch` tool to read that source URL and
extract the release date. Check that the answer cites the requested page and
that the container logs show the corresponding tool executions. A response
from built-in WebSearch or WebFetch alone does not verify this MCP connection.
This setup makes the tools available; it does not force the agent to choose
them for every web request or change your existing group instructions.

If the tools are missing, check the `mcpServers` entry in the group's runner,
the `type: 'http'` setting, outbound HTTPS access to `search.parallel.ai`, and
that a new container has started. Inspect `groups/<group-folder>/logs/` for
connection or tool errors. Anonymous usage is rate limited; if a request reaches
the free-tier limit, wait before retrying or consult the
[Search MCP authentication options](https://docs.parallel.ai/integrations/mcp/search-mcp)
for higher limits.

## Remove the customization

Remove only the `parallel-search` entry you added, including any corresponding
entry in a customized per-group runner. Start a new container as
above. Keep the built-in `nanopilot` server and any other MCP servers, group
instructions, or credentials you still use.
