# Contributing to VoyageAI

Welcome to VoyageAI! We are building the next generation of AI-powered travel intelligence. To ensure we can move fast without breaking things, this document outlines our engineering standards, Git workflow, and code ownership models.

Please read this document carefully before submitting a pull request.

---

## 1. Branching Strategy

We follow a structured branching model to maintain stability across a 5-developer team:

- **`main`**: Production-ready code. Commits here must be immediately deployable.
- **`develop`**: The integration branch for the next release. Features merge here first.
- **`feature/<issue-id>-<short-desc>`**: New features (e.g., `feature/123-add-mapbox-markers`).
- **`fix/<issue-id>-<short-desc>`**: Bug fixes (e.g., `fix/456-itinerary-schema-validation`).
- **`release/vX.Y.Z`**: Preparation for a production release. Bug fixes only.

---

## 2. Git Workflow

### Starting Work
1. Ensure your local `develop` is up-to-date:
   ```bash
   git checkout develop
   git pull origin develop
   ```
2. Create your branch from `develop`:
   ```bash
   git checkout -b feature/YOUR-ISSUE-ID-short-description
   ```

### Syncing with the Repository
Regularly rebase against `develop` to prevent massive merge conflicts:
```bash
git fetch origin
git rebase origin/develop
```
*Resolve conflicts locally before pushing.*

### Submitting a Pull Request
1. Push your branch to GitHub.
2. Open a PR targeting the `develop` branch.
3. Fill out the PR template completely.
4. Request review from the module owner (see Code Ownership).

### Merge Rules
- PRs must have **at least 1 approval** from a designated code owner.
- CI/CD checks (lint, build, typecheck, tests) must pass.
- Squash and merge your commits when merging into `develop` to keep the history clean.

---

## 3. Commit Message Standard

We enforce [Conventional Commits](https://www.conventionalcommits.org/). This allows us to auto-generate changelogs and version releases.

**Format:**
```
<type>(<optional scope>): <description>
```

**Allowed Types:**
- `feat`: A new feature
- `fix`: A bug fix
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `style`: Formatting, missing semicolons, etc.
- `test`: Adding or correcting tests
- `chore`: Updating build tasks, package manager configs, etc.

**Examples:**
- `feat(agents): implement logistics agent orchestrator`
- `fix(api): handle missing CSRF token in reoptimize endpoint`
- `refactor(ui): extract Mapbox marker logic into custom hook`

---

## 4. Pull Request Rules

### PR Checklist
- [ ] My code follows the style guidelines of this project.
- [ ] I have performed a self-review of my own code.
- [ ] I have commented my code, particularly in hard-to-understand areas.
- [ ] I have verified the build completes successfully (`npm run build`).
- [ ] Typedefs and Prisma schemas match the updated models.

### Review Guidelines
- Reviewers: Emphasize readability, performance, and security.
- Authors: Respond to comments promptly and push fixes to the same branch.

### CI Requirements
Every PR must automatically pass:
- ESLint (`npm run lint`)
- TypeScript Compilation (`tsc --noEmit`)
- Next.js Build (`npm run build`)

---

## 5. Code Ownership Strategy

To prevent merge conflicts and ensure code quality, specific domains are assigned to domain owners. You must request a review from the respective owner if you touch their modules.

| Domain | Directories | Primary Focus |
|--------|-------------|---------------|
| **AI & Agents** | `src/agents/`, `src/orchestrator/`, `src/tools/`, `src/memory/` | Orchestration, LLM router context, prompt chains. |
| **Backend & API** | `src/api/`, `src/services/` | API routes, external integrations, caching (Upstash). |
| **Data Layer** | `prisma/`, `src/services/` | DB schema migrations, Prisma queries, data integrity. |
| **Frontend UI** | `src/ui/`, `src/app/` | Mapbox rendering, React/Zustand state, Tailwind layouts. |
| **Security & Infra** | `src/security/`, `src/infrastructure/` | CSRF, Rate limits, Vercel deployments, CI/CD, logger. |

*(Please check the internal team roster for currently assigned owners).*

---

## 6. Code Quality Rules

- **TypeScript Requirements**: **No `any` types.** Explicitly type props, return values, and API responses. Utilize Zod schemas for runtime validation of LLM outputs and API inputs.
- **Lint Rules**: Run `npm run lint`. Do not bypass ESLint warnings without a shared consensus and an `eslint-disable-next-line` comment explaining *why*.
- **Testing Expectations**: Write component tests for complex UI (e.g. Mapbox interactions) and unit tests for pure functions (e.g. AI prompt builders).
- **Build Verification**: Your code must pass `npm run build` without Turbopack or Webpack compilation warnings. 

---

## 7. Security Guidelines

- **Secrets Management**: **NEVER commit secrets or `.env` files.** 
- **API Keys**: Use `NEXT_PUBLIC_` exclusively for keys intended for the client (e.g. Mapbox). Server-side keys (Groq, Gemini, Upstash, DB) must *never* be exposed.
- **Environment Variables**: If your PR introduces a new environment variable, you must add a dummy placeholder to `.env.example`.
- **User Data**: AI payloads must strip PII before transmission unless explicitly consented.

---

## 8. Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/organization/voyageai.git
   cd voyageai
   ```
2. **Install dependencies:**
   ```bash
   npm ci
   ```
3. **Set up Environment Variables:**
   ```bash
   cp .env.example .env
   ```
   *Fill out `.env` with your Mapbox, Groq/Gemini, Upstash Redis, and PostgreSQL credentials.*
4. **Initialize Prisma:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```
5. **Start the development server:**
   ```bash
   npm run dev
   ```

---

## 9. Pre-Merge Verification Checklist

Before asking for a review, run the following commands locally to verify your code:

```bash
# 1. Type Safety
npx tsc --noEmit

# 2. Linting
npm run lint

# 3. Prisma Schema Validation
npx prisma validate

# 4. Production Build Verification
npx next build
```

If any of these fail, your PR will fail CI and cannot be merged.

---

## 10. Suggested GitHub Repository Settings

To enforce this workflow, the repository maintainer should apply these settings on GitHub:

- **Branch Protection rules for `main` and `develop`**:
  - Require pull request reviews before merging.
  - Require approvals: **Minimum 1**.
  - Require status checks to pass before merging (Lint, Build, TS Check).
  - Require branches to be up to date before merging.
- **Merge Options**:
  - Allow squash merging (Default for `develop`).
  - Allow merge commits (Default for `main`).
- **Reviewer Assignment**: Setup `CODEOWNERS` mapping the directories defined in Section 5 to specific GitHub teams/users.
