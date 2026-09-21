import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database with deterministic edge cases...");

  // 1. Clean existing records in reverse dependency order
  await prisma.paymentAttempt.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.student.deleteMany();
  await prisma.parent.deleteMany();
  await prisma.trialClass.deleteMany();

  // 2. Seed Parents
  const parentAlice = await prisma.parent.create({
    data: {
      id: "parent-alice",
      name: "Alice Chen",
      email: "alice@example.com",
    },
  });

  const parentBob = await prisma.parent.create({
    data: {
      id: "parent-bob",
      name: "Bob Kumar",
      email: "bob@example.com",
    },
  });

  const parentSeed = await prisma.parent.create({
    data: {
      id: "parent-seed",
      name: "Seed Parent",
      email: "seed.cohort@example.com",
    },
  });

  // 3. Seed Students
  await prisma.student.create({
    data: {
      id: "student-emma",
      name: "Emma Chen",
      age: 8,
      parentId: parentAlice.id,
    },
  });

  const studentLiam = await prisma.student.create({
    data: {
      id: "student-liam",
      name: "Liam Chen",
      age: 10,
      parentId: parentAlice.id,
    },
  });

  await prisma.student.create({
    data: {
      id: "student-noah",
      name: "Noah Kumar",
      age: 9,
      parentId: parentBob.id,
    },
  });

  const studentFill1 = await prisma.student.create({
    data: {
      id: "student-seed-1",
      name: "Lucas Miller",
      age: 8,
      parentId: parentSeed.id,
    },
  });

  const studentFill2 = await prisma.student.create({
    data: {
      id: "student-seed-2",
      name: "Sophia Zhang",
      age: 9,
      parentId: parentSeed.id,
    },
  });

  const studentFill3 = await prisma.student.create({
    data: {
      id: "student-seed-3",
      name: "Oliver Davis",
      age: 8,
      parentId: parentSeed.id,
    },
  });

  const studentFill4 = await prisma.student.create({
    data: {
      id: "student-seed-4",
      name: "Maya Patel",
      age: 10,
      parentId: parentSeed.id,
    },
  });

  // 4. Seed Trial Classes with specific edge-case configurations
  // Case A: Available class (0 confirmed students)
  const classOpen = await prisma.trialClass.create({
    data: {
      id: "class-open",
      subject: "Interactive Math: Fractions & Shapes",
      teacher: "Ms. Clara Vance",
      startsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // in 2 days
      capacity: 4,
      seatsTaken: 0,
    },
  });

  // Case B: Almost-full class with EXACTLY 3 confirmed students (1 slot remaining)
  const classAlmostFull = await prisma.trialClass.create({
    data: {
      id: "class-almost-full",
      subject: "Hands-on Chemistry: Crystal Kitchen",
      teacher: "Mr. David Rivera",
      startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // in 3 days
      capacity: 4,
      seatsTaken: 0, // will be updated and verified
    },
  });

  // Case C: Fully booked class (4 confirmed students)
  const classFull = await prisma.trialClass.create({
    data: {
      id: "class-full",
      subject: "Young Astronomers: Journey to Mars",
      teacher: "Dr. Evelyn Reed",
      startsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // in 4 days
      capacity: 4,
      seatsTaken: 0, // will be updated and verified
    },
  });

  // 5. Seed Confirmed Bookings for Class Almost Full (3 students)
  const almostFullStudents = [studentFill1, studentFill2, studentFill3];
  for (let i = 0; i < almostFullStudents.length; i++) {
    const student = almostFullStudents[i];
    const booking = await prisma.booking.create({
      data: {
        id: `booking-af-${i + 1}`,
        trialClassId: classAlmostFull.id,
        studentId: student.id,
        status: "CONFIRMED",
        version: 1,
      },
    });

    await prisma.paymentAttempt.create({
      data: {
        id: `pay-af-${i + 1}`,
        bookingId: booking.id,
        providerEventId: `seed-evt-af-${i + 1}`,
        expectedBookingVersion: 0,
        requestedOutcome: "APPROVE",
        result: "SUCCEEDED",
        processedAt: new Date(),
      },
    });
  }

  // 6. Seed Confirmed Bookings for Class Full (4 students)
  const fullStudents = [studentFill1, studentFill2, studentFill3, studentFill4];
  for (let i = 0; i < fullStudents.length; i++) {
    const student = fullStudents[i];
    const booking = await prisma.booking.create({
      data: {
        id: `booking-full-${i + 1}`,
        trialClassId: classFull.id,
        studentId: student.id,
        status: "CONFIRMED",
        version: 1,
      },
    });

    await prisma.paymentAttempt.create({
      data: {
        id: `pay-full-${i + 1}`,
        bookingId: booking.id,
        providerEventId: `seed-evt-full-${i + 1}`,
        expectedBookingVersion: 0,
        requestedOutcome: "APPROVE",
        result: "SUCCEEDED",
        processedAt: new Date(),
      },
    });
  }

  // 7. Seed one PAYMENT_FAILED case for demonstration (student Liam in class-open)
  const failedBooking = await prisma.booking.create({
    data: {
      id: "booking-failed-demo",
      trialClassId: classOpen.id,
      studentId: studentLiam.id,
      status: "PAYMENT_FAILED",
      version: 1,
    },
  });

  await prisma.paymentAttempt.create({
    data: {
      id: "pay-failed-demo",
      bookingId: failedBooking.id,
      providerEventId: "seed-evt-failed-1",
      expectedBookingVersion: 0,
      requestedOutcome: "DECLINE",
      result: "DECLINED",
      processedAt: new Date(),
    },
  });

  // 8. Reconcile seats_taken counter with exact COUNT(CONFIRMED) to ensure zero drift
  const classes = [classOpen, classAlmostFull, classFull];
  for (const c of classes) {
    const confirmedCount = await prisma.booking.count({
      where: {
        trialClassId: c.id,
        status: "CONFIRMED",
      },
    });

    await prisma.trialClass.update({
      where: { id: c.id },
      data: { seatsTaken: confirmedCount },
    });

    // Invariant verification check
    const refreshed = await prisma.trialClass.findUniqueOrThrow({
      where: { id: c.id },
    });
    if (refreshed.seatsTaken !== confirmedCount) {
      throw new Error(
        `Seed invariant assertion failed for class ${c.id}: counter=${refreshed.seatsTaken} count=${confirmedCount}`
      );
    }
  }

  console.log("Database seeded successfully with verified invariants:");
  console.log(`- ${classOpen.id}: 0/4 confirmed (includes 1 PAYMENT_FAILED attempt for testing retry)`);
  console.log(`- ${classAlmostFull.id}: 3/4 confirmed (last-seat race test ready)`);
  console.log(`- ${classFull.id}: 4/4 confirmed (full capacity rejection ready)`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error("Seed error:", e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
