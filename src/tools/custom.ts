import fs from "fs";
import path from "path";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { GetConsoleLogsTool, ScreenshotTool } from "@repo/types/mcp/tool";

import { Tool } from "./tool";

export const getConsoleLogs: Tool = {
  schema: {
    name: GetConsoleLogsTool.shape.name.value,
    description: GetConsoleLogsTool.shape.description.value,
    inputSchema: zodToJsonSchema(GetConsoleLogsTool.shape.arguments),
  },
  handle: async (context, _params) => {
    const consoleLogs = await context.sendSocketMessage(
      "browser_get_console_logs",
      {},
    );
    const text: string = consoleLogs
      .map((log) => JSON.stringify(log))
      .join("\n");
    return {
      content: [{ type: "text", text }],
    };
  },
};

export const screenshot: Tool = {
  schema: {
    name: ScreenshotTool.shape.name.value,
    description: ScreenshotTool.shape.description.value,
    inputSchema: zodToJsonSchema(ScreenshotTool.shape.arguments),
  },
  handle: async (context, _params) => {
    const screenshot = await context.sendSocketMessage(
      "browser_screenshot",
      {},
    );
    return {
      content: [
        {
          type: "image",
          data: screenshot,
          mimeType: "image/png",
        },
      ],
    };
  },
};

// Not in @repo/types yet; mirrors the extension's `browser_upload_file` schema.
const UploadFileTool = z.object({
  name: z.literal("browser_upload_file"),
  description: z.literal(
    "Attach a local file to an input[type=file]. Only files inside the directory set by BMCP_UPLOAD_DIR can be attached.",
  ),
  arguments: z.object({
    selector: z
      .string()
      .describe("CSS selector of the file input, e.g. input[type=file]"),
    filePath: z
      .string()
      .describe("Path of the file to attach, relative to BMCP_UPLOAD_DIR"),
  }),
});

/**
 * Resolves `filePath` against the upload directory and rejects anything that
 * escapes it (via `..`, absolute paths or symlinks), hidden files, and
 * non-regular files. Returns the real absolute path to hand to the browser.
 */
function resolveUploadPath(filePath: string): string {
  const uploadDir = process.env.BMCP_UPLOAD_DIR;
  if (!uploadDir) {
    throw new Error(
      "File upload is disabled. Set BMCP_UPLOAD_DIR to the directory whose files may be uploaded.",
    );
  }

  let realDir: string;
  try {
    realDir = fs.realpathSync(uploadDir);
  } catch {
    throw new Error(`BMCP_UPLOAD_DIR does not exist: ${uploadDir}`);
  }
  if (!fs.statSync(realDir).isDirectory()) {
    throw new Error(`BMCP_UPLOAD_DIR is not a directory: ${uploadDir}`);
  }

  let realFile: string;
  try {
    realFile = fs.realpathSync(path.resolve(realDir, filePath));
  } catch {
    throw new Error(`File not found in upload directory: ${filePath}`);
  }

  const relative = path.relative(realDir, realFile);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`File is outside the upload directory: ${filePath}`);
  }
  if (relative.split(path.sep).some((segment) => segment.startsWith("."))) {
    throw new Error(`Hidden files cannot be uploaded: ${filePath}`);
  }
  if (!fs.statSync(realFile).isFile()) {
    throw new Error(`Not a regular file: ${filePath}`);
  }

  return realFile;
}

export const uploadFile: Tool = {
  schema: {
    name: UploadFileTool.shape.name.value,
    description: UploadFileTool.shape.description.value,
    inputSchema: zodToJsonSchema(UploadFileTool.shape.arguments),
  },
  handle: async (context, params) => {
    const { selector, filePath } = UploadFileTool.shape.arguments.parse(params);
    const absPath = resolveUploadPath(filePath);
    // Message type is not declared in SocketMessageMap, so bypass its typing.
    await (context.sendSocketMessage as any)("browser_upload_file", {
      selector,
      filePath: absPath,
    });
    return {
      content: [
        {
          type: "text",
          text: `Attached "${filePath}" to "${selector}"`,
        },
      ],
    };
  },
};
