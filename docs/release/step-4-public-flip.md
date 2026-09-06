# ROADMAP step 4 — delete the remote, recreate it, push the scrubbed history, flip public, file with SignPath

**Status: not executed. This document is the procedure, not a record.**

Step 4 is the one step in the 5–10-users milestone that cannot be undone, and it is
the one every other blocked step waits behind: the SignPath Foundation certificate
(step 6's signing), the release feed, the updater, and the homepage's attribution
line all depend on this repository being public under this exact name.

Written to be executed by the owner, or authorised by the owner and executed on his
behalf. **No agent should run Phase 3 or Phase 5 without the owner saying so in the
session that runs it.** Every command below is given literally. Where a command is
irreversible it is marked **IRREVERSIBLE** and preceded by what it destroys.

Commands are shown for **bash** (Git Bash ships with Git for Windows) because two of
the gates are shell loops. `gh` and `git` behave identically from PowerShell; the
loops do not.

---


> ## This file is itself in scope for the scrub
>
> **Added 2026-09-05.** This runbook names `<employer-domain>`, `<Client-A>`,
> `<Client-B>`, `<Client-C>` and `[CLIENT]` in its grep patterns and its findings — because
> it has to, to be runnable. That means **the flip would publish, in this file,
> exactly the identifiers the flip exists to remove**, and deleting the file
> afterwards does not help: the commit that added it is in the history the flip
> publishes.
>
> So Phase 2's `filter-repo` replacement pass must cover **this file's contents
> too**, not only the identity fields. Verify with the Phase 6 grep *after* the
> rewrite, not before — if it still returns hits inside `docs/release/`, the
> rewrite did not include them and the flip is not safe.
>
> The alternative, if the literals are wanted verbatim for the run: keep this
> file out of the repo entirely (run it from a copy outside the working tree)
> and commit only a version with the identifiers replaced by placeholders. Do
> not resolve this by "remembering to delete it later".

## 0. Preflight — four things that are not true yet

Step 4 is currently blocked on all four. None of them is hard; all of them are
easier to fix before the delete than after.

### 0.1 The `gh` token cannot delete a repository

```
$ gh auth status
  Token scopes: 'gist', 'read:org', 'repo', 'workflow'
```

No `delete_repo`. Phase 3 fails without it. Fix:

```bash
gh auth refresh -h github.com -s delete_repo
```

That opens a browser consent screen — it is interactive, and it is the owner's
consent, not something to be worked around. Verify with `gh auth status` before
going further. Consider dropping the scope again afterwards (`gh auth refresh -h
github.com -s repo,workflow,gist,read:org`), because a token that can delete
repositories is a token that can delete this one twice.

### 0.2 The history still carries the employer's email domain — on 654 of 728 commits

The 2026-09-02 scrub replaced client and employer **names** in file contents and
commit messages. It did not rewrite commit **identities**:

```bash
$ git log HEAD --format='%ae' | sort | uniq -c | sort -rn
    654 <employer-email>
     72 Midor2Mid@users.noreply.github.com
      2 14520777@gm.uit.edu.vn
```

`%ce` (committer) is the same 654. `<employer-domain>` is an employer identifier, it
is rendered on every commit page and in every `git log`, and publishing it is
exactly what step 2 exists to prevent. The two `gm.uit.edu.vn` commits are a third
party's personal address on two merge commits.

This is a **decision, not a defect to fix silently**: rewriting it moves all 728
commit SHAs, which is free right now (only `main` exists on the remote, nothing is
forked, no one has cloned) and expensive after publication. Recommended, and the
command is in Phase 2.

### 0.3 One client identifier survived the scrub

```bash
$ git grep -n '[CLIENT]' HEAD -- ':!package-lock.json'
HEAD:docs/superpowers/plans/2026-07-13-project-visual-identity.md:69
HEAD:docs/superpowers/specs/2026-07-13-project-visual-identity-design.md:74
HEAD:tests/projectIdentity.test.ts:15
```

`[CLIENT]` is on the scrub's own replacement list (it went to `Contoso`/`Fabrikam` in
three commits). Three occurrences in the **current tree** were missed, all of them
the same monogram example `"[CLIENT] - BE"`. Change them to the same placeholder the
rest of the tree uses, in an ordinary commit, before Phase 2.

### 0.4 0.13.0 must not be published into a repository that is about to be deleted

Cut it, tag it, keep it local. Publishing a release into this remote is work that
deletes itself in Phase 3. The CI workflow (`.github/workflows/release.yml`) is
written to run against the **recreated** remote, and its `workflow_dispatch` path
exists precisely so it can be proven there without publishing anything.

---

## 1. Why delete, when `git push --force` looks like it would do

Because it would not, and here that is not a theoretical worry — it is the current
state of the remote.

**The remote's history is not scrubbed.** Fourteen tags on `origin` point at
**pre-scrub commits**, and a tag is a reachable ref: anyone with read access gets
those commits with an ordinary `git fetch --tags`, no SHA-guessing required.

```bash
# remote v0.10.0 -> a52f161, which is NOT an ancestor of local main
$ git merge-base --is-ancestor a52f16130a9dc3bc3fe460fd155547e2320a4889 HEAD; echo $?
1
$ git grep -l -i <client-a> a52f16130a9dc3bc3fe460fd155547e2320a4889
a52f16130a9dc3bc3fe460fd155547e2320a4889:tests/runProject.test.ts
```

The pre-scrub trees still on the remote contain `<Employer>` (3 files), `<Client-A>`,
`<Client-B>` and `<Client-C>`. The affected tags: `v0.7.0`, `v0.7.3`, `v0.7.5`–`v0.7.10`,
`v0.7.12`, `v0.8.0`, `v0.9.0`, `v0.10.0`, `v0.11.0`, `v0.11.1`.

And a force-push of `main` **and** `--force --tags` would still not be enough.
GitHub does not garbage-collect on demand: commits that no ref points at any more
stay retrievable by SHA through the web UI and the API (`/commit/<sha>`,
`/raw/<sha>/<path>`) indefinitely, and those SHAs are not secret — they appear in
the fourteen existing releases, in every commit URL, and in anything that ever
linked to them. Deleting the repository is the only operation that removes the
objects.

**Right now this is not a live leak** — the repository is private, has zero forks,
zero stars and no collaborators, so nobody outside the account has ever been able
to fetch any of it. That is what makes the ordering below safe, and what makes
getting the ordering wrong the whole risk: **delete first, flip public second.**
Flip first and the identifiers are public in the interval.

---

## 2. The hard constraint: the recreated repository must be `Midor2Mid/devdeck`

Same owner. Same name. This is not tidiness.

`package.json` → `build.publish` is `{provider: github, owner: Midor2Mid, repo: devdeck}`,
and electron-builder writes that into every packaged app's
`resources/app-update.yml`. That is the URL `electron-updater` polls, baked into
0.12.0 and into every build before it. Recreate under a different owner or a
different name and **every installed DevDeck silently stops updating** — not an
error, not a warning, it simply never sees another release again. There is no
remote fix; it needs a manual reinstall of a build that names the new location.

What the delete does cost the updater, unavoidably: the old `.blockmap` files go
with the releases, so the first update after step 4 is a full download rather than
a differential one. That is bandwidth, not breakage.

---

## 3. What is lost, measured before the delete

| | |
|---|---|
| Releases | **14**, with 36 assets (28 installers, 3,053,592,909 bytes) |
| Lifetime downloads, all assets, all releases | **1** — a 346-byte `latest.yml` poll on v0.10.0 |
| Issues | 0 |
| Pull requests | 0 |
| Stars / watchers / forks | 0 / 0 / 0 |
| Repository secrets / variables | none |
| GitHub Pages site | none |
| Wiki, Projects, Discussions | never used |
| Workflows | 1 (`check.yml`) — it is in the tree, so it comes back with the push |
| Repository created | 2026-06-28 (the creation date is lost; the new one will read as today) |

So the *only* irreplaceable loss is the 14 releases and their 28 installers, and:

- **The installers are reproducible.** Every tag `v0.1.0`–`v0.12.0` is an ancestor
  of `main`, and `release/` already holds a signed 0.12.0. Nothing is archived
  because nothing needs to be.
- **The release-note bodies are not reproducible, and they are harvested.**
  `docs/release/published-release-notes.md` holds all fourteen verbatim. Six of
  eight distinctive paragraphs in the 0.10.0 body exist nowhere else in this repo —
  the install instructions, the SmartScreen warning and the "what this release is"
  framing among them. It is the only prior art for how this product has ever
  described itself to an outsider, and the recreated repo's first release notes
  should be built from it.
- **The download counts are not reproducible either, and their value is that they
  are zero.** One download, of a manifest, almost certainly by this machine's own
  updater. No human has ever downloaded a DevDeck installer. That number is in the
  same file, because after the delete it stops being a measurement and becomes an
  assertion `PRODUCT.md` is not entitled to make.

Before Phase 3, confirm the harvest is committed:

```bash
git log --oneline -1 -- docs/release/published-release-notes.md
```

---

## 4. The procedure

### Phase 1 — gates (all of these, every time, no exceptions)

```bash
cd "D:/Personal/Personal Projects/Products/devdeck"

# 1. clean tree
git status --porcelain            # must print nothing

# 2. the two suites
npm run typecheck                 # must be 0 errors
npm test                          # must be green

# 3. no tag points anywhere but into main's history.
#    This is the gate that stops Phase 4 republishing exactly what Phase 3
#    removed. It passes today; re-run it at push time, do not assume it.
for t in $(git tag); do
    git merge-base --is-ancestor "$t" HEAD || echo "UNSAFE: $t"
done                              # must print nothing

# 4. no identifier survives in the tree
git grep -n -i -E '<employer>|<client-a>|<client-b>|<client-c>|\[[CLIENT]\]' HEAD -- ':!package-lock.json'
                                  # must print nothing

# 5. no identifier survives in a commit message
git log HEAD --format='%s%n%b' | grep -i -E '<employer>|<client-a>|<client-b>|<client-c>'
                                  # must print nothing

# 6. no identifier survives in a commit identity  (see 0.2 / Phase 2)
git log HEAD --format='%ae%n%ce' | sort -u
    # Expect exactly two, both fine to publish:
    #   Midor2Mid@users.noreply.github.com   (the author)
    #   noreply@github.com                   (GitHub's own web-merge committer)
    # Anything else - and today that is <employer-email> and
    # 14520777@gm.uit.edu.vn - fails this gate.
```

### Phase 2 — rewrite the commit identities — **ALREADY DONE, 2026-09-05/06. DO NOT RE-RUN.**

> Executed and verified. Skip to Phase 3. Re-running would rewrite an already
> clean history for no gain and invalidate every SHA citation again.
>
> - **Identities:** 654 commits carried the employer address on author *and*
>   committer. `filter-branch --env-filter` over `-- --all` mapped them to
>   `Midor2Mid@users.noreply.github.com`.
> - **Contents:** two further `--index-filter` passes — one scoped to the 10
>   commits carrying this runbook, one to the 3 files that ever carried the
>   client tag — replaced every literal with placeholders.
> - **A stale ref that nearly survived it:** `refs/remotes/origin/main` still
>   pointed at pre-scrub objects, because the identity pass ran over `--all` but
>   the content passes were range-scoped to `main`, and a range rewrite never
>   touches remote-tracking refs. Deleted, then `gc --prune=now`.
> - **Verified twice, with stderr visible:** `git log --all -S<literal>` returns
>   0 commits for each literal, and `xargs -n 150 git grep` over all 745
>   revisions returns nothing. **Do not verify with
>   `git grep ... $(git rev-list --all)`** — on this history that exceeds the
>   Windows argument limit, and with `2>/dev/null` the failure reads as a pass.
>   That false negative was reported as proof once already.
> - `tests/gitIdentity.test.ts` now fails the build if an unintended identity
>   ever reappears, and it is cloned, which `.git/config` is not.
>
> The original instructions are kept below for the record.

#### (historical) rewrite the commit identities

Skip only if the owner decides publishing `@<employer-domain>` on 654 commits is
acceptable. **Rewrites every commit SHA in the repository**, which is reversible
locally (see below) and free while nothing has cloned it.

```bash
# Take a full backup first - this is the only undo.
git bundle create ../devdeck-pre-email-rewrite.bundle --all
git rev-parse HEAD > ../devdeck-pre-email-rewrite.head

git filter-repo --force --email-callback '
    return b"Midor2Mid@users.noreply.github.com" if email in (
        b"<employer-email>",
        b"14520777@gm.uit.edu.vn",
    ) else email
'
```

`git filter-repo` removes the `origin` remote as a safety measure — that is fine
here, Phase 4 adds it back. It also rewrites all 58 tags onto the new commits.

Then **re-run every gate in Phase 1**, especially gate 3 and gate 6. If anything is
wrong: `git fetch ../devdeck-pre-email-rewrite.bundle` and reset to the recorded
HEAD; nothing has left the machine yet.

### Phase 3 — delete the remote **← IRREVERSIBLE**

This destroys: 14 releases, 36 release assets, the repository's creation date, its
Actions run history and logs, and the pre-scrub commits (which is the point).
There is no self-service undo, and no restore path brings release assets back.

Last look, then do it:

```bash
gh release list --repo Midor2Mid/devdeck --limit 30
gh api repos/Midor2Mid/devdeck --jq '{visibility, stars: .stargazers_count, forks: .forks_count, issues: .open_issues_count}'

gh repo delete Midor2Mid/devdeck --yes            # IRREVERSIBLE
```

Confirm it is gone before continuing:

```bash
gh api repos/Midor2Mid/devdeck                    # must be 404
```

### Phase 4 — recreate **private**, push, and verify while nobody can see it

Private on purpose. The push is the moment to check what actually landed, and it is
better to check it in a repository the public cannot read. Note the exact name.

```bash
gh repo create Midor2Mid/devdeck \
    --private \
    --description "A command deck for terminal-first, agent-driven development. Windows." \
    --disable-wiki

# Issues stay ON (the 2026-09-03 ruling: issues on, discussions off, no CONTRIBUTING.md).
# Discussions are off by default; do not enable them.

git remote add origin https://github.com/Midor2Mid/devdeck.git
git push -u origin main

# Gate 3 again, then and only then the tags:
for t in $(git tag); do
    git merge-base --is-ancestor "$t" HEAD || echo "UNSAFE: $t"
done
git push origin --tags
```

Verify the remote is what you think it is:

```bash
# every remote tag must peel to a commit that is an ancestor of main
git ls-remote --tags origin | grep '\^{}' | awk '{print $1}' | while read c; do
    git merge-base --is-ancestor "$c" HEAD || echo "PRE-SCRUB OBJECT ON THE REMOTE: $c"
done                                              # must print nothing

gh api repos/Midor2Mid/devdeck --jq '.visibility, .default_branch'
gh api repos/Midor2Mid/devdeck/actions/workflows --jq '.workflows[] | "\(.name) \(.path) \(.state)"'
                                                  # expect: check, release
```

Then prove CI before anything is public or tagged for release:

```bash
gh workflow run release.yml --repo Midor2Mid/devdeck --ref main
gh run watch --repo Midor2Mid/devdeck
```

That run packages unsigned artifacts, verifies `latest.yml` against them and
uploads them to the workflow run. It creates **no** release. If it is red, stop:
step 6 is not done, and flipping public does not help.

### Phase 5 — flip public **← IRREVERSIBLE in effect**

Reversible as a GitHub setting; not reversible as an act. Anything visible in this
window can have been cloned, cached by a crawler, or mirrored, and un-publishing
does not recall it.

```bash
gh repo edit Midor2Mid/devdeck \
    --visibility public \
    --accept-visibility-change-consequences
```

Immediately after:

```bash
gh api repos/Midor2Mid/devdeck --jq '.visibility'          # public
# and read it as a stranger would - no token, no account:
curl -s -o /dev/null -w '%{http_code}\n' https://api.github.com/repos/Midor2Mid/devdeck
```

### Phase 6 — file with SignPath Foundation

Only possible now; the application requires a public repository and an
OSI-approved licence, and both are true from Phase 5 onwards.

What it needs, and where each piece already is:

| Requirement | Where it is |
|---|---|
| Public repository | done in Phase 5 |
| OSI-approved licence | `LICENSE` — MIT, added 2026-09-02 (ROADMAP step 1) |
| Every component's licence nameable | the provenance audit, step 1. Two unlicensed vendored design skills were stripped from history and are `.gitignore`d — do not re-add them |
| A published code-signing policy | `site/index.html#code-signing` (step 5). The SignPath attribution line is a **marked, empty slot** — fill it only when the certificate is actually granted |
| Attribution on the project site | same page; it needs a live URL, which means GitHub Pages on the recreated repo |
| A build system SignPath can verify | `.github/workflows/release.yml`, on a public repo, with the SignPath GitHub App installed |

Then, in SignPath:

1. Apply to SignPath Foundation for the OSS certificate. Wait for the grant. **Do
   not** fill in the homepage's attribution slot or the workflow's variables before
   the grant arrives.
2. Create the project (slug `devdeck`), a signing policy (`release-signing`), and
   an **Electron/nested** artifact configuration — it must open the NSIS installer,
   sign `DevDeck.exe` and the asar-unpacked native binaries inside it (including
   `@lydell/node-pty`'s `OpenConsole.exe`), and re-sign the installer. Signing only
   the outer installer leaves the exe a stranger actually runs unsigned, and
   SmartScreen judges that one too.
3. Install the SignPath GitHub App on `Midor2Mid/devdeck` and connect it as a
   trusted build system.
4. Set the secret and the five variables listed at the top of the SignPath block in
   `.github/workflows/release.yml`. The one that is not cosmetic is
   `SIGNPATH_PUBLISHER_NAME`: it must be the granted certificate's exact CN, because
   it is written into `app-update.yml` and `electron-updater` refuses any update
   whose Authenticode publisher does not equal it.
5. Tag a release and watch the SignPath block run for the first time. **Nothing in
   it has ever executed.** Expect to debug the artifact configuration, and check
   two things by hand on the first signed build: that the installer's signature is
   `Valid`, and that `node scripts/update-manifest.mjs --check` still passes after
   the manifest was rewritten for the re-signed bytes.

---

## 5. What has to be recreated afterwards

- **Release notes for the first published release**, from
  `docs/release/published-release-notes.md` plus `CHANGELOG.md`.
- **GitHub Pages**, to give `site/index.html` a real URL — step 5 has never been
  deployed because no Pages URL existed before this point, and SignPath's
  attribution requirement needs one.
- **Repository description, homepage URL and topics** — the description is in the
  Phase 4 command; the homepage should point at the Pages URL once it exists.
- **The SignPath secret and five variables** (Phase 6.4). Nothing else: the deleted
  repository had no secrets and no variables.
- **Nothing for the workflows.** `check.yml` and `release.yml` are tracked files and
  arrive with the push. Confirm they are listed and `active`.

## 6. What this unblocks

ROADMAP step 6's signing half — the part of the release path that still depends on
one machine's antivirus configuration. The rest of step 6 does not wait for any of
this: `.github/workflows/release.yml` builds, tests, packages and verifies today,
and produces unsigned artifacts plus a correct `latest.yml` on any runner. What it
cannot do until the certificate exists is produce an installer a stranger's Windows
will accept without a SmartScreen wall — which is the actual point of the step.
