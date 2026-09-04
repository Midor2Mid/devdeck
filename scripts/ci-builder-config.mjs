#!/usr/bin/env node
/**
 * ci-builder-config.mjs - the electron-builder configuration the CI release
 * build uses, derived from the one in package.json so the two cannot drift.
 *
 * WHY A GENERATED FILE AND NOT `-c.win.signExecutable=false` ON THE COMMAND
 * LINE. electron-builder coerces dot-notation CLI values for `extraMetadata`,
 * `mac`, `nsis` and `nsisWeb` only (electron-builder/out/builder.js). Anything
 * under `win` arrives as the raw yargs value, so `-c.win.signExecutable=false`
 * lands as the STRING "false" - and winPackager.js tests
 * `signExecutable === false`, which a string never satisfies. The override
 * would look applied in the log and do nothing, which is the one failure mode
 * this whole path exists to avoid.
 *
 * WHAT IT CHANGES, AND WHY EACH ONE:
 *
 * - `win.signExecutable: false` - a GitHub runner has no certificate store and
 *   `certificateSubjectName: "DevDeck Dev"` is a lookup that can only fail
 *   there. `signExecutable` skips signing while KEEPING the icon and version
 *   resources; `signAndEditExecutable: false` would drop those too, which is
 *   why it is not used here.
 *
 * - `win.signtoolOptions.publisherName: null` (unless a real one is passed) -
 *   this value is written into the packaged app's `resources/app-update.yml`,
 *   and electron-updater REFUSES an update whose Authenticode publisher does
 *   not equal it. An unsigned build that shipped `publisherName: DevDeck Dev`
 *   would be an unsigned artifact claiming a publisher it does not have. An
 *   explicit null also short-circuits app-builder-lib's fallback, which would
 *   otherwise go looking for a certificate to read the name off.
 *
 * The local signed path (`npm run package:signed`) does NOT go through here and
 * is unchanged: it still signs with the self-signed `CN=DevDeck Dev` cert out
 * of the current user's store.
 *
 * Usage:
 *   node scripts/ci-builder-config.mjs <out.json>
 *   node scripts/ci-builder-config.mjs <out.json> --publisher-name "Some CN"
 *
 * Exit: 0 = written - 2 = usage error.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * @param {any} build the `build` object from package.json
 * @param {string | null} [publisherName] the CN of the certificate the artifacts
 *   will really be signed with, or null/undefined/"" when they will not be
 *   signed at all
 * @returns {any}
 */
export function ciConfig(build, publisherName = null) {
    const win = { ...(build?.win ?? {}) }
    const signtoolOptions = { ...(win.signtoolOptions ?? {}) }

    // No cert store on the runner, so a subject-name lookup has nothing to find.
    delete signtoolOptions.certificateSubjectName
    signtoolOptions.publisherName = publisherName == null || publisherName === "" ? null : publisherName

    win.signExecutable = false
    win.signtoolOptions = signtoolOptions

    return { ...(build ?? {}), win }
}

export function main(argv) {
    const out = argv.find(a => !a.startsWith("--"))
    if (out == null) {
        console.error("usage: node scripts/ci-builder-config.mjs <out.json> [--publisher-name <CN>]")
        return 2
    }
    const i = argv.indexOf("--publisher-name")
    const publisherName = i === -1 ? null : (argv[i + 1] ?? null)

    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
    const config = ciConfig(pkg.build, publisherName)

    writeFileSync(resolve(out), JSON.stringify(config, null, 2) + "\n")
    console.log(`==> wrote ${resolve(out)}`)
    console.log(`    win.signExecutable            ${config.win.signExecutable}`)
    console.log(`    win.signtoolOptions           ${JSON.stringify(config.win.signtoolOptions)}`)
    return 0
}

if (resolve(process.argv[1] || "") === resolve(fileURLToPath(import.meta.url))) {
    process.exit(main(process.argv.slice(2)))
}
