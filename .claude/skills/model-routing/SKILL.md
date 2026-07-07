---
name: model-routing
description: Route each phase of a task to a chosen model — a strong model for planning, architecture, and final review; a cheaper/faster model for implementation, testing, and reporting. Use when the user wants to control which model does what ("plan with Fable, build with Sonnet", "use the cheap model for the grind", "set up model routing", "which model for which step"), or to stay inside usage limits on a big job. Reads a per-repo routing config and dispatches phases to the assigned model via subagents.
---

# Model Routing

The winning pattern for big work isn't one model doing everything — it's
**routing**: spend the expensive, high-judgment model where judgment pays off
(planning, architecture, adversarial review) and hand the high-volume, low-
ambiguity work (implementation loops, running tests, drafting reports) to a
cheaper, faster model. This skill defines the routing table and dispatches each
phase to the model you picked.

## The default routing table

| Phase | Wants | Default tier |
|---|---|---|
| **Plan** — decompose, map unknowns, sequence | deep judgment | strong (Fable/Opus) |
| **Architect** — design, interfaces, trade-offs | deep judgment | strong |
| **Implement** — write code against a clear spec | throughput | cheaper (Sonnet) |
| **Test** — write/run tests, iterate to green | throughput | cheaper |
| **Report** — summaries, changelogs, PR bodies | throughput | cheaper (Haiku/Sonnet) |
| **Review** — adversarial correctness pass before ship | deep judgment | strong |

The shape that works: **strong model bookends** (plan + review), **cheaper model
in the middle** (implement + test + report). Judgment at the edges, volume in the
core.

## Config — let the user own the table

Read `.claude/model-routing.json` if present; otherwise use the defaults above
and mention that you did. Create/update it when the user states preferences.

```json
{
  "version": 1,
  "models": {
    "strong": "claude-fable-5",
    "mid":    "claude-sonnet-5",
    "cheap":  "claude-haiku-4-5-20251001"
  },
  "routes": {
    "plan":      "strong",
    "architect": "strong",
    "implement": "mid",
    "test":      "mid",
    "report":    "cheap",
    "review":    "strong"
  },
  "notes": "Bookend with strong; grind with mid; cheap for prose."
}
```

Resolve a phase → tier → concrete model id through this file. If the user names
models directly ("plan with Fable, build with Sonnet"), honor that verbatim and
offer to save it to the config so it sticks.
Current model ids: Fable 5 `claude-fable-5`, Opus 4.8 `claude-opus-4-8`,
Sonnet 5 `claude-sonnet-5`, Haiku 4.5 `claude-haiku-4-5-20251001`. Confirm
against the environment if unsure rather than guessing.

## How to dispatch a phase to its model

Each phase runs as a subagent with the routed model via the `model` override on
the Agent tool (or the `model`/`effort` options inside a Workflow `agent()` call).
The **main session stays on the strong model** and acts as the router/orchestrator
— it holds the plan, reviews returns, and decides what runs next.

- **Plan / Architect / Review** → `Agent(..., model: <strong>)`. Keep these in the
  main loop or a strong-model subagent; their output is judgment you'll rely on.
- **Implement / Test** → `Agent(..., model: <mid>)` with the spec + acceptance
  criteria pasted in, so the cheaper model has an unambiguous target. This is the
  natural handoff *out of* a planning turn and *into* the long-horizon-coding loop.
- **Report** → `Agent(..., model: <cheap>)` to draft PR bodies, changelogs, run
  summaries from the diff.

Give every dispatched subagent: the goal, the relevant spec/criteria, the
invariants it must not break, and "return structured results, not prose."

## Orchestration recipe

1. **Plan** (strong): produce the spec + ordered plan of record (hand off to the
   long-horizon-coding skill's Phase 1 format).
2. **Architect** (strong) *if design is non-trivial*: lock interfaces/boundaries.
3. **Implement + Test** (mid): run the execution loop against the spec; return
   what passed/failed. Parallelize independent work-items across subagents.
4. **Review** (strong): adversarial correctness pass on the diff before ship —
   this is where routing earns its keep; don't let the cheap model bless its own work.
5. **Report** (cheap): draft the PR body / summary from the final diff.

## When to override the table

- **Ambiguity spikes mid-implement** → bounce that step back up to the strong
  model to re-plan, then hand the sharpened step back down.
- **Security-sensitive or irreversible** change → review on the strong model
  regardless of the route.
- **Tiny task** → don't route at all; the orchestration overhead exceeds the work.
- **Usage-limit pressure** → widen the cheap band (push more phases to mid/cheap),
  but keep **review** on strong — an unreviewed cheap run is how bugs ship.

## Guardrails
- The router (strong model) owns the final go/no-go; cheaper models propose,
  they don't merge.
- Pass invariants down to every subagent — a cheap model won't infer "keep tenant
  isolation server-side" on its own.
- Record which model did which phase in the run summary, so results are auditable.

## Related
- **long-horizon-coding** — the execution loop that the implement/test route drives.
- **Workflow** tool — for fan-out where many items each run plan→implement→review.
