import type { JSX } from "react"
import { useStore } from "../store"
import { confirm } from "../confirm"
import { toast } from "../toast"
import { refreshFolderStates, useFolderStates } from "../folderStates"
import { Icon } from "./Icon"

/**
 * The active project's folder is not there.
 *
 * Shown only for `missing` - the state where the OS answered and the answer was
 * "nothing there". `unchecked` deliberately gets no bar: a permission error or
 * a sleeping NAS says nothing about the project, and a persistent bar claiming
 * DevDeck "can't find this folder" would be exactly the signal this codebase
 * keeps paying to remove. The switcher's UNCHECKED pill carries that state
 * where it belongs, next to the reading it qualifies.
 *
 * Not a toast, for the same reason as PersistBlockedBar: the condition lasts
 * until someone fixes it, and a message that fades leaves the misattribution
 * behind. It is also NOT a gate - every session, terminal and view still works
 * from here, because a path can come back (a VPN, an unmounted drive) and
 * refusing to open would make DevDeck refuse something that is about to work.
 *
 * Never the word "deleted": DevDeck cannot know that, and only the
 * non-destructive action takes the frame's accent.
 */
export function FolderNotice(): JSX.Element | null {
    // `activeProject()` returns the element out of `projects`, not a fresh
    // object, so this selector is stable (same call as Topbar's).
    const project = useStore((s) => s.activeProject())
    const state = useFolderStates((s) => (project ? s.states[project.id] : undefined))
    if (!project || state !== "missing") return null

    const locate = async (): Promise<void> => {
        const r = await window.api.projects.relocate(project.id)
        if (r.outcome === "duplicate") {
            toast("That folder is already open as another project.")
            return
        }
        if (r.outcome !== "relocated") return
        // Main's reply is the whole truth about the project list, which is what
        // every projects:* mutator in the store does with it. The probe is
        // re-run at once rather than waiting for the next poll, so the bar
        // leaves with the condition instead of fifteen seconds after it.
        useStore.setState({ projects: r.store.projects, activeId: r.store.activeId })
        void refreshFolderStates()
    }

    const forget = async (): Promise<void> => {
        const ok = await confirm({
            title: "Remove project",
            // Deliberately not "the folder won't be deleted" (the wording of
            // the context menu's Remove): here the folder is already gone, and
            // reassuring someone about a folder we cannot see would be a claim.
            message: `Remove "${project.name}" from DevDeck? Its tabs and sessions here will close. Nothing on disk is touched.`,
            confirmLabel: "Remove",
            danger: true
        })
        if (ok) await useStore.getState().removeProject(project.id)
    }

    return (
        <div className="notice-bar" role="status">
            <Icon name="folder" size={14} />
            <span className="notice-bar-text">
                DevDeck can&rsquo;t find this folder. <code>{project.path}</code> It may have
                moved, been renamed, or be on a drive that isn&rsquo;t connected.
            </span>
            <button type="button" className="notice-bar-action" onClick={() => void locate()}>
                Locate&hellip;
            </button>
            <button
                type="button"
                className="notice-bar-action secondary"
                onClick={() => void forget()}
            >
                Remove from DevDeck
            </button>
        </div>
    )
}
