import type { Server } from "node:http";

export const API_LISTEN_HOST = "0.0.0.0";

type Listen = (
    port: number,
    host: string,
    onListening: () => void,
) => Server;

export function openApiListener(
    listen: Listen,
    port: number,
): Promise<Server> {
    return new Promise((resolve, reject) => {
        const server = listen(port, API_LISTEN_HOST, () => {
            server.off("error", reject);
            resolve(server);
        });

        server.once("error", reject);
    });
}
