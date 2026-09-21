"use server";

import { revalidatePath } from "next/cache";
import {
  createBooking,
  applyPaymentEvent,
  getBookingDetails,
} from "@/server/booking/service";
import { BookingError } from "@/server/booking/errors";
import {
  createBookingSchema,
  simulatePaymentActionSchema,
} from "./schemas";
import { PaymentEventResult } from "@/server/booking/types";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };

/**
 * Server action to create a trial booking in PENDING_PAYMENT status.
 */
export async function createBookingAction(
  rawInput: unknown
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = createBookingSchema.safeParse(rawInput);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((e) => e.message).join(", ");
    return { success: false, error: errorMsg, code: "VALIDATION_ERROR" };
  }

  try {
    const booking = await createBooking(parsed.data);
    revalidatePath("/classes");
    revalidatePath(`/classes/${parsed.data.trialClassId}`);
    revalidatePath("/admin/roster");

    return {
      success: true,
      data: { bookingId: booking.id },
    };
  } catch (error) {
    if (error instanceof BookingError) {
      return { success: false, error: error.message, code: error.code };
    }
    const message = error instanceof Error ? error.message : "Failed to create booking";
    return { success: false, error: message, code: "INTERNAL_ERROR" };
  }
}

/**
 * Server action to simulate a payment event (APPROVE or DECLINE) on a booking.
 */
export async function simulatePaymentAction(
  rawInput: unknown
): Promise<ActionResult<PaymentEventResult>> {
  const parsed = simulatePaymentActionSchema.safeParse(rawInput);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((e) => e.message).join(", ");
    return { success: false, error: errorMsg, code: "VALIDATION_ERROR" };
  }

  const { bookingId, expectedBookingVersion, requestedOutcome } = parsed.data;
  const providerEventId = `mock_${crypto.randomUUID()}`;

  try {
    const result = await applyPaymentEvent({
      providerEventId,
      bookingId,
      expectedBookingVersion,
      requestedOutcome,
    });

    const booking = await getBookingDetails(bookingId);
    revalidatePath("/classes");
    revalidatePath(`/classes/${booking.trialClassId}`);
    revalidatePath("/admin/roster");

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof BookingError) {
      return { success: false, error: error.message, code: error.code };
    }
    const message = error instanceof Error ? error.message : "Payment processing failed";
    return { success: false, error: message, code: "INTERNAL_ERROR" };
  }
}
