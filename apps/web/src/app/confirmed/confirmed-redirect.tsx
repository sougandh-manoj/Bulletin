"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function ConfirmedRedirect() {
  const router = useRouter();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      router.replace("/");
    }, 3_000);

    return () => window.clearTimeout(timeout);
  }, [router]);

  return null;
}
