# Sensitive-data audit — 2026-09-09

Repo: `AgentsUniteDesktop` (private on GitHub). Standard: commit `c62f006` (sanitize absolute `/Users/` paths, named NotebookLM notebooks, conversation/session ids, the project codename, and chat/conversation content). Scope: working tree of `feat/seat-exchange` @ `f95e575` plus `git log -p --all` (58 commits). Read-only; this file is the only write.

Masking: secrets and ids are shown as first 3 + last 3 characters. Conversation text is described, never quoted.

## Standard (`c62f006`)

That commit replaced a home-directory chat path with `~/.unite/chats/main/` and replaced a list of named NotebookLM notebooks with “private NotebookLM notebooks, project notes, and rich desktop context.” Anything still matching the pre-change shape is a miss against the repo’s own publishability convention.

---

## Findings

### 1. Credentials and tokens

No findings. `gitleaks detect --source . --log-opts='--all' --redact` (v8.30.1) scanned 58 commits, ~2.07 MB, **no leaks**. Pattern search found no `ghp_` / `github_pat_` / `sk-` / `AKIA` / `AIza` / `ya29.` / `BEGIN PRIVATE KEY` / cookie headers / `.env` bodies / `storage_state.json` contents. Mentions of `storage_state.json` and `~/.notebooklm/` in docs are path names only, not artifacts.

### 2. Personal identifiers

| # | Location | Line / field | Cat | Sev | MASKED excerpt | Remediation |
|---|---|---|---|---|---|---|
| 2a | `PROJECT.md` | 25, 34 | 2 | B | `/Us…/ted…eds/Projekts/AgentsUnite` | Redact in place to `~/Projekts/AgentsUnite` (same shape as `c62f006`). |
| 2b | `docs/superpowers/specs/2026-09-06-agentsunite-desktop-relay-design.md` | 5 | 2 | B | same `/Us…/ted…eds/…` home path | Redact in place. |
| 2c | `docs/superpowers/plans/2026-09-06-agentsunite-desktop-relay.md` | 1960, 1975, 2019, 2035, 2041, 2055, 2944 | 2 | B | `cd /Us…/ted…eds/Projekts/…` and a folder-picker example under that home | Redact in place to `~` / `$HOME`. |
| 2d | `scripts/build-instructions.sh` | 25–27 | 2 | B | `DESKTOP_OUT="/Us…/ted…eds/Desktop/…pdf"` | Redact in place: copy to `"$HOME/Desktop/…"` or drop the Desktop copy. |
| 2e | `test/claude-cli.test.js` | 101–102 | 2 | B | live denial text `ls /Us…/ted…eds/Projekts` | Replace with a synthetic path (`~/proj`) that still exercises the denial parser. |
| 2f | history-only: `Collaboration.md` before `c62f006` (e.g. `41e5141`) | quoted room folder | 2 | B | `/Us…/ted…eds/Downloads/.unite/chats/main/` | Working tree is already sanitized. **History rewrite** if the repo goes public (the old blob remains on `main`). |
| 2g | `LICENSE`, `README.md`, commit `Author:` | copyright / clone URL | 2 | C | public GitHub identity (`tedico`, full legal name in LICENSE) | Acceptable for an MIT project published under that account. Not a `c62f006` miss. |
| 2h | `scripts/package.mjs:38`, `Collaboration.md:236` | bundle id | 2 | C | `com.ted…ico.agentsunite-desktop` | Reverse-DNS of the GitHub identity. Keep unless the published name should differ. |

No phone numbers. No emails other than GitHub `noreply` (`300…com` via `users.noreply.github.com`) and the documented agent trailers `noreply@cursor.com` / `noreply@google.com`. No machine hostnames (iTerm2 is an app name, not a host).

### 3. Project-private identifiers (`c62f006`)

| # | Location | Line / field | Cat | Sev | MASKED excerpt | Remediation |
|---|---|---|---|---|---|---|
| 3a | `test/fixtures/gemini-reply-as-button.json` | AXWindow `name`/`title` | 3 | B | `Gemini — Defining the Rue…ena Thesis` (project codename) | Regenerate from a **neutral** tree (synthetic title + lorem reply) that still has an `AXButton` reply `value`. Update `test/gemini-live.test.js` (it currently matches a live phrase). |
| 3b | same fixture | AXButton `value` + thinking `AXTextArea` | 3+4 | B | names a notebook that `c62f006` deleted from docs (3-letter code), handwritten-note content, and the same project codename | Same regenerate. Do not redact only the title — the body still names the notebook and the thesis. |
| 3c | `test/claude-cli.test.js` | 80 (`INNOCENT_STREAM`) | 3 | B | `Matched: 4ef…ab4 (<3-letter notebook>)` — looks like a real NotebookLM source/notebook id plus a name `c62f006` removed | Redact in place: `Matched: aaa…zzz (Notebook)` or `nb-1`. The test only needs the word `permission` in a successful tool result. |
| 3d | `docs/field-notes/2026-09-08-company-os-x.md` | 1, 4, 9 | 3 | B | workspace `~/Projekts/Com…S_X`, chat dir `…/.unite/chats/main` | Redact workspace/chat names to `~/Projekts/<room>/` / `~/.unite/chats/main`. |
| 3e | `docs/field-notes/2026-09-08-evening-relay-hardening.md` | 1, 4 | 3 | B | same `Com…S_X` workspace name | Same as 3d. |
| 3f | history-only: `docs/superpowers/specs/2026-09-06-agentsunite-desktop-relay-design.md` @ `48d8835` (removed from HEAD in `7a3ffee`) | 12–13 | 3 | B | listed the same notebook names `c62f006` later stripped from `Collaboration.md` | HEAD is clean. **History rewrite** (or accept that clones of old commits still list them). |
| 3g | history-only: `Collaboration.md` @ `e70d706` / `9770ff6` / `7a3ffee` | A4 pivot paragraph | 3 | B | same named-notebook list | Already fixed in HEAD by `c62f006`. History rewrite if publishing. |

Synthetic ids in tests (`nb-1`, `nb-abc`, `conv-99`, `sess-ok`) are fine.

### 4. Conversation content (live AX / field quotes)

| # | Location | Line / field | Cat | Sev | MASKED excerpt | Remediation |
|---|---|---|---|---|---|---|
| 4a | `test/fixtures/gemini-reply-as-button.json` | window title, button `value`, thinking-panel `value` | 4 | B | live Gemini chat: thesis/handoff, handwritten-note recap, thinking-panel traces. Known suspect confirmed. | **Regenerate** a minimal tree that preserves roles/paths (`AXButton` reply, empty `AXStaticText`, thinking `AXTextArea`) with dummy strings. Then point `test/gemini-live.test.js` at a dummy substring instead of a live phrase. |
| 4b | `test/gemini-live.test.js` | 7–15 | 4 | B | comment “Captured live 2026-09-08 21:29”; assertion on a live reply fragment | After 4a, assert on the dummy string. |
| 4c | `test/fixtures/gemini-{idle,streaming,done}.json` | conversation `name`/`value`; idle window title | 4 | B | prior Gemini thread plus probe turns; a personal nickname greeting and the model repeating it; a local screenshot filename `Scr…png` | Redact nickname + screenshot filename in place (tests do not assert those strings). Optional: regenerate probe trees from a dedicated throwaway chat titled e.g. “Probe”. |
| 4d | `test/fixtures/claude-idle.json` | sidebar/message `name`/`value` | 4 | B | same personal nickname in the Claude tree | Redact in place. |
| 4e | `docs/field-notes/2026-09-08-company-os-x.md` | O1, F2, F4 | 4 | B | timestamps plus paraphrases/quotes of live `@gemini` / `@claude` turns, including a relayed directory-structure answer | Strip quoted chat to one-line summaries (“Gemini restated a directory tree; the relay dropped it”). Keep the engineering diagnosis. |
| 4f | `docs/field-notes/2026-09-08-evening-relay-hardening.md` | F8, O1 | 4 | B | live round descriptions (seat claimed to have read a file; notebook upload behaviour) | Same: keep the bug, drop chat wording. |
| 4g | `docs/probe/findings.md` | “Surprises” | 4 | C | notes that Gemini’s on-screen title was a prior probe question and that fixtures contain that text | Probe Q&A about Electron is lab content, not the private thesis. Leave or retitle fixtures when 4c is done. |

Claude `streaming`/`done` fixtures are probe prompts (hello / JS / accessibility essay), not the private project. Still live AX, but not a `c62f006` notebook/codename miss.

### 5. Commit messages and trailers

| # | Location | Field | Cat | Sev | MASKED excerpt | Remediation |
|---|---|---|---|---|---|---|
| 5a | 13 commits (including `origin/main` @ `53504fb`) | trailer `Claude-Session:` | 5 | B | `https://claude.ai/code/session_01L…uGe` (10 commits), `session_01S…ckQ` (2), `session_01K…ZLw` (1) | **History rewrite** (filter-repo / `git rebase` with message rewrite). A follow-up commit cannot unpublish a trailer already on `main`. Treat the URLs as session ids, not as credentials — they are still forbidden by the standard. |

Bodies otherwise match the status-signal convention. No tokens in subjects.

### 6. Files that should be ignored but are tracked

| # | Location | Cat | Sev | Notes | Remediation |
|---|---|---|---|---|---|
| 6a | — | 6 | — | **None tracked.** `git ls-files` has no `.unite/`, `dist/`, `node_modules/`, `transcript.jsonl`/`transcript.md`, `settings.local.json`, or `*.log`. | — |
| 6b | `.gitignore` | 6 | C | Ignores `node_modules/`, `dist/`, `.unite/`, `.DS_Store` only. Does **not** ignore `*.log`, `transcript.*`, `settings.local.json`, `.env`, `storage_state.json`. | Add those patterns before public so a future `git add .` cannot land logs or session files. Packager already drops `.unite` and fixtures from the `.app`. |

`docs/instructions/AgentsUniteDesktop-Instructions.pdf` is tracked; `strings` on it has none of the `c62f006` names or `/Users/` paths. Not in the “must ignore” list.

---

## Summary

| Category | A | B | C | Notes |
|---|---:|---:|---:|---|
| 1 Credentials | 0 | 0 | 0 | gitleaks clean |
| 2 Personal ids | 0 | 6 | 2 | all B are `/Users/<name>/` paths (HEAD + one history blob) |
| 3 Project-private ids | 0 | 7 | 0 | notebook names/ids, project codename, workspace/chat dir |
| 4 Conversation content | 0 | 6 | 1 | live AX fixture is the worst; field notes quote rounds |
| 5 Commit trailers | 0 | 1 | 0 | 13 commits / 3 session URLs, already on `origin/main` |
| 6 Ignored-but-tracked | 0 | 0 | 1 | gitignore gap only |
| **Total** | **0** | **20** | **4** | |

Severity: **A** = must never be in the repo (credentials). **B** = must be sanitized before public (`c62f006`). **C** = fine while private / expected public identity.

---

## Clean (checked, no finding)

Evidence, not silence:

- **gitleaks** `--all`: 0 secrets.
- **No** `.env`, `storage_state.json`, `~/.notebooklm` artifacts, private keys, cookies, or GitHub tokens in tree or history (`git log --all --diff-filter=A` for those names: empty except the intentional PDF).
- **No** phone numbers.
- **No** non-noreply emails.
- **HEAD `Collaboration.md`**: `c62f006` sanitization still holds (tilde path; no named notebooks).
- **HEAD design spec** (after `7a3ffee`): “private NotebookLM notebooks”, no name list.
- **Instructions HTML + PDF**: no notebook names, no `/Users/` home paths.
- **Tracked ignore-list files**: none of `.unite/`, `dist/`, `node_modules/`, transcripts, `*.log`.
- **Vendor** `vendor/agentsunite/`: no home paths, no session URLs, no notebook names (only `claude.ai` as a product word in comments).
- **Synthetic test ids** (`nb-1`, `conv-99`, `sess-wd`, `desktop:gemini`): not live.
- **`main` vs `feat/seat-exchange`**: the live `gemini-reply-as-button.json` tree is **not** on `main`; it is on `feat/seat-exchange` (and `origin/feat/seat-exchange`). Session-URL trailers **are** on `origin/main`.

---

## Publish path (recommendation only — not done)

1. Redact / regenerate HEAD (findings 2a–2e, 3a–3e, 4a–4f).
2. Tighten `.gitignore` (6b).
3. **Rewrite history** for (2f), (3f–3g), and (5a). `c62f006` only rewrote the tip of `Collaboration.md`; clones still contain the old blobs and every `Claude-Session:` trailer on `main`.
4. After rewrite, force-push is required (warn before `main`). Re-run gitleaks and this checklist on the new tip.

---

## Verdict

**Highest severity: B** (no A). The single worst item is `test/fixtures/gemini-reply-as-button.json`: a live Gemini accessibility dump whose window title is the project codename and whose reply/thinking fields carry notebook-named, handwritten-note, thesis chat.

**Making the repository public today would not be safe.** Flip-to-public would publish (a) that fixture on `feat/seat-exchange`, (b) `/Users/` home paths and field-note workspace/chat names on current branches, (c) named notebooks in older commits, and (d) `claude.ai/code/session_…` trailers already on `origin/main`. Sanitize HEAD, then rewrite history, then re-audit.

---

## Re-audit of HEAD — 2026-09-09

Working-tree only (history not rewritten). Checks: `git grep` on HEAD for home-directory paths and the previously flagged notebook/codename/live-reply strings; fixture string walk; `gitleaks detect --source . --no-git`; `npm test`; `git status --short vendor/`.

HEAD is clean for the category-B items this branch can fix without a history rewrite:

- No `/Users/<name>/` paths in tracked files.
- `test/claude-cli.test.js` INNOCENT_STREAM uses a nil UUID and the label `Example notebook`; the `permission` sentence is unchanged. The denial fixture uses `~/Projekts`.
- `test/fixtures/gemini-reply-as-button.json`: window title/name is `Example chat`; AXButton reply starts `This is a redacted reply.`; thinking panel starts `Redacted thinking text.`; chrome strings left alone. `test/gemini-live.test.js` asserts on the redacted opener. Node count still 50.
- Field notes use `<workspace>/.unite/chats/<chat>/` and no longer name the live workspace.
- `gitleaks` (working tree): no leaks. `npm test`: 187 pass / 0 fail. `vendor/` unmodified.

Still **not** safe to make the repository public: pre-`c62f006` blobs, named notebooks in old commits, and `Claude-Session:` trailers remain in history (including `origin/main`). Those need a history rewrite, which this remediating commit does not do.

