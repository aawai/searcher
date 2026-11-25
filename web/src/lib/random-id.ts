/**
 * Generates an RFC 4122 v4 UUID, falling back to `crypto.getRandomValues`
 * when `crypto.randomUUID` is unavailable (such as non-secure HTTP LAN origins).
 */
export function createRandomId(
    cryptoImpl: Pick<Crypto, "getRandomValues"> & {
        randomUUID?: () => string;
    } = globalThis.crypto,
): string {
    if (typeof cryptoImpl.randomUUID === "function") {
        return cryptoImpl.randomUUID();
    }
    const bytes = new Uint8Array(16);
    cryptoImpl.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, "0");
    }
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${
        hex.slice(16, 20)
    }-${hex.slice(20)}`;
}
