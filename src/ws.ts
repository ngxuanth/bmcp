import type { IncomingMessage } from "node:http";

import { WebSocketServer } from "ws";

import { mcpConfig } from "@repo/config/mcp.config";
import { wait } from "@repo/utils";

import { isPortInUse, killProcessOnPort } from "@/utils/port";

/**
 * Only accept connections from a Chrome extension (web pages cannot forge
 * `Origin`). Set `BMCP_EXTENSION_ID` to restrict this to one extension.
 */
function isAuthorizedClient(req: IncomingMessage): boolean {
  const origin = req.headers.origin ?? "";
  const extensionId = process.env.BMCP_EXTENSION_ID;
  return extensionId
    ? origin === `chrome-extension://${extensionId}`
    : origin.startsWith("chrome-extension://");
}

export async function createWebSocketServer(
  port: number = mcpConfig.defaultWsPort,
): Promise<WebSocketServer> {
  killProcessOnPort(port);
  // Wait until the port is free
  while (await isPortInUse(port)) {
    await wait(100);
  }
  return new WebSocketServer({
    host: "127.0.0.1",
    port,
    verifyClient: ({ req }: { req: IncomingMessage }) => isAuthorizedClient(req),
  });
}
