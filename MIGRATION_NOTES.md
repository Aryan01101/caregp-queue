# Migration Notes: v1 to v2

## Deployment Platform Change

**IMPORTANT**: Hermes v2 uses **Google Cloud Run** instead of Vercel.

### Action Required

If you have an existing Vercel deployment:

1. **Go to Vercel Dashboard** → Your Hermes project → Settings
2. **Either:**
   - Delete the project completely, OR
   - Disable automatic deployments (Git → Disconnect)

### Why the Change?

- v1: Next.js/TypeScript → Vercel (Edge Functions)
- v2: Python/FastAPI → GCP Cloud Run (stateless containers)

The v2 architecture requires:
- Long-running LangGraph state machines
- Postgres checkpoint storage
- Webhook processing
- Docker containerization

All of these are better suited to Cloud Run than Vercel's edge runtime.

### New Deployment Process

See `DEPLOYMENT.md` for complete GCP Cloud Run deployment instructions.

## Technology Stack Changes

| Component | v1 | v2 |
|-----------|----|----|
| Language | TypeScript | Python |
| Framework | Next.js | FastAPI |
| Database | Prisma + Postgres | Supabase Postgres |
| Deployment | Vercel | GCP Cloud Run |
| AI Orchestration | Manual | LangGraph |
| State Management | Client-side | Server-side (Postgres) |

## Code Reusability

**0% code reuse** - Complete rebuild was necessary due to:
- Different programming languages
- Different architectural patterns
- Different deployment targets
- Different use case (healthcare → email triage)

All v1 code has been preserved in:
- Branch: `archive/v1-hermes`
- Tag: `v1.0-archived`
