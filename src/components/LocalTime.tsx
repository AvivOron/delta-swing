"use client";

export function LocalTime({ iso }: { iso: string }) {
  return (
    <>
      {new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </>
  );
}
