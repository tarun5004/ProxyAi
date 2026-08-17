import type { ReactNode } from "react";

interface WorkspaceShellProps {
    sidebar: ReactNode;
    main: ReactNode;
    inspector: ReactNode;
    panelOpen: boolean;
    onDismissPanels(): void;
}

export function WorkspaceShell(props: Readonly<WorkspaceShellProps>) {
    return (
        <div className="grid h-dvh w-full grid-cols-[300px_minmax(0,1fr)_330px] overflow-hidden bg-app-bg max-[1280px]:grid-cols-[300px_minmax(0,1fr)] max-[1100px]:grid-cols-[minmax(0,1fr)]">
            {props.sidebar}
            {props.main}
            {props.inspector}
            {props.panelOpen ? (
                <button
                    className="fixed inset-0 z-35 hidden bg-[rgb(5_12_8_/_22%)] backdrop-blur-[2px] max-[1280px]:block"
                    aria-label="Close open panel"
                    onClick={props.onDismissPanels}
                />
            ) : null}
        </div>
    );
}
