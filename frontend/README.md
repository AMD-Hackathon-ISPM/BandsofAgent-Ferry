# Ferry Frontend

React, TypeScript, Vite, Tailwind CSS, and shadcn/ui frontend for Ferry migration runs.

## Project Map

- `src/routes`: Route-level screens and route composition.
- `src/features/home`: Dashboard components for starting a migration and opening recent runs.
- `src/features/runs`: Run detail components for the live band room, agent roster, pipeline, outputs, and run header.
- `src/features/migrations`: Shared migration-domain UI such as agents, language routes, confidence, and status indicators.
- `src/components/ui`: shadcn/ui primitives and local UI building blocks.
- `src/components`: App shell, brand, and cross-app component providers.
- `src/providers`: React context providers.
- `src/lib`: API boundaries, domain constants, formatting, hooks, types, and mock data.
- `public`: Static assets.

## Scripts

- `npm run dev`: Start the Vite dev server.
- `npm run build`: Type-check and build.
- `npm run lint`: Run ESLint.
- `npm run typecheck`: Run TypeScript without emitting.
