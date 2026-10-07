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
    <div className="space-y-4 py-12 text-center">
      <h1 className="font-heading text-2xl font-semibold">Не удалось загрузить данные</h1>
      <p className="text-muted-foreground">
        Скорее всего, не запущена база данных. Запустите Docker Desktop и попробуйте ещё раз.
      </p>
      <Button onClick={() => retry()}>Попробовать снова</Button>
    </div>
  );
}
