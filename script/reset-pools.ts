import { db } from "../server/db";
import { pools } from "../shared/schema";

async function resetPools() {
  try {
    console.log("🗑️  Deleting all pools from database...");
    
    const result = await db.delete(pools);
    
    console.log("✅ Database reset complete!");
    console.log("📊 All pools have been deleted.");
    console.log("🎯 You can now create a new pool with the correct mint: HNcz9fndVXBogLjU55uyvbz79P5qWxaBZVKk7iRSy7jV");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error resetting database:", error);
    process.exit(1);
  }
}

resetPools();
