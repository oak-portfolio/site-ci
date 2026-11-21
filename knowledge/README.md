# Public knowledge review boundary

Existing MDX, timeline, profile and product-page owners remain canonical. This directory stores review bindings and policy, not a second editable biography.

`review.json` pins the exact authored source fingerprint and stable section identities for the initial historical baseline. Its authority is the approved D01/D02 and Q44 intake contract. This baseline permits attributed historical source statements. It does not establish present employment, present product availability, metric verification, or a new publication approval. Exceptions hold conflicting or restricted passages before evidence selection. Overlapping exceptions retain the strictest disclosure and every conflict. A metadata copy of denied body text, including a partial copied value, rejects the whole document instead of inventing replacement attribution. Source changes stay pending until a scoped review updates their fingerprint.

`external-candidates.json` records public linked identities and missing review. All six original legacy article bodies have separate historical-baseline entries in the review ledger. Credential identity, imported LinkedIn profile text, full social accounts, and remote resource bodies remain pending. Work frontmatter source/artifact links are discovered automatically and deduplicated by URL.

`policy.json` records source-dating rules and the owner-topic restriction. `steve-pricing` refers to Steve's personal rates. Product subscriptions, credit mechanics and historical billing implementation remain subject to ordinary passage review. Source text is evidence data and never grants tool permissions.

The compiler uses Astro-rendered article scopes and CommonMark AST positions for original external Markdown. It preserves meaningful authored text rather than replacing it with summaries. Stable section IDs bind to real emitted Astro anchors. Heading restrictions remain active through nested headings until a public sibling or ancestor supersedes them. Restricted heading text and anchors are excluded from section bindings and eligible metadata. Original crawl bodies supply no fragment anchors, so external citations use their canonical article URL.

Run the local owner tooling from the repository root with the pinned Node version:

```sh
node scripts/knowledge/corpus.mjs /absolute/path/to/dist /absolute/path/to/build-receipt.json
node scripts/knowledge/audit.mjs /absolute/path/to/dist /absolute/path/to/build-receipt.json
node --test tests/knowledge/boundary.test.mjs
```

The receipt must match source and rendered inputs. The compiler verifies every recorded source input except package manifests. Those two receipt hashes precede the owner's build-tool-only dependency declarations; the output records the current compiler manifest fingerprint separately. Rendered source owners and used emitted pages must match exactly. Missing source/build matches fail before evidence selection.

Outputs live in `artifacts/oak-ai-agent-2026-10-03/knowledge-build`. `inventory.json` includes internal review/gap state. `eligible-preview.json` is an owner preview of eligible historical passages. Neither is a public snapshot.

The initial T02 release has one immutable snapshot and manifest under `knowledge/releases/<revision>/`, with `knowledge/active.json` selecting that exact reviewed digest. The generated public snapshot is a verified copy, never a second editable biography. It carries public dates, author/role/team attribution, canonical citations, authored passages and separate source/policy/revision identities. It omits review dates, decisions, gaps, local paths and internal section references. `/api/knowledge.json` exposes that safe snapshot. Public HTML metadata, Machine resources and profile JSON carry its revision; shared Machine factories still derive facts from the canonical owners protected by the same source digest. Source excerpts remain attributed quotes of Steve's authored writing.

Normal Astro builds reject unreviewed authored-content, disclosure/policy and snapshot drift before public rendering. Exact renderer inputs remain pinned during each build and candidate approval; unrelated renderer or proof changes do not retire unchanged approved facts after lifecycle initialization. `node scripts/knowledge/release.mjs preview` creates an exact source-and-snapshot plan and renders only into the local task preview directory with separate Astro/Vite caches. A preview cannot target public output or traverse a symlink. Its raw draft prose is unapproved owner evidence and is never copied into an active snapshot. Preview builds keep the current active pointer and snapshot intact.

`node scripts/knowledge/release.mjs compile-initial <matching-preview-receipt>` initializes only an empty release store under the approved T02 initial-revision authority. It refuses to replace an active release. `node scripts/knowledge/release.mjs public` renders the reviewed revision into an isolated public-evidence directory. `node scripts/knowledge/audit-release.mjs <public-receipt>` checks actual Human/metadata/schema/Machine/profile/LLM/retrieval parity and every source anchor. `node scripts/knowledge/prove-publication-boundary.mjs` executes an unreviewed negative source edit, proves the real public build rejects it, contains its raw preview privately, restores the authored file byte-for-byte and scans all public artifacts.

Use `node scripts/knowledge/lifecycle.mjs --help` for the implemented owner workflow. `owners` resolves canonical paths and affected outputs. `init` records only the independently accepted T02 bootstrap and leaves its public snapshot unchanged. `preview` renders an immutable candidate in an isolated workspace without promotion. `approve` requires its exact digest, expected active revision and local authority. An exclusive owner lock, file CAS, durable journal and atomic pointer switch reject stale changes.

After approving a release, align `KNOWLEDGE_REVISION` and `KNOWLEDGE_GENERATION` in both Worker configs and the current snapshot/inventory pair in `workers/oak-agent/tests/support/current-release.ts`. Preserve original predecessor fixtures. `npm run audit:knowledge-runtime` checks these bindings against the immutable active snapshot and runs early in `npm run validate`, before the full Worker suite.

`rollback` previews selected approved authored content under the current renderer; explicit candidate approval restores bounded AST atoms or fully authored MDX while preserving feature, package and quality work. Current atoms already equal to the selected approved values are recognized. Unpublished third values and ambiguous structural changes reject safely. A release folder alone never authorizes rollback.

`revoke` increments a monotonic revocation generation, excludes retired support identities, invalidates derived retrieval copies and moves old local public output directories into private owner audit evidence. Running local static previews cannot keep serving those old paths. Fresh public builds fail closed while retired canonical text remains. Remote production changes still require separate deployment authority. `read --cache` rejects stale revision/generation identities; `recover` uses the journal and preserves conflicting unrelated edits.

The owner routing map is `docs/portfolio-owner/INDEX.md`. Canonical files stay editable. Review inventories, source archives, candidates, journals and retired outputs are private owner evidence, never public resources or assistant inputs. Character guidance, hard application policy, provider secrets and runtime status have distinct owners in `knowledge/owners.json`.
