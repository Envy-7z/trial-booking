# Trial Booking System

A production-grade, concurrency-safe slice of a trial class booking system built for live online education platforms.

Trial classes are strictly capped at **4 confirmed students per class**. This project demonstrates database-level invariants, optimistic concurrency control, race-condition safety, and deterministic webhook idempotency under concurrent load.

---

## Quickstart & How to Run

### Prerequisites
- Node.js 20.9+ (tested on Node.js v22)
- Docker & Docker Compose (for local PostgreSQL 17)

### 1. Clone & Start Database
```bash
git clone https://github.com/Envy-7z/trial-booking.git
cd trial-booking

# Start PostgreSQL 17 in the background
docker compose up -d
```

### 2. Install Dependencies & Setup Database
```bash
npm install

# Copy environment config (defaults to local docker postgres)
cp .env.example .env

# Run Prisma 7 migration and seed deterministic test dataset
npm run db:setup
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. The app redirects to `/classes`.

---

## Running Automated Tests

The test suite runs against the real PostgreSQL container using Vitest to guarantee database-level concurrency behavior:

```bash
# Run all 15 integration and invariant tests
npm test

# Run specifically the concurrency, race condition, and burst tests
npm run test:race
```

### Reset Demo Data
```bash
npm run db:reset
```

---

## What Was Built

A focused, robust slice of trial booking:

1. **Parent & Student Browsing (`/classes`)**:
   - Context selector to switch between simulated parents and children.
   - Live class schedule with real-time capacity badges (`X / 4 seats`, `1 Seat Remaining`, or `Full`).
2. **Trial Booking & Mock Payment Flow (`/classes/[classId]`)**:
   - Creates a pending booking draft without prematurely consuming capacity.
   - Interactive payment controls: `Complete Payment (Approve)` or `Simulate Card Decline`.
   - Specific, honest error states (e.g. if the last seat is taken while paying, the user is notified: *"This class filled up before payment completed. You were not charged."*).
   - Retry capabilities on payment failure without creating duplicate records.
3. **Teacher / Admin Confirmed Roster (`/admin/roster`)**:
   - Official confirmed attendance list per class.
   - Strictly excludes pending drafts or failed payment attempts.
4. **Deterministic Webhook Route (`POST /api/payment-events`)**:
   - Accepts external payment callbacks with idempotency guarantees.

---

## Data Model & Schema

The schema is built with **Prisma ORM 7** targeting **PostgreSQL 17**:

```prisma
enum BookingStatus {
  PENDING_PAYMENT
  PROCESSING_PAYMENT
  PAYMENT_FAILED
  CONFIRMED
}

enum RequestedPaymentOutcome {
  APPROVE
  DECLINE
}

enum PaymentResult {
  PROCESSING
  SUCCEEDED
  DECLINED
  NO_SEAT
}
```

### Entities & Physical Table Mappings

- **`parents`**: `id`, `name`, `email` (unique).
- **`students`**: `id`, `name`, `age`, `parent_id` (foreign key to `parents`).
- **`trial_classes`**: `id`, `subject`, `teacher`, `starts_at`, `capacity` (default: 4), `seats_taken` (counter).
- **`bookings`**:
  - `id`: CUID.
  - `trial_class_id`, `student_id`.
  - `status`: `BookingStatus` (`PENDING_PAYMENT` | `PROCESSING_PAYMENT` | `PAYMENT_FAILED` | `CONFIRMED`).
  - `version`: Integer for optimistic concurrency control (incremented on each state change).
  - **Constraint**: `@@unique([trialClassId, studentId], map: "bookings_class_student_key")`.
- **`payment_attempts`**:
  - `id`: CUID.
  - `booking_id`: Foreign key.
  - `provider_event_id`: String (unique) for webhook and attempt deduplication.
  - `expected_booking_version`: Version claimed during this attempt.
  - `requested_outcome`: `APPROVE` | `DECLINE`.
  - `result`: `PROCESSING` | `SUCCEEDED` | `DECLINED` | `NO_SEAT`.
  - `processed_at`: Timestamp.

### PostgreSQL Hard CHECK Constraints

In addition to Prisma-level validations, the migration applies native PostgreSQL CHECK constraints:
```sql
ALTER TABLE "trial_classes"
ADD CONSTRAINT "trial_classes_capacity_check"
CHECK ("capacity" > 0 AND "capacity" <= 4);

ALTER TABLE "trial_classes"
ADD CONSTRAINT "trial_classes_seats_check"
CHECK ("seats_taken" >= 0 AND "seats_taken" <= "capacity");
```

---

## Booking State Machine & Seat Accounting

```text
                    ┌── payment success + seat available ──→ CONFIRMED (final, seat +1)
                    │
PENDING_PAYMENT ────┤── payment decline ───────────────────→ PAYMENT_FAILED (seat unchanged)
                    │
                    └── payment success + no seat ─────────→ PAYMENT_FAILED (seat unchanged, NO_SEAT)
                                                                   │
                                                                   ├── retry success + seat available → CONFIRMED
                                                                   └── retry decline / no seat ──────→ PAYMENT_FAILED
```

### Core Seat Invariant
```text
trial_classes.seats_taken == COUNT(bookings WHERE trial_class_id = class.id AND status = 'CONFIRMED')
```

- **When is a seat reserved?** Strictly at the moment of **payment approval**, inside the database transaction. Draft bookings (`PENDING_PAYMENT`) do **not** hold seats indefinitely.
- **Which statuses consume a seat?** Only `CONFIRMED`.
- **Which statuses appear on the roster?** Only `CONFIRMED`.
- **Can confirmed bookings be cancelled?** In this MVP slice, confirmed bookings are final to prevent complex seat release cascades without administrative refunds.

---

## Last-Seat Race Condition: The Required Scenario

The assignment mandates handling this exact sequence:

1. **User A** selects the last available slot (3 of 4 seats currently filled) and moves to payment.
2. **User B** selects the same slot.
3. **User B** completes payment first and confirms the booking.
4. **User A** then tries to complete payment.

### Our Solution: Atomic Conditional Update
Inside `applyPaymentEvent`, when payment outcome is `APPROVE`:

```sql
UPDATE "trial_classes"
SET "seats_taken" = "seats_taken" + 1
WHERE "id" = $trial_class_id
  AND "seats_taken" < "capacity";
```

### Trace of the Scenario:
1. **User A** creates `Booking A` (`PENDING_PAYMENT`, `version: 0`). `seats_taken` remains `3`.
2. **User B** creates `Booking B` (`PENDING_PAYMENT`, `version: 0`). Both users are in checkout simultaneously.
3. **User B** submits payment with `APPROVE`. The atomic SQL executes:
   - `seats_taken < 4` is **TRUE** (3 < 4).
   - Rows affected: `1`.
   - `Booking B` transitions to `CONFIRMED` (`version: 1`).
   - `PaymentAttempt B` is marked `SUCCEEDED`.
   - Class `seats_taken` is now `4`.
4. **User A** submits payment with `APPROVE`:
   - The atomic SQL executes: `WHERE "id" = $id AND "seats_taken" < "capacity"`.
   - `seats_taken < 4` is **FALSE** (4 < 4 is false).
   - Rows affected: `0`.
   - The transaction detects zero rows updated, immediately branches to the `NO_SEAT` path:
     - `Booking A` transitions to `PAYMENT_FAILED` (`version: 1`).
     - `PaymentAttempt A` is recorded as `NO_SEAT`.
     - **User A is NOT charged.**
     - The UI presents: *"This class filled up before payment completed. You were not charged."*

### Result:
- Class seats taken: exactly `4` (never 5).
- Confirmed roster: contains User B, excludes User A.
- Automated proof: verified in `tests/integration/booking-race.test.ts` (Test `R1`).

---

## Duplicate Prevention & Retries

- **Duplicate Prevention**: Backed by PostgreSQL unique constraint `UNIQUE (trial_class_id, student_id)`. If a parent attempts to create a second booking for the same child in the same class, Prisma catches error code `P2002` and rejects the request with a descriptive error.
- **Payment Retries**: If payment fails (`DECLINED` or `NO_SEAT`), the child already has a booking row in `PAYMENT_FAILED`. Instead of violating the unique constraint by creating a new booking, the system allows retrying payment **on the existing booking**. The retry claims the new version (`version: 1`) and creates a second `PaymentAttempt` audit record.

---

## Webhook Idempotency

External payment notifications can arrive multiple times over network retries.

- Every `PaymentAttempt` requires a unique `provider_event_id`.
- When an event arrives:
  1. If `provider_event_id` is already persisted:
     - If the payload matches the stored attempt: returns HTTP 200 with `{ replayed: true, result: stored.result }` with zero duplicate mutations.
     - If the payload differs: rejects with HTTP 409 `IDEMPOTENCY_CONFLICT`.
  2. If concurrent duplicate events hit the endpoint simultaneously: the unique database index serializes the write; the second request catches `P2002` and safely returns the committed result of the first.

---

## Where Checks Belong

| Check | System Layer | Implementation |
|---|---|---|
| Input sanitization & enum validation | Route Handler / Server Action | Zod schemas (`createBookingSchema`, `paymentEventSchema`) |
| Student / class existence | Service layer | Prisma `findUnique` |
| Soft availability check (informational) | Service layer | `seatsTaken < capacity` check in `createBooking` |
| Duplicate child booking | Database layer | `UNIQUE (trial_class_id, student_id)` constraint |
| Same-booking race condition | Service + DB layer | Optimistic version claim (`UPDATE bookings WHERE version = $v`) |
| Last-seat race condition | Database layer | Atomic update (`UPDATE trial_classes WHERE seats_taken < capacity`) |
| Capacity bounds & non-negativity | Database layer | Native PostgreSQL `CHECK` constraints |
| Event deduplication | Database layer | `UNIQUE (provider_event_id)` index |
| Roster attendance filter | Query layer | `WHERE status = 'CONFIRMED'` |

---

## Seed Data & Edge Cases

The seed script (`prisma/seed.ts`) generates verifiable test cases:

| Class / Scenario | Seed State | Purpose |
|---|---|---|
| `class-open` | 0 confirmed students | Verifies standard available booking flow |
| `class-almost-full` | Exactly 3 confirmed students | Directly tests the last-seat race condition |
| `class-full` | Exactly 4 confirmed students | Tests immediate rejection at maximum capacity |
| `booking-failed-demo` | 1 booking in `PAYMENT_FAILED` | Demonstrates payment decline and retry flow |
| Roster reconciliation | Verified in seed script | Asserts `seats_taken == COUNT(CONFIRMED)` on every seed run |

---

## Integration Test Matrix

All 15 tests pass against the real PostgreSQL container (`npx vitest run`):

1. **`tests/integration/booking.test.ts`**:
   - `B1`: Creates draft booking in `PENDING_PAYMENT` without consuming seat.
   - `B2`: Rejects booking creation if class is already full.
   - `B3`: Prevents duplicate bookings for same child and class via unique index.
   - `B4`: Rejects booking if student or class ID does not exist.
2. **`tests/integration/payment.test.ts`**:
   - `P1`: Approved payment confirms booking, increments seat, adds to roster.
   - `P2`: Declined payment marks `PAYMENT_FAILED`, keeps seats at 0, leaves roster empty.
   - `P3`: Retrying payment on a `PAYMENT_FAILED` booking claims new version and succeeds.
   - `P4`: Approved payment when class is full records `NO_SEAT` without charging.
   - `I1`: Exact duplicate webhook delivery returns cached result idempotently.
   - `I2`: Reusing an event ID with conflicting payload throws `IdempotencyConflictError`.
3. **`tests/integration/booking-race.test.ts`**:
   - `R1`: **Exact Assignment Scenario**: User A & B both select the last seat, B confirms first, A attempts payment later. Only B confirmed, A gets `NO_SEAT`.
   - `R2`: **True Concurrent Race**: Two simultaneous payment approvals for the last slot fired via `Promise.allSettled`. Exactly one `SUCCEEDED`, exactly one `NO_SEAT`.
   - `R3`: **Same-Booking Concurrent Confirmation**: User double-clicks pay; only one payment attempt claims the version, preventing double seat allocation.
   - `R4`: **Burst Overbooking**: 5 concurrent approvals for a class with capacity 4; exactly 4 succeed, 1 gets `NO_SEAT`.
   - `R5`: **System Invariant Audit**: Verifies `seats_taken == COUNT(CONFIRMED)` across all mixed states.

---

## Architecture Tradeoffs & Production Considerations

1. **Seat Reservation Timing**:
   - *Choice*: Reserve seat at payment confirmation rather than booking creation.
   - *Reason*: Matches real-world checkout where multiple parents explore slots simultaneously. Prevents abandoned carts from locking seats indefinitely without complex cron timers.
   - *Production Tradeoff*: If two parents reach payment at the exact same second for the last seat, the second parent experiences a checkout failure (`NO_SEAT`). In production, this can be paired with an optional 10-minute hold reservation using Redis or PostgreSQL timestamps.
2. **Mock Payment Isolation**:
   - *Choice*: Single PostgreSQL transaction handles both seat acquisition and payment recording.
   - *Reason*: Eliminates distributed transaction complexity for this mock evaluation while maintaining 100% database consistency.
   - *Production Tradeoff*: A real payment gateway (like Stripe) cannot participate in a local DB transaction. In production, we would use a two-phase flow: authorize payment with Stripe, reserve seat in DB, then capture charge; or refund charge asynchronously if seat acquisition fails.

---

## Deliberate Scope Cuts

To strictly respect the 3–4 hour timebox and prioritize correctness over breadth:
- **Authentication**: Omitted. A dropdown switcher simulates authenticated parent context.
- **Regular Enrollment**: Out of scope per prompt (trial booking only).
- **Stripe Live API**: Replaced with clean deterministic mock provider and webhook route.
- **Background Cron for Hold Expiry**: Omitted by designing seats to reserve only on payment.
- **Confirmed Booking Cancellation**: Excluded to avoid premature refund domain logic.

---

## What I Would Monitor After Release

1. **`NO_SEAT` Rate Spike Alert**: Tracks how often users experience lost last-seat races. A high rate indicates demand outstripping schedule supply.
2. **Payment Invariant Drift Metric**: Periodic query verifying `trial_classes.seats_taken == count(CONFIRMED)`. Any non-zero drift triggers immediate Sev-1 alert.
3. **P95 Latency on `applyPaymentEvent`**: Monitors write contention on `trial_classes` row locks during enrollment bursts.
4. **Idempotency Replay Frequency**: High rate of duplicate webhooks indicates upstream gateway network retries.

---

## What I Would Do Next With More Time

1. **Temporary Seat Hold TTL**: Implement a 10-minute soft reservation during checkout backed by a background worker to expire abandoned checkouts.
2. **Live Stripe Elements Integration**: Implement Stripe SetupIntent / PaymentIntent with cryptographic webhook signature verification (`stripe-signature`).
3. **Realtime Seat Availability**: Connect Supabase Realtime or Server-Sent Events (SSE) so the UI refreshes class cards instantly when another user books the last seat.
4. **Parent Auth via Passkeys / Magic Links**: Implement passwordless parent authentication using Auth.js (NextAuth).

---

## Time Spent Breakdown

- **Architecture, Schema & Invariant Design**: 45 mins
- **Core Domain Service & Concurrency Logic**: 60 mins
- **Automated Integration & Race Condition Test Suite**: 45 mins
- **Clean Anti-Slop UI & Server Actions**: 40 mins
- **Documentation (`README.md`, `AI_USAGE.md`, walkthrough script)**: 30 mins
- **Total Time**: ~3 hours 40 minutes (within 4-hour timebox).
