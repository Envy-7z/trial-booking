import { prisma } from "@/server/db";
import {
  BookingNotFoundError,
  ClassNotFoundError,
  StudentNotFoundError,
  ClassFullError,
  DuplicateBookingError,
  StalePaymentAttemptError,
  IdempotencyConflictError,
} from "./errors";
import {
  CreateBookingInput,
  ApplyPaymentEventInput,
  PaymentEventResult,
  ClassRoster,
} from "./types";

interface PrismaErrorWithCode {
  code?: string;
  meta?: { target?: string[] };
}

function isUniqueConstraintViolation(error: unknown, targetField?: string): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    const err = error as PrismaErrorWithCode;
    if (err.code === "P2002") {
      if (!targetField) return true;
      const targets = err.meta?.target || [];
      return targets.some((t) => t.includes(targetField));
    }
  }
  return false;
}

/**
 * Creates a trial booking for a student in a trial class.
 * Booking starts in PENDING_PAYMENT status and does NOT reserve a seat yet.
 * Seat reservation is strictly executed upon payment approval.
 */
export async function createBooking(input: CreateBookingInput) {
  // 1. Verify Trial Class exists
  const trialClass = await prisma.trialClass.findUnique({
    where: { id: input.trialClassId },
  });
  if (!trialClass) {
    throw new ClassNotFoundError(`Class with ID ${input.trialClassId} not found`);
  }

  // 2. Verify Student exists
  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
  });
  if (!student) {
    throw new StudentNotFoundError(`Student with ID ${input.studentId} not found`);
  }

  // 3. Informational soft capacity check
  if (trialClass.seatsTaken >= trialClass.capacity) {
    throw new ClassFullError(
      `Class ${trialClass.subject} is already full (${trialClass.seatsTaken}/${trialClass.capacity} confirmed students)`
    );
  }

  // 4. Create booking record. Database unique constraint ensures no duplicate student booking.
  try {
    const booking = await prisma.booking.create({
      data: {
        trialClassId: input.trialClassId,
        studentId: input.studentId,
        status: "PENDING_PAYMENT",
        version: 0,
      },
      include: {
        trialClass: true,
        student: true,
      },
    });
    return booking;
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new DuplicateBookingError(
        `Student ${student.name} already has a booking for this class`
      );
    }
    throw error;
  }
}

/**
 * Atomically processes a mock payment event with:
 * 1. Idempotency (replay existing event on exact match, conflict on mismatch)
 * 2. Optimistic concurrency claim on booking version
 * 3. Atomic conditional UPDATE on trial_classes to guarantee capacity invariant <= 4
 */
export async function applyPaymentEvent(
  input: ApplyPaymentEventInput
): Promise<PaymentEventResult> {
  // Pre-check for existing provider event to short-circuit idempotently
  const existingAttempt = await prisma.paymentAttempt.findUnique({
    where: { providerEventId: input.providerEventId },
    include: { booking: true },
  });

  if (existingAttempt) {
    // Assert idempotent payload match
    const isMatching =
      existingAttempt.bookingId === input.bookingId &&
      existingAttempt.requestedOutcome === input.requestedOutcome &&
      existingAttempt.expectedBookingVersion === input.expectedBookingVersion;

    if (!isMatching) {
      throw new IdempotencyConflictError(
        `Event ID ${input.providerEventId} already recorded with different parameters`
      );
    }

    return {
      replayed: true,
      result: existingAttempt.result,
      bookingStatus: existingAttempt.booking.status,
      bookingVersion: existingAttempt.booking.version,
    };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch immutable booking association and verify existence first
      const booking = await tx.booking.findUnique({
        where: { id: input.bookingId },
        select: {
          id: true,
          trialClassId: true,
          status: true,
          version: true,
        },
      });

      if (!booking) {
        throw new BookingNotFoundError(`Booking ID ${input.bookingId} not found`);
      }

      // 2. Claim provider event inside transaction. Unique index on provider_event_id prevents duplicates.
      const attempt = await tx.paymentAttempt.create({
        data: {
          bookingId: input.bookingId,
          providerEventId: input.providerEventId,
          expectedBookingVersion: input.expectedBookingVersion,
          requestedOutcome: input.requestedOutcome,
          result: "PROCESSING",
        },
      });
      // 3. Atomically claim the booking version.
      // Eligible statuses for payment: PENDING_PAYMENT, PAYMENT_FAILED (retry)
      const claim = await tx.booking.updateMany({
        where: {
          id: input.bookingId,
          version: input.expectedBookingVersion,
          status: { in: ["PENDING_PAYMENT", "PAYMENT_FAILED"] },
        },
        data: {
          status: "PROCESSING_PAYMENT",
          version: { increment: 1 },
        },
      });

      if (claim.count !== 1) {
        throw new StalePaymentAttemptError(
          `Booking ${input.bookingId} has already been modified or is in invalid status (${booking.status}, v${booking.version})`
        );
      }

      const nextVersion = input.expectedBookingVersion + 1;

      // 4. Branch on requested payment outcome
      if (input.requestedOutcome === "DECLINE") {
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            result: "DECLINED",
            processedAt: new Date(),
          },
        });

        await tx.booking.update({
          where: { id: input.bookingId },
          data: { status: "PAYMENT_FAILED" },
        });

        return {
          replayed: false,
          result: "DECLINED",
          bookingStatus: "PAYMENT_FAILED",
          bookingVersion: nextVersion,
        };
      }

      // 5. Outcome is APPROVE: Attempt atomic conditional seat increment
      // Predicate: seats_taken < capacity guarantees never exceeding 4 confirmed students
      const affected = await tx.$executeRaw`
        UPDATE "trial_classes"
        SET "seats_taken" = "seats_taken" + 1
        WHERE "id" = ${booking.trialClassId}
          AND "seats_taken" < "capacity"
      `;

      if (affected !== 1) {
        // Seat unavailable (race lost / class filled). No payment taken.
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            result: "NO_SEAT",
            processedAt: new Date(),
          },
        });

        await tx.booking.update({
          where: { id: input.bookingId },
          data: { status: "PAYMENT_FAILED" },
        });

        return {
          replayed: false,
          result: "NO_SEAT",
          bookingStatus: "PAYMENT_FAILED",
          bookingVersion: nextVersion,
        };
      }

      // 6. Seat successfully acquired: finalize booking to CONFIRMED and attempt to SUCCEEDED
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          result: "SUCCEEDED",
          processedAt: new Date(),
        },
      });

      await tx.booking.update({
        where: { id: input.bookingId },
        data: { status: "CONFIRMED" },
      });

      return {
        replayed: false,
        result: "SUCCEEDED",
        bookingStatus: "CONFIRMED",
        bookingVersion: nextVersion,
      };
    });
  } catch (error) {
    // If another concurrent request just committed the exact same providerEventId
    if (isUniqueConstraintViolation(error, "provider_event_id")) {
      const persisted = await prisma.paymentAttempt.findUniqueOrThrow({
        where: { providerEventId: input.providerEventId },
        include: { booking: true },
      });

      const isMatching =
        persisted.bookingId === input.bookingId &&
        persisted.requestedOutcome === input.requestedOutcome &&
        persisted.expectedBookingVersion === input.expectedBookingVersion;

      if (!isMatching) {
        throw new IdempotencyConflictError(
          `Event ID ${input.providerEventId} already recorded with different parameters`
        );
      }

      return {
        replayed: true,
        result: persisted.result,
        bookingStatus: persisted.booking.status,
        bookingVersion: persisted.booking.version,
      };
    }

    throw error;
  }
}

/**
 * Lists all trial classes with confirmed counts and remaining capacity.
 */
export async function getAvailableClasses() {
  const classes = await prisma.trialClass.findMany({
    orderBy: { startsAt: "asc" },
  });

  return classes.map((c) => ({
    id: c.id,
    subject: c.subject,
    teacher: c.teacher,
    startsAt: c.startsAt,
    capacity: c.capacity,
    seatsTaken: c.seatsTaken,
    isFull: c.seatsTaken >= c.capacity,
    availableSeats: Math.max(0, c.capacity - c.seatsTaken),
  }));
}

/**
 * Gets detail for a single trial class along with its bookings.
 */
export async function getClassDetail(classId: string) {
  const trialClass = await prisma.trialClass.findUnique({
    where: { id: classId },
    include: {
      bookings: {
        include: {
          student: {
            include: { parent: true },
          },
          paymentAttempts: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  if (!trialClass) {
    throw new ClassNotFoundError(`Class with ID ${classId} not found`);
  }

  return trialClass;
}

/**
 * Returns confirmed student rosters for teacher/admin view.
 * Strictly filters by status: 'CONFIRMED'.
 */
export async function getConfirmedRosters(classId?: string): Promise<ClassRoster[]> {
  const classes = await prisma.trialClass.findMany({
    where: classId ? { id: classId } : undefined,
    orderBy: { startsAt: "asc" },
    include: {
      bookings: {
        where: { status: "CONFIRMED" },
        include: {
          student: {
            include: { parent: true },
          },
        },
        orderBy: { updatedAt: "asc" },
      },
    },
  });

  return classes.map((c) => ({
    classId: c.id,
    subject: c.subject,
    teacher: c.teacher,
    startsAt: c.startsAt,
    capacity: c.capacity,
    seatsTaken: c.seatsTaken,
    confirmedStudents: c.bookings.map((b) => ({
      bookingId: b.id,
      studentId: b.student.id,
      studentName: b.student.name,
      studentAge: b.student.age,
      parentName: b.student.parent.name,
      parentEmail: b.student.parent.email,
      confirmedAt: b.updatedAt,
    })),
  }));
}

/**
 * Retrieves parents with their children for user selection in UI.
 */
export async function getParentsWithStudents() {
  return prisma.parent.findMany({
    include: {
      students: {
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * Retrieves a booking along with its trial class and payment history.
 */
export async function getBookingDetails(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      trialClass: true,
      student: {
        include: { parent: true },
      },
      paymentAttempts: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!booking) {
    throw new BookingNotFoundError(`Booking ID ${bookingId} not found`);
  }

  return booking;
}
