import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("CU2sowQaHdVcJUgEfgYvaPKj4AVb6i58oAytLnNE5y1L");
export const DEVNET_MINT = new PublicKey("HNcz9fndVXBogLjU55uyvbz79P5qWxaBZVKk7iRSy7jV");
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const SWITCHBOARD_PROGRAM_ID = new PublicKey("Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2");
export const SWITCHBOARD_QUEUE = new PublicKey(
  import.meta.env.VITE_SWITCHBOARD_QUEUE || "EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7"
);
