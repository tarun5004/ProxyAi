import type { Logger } from "pino";

declare global {
    namespace Express {
        interface Request {
            log: Logger;
            requestId: string;
        }
    }
}

export {};
