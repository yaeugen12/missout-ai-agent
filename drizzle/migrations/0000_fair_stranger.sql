CREATE TABLE "participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"wallet_address" text NOT NULL,
	"avatar" text,
	"joined_at" timestamp DEFAULT now(),
	"refund_claimed" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "pools" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_address" text,
	"token_symbol" text NOT NULL,
	"token_name" text NOT NULL,
	"token_mint" text,
	"entry_amount" double precision NOT NULL,
	"min_participants" integer NOT NULL,
	"max_participants" integer NOT NULL,
	"participants_count" integer DEFAULT 0,
	"status" text NOT NULL,
	"start_time" timestamp DEFAULT now(),
	"lock_duration" integer NOT NULL,
	"lock_start_time" integer,
	"lock_time" timestamp,
	"end_time" timestamp,
	"winner_wallet" text,
	"total_pot" double precision DEFAULT 0,
	"donated_amount" double precision DEFAULT 0,
	"creator_wallet" text NOT NULL,
	"randomness_account" text,
	"randomness_hex" text,
	"tx_hash" text,
	"allow_mock" integer DEFAULT 0,
	"rent_claimed" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"nickname" text,
	"avatar_url" text,
	"avatar_style" text DEFAULT 'bottts',
	"nonce" text,
	"nickname_change_count" integer DEFAULT 0,
	"last_nickname_change" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "profiles_wallet_address_unique" UNIQUE("wallet_address"),
	CONSTRAINT "profiles_nickname_unique" UNIQUE("nickname")
);
--> statement-breakpoint
CREATE TABLE "referral_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_wallet" text NOT NULL,
	"token_mint" text NOT NULL,
	"amount" text NOT NULL,
	"tx_signature" text,
	"status" text DEFAULT 'pending',
	"claimed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "referral_relations" (
	"id" serial PRIMARY KEY NOT NULL,
	"referred_wallet" text NOT NULL,
	"referrer_wallet" text NOT NULL,
	"source" text DEFAULT 'link',
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "referral_relations_referred_wallet_unique" UNIQUE("referred_wallet")
);
--> statement-breakpoint
CREATE TABLE "referral_reward_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"token_mint" text NOT NULL,
	"referrer_wallet" text NOT NULL,
	"amount" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "referral_rewards" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_wallet" text NOT NULL,
	"token_mint" text NOT NULL,
	"amount_pending" text DEFAULT '0',
	"amount_claimed" text DEFAULT '0',
	"last_updated" timestamp DEFAULT now(),
	"last_claim_timestamp" bigint,
	CONSTRAINT "referral_rewards_referrer_wallet_token_mint_unique" UNIQUE("referrer_wallet","token_mint")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"wallet_address" text NOT NULL,
	"type" text NOT NULL,
	"amount" double precision NOT NULL,
	"tx_hash" text,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "used_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tx_hash" text NOT NULL,
	"wallet_address" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "used_transactions_tx_hash_unique" UNIQUE("tx_hash")
);
