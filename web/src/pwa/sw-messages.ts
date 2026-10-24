/** Messages a page sends to a service worker. */
export type ServiceWorkerMessage =
    /** Let a waiting worker take over now. */
    | { type: "activate" }
    /** Ask which build a worker caches; answered on the transferred port. */
    | { type: "build" };

export interface ServiceWorkerReply {
    version: string;
    shellAssets: readonly string[];
}
