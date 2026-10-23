import { useOutletContext } from "react-router-dom";
import type { AiModelDto } from "../../../src/features/ai/types.ts";

/** What Layout shares with the page rendered in its Outlet. */
export interface AppOutletContext {
    /** Models the signed-in user can ask; empty means no AI entry point anywhere. */
    aiModels: AiModelDto[];
}

export function useAppOutletContext(): AppOutletContext {
    return useOutletContext<AppOutletContext>();
}
