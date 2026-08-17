import type { ReactNode } from "react";

import { ProtectedWorkspace } from "@/features/auth/protected-workspace";

export default function WorkspaceLayout({ children }: Readonly<{ children: ReactNode }>) {
    return <ProtectedWorkspace>{children}</ProtectedWorkspace>;
}
