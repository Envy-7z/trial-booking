-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PAYMENT', 'PROCESSING_PAYMENT', 'PAYMENT_FAILED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "RequestedPaymentOutcome" AS ENUM ('APPROVE', 'DECLINE');

-- CreateEnum
CREATE TYPE "PaymentResult" AS ENUM ('PROCESSING', 'SUCCEEDED', 'DECLINED', 'NO_SEAT');

-- CreateTable
CREATE TABLE "parents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "parent_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_classes" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "teacher" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "seats_taken" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "trial_class_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "expected_booking_version" INTEGER NOT NULL,
    "requested_outcome" "RequestedPaymentOutcome" NOT NULL,
    "result" "PaymentResult" NOT NULL DEFAULT 'PROCESSING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parents_email_key" ON "parents"("email");

-- CreateIndex
CREATE INDEX "students_parent_id_idx" ON "students"("parent_id");

-- CreateIndex
CREATE INDEX "bookings_trial_class_id_idx" ON "bookings"("trial_class_id");

-- CreateIndex
CREATE INDEX "bookings_student_id_idx" ON "bookings"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_class_student_key" ON "bookings"("trial_class_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_provider_event_id_key" ON "payment_attempts"("provider_event_id");

-- CreateIndex
CREATE INDEX "payment_attempts_booking_id_idx" ON "payment_attempts"("booking_id");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trial_class_id_fkey" FOREIGN KEY ("trial_class_id") REFERENCES "trial_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom Constraints for Trial Classes Capacity and Seat Invariants
ALTER TABLE "trial_classes"
ADD CONSTRAINT "trial_classes_capacity_check"
CHECK ("capacity" > 0 AND "capacity" <= 4);

ALTER TABLE "trial_classes"
ADD CONSTRAINT "trial_classes_seats_check"
CHECK ("seats_taken" >= 0 AND "seats_taken" <= "capacity");
