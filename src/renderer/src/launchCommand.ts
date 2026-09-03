/**
 * What actually gets typed into a fresh pane.
 *
 * This was `initialCommand ?? preset?.command ?? agentId`, and `??` lets `""`
 * through: a preset whose command was blank wrote a **blank line** into a new
 * shell, so the pane opened, the agent never started, and literally nothing
 * happened. Empty and whitespace-only are the same fact as absent here, and the
 * `agentId` fallback must not become the command either — `blank1` is a preset
 * id, not something anyone can run.
 */

const nonBlank = (s: string | undefined): string | undefined =>
    s !== undefined && s.trim() !== "" ? s : undefined

/**
 * @param isAgent whether the pane is starting an agent preset rather than a shell.
 * @param initialCommand an explicit override (resume, a pipeline, the palette).
 * @param presetCommand the preset's own command, when a preset was found.
 * @param agentId the id, used only when no preset exists at all — the historical
 *        guess for an agent whose preset was deleted, where the id has at least
 *        a chance of being the binary's name.
 * @returns the line to send, or `undefined` for "send nothing" — which leaves a
 *        plain, usable shell instead of a shell with a nonsense token in it.
 */
export function agentInitCommand(
    isAgent: boolean,
    initialCommand: string | undefined,
    presetCommand: string | undefined,
    agentId: string
): string | undefined {
    if (!isAgent) return initialCommand
    const explicit = nonBlank(initialCommand)
    if (explicit) return explicit
    // A preset that exists and is blank is a configured absence: send nothing.
    // Only a preset that does not exist falls back to the id.
    if (presetCommand === undefined) return agentId
    return nonBlank(presetCommand)
}
