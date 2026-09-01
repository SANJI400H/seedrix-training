import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-sm font-bold transition-all duration-300 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-seedrix-green text-seedrix-white hover:bg-seedrix-dark-green",
        secondary:
          "bg-seedrix-dark-green text-seedrix-white hover:bg-seedrix-darkest",
        outline:
          "border border-seedrix-green text-seedrix-green hover:bg-seedrix-green hover:text-seedrix-white",
        ghost: "text-seedrix-white hover:text-seedrix-mint",
        link: "text-seedrix-green underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 px-3",
        lg: "h-12 px-6 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "primary",
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
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
