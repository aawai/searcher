let requested = false;

/** Leaving the expanded conversation for home asks the next home to focus its search box. */
export function requestSearchFocus(): void {
    requested = true;
}

/** True once per request; the home page that mounts next takes it. */
export function consumeSearchFocusRequest(): boolean {
    const wasRequested = requested;
    requested = false;
    return wasRequested;
}
