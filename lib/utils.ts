type CryptoLike = {
  randomUUID?: () => string;
};

export function createUuid(): string {
  const cryptoRef =
    typeof globalThis !== "undefined"
      ? (globalThis as { crypto?: CryptoLike }).crypto
      : undefined;

  if (cryptoRef?.randomUUID) {
    return cryptoRef.randomUUID();
  }

  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, (char) => {
    const rand = Math.random() * 16;
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return Math.floor(value).toString(16);
  });
}

export function formatSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? Math.floor(seconds) : 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remain = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

export function secondsToParts(seconds: number): { minutes: number; seconds: number } {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? Math.floor(seconds) : 0);
  return {
    minutes: Math.floor(safeSeconds / 60),
    seconds: safeSeconds % 60,
  };
}
