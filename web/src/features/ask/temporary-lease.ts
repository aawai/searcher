import { api, ApiError } from "../../lib/api.ts";

export interface TemporaryLease {
    id: string;
    expiresAt: number;
}

/** Owns at most one conversation lease; late acquisitions are released, never adopted. */
export class TemporaryLeaseOwner {
    private epoch = 0;
    private forgotten = new Set<number>();
    private current: { conversationId: string; lease: TemporaryLease } | null =
        null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private pending: string | null = null;

    constructor(private readonly warn: (message: string) => void) {}

    private path(id: string) {
        return `/api/ai/conversations/${encodeURIComponent(id)}/temporary`;
    }

    private releaseLease(conversationId: string, lease: TemporaryLease) {
        try {
            void fetch(this.path(conversationId), {
                method: "DELETE",
                headers: { "X-Searcher-Temporary-Lease": lease.id },
                credentials: "same-origin",
                keepalive: true,
            }).catch(() => {});
        } catch { /* The server expiry is the fallback. */ }
    }
    discard(conversationId: string, lease: TemporaryLease) {
        this.releaseLease(conversationId, lease);
    }

    forget() {
        if (this.pending) this.forgotten.add(this.epoch);
        this.epoch++;
        this.pending = null;
        clearTimeout(this.timer ?? undefined);
        this.timer = null;
        this.current = null;
    }

    release() {
        this.epoch++;
        this.pending = null;
        clearTimeout(this.timer ?? undefined);
        this.timer = null;
        const current = this.current;
        this.current = null;
        if (current) this.releaseLease(current.conversationId, current.lease);
    }

    owns(id: string) {
        return this.current?.conversationId === id || this.pending === id;
    }

    async acquire(id: string, initial?: TemporaryLease) {
        if (this.owns(id)) return;
        this.release();
        const epoch = this.epoch;
        this.pending = id;
        // An initial lease is already server-side even if its claim request fails.
        if (initial) this.current = { conversationId: id, lease: initial };
        try {
            const lease = await api<TemporaryLease>(
                this.path(id) + "/leases" +
                    (initial ? `/${encodeURIComponent(initial.id)}` : ""),
                { method: initial ? "PUT" : "POST" },
            );
            if (epoch !== this.epoch) {
                if (!this.forgotten.delete(epoch)) this.releaseLease(id, lease);
                return;
            }
            this.pending = null;
            this.current = { conversationId: id, lease };
            this.schedule();
        } catch (error) {
            if (epoch !== this.epoch) {
                this.forgotten.delete(epoch);
                return;
            }
            this.pending = null;
            if (
                !(error instanceof ApiError && error.code >= 400 &&
                    error.code < 500)
            ) {
                this.warn(
                    "临时会话租约暂时无法取得，请检查网络；过期后内容可能丢失，请及时复制。",
                );
                if (initial) {
                    this.schedule(15000);
                } else {
                    this.pending = id;
                    this.timer = setTimeout(() => {
                        if (epoch !== this.epoch) return;
                        this.pending = null;
                        void this.acquire(id);
                    }, 15000);
                }
            } else {
                this.current = null;
                this.warn(
                    "临时会话已过期或无法取得租约，请复制当前仍显示的内容。",
                );
            }
        }
    }

    private schedule(delay = 5 * 60 * 1000) {
        clearTimeout(this.timer ?? undefined);
        this.timer = setTimeout(() => void this.renew(), delay);
    }

    private async renew() {
        const current = this.current;
        if (!current) return;
        const epoch = this.epoch;
        if (Date.now() >= current.lease.expiresAt) {
            this.warn("临时会话租约可能已过期，请复制当前仍显示的内容。");
        }
        try {
            const lease = await api<TemporaryLease>(
                this.path(current.conversationId) +
                    `/leases/${encodeURIComponent(current.lease.id)}`,
                { method: "PUT" },
            );
            if (epoch !== this.epoch) return;
            this.current = { conversationId: current.conversationId, lease };
            this.schedule();
        } catch (error) {
            if (epoch !== this.epoch) return;
            if (
                error instanceof ApiError && error.code >= 400 &&
                error.code < 500
            ) {
                this.current = null;
                this.warn("临时会话已过期或无法恢复，请复制当前仍显示的内容。");
                return;
            }
            this.warn(
                "临时会话租约暂时无法续期，请检查网络；过期后内容可能丢失，请及时复制。",
            );
            this.schedule(15000);
        }
    }
}
