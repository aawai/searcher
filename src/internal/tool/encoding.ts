/**
 * ArrayBuffer转 Hex(16进制)字符串
 * @param {ArrayBuffer} buf
 * @returns
 */
export function bufferToHex(buf: Uint8Array | ArrayBuffer): string {
    buf = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Hex转Uint8Array
 * @param {String} hex
 * @returns
 */
export function hexToBuffer(hex: string): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}
