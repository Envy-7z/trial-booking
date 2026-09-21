import { z } from "zod";

export const createBookingSchema = z.object({
  trialClassId: z.string().trim().min(1, "Trial class ID is required"),
  studentId: z.string().trim().min(1, "Student ID is required"),
});

export const simulatePaymentActionSchema = z.object({
  bookingId: z.string().trim().min(1, "Booking ID is required"),
  expectedBookingVersion: z.coerce.number().int().min(0, "Expected booking version must be >= 0"),
  requestedOutcome: z.enum(["APPROVE", "DECLINE"]),
});

export const paymentEventWebhookSchema = z.object({
  providerEventId: z.string().trim().min(1, "providerEventId is required"),
  bookingId: z.string().trim().min(1, "bookingId is required"),
  expectedBookingVersion: z.coerce.number().int().min(0, "expectedBookingVersion must be >= 0"),
  requestedOutcome: z.enum(["APPROVE", "DECLINE"]),
});
