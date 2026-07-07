import { useStore } from "./store"
import { useSettings } from "./settings"
import { confirm } from "./confirm"
import { prompt } from "./prompt"
import type { MenuItem } from "./contextmenu"

export type { MenuItem } from "./contextmenu"

/** The project context-menu shared by the deck strip and the project switcher. */
export function projectContextMenu(projectId: string): MenuItem[] {
    const s = useStore.getState()
    const project = s.projects.find((p) => p.id === projectId)
    if (!project) return []
    const presets = useSettings.getState().workspacePresets
    const groups = [...new Set(s.projects.map((p) => p.group).filter(Boolean))] as string[]
    const projPresets = presets.filter((pr) => pr.projectId === project.id)
    const hasTabs = (s.tabsByProject[project.id] ?? []).length > 0
    return [
        { label: "Open", onClick: () => s.setActiveProject(project.id) },
        { label: "Environment variables…", onClick: () => s.setEnvEditorProject(project.id) },
        { label: "Saved commands…", onClick: () => s.setCommandsEditorProject(project.id) },
        { separator: true },
        ...groups
            .filter((g) => g !== project.group)
            .map((g) => ({ label: "Move to " + g, onClick: () => s.setProjectGroup(project.id, g) })),
        {
            label: "Move to new group…",
            onClick: async () => {
                const name = await prompt({
                    title: "New group",
                    placeholder: "Group name",
                    confirmLabel: "Create"
                })
                if (name && name.trim()) s.setProjectGroup(project.id, name.trim())
            }
        },
        ...(project.group ? [{ label: "Ungroup", onClick: () => s.setProjectGroup(project.id, "") }] : []),
        { separator: true },
        ...(hasTabs ? [{ label: "Save layout as preset", onClick: () => s.saveWorkspacePreset(project.id) }] : []),
        ...projPresets.map((pr) => ({ label: `Open ${pr.name}`, onClick: () => s.openWorkspacePreset(pr.id) })),
        ...projPresets.map((pr) => ({
            label: `Delete ${pr.name}`,
            danger: true,
            onClick: () => s.deleteWorkspacePreset(pr.id)
        })),
        { separator: true },
        {
            label: "Remove project",
            danger: true,
            onClick: async () => {
                const ok = await confirm({
                    title: "Remove project",
                    message: `Remove "${project.name}" from DevDeck? The folder won't be deleted, but its tabs/sessions here will close.`,
                    confirmLabel: "Remove",
                    danger: true
                })
                if (ok) s.removeProject(project.id)
            }
        }
    ]
}
