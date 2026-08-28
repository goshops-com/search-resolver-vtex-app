# Agent Operations & Constraints

This repository is used by an automated agent. To ensure safety and consistency:

- The agent MUST NOT run `vtex` CLI commands such as `vtex link`, `vtex publish`, `vtex install`, or any other VTEX CLI action.
- The agent MAY run `npm install` in `react/` or `node/` if dependencies are required for static analysis or builds.
- When a VTEX CLI action is needed, the agent will ask the user to run it and wait for confirmation.
- To restart a local link build, the agent will ask the user to run:
  - curl GET http://localhost:3001/restart-build

Recommended user flow:
1) Use a development workspace: `vtex use {workspace}`
2) Link the app: `vtex link`
3) Watch logs: `vtex logs`
4) Publish when ready: `vtex publish`

