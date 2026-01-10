// Test if vite.ts can be imported
console.log("Testing vite import...");

try {
  const module = await import("./server/vite.js");
  console.log("✅ Vite module loaded successfully!");
  console.log("Exports:", Object.keys(module));
} catch (error) {
  console.error("❌ Failed to import vite module:");
  console.error(error.message);
  console.error(error.stack);
}
