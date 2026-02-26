---
name: filldoc
description: Build, extend, and debug RepGen features that fill user templates with structured data. Use when tasks involve template upload/parsing, placeholder mapping, preview generation, fill APIs, validation rules, error handling, or export output for template+data workflows.
---

# FillDoc

Implement and improve end-to-end template filling in RepGen with safe, incremental changes and clear verification.

## Workflow

1. Confirm scope and constraints
- Keep existing working behavior intact.
- Clarify input template format, expected output format, and data schema assumptions.

2. Trace the current flow before editing
- Locate upload, parsing, mapping, fill execution, preview, and export code paths.
- Document the exact request/response shapes and where validation occurs.

3. Apply minimal, reversible changes
- Prefer surgical edits over broad refactors.
- Preserve existing naming and project conventions.
- Keep user-facing errors clear and developer logs actionable.

4. Validate the fill behavior
- Run lint/build commands relevant to the changed area.
- Verify happy path: template + valid data -> correct filled output.
- Verify failure paths: missing placeholders, malformed data, unsupported template type.

5. Report outcomes clearly
- Summarize touched files and behavior changes.
- Call out remaining edge cases and follow-up items.

## Implementation Rules

- Keep template parsing and field mapping deterministic.
- Normalize placeholder keys before matching.
- Fail fast on schema mismatch with explicit messages.
- Avoid hidden defaults that silently drop fields.
- Preserve backward compatibility for existing template payloads unless explicitly asked to break it.

## Output Contract Checklist

Before finishing, confirm:
- Input template is accepted or rejected with a clear reason.
- Data-to-placeholder mapping is visible and debuggable.
- Filled output preserves template structure and formatting constraints.
- API and UI expose consistent error semantics.

## References

- RepGen project conventions: `/Users/whyun/workspace/SERVICE/RepGen/AGENTS.md`
