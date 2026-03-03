import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97] active:transition-transform active:duration-100 relative overflow-hidden select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20 active:shadow-none",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-md hover:shadow-destructive/20 active:shadow-none",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground hover:border-accent-foreground/20 hover:shadow-sm",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:shadow-sm",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        // Create ripple effect
        if (!asChild) {
          const button = e.currentTarget;
          const ripple = document.createElement("span");
          const rect = button.getBoundingClientRect();
          const diameter = Math.max(rect.width, rect.height);
          const x = e.clientX - rect.left - diameter / 2;
          const y = e.clientY - rect.top - diameter / 2;

          ripple.style.cssText = `
            position: absolute;
            width: ${diameter}px;
            height: ${diameter}px;
            left: ${x}px;
            top: ${y}px;
            border-radius: 50%;
            background: currentColor;
            opacity: 0.15;
            pointer-events: none;
            animation: ripple 0.5s ease-out forwards;
          `;

          button.appendChild(ripple);
          setTimeout(() => ripple.remove(), 500);
        }

        onClick?.(e);
      },
      [onClick, asChild],
    );

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
