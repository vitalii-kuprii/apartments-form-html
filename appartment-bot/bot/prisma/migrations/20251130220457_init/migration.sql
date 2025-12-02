-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('rent', 'buy');

-- CreateEnum
CREATE TYPE "ApartmentType" AS ENUM ('flat', 'house');

-- CreateTable
CREATE TABLE "users" (
    "id" BIGINT NOT NULL,
    "username" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "language_code" TEXT,
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "searches" (
    "id" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "name" TEXT,
    "city" TEXT NOT NULL,
    "property_type" "PropertyType" NOT NULL,
    "apartment_type" "ApartmentType" NOT NULL,
    "price_min" INTEGER,
    "price_max" INTEGER,
    "rooms" INTEGER[],
    "area_min" INTEGER,
    "area_max" INTEGER,
    "floor_min" INTEGER,
    "floor_max" INTEGER,
    "without_realtors" BOOLEAN NOT NULL DEFAULT false,
    "pets_friendly" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notify_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apartments" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "address" TEXT,
    "property_type" "PropertyType" NOT NULL,
    "apartment_type" "ApartmentType" NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "rooms" INTEGER,
    "area" DOUBLE PRECISION,
    "floor" INTEGER,
    "total_floors" INTEGER,
    "photos" TEXT[],
    "is_from_realtor" BOOLEAN NOT NULL DEFAULT false,
    "pets_friendly" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apartments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "apartment_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sent_apartments" (
    "id" TEXT NOT NULL,
    "search_id" TEXT NOT NULL,
    "apartment_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sent_apartments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "apartment_id" TEXT NOT NULL,
    "message_id" INTEGER,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'sent',

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "searches_user_id_idx" ON "searches"("user_id");

-- CreateIndex
CREATE INDEX "searches_city_idx" ON "searches"("city");

-- CreateIndex
CREATE INDEX "searches_is_active_idx" ON "searches"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "apartments_external_id_key" ON "apartments"("external_id");

-- CreateIndex
CREATE INDEX "apartments_city_idx" ON "apartments"("city");

-- CreateIndex
CREATE INDEX "apartments_property_type_idx" ON "apartments"("property_type");

-- CreateIndex
CREATE INDEX "apartments_price_idx" ON "apartments"("price");

-- CreateIndex
CREATE INDEX "apartments_rooms_idx" ON "apartments"("rooms");

-- CreateIndex
CREATE INDEX "apartments_is_active_idx" ON "apartments"("is_active");

-- CreateIndex
CREATE INDEX "apartments_first_seen_at_idx" ON "apartments"("first_seen_at");

-- CreateIndex
CREATE INDEX "favorites_user_id_idx" ON "favorites"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_apartment_id_key" ON "favorites"("user_id", "apartment_id");

-- CreateIndex
CREATE INDEX "sent_apartments_search_id_idx" ON "sent_apartments"("search_id");

-- CreateIndex
CREATE INDEX "sent_apartments_apartment_id_idx" ON "sent_apartments"("apartment_id");

-- CreateIndex
CREATE UNIQUE INDEX "sent_apartments_search_id_apartment_id_key" ON "sent_apartments"("search_id", "apartment_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_apartment_id_idx" ON "notifications"("apartment_id");

-- CreateIndex
CREATE INDEX "notifications_sent_at_idx" ON "notifications"("sent_at");

-- AddForeignKey
ALTER TABLE "searches" ADD CONSTRAINT "searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_apartment_id_fkey" FOREIGN KEY ("apartment_id") REFERENCES "apartments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_apartments" ADD CONSTRAINT "sent_apartments_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_apartments" ADD CONSTRAINT "sent_apartments_apartment_id_fkey" FOREIGN KEY ("apartment_id") REFERENCES "apartments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_apartment_id_fkey" FOREIGN KEY ("apartment_id") REFERENCES "apartments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
