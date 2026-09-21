import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/server/db";
import {
  createBooking,
  applyPaymentEvent,
  getConfirmedRosters,
} from "@/server/booking/service";
import { IdempotencyConflictError } from "@/server/booking/errors";
import {
  resetDatabase,
  createTestParent,
  createTestStudent,
  createTestClass,
} from "../helpers/setup";

describe("Payment Domain Service - Invariants & Idempotency", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("P1: approves payment, increments seats_taken atomically, and adds student to confirmed roster", async () => {
    const parent = await createTestParent();
    const student = await createTestStudent(parent.id);
    const trialClass = await createTestClass({ capacity: 4, seatsTaken: 0 });

    const booking = await createBooking({
      trialClassId: trialClass.id,
      studentId: student.id,
    });

    const paymentResult = await applyPaymentEvent({
      providerEventId: "evt-approve-1",
      bookingId: booking.id,
      expectedBookingVersion: 0,
      requestedOutcome: "APPROVE",
    });

    expect(paymentResult.replayed).toBe(false);
    expect(paymentResult.result).toBe("SUCCEEDED");
    expect(paymentResult.bookingStatus).toBe("CONFIRMED");
    expect(paymentResult.bookingVersion).toBe(1);

    // Invariant check: seatsTaken must be 1
    const classAfter = await prisma.trialClass.findUniqueOrThrow({
      where: { id: trialClass.id },
    });
    expect(classAfter.seatsTaken).toBe(1);

    // Invariant check: confirmed roster must include student
    const roster = await getConfirmedRosters(trialClass.id);
    expect(roster[0].confirmedStudents).toHaveLength(1);
    expect(roster[0].confirmedStudents[0].studentId).toBe(student.id);

    // PaymentAttempt check
    const attempt = await prisma.paymentAttempt.findUniqueOrThrow({
      where: { providerEventId: "evt-approve-1" },
    });
    expect(attempt.result).toBe("SUCCEEDED");
  });

  it("P2: records declined payment without incrementing seat count and keeps student off roster", async () => {
    const parent = await createTestParent();
    const student = await createTestStudent(parent.id);
    const trialClass = await createTestClass({ capacity: 4, seatsTaken: 0 });

    const booking = await createBooking({
      trialClassId: trialClass.id,
      studentId: student.id,
    });

    const paymentResult = await applyPaymentEvent({
      providerEventId: "evt-decline-1",
      bookingId: booking.id,
      expectedBookingVersion: 0,
      requestedOutcome: "DECLINE",
    });

    expect(paymentResult.replayed).toBe(false);
    expect(paymentResult.result).toBe("DECLINED");
    expect(paymentResult.bookingStatus).toBe("PAYMENT_FAILED");
    expect(paymentResult.bookingVersion).toBe(1);

    // Invariant check: seatsTaken must remain 0
    const classAfter = await prisma.trialClass.findUniqueOrThrow({
      where: { id: trialClass.id },
    });
    expect(classAfter.seatsTaken).toBe(0);

    // Confirmed roster must be empty
    const roster = await getConfirmedRosters(trialClass.id);
    expect(roster[0].confirmedStudents).toHaveLength(0);
  });

  it("P3: allows retrying payment on a PAYMENT_FAILED booking using updated version", async () => {
    const parent = await createTestParent();
    const student = await createTestStudent(parent.id);
    const trialClass = await createTestClass({ capacity: 4, seatsTaken: 0 });

    const booking = await createBooking({
      trialClassId: trialClass.id,
      studentId: student.id,
    });

    // 1. Initial attempt declines (v0 -> v1)
    await applyPaymentEvent({
      providerEventId: "evt-attempt-fail",
      bookingId: booking.id,
      expectedBookingVersion: 0,
      requestedOutcome: "DECLINE",
    });

    // 2. Retry with expectedBookingVersion: 1 succeeds (v1 -> v2)
    const retryResult = await applyPaymentEvent({
      providerEventId: "evt-attempt-retry-success",
      bookingId: booking.id,
      expectedBookingVersion: 1,
      requestedOutcome: "APPROVE",
    });

    expect(retryResult.result).toBe("SUCCEEDED");
    expect(retryResult.bookingStatus).toBe("CONFIRMED");
    expect(retryResult.bookingVersion).toBe(2);

    // Invariant check: exactly 1 seat taken, 2 payment attempt records preserved
    const classAfter = await prisma.trialClass.findUniqueOrThrow({
      where: { id: trialClass.id },
    });
    expect(classAfter.seatsTaken).toBe(1);

    const attempts = await prisma.paymentAttempt.findMany({
      where: { bookingId: booking.id },
      orderBy: { createdAt: "asc" },
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[0].result).toBe("DECLINED");
    expect(attempts[1].result).toBe("SUCCEEDED");
  });

  it("P4: handles payment approval when no seats remain by marking NO_SEAT and not charging", async () => {
    const parent = await createTestParent();
    const student = await createTestStudent(parent.id);
    // Class is created with 3 seats taken
    const trialClass = await createTestClass({ capacity: 4, seatsTaken: 3 });

    // Pre-seed a confirmed student booking that takes the 4th slot in the background
    const fillerStudent = await createTestStudent(parent.id);
    await prisma.trialClass.update({
      where: { id: trialClass.id },
      data: { seatsTaken: 4 },
    });
    await prisma.booking.create({
      data: {
        trialClassId: trialClass.id,
        studentId: fillerStudent.id,
        status: "CONFIRMED",
        version: 1,
      },
    });

    // Student created a booking before the class became full
    const booking = await prisma.booking.create({
      data: {
        trialClassId: trialClass.id,
        studentId: student.id,
        status: "PENDING_PAYMENT",
        version: 0,
      },
    });

    // Student now attempts payment approval, but capacity is reached!
    const result = await applyPaymentEvent({
      providerEventId: "evt-no-seat-test",
      bookingId: booking.id,
      expectedBookingVersion: 0,
      requestedOutcome: "APPROVE",
    });

    expect(result.result).toBe("NO_SEAT");
    expect(result.bookingStatus).toBe("PAYMENT_FAILED");

    // Invariant: seats_taken MUST NOT exceed 4
    const classAfter = await prisma.trialClass.findUniqueOrThrow({
      where: { id: trialClass.id },
    });
    expect(classAfter.seatsTaken).toBe(4);

    // Invariant: roster must have exactly 1 student (the filler student), NOT the rejected student
    const roster = await getConfirmedRosters(trialClass.id);
    expect(roster[0].confirmedStudents).toHaveLength(1);
    expect(roster[0].confirmedStudents[0].studentId).toBe(fillerStudent.id);
  });

  it("I1: exact duplicate webhook delivery returns cached result idempotently with zero side effects", async () => {
    const parent = await createTestParent();
    const student = await createTestStudent(parent.id);
    const trialClass = await createTestClass({ capacity: 4, seatsTaken: 0 });

    const booking = await createBooking({
      trialClassId: trialClass.id,
      studentId: student.id,
    });

    // First delivery
    const res1 = await applyPaymentEvent({
      providerEventId: "webhook-evt-100",
      bookingId: booking.id,
      expectedBookingVersion: 0,
      requestedOutcome: "APPROVE",
    });
    expect(res1.replayed).toBe(false);
    expect(res1.result).toBe("SUCCEEDED");

    // Second identical delivery (webhook retry)
    const res2 = await applyPaymentEvent({
      providerEventId: "webhook-evt-100",
      bookingId: booking.id,
      expectedBookingVersion: 0,
      requestedOutcome: "APPROVE",
    });
    expect(res2.replayed).toBe(true);
    expect(res2.result).toBe("SUCCEEDED");
    expect(res2.bookingStatus).toBe("CONFIRMED");

    // Seat count must still be 1, NOT 2
    const classAfter = await prisma.trialClass.findUniqueOrThrow({
      where: { id: trialClass.id },
    });
    expect(classAfter.seatsTaken).toBe(1);

    // Only 1 PaymentAttempt record exists
    const attempts = await prisma.paymentAttempt.findMany({
      where: { providerEventId: "webhook-evt-100" },
    });
    expect(attempts).toHaveLength(1);
  });

  it("I2: throws IdempotencyConflictError if an event ID is reused with mismatched parameters", async () => {
    const parent = await createTestParent();
    const student1 = await createTestStudent(parent.id);
    const student2 = await createTestStudent(parent.id);
    const trialClass = await createTestClass({ capacity: 4, seatsTaken: 0 });

    const booking1 = await createBooking({
      trialClassId: trialClass.id,
      studentId: student1.id,
    });
    const booking2 = await createBooking({
      trialClassId: trialClass.id,
      studentId: student2.id,
    });

    // Event used for booking1
    await applyPaymentEvent({
      providerEventId: "evt-conflict-test",
      bookingId: booking1.id,
      expectedBookingVersion: 0,
      requestedOutcome: "APPROVE",
    });

    // Reusing same eventId for booking2 must be rejected with 409 conflict
    await expect(
      applyPaymentEvent({
        providerEventId: "evt-conflict-test",
        bookingId: booking2.id,
        expectedBookingVersion: 0,
        requestedOutcome: "APPROVE",
      })
    ).rejects.toThrow(IdempotencyConflictError);
  });
});
