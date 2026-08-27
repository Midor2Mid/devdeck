/**
 * The message a versioned write fails with when the file changed underneath the
 * buffer. Shared because main throws it and the renderer has to recognise it -
 * matching on a string literal spelled out in two places is how the editor would
 * end up showing a raw error instead of the conflict bar.
 */
export const CHANGED_ON_DISK = "changed on disk"
