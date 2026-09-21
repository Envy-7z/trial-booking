# AI Usage & Engineering Decisions

This document details how AI assistance was leveraged, questioned, steered, and verified during the development of the Trial Booking Take-Home application.

---

## 1. Which AI Tools I Used
- **Katalyst IDE (OMP harness)**: A customized coding environment with multi-model AI assistance. Used Gemini 3.8 Flash for rapid code execution and scaffolding, and Claude Opus 4 / GPT-5.6 Sol for architecture planning, code review, and concurrency design decisions.
- **Deep Research / Context Search**: Used during the initial phase to query current documentation regarding Next.js 16 App Router patterns and Prisma 7 PostgreSQL driver adapter conventions.

---

## 2. What I Used AI For
- **Stress-testing concurrency models**: Analyzing trade-offs between pessimistic locking (`SELECT ... FOR UPDATE`), distributed Redis locks, and database-native atomic conditional updates (`UPDATE ... WHERE seats_taken < capacity`).
- **Drafting boilerplate**: Scaffolding initial Zod validation schemas, Prisma models, and repetitive test case setups.
- **Formulating integration test assertions**: Constructing `Promise.allSettled` concurrent test templates to simulate competing HTTP and database transactions.

---

## 3. One Place Where AI Helped Me Move Faster
AI significantly accelerated **writing the integration test matrix**. 

Constructing 15 distinct test cases covering:
- Happy paths
- Overbooking burst scenarios (5 simultaneous requests for 4 slots)
- Double-click concurrent confirmations on the same booking
- Webhook duplicate replays vs payload conflicts

Having AI rapidly draft the boilerplate for `Promise.allSettled` and seed assertions saved approximately 30–45 minutes of manual fixture typing, allowing me to focus on verifying the exact transaction boundaries and SQL predicates.

---

## 4. One Place Where I Disagreed With, Corrected, or Rejected AI Output
I made three critical corrections to AI-suggested designs:

### A. Rejected Seat Reservation at Booking Creation Time
- **AI Proposal**: The AI initially proposed incrementing `seats_taken` when the parent clicked "Book Trial" (creating the `PENDING_PAYMENT` record).
- **Why I Corrected It**: When analyzing the assignment's explicit technical scenario (*"User A selects the last slot and moves to payment; User B selects the same slot; User B pays first and confirms; User A then tries to pay"*), I realized that reserving the seat at booking creation would immediately lock out User B from ever reaching the payment screen. That violates the prompt's scenario. I redirected the model to keep `PENDING_PAYMENT` as a non-allocating draft, moving the atomic seat reservation strictly to the **payment confirmation transaction**.

### B. Rejected "Successful Charge With No Seat" Inconsistency
- **AI Proposal**: When a race condition was lost during payment, the initial code marked `PaymentAttempt = SUCCEEDED` while setting `Booking = PAYMENT_FAILED`.
- **Why I Corrected It**: In a real payment system, marking a payment as "succeeded" when no seat exists implies taking a parent's money without giving them a class. I introduced the explicit `NO_SEAT` payment result and ensured the customer is never charged if the atomic seat allocation returns zero rows.

### C. Corrected Prisma 7 Driver Adapter & Raw SQL Mappings
- **AI Proposal**: The AI assumed Prisma 5/6 syntax (`provider = "prisma-client-js"` with automatic connection pooling in the datasource block and unquoted snake_case table names).
- **Why I Corrected It**: Official Prisma 7 documentation requires using the `@prisma/adapter-pg` driver adapter with a client generated to a custom path (`provider = "prisma-client"`) and connection URLs defined in `prisma7.config.ts`. I also added explicit `@@map` and `@map` directives to the schema so the raw SQL update queries match PostgreSQL physical table and column names exactly.

---

## 5. What I Would Change About My AI Workflow If I Did This Again
If I had to do this again, I would **ground the AI on official documentation for version-sensitive tooling earlier in the session**. 

Because Prisma 7 moved database connection handling to JavaScript-side driver adapters and relocated configuration out of `schema.prisma`, general LLM training data initially suggested deprecated patterns. Checking the official Prisma v7 docs first saved debugging time and prevented configuration drift.

---

## 6. How I Verified the Final Implementation
Every critical behavior claimed in the implementation was empirically verified:

1. **Automated Vitest Concurrency Suite**:
   ```bash
   npx vitest run
   ```
   - **Result**: `15 passed (15)` across 3 test files.
   - Proved that in simultaneous attempts on the last seat, exactly 1 booking confirms and exactly 1 is rejected with `NO_SEAT`.
   - Proved that simultaneous payment attempts on the same booking version are serialized, with only 1 succeeding and 0 duplicate seat increments.
2. **PostgreSQL Container Health & Native Invariants**:
   - Inspected PostgreSQL container logs and verified that CHECK constraints prevent `seats_taken` from ever becoming negative or exceeding 4.
3. **End-to-End Next.js Build**:
   ```bash
   npm run build
   ```
   - Verified that Turbopack compiles all server actions, route handlers, and client components with zero TypeScript or ESLint errors.
4. **Interactive Smoke Test**:
   - Verified full lifecycle via HTTP: `/classes` loads seed data, pending booking creates version 0, payment approval confirms and updates live roster on `/admin/roster`, and duplicate webhook events return `{ replayed: true }`.
