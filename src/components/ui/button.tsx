import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

// Buttons as on the landing: Oswald, uppercase, spaced letters, small radius, no shadows.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-sm border border-transparent font-display font-medium whitespace-nowrap uppercase transition-opacity select-none hover:opacity-90 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        outline: "border-[1.5px] border-accent text-accent",
        secondary: "bg-secondary text-secondary-foreground",
        ghost: "text-accent hover:bg-muted/40 hover:opacity-100",
        destructive: "bg-destructive text-accent-foreground",
        link: "text-accent underline-offset-4 hover:underline hover:opacity-100",
      },
      size: {
        default: "h-11 px-5 text-button",
        xs: "h-7 px-2.5 text-label [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 px-3.5 text-label [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 px-7 text-button md:h-13",
        icon: "size-11",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
