import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  console.log("[VITE] Creating Vite dev server...");

  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    // Vite will automatically find vite.config.mjs in the project root
    configFile: undefined, // Let Vite auto-detect the config file
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  console.log("[VITE] ✅ Vite server created, adding middleware to Express...");
  app.use(vite.middlewares);
  console.log("[VITE] ✅ Vite middlewares added");

  // Serve index.html for all non-API routes (SPA fallback)
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Skip API routes - let them be handled by the API handlers
    if (url.startsWith('/api/') || url.startsWith('/vite-hmr')) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");

      // Update cache-busting version on main.tsx script tag
      template = template.replace(
        /src="\/src\/main\.tsx(\?v=[^"]+)?"/,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );

      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
