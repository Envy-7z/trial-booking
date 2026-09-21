import { notFound } from "next/navigation";
import { getClassDetail, getParentsWithStudents } from "@/server/booking/service";
import { ClassDetailClient } from "@/components/booking/ClassDetailClient";
import { BookingStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ studentId?: string }>;
}

export default async function ClassDetailPage({ params, searchParams }: PageProps) {
  const { classId } = await params;
  const { studentId } = await searchParams;

  let trialClass;
  try {
    trialClass = await getClassDetail(classId);
  } catch {
    notFound();
  }

  const parents = await getParentsWithStudents();

  // Serialize dates and enums for Client Component boundary without `any`
  const serializedClass = {
    id: trialClass.id,
    subject: trialClass.subject,
    teacher: trialClass.teacher,
    startsAt: trialClass.startsAt.toISOString(),
    capacity: trialClass.capacity,
    seatsTaken: trialClass.seatsTaken,
    bookings: trialClass.bookings.map((b) => ({
      id: b.id,
      trialClassId: b.trialClassId,
      studentId: b.studentId,
      status: b.status as BookingStatus,
      version: b.version,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      student: {
        id: b.student.id,
        name: b.student.name,
        age: b.student.age,
        parentId: b.student.parentId,
      },
      paymentAttempts: b.paymentAttempts.map((p) => ({
        id: p.id,
        providerEventId: p.providerEventId,
        expectedBookingVersion: p.expectedBookingVersion,
        requestedOutcome: p.requestedOutcome,
        result: p.result,
        processedAt: p.processedAt ? p.processedAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
      })),
    })),
  };

  return (
    <div>
      <ClassDetailClient
        trialClass={serializedClass}
        parents={parents}
        initialStudentId={studentId}
      />
    </div>
  );
}
