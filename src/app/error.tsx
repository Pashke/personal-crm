"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Page failed to render", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-5 py-12 text-center md:gap-6">
      <h1 className="font-display text-title font-bold text-balance uppercase">Не удалось загрузить данные</h1>
      <p className="max-w-xl text-pretty text-muted-foreground">
        Скорее всего, не запущена база данных. Запустите Docker Desktop и попробуйте ещё раз.
      </p>
      <Button onClick={() => retry()}>Попробовать снова</Button>
    </div>
  );
}
