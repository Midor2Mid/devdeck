# Agent routing — choosing who does the work

**Status:** draft, awaiting approval
**Date:** 2026-08-13

## The problem

`dispatchBoardTask` picks the agent like this:

```ts
const agent = useSettings.getState().agents[0]
```

The first configured preset, always. Not the best one for the job, not the one you
used last, not one you chose — the first one in the list. Reordering your presets
silently changes who does every future task.

That is a real limitation rather than a cosmetic one, because the presets genuinely
differ: they carry different models, different API keys, and different permission
postures (`claude-yolo` runs with `--dangerously-skip-permissions`). Sending a
one-line rename to an expensive model, or a refactor of `src/main/` to a cheap one,
is a decision the app currently makes for you by array position.

The bake-off exists to answer "which agent is better for this repo". Routing is
where that answer gets used.

## What this adds

Two things, in the order they matter:

1. **A per-card agent choice at dispatch.** Pick the agent when you dispatch,
   defaulting to whatever a rule or the fallback selects. This alone removes the
   `agents[0]` problem.
2. **Rules that pre-select it.** An ordered list, first match wins, each mapping a
   condition to an agent. The rule does not dispatch anything — it sets what the
   picker starts on, and you can always override it.

The second is deliberately subordinate to the first. A router that silently sends
work somewhere you did not intend is worse than no router, so the rule's output is
always visible and always editable before anything is spent.

## What a rule matches on

Only what exists at dispatch time, which is less than it first appears. A board
card has a title, a project, and nothing else — no labels, no file list, no
diff. Matching on files is impossible before an agent has touched anything.

So the conditions are:

| Kind | Matches |
| --- | --- |
| `title` | A case-insensitive substring of the card's title |
| `titleRegex` | A regular expression against the title |
| `project` | A specific project id |
| `always` | Everything — the fallback rule |

> **Superseded (2026-08-14).** `titleRegex` did not ship. Four fix rounds on
> the implementation (see `NOTES.md` → "Agent routing: what rules can and
> can't see, and why the glob isn't a RegExp") found that compiling
> user-typed text to a `RegExp` inherits the engine's backtracking — escaping
> metacharacters closes only the nested-quantifier shape, and several plain
> `*` tokens alone still produced multi-minute hangs on the path that renders
> the dispatch preview. What shipped is `titleGlob`, matched by a hand-written
> two-pointer walk that never compiles to a `RegExp` and cannot degrade
> regardless of pattern shape. The "compiled defensively, invalid pattern
> makes the rule inert" design below describes `titleRegex` as originally
> planned, not `titleGlob` as built — **a glob has no invalid form**, so that
> failure mode doesn't apply to what actually exists. `routing.ts` is the
> source of truth for the kind that shipped.

`titleRegex` is compiled defensively: an invalid pattern makes the rule **never
match**, rather than throwing inside dispatch or matching everything. A rule you
mistyped should be inert, not a wildcard, and certainly not a crash on the path
that spends money.

```ts
// Superseded (2026-08-14): shipped as `kind: "title" | "titleGlob" | "project"
// | "always"` — see routing.ts and the note above the rule table. A glob has
// no invalid form, so there is no "inert on bad pattern" case to speak of;
// an empty or whitespace-only pattern is what leaves a rule inert instead
// (and the Task 4 editor flags that case visibly — see NOTES.md).
export interface RoutingRule {
    id: string
    enabled: boolean
    kind: "title" | "titleRegex" | "project" | "always"
    pattern: string
    agentId: string
}
```

Stored in settings as an ordered `routingRules: RoutingRule[]`. First enabled rule
whose condition matches decides; if none match, the fallback is the **explicitly
configured** `defaultAgentId`, and only if that is empty or missing does it fall
back to `agents[0]` — preserving today's behaviour for anyone who configures
nothing.

## The pure part

```ts
export function routeAgent(
    rules: RoutingRule[],
    card: { title: string; projectId: string },
    agents: AgentPreset[],
    defaultAgentId: string
): { agentId: string; ruleId?: string }
```

Returns the chosen agent **and which rule chose it**, because the UI has to be able
to say why. A rule pointing at an agent that has since been deleted is skipped
rather than honoured — a dangling reference must not dispatch to nothing or throw.

This lives in a new `src/renderer/src/routing.ts`, pure and unit-tested, following
`board.ts` and `race.ts`.

## Where it shows

- **The board card's Dispatch button becomes a split control**: dispatch, plus a
  chevron opening the agent list. The chosen agent's name sits on the button, so
  the routing decision is visible before the click rather than after the spend.
- **When a rule chose it**, the tooltip names the rule. An automatic choice you
  cannot trace is the thing that makes routing feel unpredictable.
- **Settings → Agents** grows a Routing section: the ordered rule list with
  reordering, an enable toggle per rule, and the default-agent picker.

The existing `worktree` checkbox and confirm dialog are unchanged. The confirm
already names the agent, which becomes more useful now that it can differ.

## What this does not do

- **No automatic dispatch.** Rules choose *who*, never *whether* — nothing here
  starts an agent without a human click.
- **No cost or capability awareness.** A rule cannot say "cheapest that can pass
  the gate". That needs the run ledger, which is the next piece of work, and
  guessing at it now would bake in a model of cost the app cannot yet support.
- **No routing for the race.** The race already asks you to pick entrants
  explicitly, which is the point of it.
- **No per-file rules**, for the reason above: at dispatch time there are no files.

## Testing

`routing.ts` is pure and carries the tests:

- First enabled match wins; a disabled rule is skipped even when it matches.
- `title` is case-insensitive and substring; `titleRegex` matches; **an invalid
  regex makes the rule inert rather than throwing or matching everything**.
  (Superseded — see the note above the rule table: this describes `titleRegex`
  as planned, not the `titleGlob` that shipped. A glob has no invalid form; the
  tests that actually exist, in `tests/routing.test.ts`, cover an empty or
  whitespace-only pattern leaving a rule inert instead, plus the glob's
  anchoring and its resistance to catastrophic backtracking.)
- `project` matches on id, not name.
- No match falls back to `defaultAgentId`, and to `agents[0]` only when that is
  unset — the compatibility path.
- A rule naming a deleted agent is skipped, and the next matching rule wins.
- The returned `ruleId` identifies the rule that decided, so the UI can attribute it.
