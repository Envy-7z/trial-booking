export class BookingError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "BookingError";
  }
}

export class BookingNotFoundError extends BookingError {
  constructor(message = "Booking not found") {
    super("BOOKING_NOT_FOUND", message);
    this.name = "BookingNotFoundError";
  }
}

export class ClassNotFoundError extends BookingError {
  constructor(message = "Trial class not found") {
    super("CLASS_NOT_FOUND", message);
    this.name = "ClassNotFoundError";
  }
}

export class StudentNotFoundError extends BookingError {
  constructor(message = "Student not found") {
    super("STUDENT_NOT_FOUND", message);
    this.name = "StudentNotFoundError";
  }
}

export class ClassFullError extends BookingError {
  constructor(message = "This trial class is currently full (4 confirmed students)") {
    super("CLASS_FULL", message);
    this.name = "ClassFullError";
  }
}

export class DuplicateBookingError extends BookingError {
  constructor(message = "A booking for this student and class already exists") {
    super("DUPLICATE_BOOKING", message);
    this.name = "DuplicateBookingError";
  }
}

export class StalePaymentAttemptError extends BookingError {
  constructor(message = "Booking was modified concurrently or is not eligible for payment") {
    super("STALE_PAYMENT_VERSION", message);
    this.name = "StalePaymentAttemptError";
  }
}

export class InvalidBookingStateError extends BookingError {
  constructor(message = "Invalid booking state transition") {
    super("INVALID_STATE", message);
    this.name = "InvalidBookingStateError";
  }
}

export class IdempotencyConflictError extends BookingError {
  constructor(message = "A payment event with this ID already exists with different payload parameters") {
    super("IDEMPOTENCY_CONFLICT", message);
    this.name = "IdempotencyConflictError";
  }
}
