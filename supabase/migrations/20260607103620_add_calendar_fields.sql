ALTER TABLE "public"."rooms"
ADD COLUMN "status" TEXT DEFAULT 'available',
ADD COLUMN "maintenance_start" DATE,
ADD COLUMN "maintenance_end" DATE;

ALTER TABLE "public"."bookings"
ADD COLUMN "booking_status" TEXT,
ADD COLUMN "reservation_color" TEXT;
