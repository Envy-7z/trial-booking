import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/server/db";
import { createBooking } from "@/server/booking/service";
import {
  ClassFullError,
  DuplicateBookingError,
  ClassNotFoundError,
  StudentNotFoundError,
} from "@/server/booking/errors";
import {
  resetDatabase,
  createTestParent,
  createTestStudent,
  createTestClass,
} from "../helpers/setup";

describe("Booking Domain Service - Creation & Validation", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("B1: successfully creates a trial booking in PENDING_PAYMENT status without reserving a seat", async () => {
    const parent = await createTestParent();
    const student = await createTestStudent(parent.id);
    const trialClass = await createTestClass({ capacity: 4, seatsTaken: 0 });

    const booking = await createBooking({
      trialClassId: trialClass.id,
      studentId: student.id,
    });

    expect(booking).toBeDefined();
    expect(booking.status).toBe("PENDING_PAYMENT");
    expect(booking.version).toBe(0);
    expect(booking.trialClassId).toBe(trialClass.id);
    expect(booking.studentId).toBe(student.id);

    // CRITICAL: seats_taken MUST remain 0 because seat reservation happens at payment confirmation
    const classAfter = await prisma.trialClass.findUniqueOrThrow({
      where: { id: trialClass.id },
    });
    expect(classAfter.seatsTaken).toBe(0);
  });

  it("B2: rejects booking creation if the class is already full (soft capacity check)", async () => {
    const parent = await createTestParent();
    const student = await createTestStudent(parent.id);
    const trialClass = await createTestClass({ capacity: 4, seatsTaken: 4 });

    await expect(
      createBooking({
        trialClassId: trialClass.id,
        studentId: student.id,
      })
    ).rejects.toThrow(ClassFullError);

    // No booking should be inserted
    const count = await prisma.booking.count({
      where: { trialClassId: trialClass.id },
    });
    expect(count).toBe(0);
  });

  it("B3: prevents duplicate bookings for the same child and class via unique constraint", async () => {
    const parent = await createTestParent();
    const student = await createTestStudent(parent.id);
    const trialClass = await createTestClass({ capacity: 4, seatsTaken: 0 });

    // First booking succeeds
    await createBooking({
      trialClassId: trialClass.id,
      studentId: student.id,
    });

    // Second booking for the same student and class MUST fail
    await expect(
      createBooking({
        trialClassId: trialClass.id,
        studentId: student.id,
      })
    ).rejects.toThrow(DuplicateBookingError);

    // Only 1 booking record should exist
    const totalBookings = await prisma.booking.count({
      where: {
        trialClassId: trialClass.id,
        studentId: student.id,
      },
    });
    expect(totalBookings).toBe(1);
  });

  it("B4: rejects booking when class or student does not exist", async () => {
    const parent = await createTestParent();
    const student = await createTestStudent(parent.id);
    const trialClass = await createTestClass();

    await expect(
      createBooking({
        trialClassId: "non-existent-class",
        studentId: student.id,
      })
    ).rejects.toThrow(ClassNotFoundError);

    await expect(
      createBooking({
        trialClassId: trialClass.id,
        studentId: "non-existent-student",
      })
    ).rejects.toThrow(StudentNotFoundError);
  });
});
