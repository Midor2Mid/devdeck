import { newPathsSince } from "./agentSignals"
import { normDir, sameDir } from "../../shared/paths"

// Re-exported rather than made a second import at the call site: `store.ts` asks
// this module "are these two agents in the same tree", which is part of asking
// it about ownership. The FUNCTION is the shared one - promoted 2026-09-14
// because this file and `paths.ts` held byte-identical private copies of it -
// and only the door is here.
export { sameDir }

export interface OwnerRef {
    termId: string
    sessionName: string
}

/** An agent already editing a given working directory. */
export interface CwdHolder {
    termId: string
    sessionName: string
    files: string[]
}

/**
 * Which agents already hold uncommitted changes in `cwd`.
 *
 * The conflict map reports collisions *after* two agents have both edited a
 * file. This is the same question asked one step earlier: before dispatching a
 * second agent into a directory someone is already working in, we can say who
 * is there and what they're holding. Agents in their own git worktree have a
 * different cwd and so never match — which is exactly the point of the worktree
 * toggle.
 */
export function holdersOf(
    entries: { termId: string; sessionName: string; cwd: string; files: string[] }[],
    cwd: string
): CwdHolder[] {
    return entries
        .filter((e) => e.files.length > 0 && sameDir(e.cwd, cwd))
        .map(({ termId, sessionName, files }) => ({ termId, sessionName, files }))
}

/**
 * One-line "who's already in here" summary.
 *
 * Careful about what this can honestly claim. Every session sharing a working
 * tree reports that tree's *whole* dirty file list, because the only question git
 * can answer is "what has changed in this directory" — not "which pty changed
 * it". An earlier wording said "claude 1, claude 2, claude 3, claude 5, claude 6
 * are already editing this project (one-file.md)", which read as five agents
 * fighting over a file none of them may have touched; the change could equally
 * have been the user's. Seen with five sessions open it was actively misleading.
 *
 * So: name the sessions running here (true), attribute the changes to the *tree*
 * (true), and claim nothing about who made them. Past two sessions the names stop
 * being scannable, so they become a count.
 */
export function holdersSummary(holders: CwdHolder[]): string {
    if (holders.length === 0) return ""
    const who =
        holders.length <= 2
            ? `${holders.map((h) => h.sessionName).join(" and ")} ${holders.length === 1 ? "is" : "are"}`
            : `${holders.length} agent sessions are`
    const files = [...new Set(holders.flatMap((h) => h.files))]
    // File names, not full paths. This sits in a narrow popover that a user with a
    // habitually dirty tree sees on every launch, and one repo path
    // ("docs/managements/SPCSG_Jira_Reconciliation_2026-07-29.md") wrapped it to
    // five lines of red — enough bulk to become wallpaper and stop being read. The
    // directory isn't what makes the decision; the count and the name are.
    const shown = files
        .slice(0, 2)
        .map((f) => f.split(/[\\/]/).pop() || f)
        .join(", ")
    const more = files.length > 2 ? ` +${files.length - 2} more` : ""
    return (
        `${who} already working in this tree, which has ${files.length} uncommitted ` +
        `change${files.length === 1 ? "" : "s"} (${shown}${more}). ` +
        `Two agents in one working tree overwrite each other.`
    )
}
export interface FileOwnership {
    path: string
    projectName: string
    owners: OwnerRef[]
}
export interface OwnershipMap {
    files: FileOwnership[]
    /**
     * Files that appeared after two or more sessions **in the same working
     * tree** had already started. Not proof of who wrote them - see the note on
     * `buildOwnership` - but the one shape of this data worth a warning colour.
     */
    conflicts: number
}

/** One session's directory, its dirty list, and what it inherited. */
export interface OwnershipEntry {
    termId: string
    sessionName: string
    /** For display on the row. The TREE is what identity is keyed on, not this. */
    projectName: string
    /** The directory `files` was read from - `sessionCwd`, worktree included. */
    cwd: string
    /** The whole dirty list of `cwd` right now. */
    files: string[]
    /**
     * The dirty set this session inherited when it started (`baselineOf`).
     * `undefined` is an unknown baseline, which is no evidence at all.
     */
    baseline: ReadonlySet<string> | undefined
}

/**
 * Aggregate what each agent has changed **since it started** into a
 * file-to-owners map, keyed by working tree.
 *
 * Two corrections live in that sentence, and both are the correction
 * `holdersSummary` above already carries.
 *
 * **Since it started.** Every session sharing a working tree reports that
 * tree's *whole* dirty list, because the only question git can answer is "what
 * has changed in this directory" - not "which pty changed it". Handing that
 * list to a map that calls any shared path a conflict reported "3 conflicts" in
 * red for two sessions that had written nothing, over files the user had edited
 * before either existed - and it fired for any dirty repo with two or more
 * sessions, which is the product's headline use case. So a change belongs to
 * the tree until there is evidence otherwise, and `agentSignals`' launch
 * baseline is that evidence, including its rule that an UNKNOWN baseline yields
 * nothing rather than everything.
 *
 * **Keyed by working tree.** The key was the project name, so two sessions in
 * separate worktrees of one project - which hold the same relative paths and
 * cannot collide by construction - conflicted on every file, defeating the
 * toggle that exists to prevent exactly that. Identical paths in different
 * projects were already distinct and stay so.
 *
 * What this still cannot claim is that the SESSION made a change rather than
 * the user, only that it was not there when the session started. Two live
 * agents in one tree and a file neither of them inherited is worth saying out
 * loud; the caller's wording has to stop short of naming a culprit.
 */
export function buildOwnership(entries: OwnershipEntry[]): OwnershipMap {
    const map = new Map<string, FileOwnership>()
    for (const e of entries) {
        // No directory is no tree. Two sessions whose cwd could not be resolved
        // would otherwise key together under "" and collide with each other.
        const tree = normDir(e.cwd)
        if (!tree) continue
        for (const path of newPathsSince(e.baseline, e.files)) {
            const key = tree + "\u0000" + path
            let fo = map.get(key)
            if (!fo) {
                fo = { path, projectName: e.projectName, owners: [] }
                map.set(key, fo)
            }
            if (!fo.owners.some((o) => o.termId === e.termId)) {
                fo.owners.push({ termId: e.termId, sessionName: e.sessionName })
            }
        }
    }
    const files = [...map.values()].sort(
        (a, b) =>
            (b.owners.length > 1 ? 1 : 0) - (a.owners.length > 1 ? 1 : 0) ||
            a.path.localeCompare(b.path)
    )
    return { files, conflicts: files.filter((f) => f.owners.length > 1).length }
}
