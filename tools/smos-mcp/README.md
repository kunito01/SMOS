# smos-mcp — Studio Map OS agent bridge

A tiny local [MCP](https://modelcontextprotocol.io) server that lets AI agents
(Claude Code, Grok desktop, any MCP client) operate the Studio Map OS workspace
that is open in your browser. Nothing leaves your machine: the relay listens on
`127.0.0.1` only, the PWA connects to it, and every tool call is executed by the
PWA itself with your signed-in workspace.

## Setup

1. Install once:

   ```bash
   cd tools/smos-mcp && npm install
   ```

2. In Studio Map OS open **Archive → Agent access**, turn it on and copy the
   pairing token (and the MCP config snippet shown there).

3. Register the server with your agent, e.g. Claude Code:

   ```bash
   claude mcp add studio-map-os \
     -e SMOS_AGENT_TOKEN=<token> -e SMOS_AGENT_PORT=3391 \
     -- node /absolute/path/to/Codex/tools/smos-mcp/index.mjs
   ```

   Other clients take the equivalent JSON:

   ```json
   {
     "mcpServers": {
       "studio-map-os": {
         "command": "node",
         "args": ["/absolute/path/to/Codex/tools/smos-mcp/index.mjs"],
         "env": { "SMOS_AGENT_TOKEN": "<token>", "SMOS_AGENT_PORT": "3391" }
       }
     }
   }
   ```

4. Keep Studio Map OS open in **Chrome** with Agent access on while the agent
   works. (Safari blocks plain `ws://` connections from an `https://` page, so
   the hosted app must run in Chrome; a local `http://localhost` dev server
   works in any browser.)

The tool list comes from the app, so new tools appear automatically. Destructive
tools (`archive_project`, `delete_project`) refuse to run unless the agent passes
`confirm: true`.
