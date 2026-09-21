import {
  BookingStatus,
  RequestedPaymentOutcome,
  PaymentResult,
} from "@/generated/prisma/enums";

export type { BookingStatus, RequestedPaymentOutcome, PaymentResult };

export interface CreateBookingInput {
  trialClassId: string;
  studentId: string;
}

export interface ApplyPaymentEventInput {
  providerEventId: string;
  bookingId: string;
  expectedBookingVersion: number;
  requestedOutcome: RequestedPaymentOutcome;
}

export interface PaymentEventResult {
  replayed: boolean;
  result: PaymentResult;
  bookingStatus: BookingStatus;
  bookingVersion: number;
}

export interface TrialClassSummary {
  id: string;
  subject: string;
  teacher: string;
  startsAt: Date;
  capacity: number;
  seatsTaken: number;
  isFull: boolean;
}

export interface RosterStudent {
  bookingId: string;
  studentId: string;
  studentName: string;
  studentAge: number;
  parentName: string;
  parentEmail: string;
  confirmedAt: Date;
}

export interface ClassRoster {
  classId: string;
  subject: string;
  teacher: string;
  startsAt: Date;
  capacity: number;
  seatsTaken: number;
  confirmedStudents: RosterStudent[];
}
