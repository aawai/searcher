/**
 * What another page asks the home page to open on arrival: 览 itself or 览
 * with the notes detail. Carried in the router state of a home navigation.
 */
export type DeskRequest = "overview" | "notes";

export function deskRequestState(request: DeskRequest): { desk: DeskRequest } {
    return { desk: request };
}

export function readDeskRequest(state: unknown): DeskRequest | null {
    if (!state || typeof state !== "object" || !("desk" in state)) return null;
    return state.desk === "overview" || state.desk === "notes"
        ? state.desk
        : null;
}
