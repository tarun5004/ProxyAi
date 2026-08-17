export interface ParsedSseEvent {
    event: string;
    data: unknown;
}

export function parseSseFrames(buffer: string): {
    events: ParsedSseEvent[];
    remainder: string;
} {
    const normalizedBuffer = buffer.replace(/\r\n/gu, "\n");
    const frames = normalizedBuffer.split("\n\n");
    const remainder = frames.pop() ?? "";
    const events = frames.flatMap(parseFrame);

    return { events, remainder };
}

export async function* readSseStream(
    stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ParsedSseEvent> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
        while (true) {
            const chunk = await reader.read();

            if (chunk.done) {
                buffer += decoder.decode();
                break;
            }

            buffer += decoder.decode(chunk.value, { stream: true });
            const parsed = parseSseFrames(buffer);
            buffer = parsed.remainder;

            for (const event of parsed.events) {
                yield event;
            }
        }

        const trailing = parseFrame(buffer);
        for (const event of trailing) {
            yield event;
        }
    } finally {
        reader.releaseLock();
    }
}

function parseFrame(frame: string): ParsedSseEvent[] {
    if (frame.trim().length === 0) {
        return [];
    }

    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of frame.split("\n")) {
        if (line.startsWith(":")) {
            continue;
        }

        if (line.startsWith("event:")) {
            eventName = line.slice(6).trimStart();
        } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
        }
    }

    if (dataLines.length === 0) {
        return [];
    }

    return [{
        event: eventName,
        data: JSON.parse(dataLines.join("\n")),
    }];
}
