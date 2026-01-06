import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "../programs/program-id";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

export function derivePoolPda(mint: PublicKey, salt: Uint8Array) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), mint.toBuffer(), Buffer.from(salt)],
    PROGRAM_ID
  );
}

export function deriveParticipantsPda(pool: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("participants"), pool.toBuffer()],
    PROGRAM_ID
  );
}

export function derivePoolTokenAddress(mint: PublicKey, pool: PublicKey) {
  return getAssociatedTokenAddressSync(mint, pool, true);
}
