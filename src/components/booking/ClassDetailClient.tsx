"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { createBookingAction, simulatePaymentAction } from "@/features/booking/actions";

interface Student {
  id: string;
  name: string;
  age: number;
  parentId: string;
}

interface Parent {
  id: string;
  name: string;
  email: string;
  students: Student[];
}

interface PaymentAttemptItem {
  id: string;
  providerEventId: string;
  expectedBookingVersion: number;
  requestedOutcome: string;
  result: string;
  processedAt: string | null;
  createdAt: string;
}

interface BookingItem {
  id: string;
  trialClassId: string;
  studentId: string;
  status: "PENDING_PAYMENT" | "PROCESSING_PAYMENT" | "PAYMENT_FAILED" | "CONFIRMED";
  version: number;
  createdAt: string;
  updatedAt: string;
  student: Student;
  paymentAttempts: PaymentAttemptItem[];
}

interface TrialClassDetail {
  id: string;
  subject: string;
  teacher: string;
  startsAt: string;
  capacity: number;
  seatsTaken: number;
  bookings: BookingItem[];
}

interface Props {
  trialClass: TrialClassDetail;
  parents: Parent[];
  initialStudentId?: string;
}

export function ClassDetailClient({ trialClass, parents, initialStudentId }: Props) {
  const [isPending, startTransition] = useTransition();

  // Find all available students across parents
  const allStudents = parents.flatMap((p) => p.students);

  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    initialStudentId || allStudents[0]?.id || ""
  );

  const activeStudent = allStudents.find((s) => s.id === selectedStudentId);

  // Find existing booking for this student in this class if any
  const existingBooking = trialClass.bookings.find(
    (b) => b.studentId === selectedStudentId
  );

  const isFull = trialClass.seatsTaken >= trialClass.capacity;
  const remainingSeats = Math.max(0, trialClass.capacity - trialClass.seatsTaken);

  const dateFormatted = new Date(trialClass.startsAt).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  // Action: Create Booking
  const handleCreateBooking = () => {
    if (!selectedStudentId) {
      toast.error("Please select a child first.");
      return;
    }

    startTransition(async () => {
      const res = await createBookingAction({
        trialClassId: trialClass.id,
        studentId: selectedStudentId,
      });

      if (!res.success) {
        toast.error(res.error);
      } else {
        toast.success("Draft booking created! Please complete payment to reserve seat.");
      }
    });
  };

  // Action: Simulate Payment
  const handlePayment = (requestedOutcome: "APPROVE" | "DECLINE") => {
    if (!existingBooking) return;

    startTransition(async () => {
      const res = await simulatePaymentAction({
        bookingId: existingBooking.id,
        expectedBookingVersion: existingBooking.version,
        requestedOutcome,
      });

      if (!res.success) {
        toast.error(res.error);
      } else {
        if (res.data.result === "SUCCEEDED") {
          toast.success("Payment succeeded! Booking confirmed and seat reserved.");
        } else if (res.data.result === "NO_SEAT") {
          toast.error("Class reached capacity before payment completed. You were not charged.");
        } else if (res.data.result === "DECLINED") {
          toast.warning("Payment was declined. You can retry with approval outcome.");
        }
      }
    });
  };

  const lastAttempt = existingBooking?.paymentAttempts?.[0] ?? null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top back navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/classes"
          className="text-xs font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1.5 transition-colors"
        >
          ← Back to All Classes
        </Link>
        <span className="text-xs font-mono text-slate-400">Class ID: {trialClass.id}</span>
      </div>

      {/* Main Class Card */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-teal-700 tracking-wider uppercase">
                Trial Class Session
              </span>
              <CardTitle className="text-2xl font-bold text-slate-900 mt-1">
                {trialClass.subject}
              </CardTitle>
              <CardDescription className="text-sm text-slate-600 mt-1">
                Instructor: <span className="font-semibold text-slate-800">{trialClass.teacher}</span>
              </CardDescription>
            </div>

            <div>
              {isFull ? (
                <Badge variant="destructive" className="bg-rose-600 text-xs px-3 py-1 font-medium">
                  Class Full (4/4 Confirmed)
                </Badge>
              ) : remainingSeats === 1 ? (
                <Badge className="bg-amber-600 hover:bg-amber-700 text-xs px-3 py-1 font-medium">
                  Last Seat Remaining (3/4 Confirmed)
                </Badge>
              ) : (
                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-xs px-3 py-1 font-medium">
                  {remainingSeats} Seats Available ({trialClass.seatsTaken}/4)
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-5">
          {/* Metadata details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200/60">
            <div>
              <span className="text-slate-500 block mb-0.5">Date & Time</span>
              <span className="font-semibold text-slate-900">{dateFormatted}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">Classroom Size</span>
              <span className="font-semibold text-slate-900">4 Students Maximum</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">Trial Tuition</span>
              <span className="font-semibold text-slate-900">Mock Payment ($25.00)</span>
            </div>
          </div>

          <Separator className="bg-slate-100" />

          {/* Student Selector */}
          <div>
            <label htmlFor="student-picker" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Select Child for Enrollment
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <select
                id="student-picker"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full sm:w-80 text-xs border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-800 focus:outline-teal-600 focus:ring-1 focus:ring-teal-600"
              >
                {parents.map((p) => (
                  <optgroup key={p.id} label={`${p.name} (${p.email})`}>
                    {p.students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Age {s.age})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {activeStudent && (
                <span className="text-xs text-slate-500">
                  Enrolling: <strong className="text-slate-800">{activeStudent.name}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Conditional Booking & Payment Flow */}
          <div className="pt-2">
            {!existingBooking ? (
              // Case 1: No existing booking
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-1">
                  Ready to Book Trial?
                </h3>
                <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                  Submitting a trial booking creates a pending reservation. Your seat will be confirmed once mock payment is approved.
                </p>

                <Button
                  onClick={handleCreateBooking}
                  disabled={isPending || isFull}
                  className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium px-5"
                >
                  {isPending ? "Creating Booking..." : isFull ? "Class is Full" : "Submit Trial Booking"}
                </Button>

                {isFull && (
                  <p className="text-xs text-rose-600 mt-2 font-medium">
                    This trial class has reached its maximum cap of 4 confirmed students.
                  </p>
                )}
              </div>
            ) : existingBooking.status === "CONFIRMED" ? (
              // Case 2: Confirmed booking
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5 text-emerald-950">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                  <h3 className="text-sm font-bold text-emerald-900">
                    Booking Confirmed!
                  </h3>
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed mb-4">
                  <strong>{existingBooking.student.name}</strong> has a confirmed seat in this session. The seat is locked and accounted for on the roster.
                </p>
                <div className="flex items-center gap-3">
                  <Link href="/admin/roster">
                    <Button variant="outline" className="text-xs border-emerald-300 text-emerald-900 hover:bg-emerald-100 bg-white font-medium">
                      View Confirmed Class Roster →
                    </Button>
                  </Link>
                </div>
              </div>
            ) : existingBooking.status === "PENDING_PAYMENT" ? (
              // Case 3: Pending payment booking
              <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                    <h3 className="text-sm font-bold text-amber-950">
                      Payment Required (Pending)
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-amber-800">
                    Booking Version: {existingBooking.version}
                  </span>
                </div>

                <p className="text-xs text-amber-900/90 leading-relaxed mb-4">
                  Booking for <strong>{existingBooking.student.name}</strong> is created in pending status. Seat reservation executes atomically upon payment approval.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={() => handlePayment("APPROVE")}
                    disabled={isPending}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium"
                  >
                    {isPending ? "Processing..." : "Complete Payment (Approve)"}
                  </Button>

                  <Button
                    onClick={() => handlePayment("DECLINE")}
                    disabled={isPending}
                    variant="outline"
                    className="border-rose-300 text-rose-800 hover:bg-rose-50 bg-white text-xs font-medium"
                  >
                    {isPending ? "Processing..." : "Simulate Card Decline"}
                  </Button>
                </div>
              </div>
            ) : (
              // Case 4: Payment failed (retry available)
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                    <h3 className="text-sm font-bold text-rose-950">
                      Payment Failed
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-rose-800">
                    Booking Version: {existingBooking.version}
                  </span>
                </div>

                {lastAttempt?.result === "NO_SEAT" ? (
                  <Alert className="bg-white border-amber-300 text-amber-950 my-3 text-xs">
                    <AlertTitle className="font-semibold text-amber-900">Class Reached Maximum Capacity</AlertTitle>
                    <AlertDescription className="text-amber-800 mt-1">
                      This class filled up with 4 confirmed students before your payment completed. <strong>You were not charged.</strong>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="bg-white border-rose-200 text-rose-950 my-3 text-xs">
                    <AlertTitle className="font-semibold text-rose-900">Payment Declined</AlertTitle>
                    <AlertDescription className="text-rose-800 mt-1">
                      The card transaction was simulated as declined. You can retry payment below or choose an approved outcome.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-wrap items-center gap-3 mt-4">
                  <Button
                    onClick={() => handlePayment("APPROVE")}
                    disabled={isPending || isFull}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium"
                  >
                    {isPending ? "Retrying..." : "Retry Payment (Approve)"}
                  </Button>

                  <Button
                    onClick={() => handlePayment("DECLINE")}
                    disabled={isPending}
                    variant="outline"
                    className="border-slate-300 text-slate-700 hover:bg-slate-50 bg-white text-xs font-medium"
                  >
                    Retry (Simulate Decline)
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Payment Attempt Audit Log (for reviewer inspection) */}
          {existingBooking && existingBooking.paymentAttempts.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Payment Audit Trail (Booking: {existingBooking.id})
              </h4>
              <div className="divide-y divide-slate-200 text-xs">
                {existingBooking.paymentAttempts.map((attempt) => (
                  <div key={attempt.id} className="py-2 flex items-center justify-between">
                    <div>
                      <span className="font-mono text-[11px] text-slate-500 mr-2">
                        {attempt.providerEventId}
                      </span>
                      <span className="font-medium text-slate-800">
                        Outcome: {attempt.requestedOutcome}
                      </span>
                    </div>
                    <div>
                      <Badge
                        variant={
                          attempt.result === "SUCCEEDED"
                            ? "default"
                            : attempt.result === "NO_SEAT"
                            ? "outline"
                            : "destructive"
                        }
                        className={`text-[10px] font-mono ${
                          attempt.result === "SUCCEEDED"
                            ? "bg-emerald-600 text-white"
                            : attempt.result === "NO_SEAT"
                            ? "border-amber-500 text-amber-800 bg-amber-50"
                            : "bg-rose-600 text-white"
                        }`}
                      >
                        {attempt.result}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
