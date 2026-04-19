# Compact Tool Messages Design

## Goal
Reduce tool-call noise in HAPI chat so normal tool activity is visible but does not dominate the message list.

## Approved approach
Use option C: collapse ordinary tool calls to a one-line compact row by default, while keeping actionable tools prominent when the user must approve, deny, or answer something.

## Behavior
- Completed/running/error ordinary tools render as a compact row: icon, tool title, optional short subtitle, elapsed/status, and details affordance.
- Ordinary tool inputs/results stay available through the existing click-to-open dialog.
- Tools with pending permissions or pending user questions keep their inline footer/controls visible.
- Dense tools that currently render inline bodies, such as `update_plan`, `TodoWrite`, `NotebookEdit`, and `ExitPlanMode`, no longer expand inline unless they are actionable.
- Task child details remain available via the existing nested details UI, but the parent Task card itself should not show a large summary block by default.

## Testing
Add component tests for `ToolCard` proving non-actionable tool bodies are collapsed and pending permission controls remain visible.
