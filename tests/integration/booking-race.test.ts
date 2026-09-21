import { PaymentEventResult } from "@/server/booking/types";
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/server/db";
import {
  createBooking,
  applyPaymentEvent,
  getConfirmedRosters,
} from "@/server/booking/service";
import {
  resetDatabase,
  createTestParent,
  createTestStudent,
  createTestClass,
} from "../helpers/setup";

describe("Concurrency, Race Conditions & Invariant Hardening", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("R1: Exact Assignment Scenario — User A and B both select the last seat, B confirms first, A attempts payment later", async () => {
    const parentA = await createTestParent("parent-a", "parent-a@example.com");
    const parentB = await createTestParent("parent-b", "parent-b@example.com");
    const studentA = await createTestStudent(parentA.id, "student-a");
    const studentB = await createTestStudent(parentB.id, "student-b");

    // Setup: Class with capacity 4, already has 3 confirmed students
    const trialClass = await createTestClass({ capacity: 4, seatsTaken: 3 });

    // Step 1: User A selects the last available slot and moves to payment
    const bookingA = await createBooking({
      trialClassId: trialClass.id,
      studentId: studentA.id,
    });
    expect(bookingA.status).toBe("PENDING_PAYMENT");
    expect(bookingA.version).toBe(0);

    // Step 2: User B selects the same slot (both are in pending payment)
    const bookingB = await createBooking({
      trialClassId: trialClass.id,
      studentId: studentB.id,
    });
    expect(bookingB.status).toBe("PENDING_PAYMENT");
    expect(bookingB.version).toBe(0);

    // At this stage, seats_taken is STILL 3 because neither has paid
    const classMidway = await prisma.trialClass.findUniqueOrThrow({
      where: { id: trialClass.id },
    });
    expect(classMidway.seatsTaken).toBe(3);

    // Step 3: User B completes payment first and confirms the booking
    const resultB = await applyPaymentEvent({
      providerEventId: "evt-user-b-pay",
      bookingId: bookingB.id,
      expectedBookingVersion: 0,
      requestedOutcome: "APPROVE",
    });
    expect(resultB.result).toBe("SUCCEEDED");
    expect(resultB.bookingStatus).toBe("CONFIRMED");

    // Seat count increments to 4 (maximum capacity reached)
    const classAfterB = await prisma.trialClass.findUniqueOrThrow({
      where: { id: trialClass.id },
    });
    expect(classAfterB.seatsTaken).toBe(4);

    // Step 4: User A then tries to complete payment
    const resultA = await applyPaymentEvent({
      providerEventId: "evt-user-a-pay",
      bookingId: bookingA.id,
      expectedBookingVersion: 0,
      requestedOutcome: "APPROVE",
    });

    // Verification: User A's payment is rejected for NO_SEAT without charge
    expect(resultA.result).toBe("NO_SEAT");
    expect(resultA.bookingStatus).toBe("PAYMENT_FAILED");

    // INVARIANT ASSERTIONS:
    // 1. Exactly 4 confirmed seats taken (never 5)
    const classFinal = await prisma.trialClass.findUniqueOrThrow({
      where: { id: trialClass.id },
    });
    expect(classFinal.seatsTaken).toBe(4);

    // 2. Confirmed roster includes User B (Noah), and DOES NOT include User A (Emma)
    const roster = await getConfirmedRosters(trialClass.id);
    const confirmedIds = roster[0].confirmedStudents.map((s) => s.studentId);
    expect(confirmedIds).toContain(studentB.id);
    expect(confirmedIds).not.toContain(studentA.id);

    // 3. Database counts strictly align
    const totalConfirmedBookings = await prisma.booking.count({
      where: { trialClassId: trialClass.id, status: "CONFIRMED" },
    });
    expect(totalConfirmedBookings).toBe(1); // 1 from this test + 3 simulated initial
  });

  it("R2: True Concurrent Race — Two simultaneous approval requests for the last available slot", async () => {
    const parentA = await createTestParent("parent-a2", "a2@example.com");
    const parentB = await createTestParent("parent-b2", "b2@example.com");
    const studentA = await createTestStudent(parentA.id, "student-a2");
    const studentB = await createTestStudent(parentB.id, "student-b2");

    const trialClass = await createTestClass({ capacity: 4, seatsTaken: 3 });

    const bookingA = await createBooking({
      trialClassId: trialClass.id,
      studentId: studentA.id,
    });
    const bookingB = await createBooking({
      trialClassId: trialClass.id,
      studentId: studentB.id,
    });

    // Fire both payment approvals simultaneously via Promise.allSettled
    const [resA, resB] = await Promise.allSettled([
      applyPaymentEvent({
        providerEventId: "race-evt-a",
        bookingId: bookingA.id,
        expectedBookingVersion: 0,
        requestedOutcome: "APPROVE",
      }),
      applyPaymentEvent({
        providerEventId: "race-evt-b",
        bookingId: bookingB.id,
        expectedBookingVersion: 0,
        requestedOutcome: "APPROVE",
      }),
    ]);

    expect(resA.status).toBe("fulfilled");
    expect(resB.status).toBe("fulfilled");

    const outcomes = [
      (resA as PromiseFulfilledResult<PaymentEventResult>).value.result,
      (resB as PromiseFulfilledResult<PaymentEventResult>).value.result,
    ];

    // Exactly one SUCCEEDED, exactly one NO_SEAT
    expect(outcomes.sort()).toEqual(["NO_SEAT", "SUCCEEDED"]);

    // seats_taken must equal capacity (4), never 5
    const classFinal = await prisma.trialClass.findUniqueOrThrow({
      where: { id: trialClass.id },
    });
    expect(classFinal.seatsTaken).toBe(4);
  });

  it("R3: Same-Booking Concurrent Confirmations — Prevents double-counting a seat if user clicks pay twice", async () => {
    const parent = await createTestParent();
    const student = await createTestStudent(parent.id);
    const trialClass = await createTestClass({ capacity: 4, seatsTaken: 0 });

    const booking = await createBooking({
      trialClassId: trialClass.id,
      studentId: student.id,
    });

    // Two distinct events trying to confirm the same booking at version 0
    const [res1, res2] = await Promise.allSettled([
      applyPaymentEvent({
        providerEventId: "double-click-1",
        bookingId: booking.id,
        expectedBookingVersion: 0,
        requestedOutcome: "APPROVE",
      }),
      applyPaymentEvent({
        providerEventId: "double-click-2",
        bookingId: booking.id,
        expectedBookingVersion: 0,
        requestedOutcome: "APPROVE",
      }),
    ]);

    const successful = [res1, res2].filter((r) => r.status === "fulfilled");
    const failed = [res1, res2].filter((r) => r.status === "rejected");

    // Exactly one request claims the version and succeeds; the other is rejected as stale version
    expect(successful).toHaveLength(1);
    expect(failed).toHaveLength(1);

    // CRITICAL: Seat count must be 1, NOT 2
    const classFinal = await prisma.trialClass.findUniqueOrThrow({
      where: { id: trialClass.id },
    });
    expect(classFinal.seatsTaken).toBe(1);

    // Only 1 PaymentAttempt record was committed (the winning transaction)
    const attempts = await prisma.paymentAttempt.findMany({
      where: { bookingId: booking.id },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].result).toBe("SUCCEEDED");
  });

  it("R4: Burst Overbooking Prevention — 5 simultaneous confirmations for a class with capacity 4", async () => {
    const parent = await createTestParent();
    const trialClass = await createTestClass({ capacity: 4, seatsTaken: 0 });

    // Create 5 distinct students and pending bookings
    const bookings = [];
    for (let i = 1; i <= 5; i++) {
      const student = await createTestStudent(parent.id, `burst-student-${i}`);
      const booking = await createBooking({
        trialClassId: trialClass.id,
        studentId: student.id,
      });
      bookings.push(booking);
    }

    // Attempt concurrent confirmation for all 5
    const results = await Promise.allSettled(
      bookings.map((b, idx) =>
        applyPaymentEvent({
          providerEventId: `burst-evt-${idx + 1}`,
          bookingId: b.id,
          expectedBookingVersion: 0,
          requestedOutcome: "APPROVE",
        })
      )
    );

    const outcomes = results
      .filter((r): r is PromiseFulfilledResult<PaymentEventResult> => r.status === "fulfilled")
      .map((r) => r.value.result);

    const succeededCount = outcomes.filter((o) => o === "SUCCEEDED").length;
    const noSeatCount = outcomes.filter((o) => o === "NO_SEAT").length;

    // Invariant: Exactly 4 confirmed, exactly 1 denied seat
    expect(succeededCount).toBe(4);
    expect(noSeatCount).toBe(1);

    // Database seat counter strictly equals 4
    const classFinal = await prisma.trialClass.findUniqueOrThrow({
      where: { id: trialClass.id },
    });
    expect(classFinal.seatsTaken).toBe(4);
  });

  it("R5: System-wide Invariant Audit — seats_taken strictly equals count of CONFIRMED bookings", async () => {
    const parent = await createTestParent();
    const trialClass = await createTestClass({ capacity: 4, seatsTaken: 0 });

    // Mix of actions on class:
    // 2 Confirmed, 1 Declined, 1 No-Seat
    const s1 = await createTestStudent(parent.id);
    const s2 = await createTestStudent(parent.id);
    const s3 = await createTestStudent(parent.id);

    const b1 = await createBooking({ trialClassId: trialClass.id, studentId: s1.id });
    const b2 = await createBooking({ trialClassId: trialClass.id, studentId: s2.id });
    const b3 = await createBooking({ trialClassId: trialClass.id, studentId: s3.id });

    // b1: Approve
    await applyPaymentEvent({
      providerEventId: "audit-1",
      bookingId: b1.id,
      expectedBookingVersion: 0,
      requestedOutcome: "APPROVE",
    });

    // b2: Decline
    await applyPaymentEvent({
      providerEventId: "audit-2",
      bookingId: b2.id,
      expectedBookingVersion: 0,
      requestedOutcome: "DECLINE",
    });

    // b3: Approve
    await applyPaymentEvent({
      providerEventId: "audit-3",
      bookingId: b3.id,
      expectedBookingVersion: 0,
      requestedOutcome: "APPROVE",
    });

    const finalClass = await prisma.trialClass.findUniqueOrThrow({
      where: { id: trialClass.id },
    });
    const confirmedCount = await prisma.booking.count({
      where: { trialClassId: trialClass.id, status: "CONFIRMED" },
    });

    // HARD INVARIANT CHECK
    expect(finalClass.seatsTaken).toBe(confirmedCount);
    expect(finalClass.seatsTaken).toBe(2);
  });
});
