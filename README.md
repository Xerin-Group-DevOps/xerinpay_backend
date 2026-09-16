# XerinPay Backend

Node.js + Express + PostgreSQL (via Prisma) REST API. See the root-level docs for the full picture:

- [../README.md](../README.md) — quick start
- [../ARCHITECTURE.md](../ARCHITECTURE.md)
- [../DATABASE.md](../DATABASE.md)
- [../API.md](../API.md)
- [../SECURITY.md](../SECURITY.md)
- [../TESTING.md](../TESTING.md)

## Scripts

```bash
npm run dev              # start with --watch
npm start                # start
npm run prisma:generate
npm run prisma:migrate   # dev migrations
npm run prisma:deploy    # production migrations
npm run seed              # seed RBAC, email templates, providers, default fee rule
npm test                  # vitest
npm run lint
```
