CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"pool_id" integer,
	"pool_name" text,
	"randomness" text,
	"verify_url" text,
	"read" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pool_chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"wallet_address" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "winners_feed" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"winner_wallet" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"token_symbol" text NOT NULL,
	"bet_usd" double precision NOT NULL,
	"win_usd" double precision NOT NULL,
	"roi_percent" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "bet_usd" double precision;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "price_at_join_usd" double precision;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "initial_price_usd" double precision;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "current_price_usd" double precision;--> statement-breakpoint
ALTER TABLE "pool_chat_messages" ADD CONSTRAINT "pool_chat_messages_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winners_feed" ADD CONSTRAINT "winners_feed_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pool_chat_messages_pool_id_idx" ON "pool_chat_messages" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "pool_chat_messages_created_at_idx" ON "pool_chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "winners_feed_created_at_idx" ON "winners_feed" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "pools" DROP COLUMN "allow_mock";