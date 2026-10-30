import * as React from "react";
import { cn } from "@/lib/utils";

// Same cream field as Input, growing with its text.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-sm border-2 border-transparent bg-input px-3.5 py-2.5 text-field text-popover-foreground transition-colors placeholder:text-muted-light/75 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-primary md:px-4.5 md:py-3",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
