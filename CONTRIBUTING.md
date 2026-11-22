# Contributing to Horizon

Thanks for your interest in contributing. This guide describes how the repository is organized and the workflow every change follows.

## Table of contents

- [Development setup](#development-setup)
- [Branch strategy](#branch-strategy)
- [Commit convention](#commit-convention)
- [Pull request process](#pull-request-process)
- [Code standards](#code-standards)
- [Release process](#release-process)
- [Repository settings (maintainers)](#repository-settings-maintainers)

## Development setup

```bash
nvm use          # Node.js version from .nvmrc
npm install      # installs dependencies and the Husky Git hooks
npm run dev      # http://localhost:5173
```

Before opening a pull request, make sure the same checks CI runs pass locally:

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
```

## Branch strategy

Horizon uses a simplified GitFlow on top of GitHub Flow:

| Branch       | Purpose                                                                | Receives merges from     |
| ------------ | ---------------------------------------------------------------------- | ------------------------ |
| `main`       | Production. Always releasable; every merge is tagged with a SemVer tag | `release/*`, `hotfix/*`  |
| `develop`    | Default branch. Integration branch for the next release                | Feature branches, `main` |
| `feat/*`     | New features (`feat/timeline-zoom-pan`)                                | –                        |
| `fix/*`      | Bug fixes (`fix/drawer-focus-trap`)                                    | –                        |
| `docs/*`     | Documentation only                                                     | –                        |
| `refactor/*` | Code changes without behavior changes                                  | –                        |
| `chore/*`    | Tooling, configuration, dependencies                                   | –                        |
| `ci/*`       | CI/CD workflows                                                        | –                        |
| `release/*`  | Release preparation (`release/v0.2.0`)                                 | `develop`                |
| `hotfix/*`   | Urgent fixes on production                                             | `main`                   |

Rules:

1. Always branch from an up-to-date `develop` (except `hotfix/*`, which branches from `main`).
2. Use **kebab-case** and a short, descriptive name: `feat/project-drawer`, not `feat/stuff`.
3. Keep branches short-lived and focused on a single concern.
4. Rebase on `develop` instead of merging `develop` into your branch: `git fetch && git rebase origin/develop`.

### Merge strategy

- **Feature branches → `develop`:** _Rebase and merge_, so the atomic, conventional commits are kept in a linear history.
- **`release/*` → `main`:** _Create a merge commit_, which leaves a clear release marker. `main` is then merged back into `develop`.

## Commit convention

All commits must follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org). This is enforced by **Commitlint** in the `commit-msg` hook and again in CI.

```text
<type>(<optional scope>): <subject in imperative, lower case>

[optional body: what and why, wrapped at 100 characters]

[optional footer: BREAKING CHANGE: …, Closes #123]
```

| Type       | Use for                                                   | SemVer impact |
| ---------- | --------------------------------------------------------- | ------------- |
| `feat`     | A new feature                                             | minor         |
| `fix`      | A bug fix                                                 | patch         |
| `perf`     | A performance improvement                                 | patch         |
| `refactor` | A code change that neither fixes a bug nor adds a feature | –             |
| `test`     | Adding or fixing tests                                    | –             |
| `docs`     | Documentation only                                        | –             |
| `style`    | Formatting, whitespace (no code behavior change)          | –             |
| `build`    | Build system or external dependencies                     | –             |
| `ci`       | CI configuration                                          | –             |
| `chore`    | Other maintenance tasks                                   | –             |
| `revert`   | Reverts a previous commit                                 | –             |

A `!` after the type/scope or a `BREAKING CHANGE:` footer marks a **major** change.

**Recommended scopes:** `app`, `ui`, `theme`, `timeline`, `projects`, `filters`, `data-io`, `persistence`, `a11y`, `deps`, `github`, `release`.

**Examples:**

```text
feat(timeline): add ctrl+wheel zoom anchored on cursor
fix(projects): keep end date after start date when editing
test(timeline): cover tick generation across year boundaries
docs: add screenshot capture guide
```

## Pull request process

1. Open the pull request against **`develop`** (or `main` for `release/*` and `hotfix/*`).
2. Use a Conventional Commit-style title, e.g. `feat(filters): add status filter`.
3. Fill in the [pull request template](./.github/PULL_REQUEST_TEMPLATE.md), including screenshots for visual changes.
4. Wait for the **CI** checks (`quality` and `commitlint`) to pass.
5. Address review comments with new commits, then tidy the history (`git rebase -i`) before the merge if needed.
6. Add a line to the `[Unreleased]` section of [`CHANGELOG.md`](./CHANGELOG.md) for user-facing changes.

## Code standards

- **TypeScript strict mode** is mandatory. Avoid `any`; prefer precise union types and `unknown` with narrowing.
- **Feature-based structure.** Code lives in `src/features/<feature>/` with `components/`, `hooks/`, `lib/` and `store/`.
- **Pure logic in `lib/`.** Anything that computes positions, dates or filters must be a pure function with unit tests.
- **Components** are small, typed with explicit props, and accessible (labels, roles, keyboard support, visible focus).
- **Styling** uses Tailwind utilities and the design tokens in `src/styles/globals.css`. Do not hard-code colors.
- **Imports** use the `@/` alias for anything outside the current feature. ESLint sorts them automatically.
- **Tests** sit next to the code in `__tests__/` folders and are named `*.test.ts(x)`.

## Release process

1. Create `release/vX.Y.Z` from `develop`.
2. Bump `version` in `package.json` and move the `[Unreleased]` entries in `CHANGELOG.md` to a new `[X.Y.Z] - YYYY-MM-DD` section.
3. Commit with `chore(release): vX.Y.Z` and open a pull request to `main`.
4. After the merge, tag and publish:
   ```bash
   git checkout main && git pull
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```
5. Create a GitHub Release from the tag with the CHANGELOG notes.
6. Merge `main` back into `develop`.

## Repository settings (maintainers)

One-time configuration on GitHub, under **Settings**:

1. **General → Pull Requests:** enable _Allow rebase merging_ and _Allow merge commits_, disable _Allow squash merging_, and enable _Automatically delete head branches_.
2. **General → Default branch:** set to `develop`, so new pull requests target it by default. Release and hotfix pull requests must switch the base to `main` explicitly.
3. **Branches → Add branch ruleset** (or classic protection rule) for `main` and for `develop`:
   - Require a pull request before merging.
   - Require status checks to pass: `quality` and `commitlint` (they show up after the first CI run).
   - Require branches to be up to date before merging.
   - Require linear history (on `develop` only, since `main` receives merge commits).
   - Block force pushes and deletions.
4. **Features:** enable _Discussions_ (linked from the issue template chooser).
5. **Pages → Build and deployment → Source:** select _GitHub Actions_. The [`deploy`](.github/workflows/deploy.yml) workflow then publishes every push to `develop`; change its branch to `main` to deploy releases only.
