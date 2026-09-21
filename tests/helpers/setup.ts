import { prisma } from "@/server/db";

export async function resetDatabase() {
  await prisma.paymentAttempt.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.student.deleteMany();
  await prisma.parent.deleteMany();
  await prisma.trialClass.deleteMany();
}

export async function createTestParent(id = `parent-${crypto.randomUUID()}`, email = `parent-${crypto.randomUUID()}@example.com`) {
  return prisma.parent.create({
    data: {
      id,
      name: "Test Parent",
      email,
    },
  });
}

export async function createTestStudent(parentId: string, id = `student-${crypto.randomUUID()}`) {
  return prisma.student.create({
    data: {
      id,
      name: "Test Student",
      age: 8,
      parentId,
    },
  });
}

export async function createTestClass(options?: {
  id?: string;
  capacity?: number;
  seatsTaken?: number;
}) {
  return prisma.trialClass.create({
    data: {
      id: options?.id ?? `class-${crypto.randomUUID()}`,
      subject: "Science Lab Test",
      teacher: "Test Teacher",
      startsAt: new Date(Date.now() + 86400000),
      capacity: options?.capacity ?? 4,
      seatsTaken: options?.seatsTaken ?? 0,
    },
  });
}
