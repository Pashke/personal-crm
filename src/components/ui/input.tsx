import * as React from "react";
import { cn } from "@/lib/utils";

// A cream field on the forest background, like the search example on the landing.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11.5 w-full min-w-0 rounded-sm border-2 border-transparent bg-input px-3.5 text-field text-popover-foreground transition-colors placeholder:text-muted-light/75 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-primary md:h-13.5 md:px-4.5",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
