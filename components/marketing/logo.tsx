import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoProps = {
  variant: "white" | "black";
  className?: string;
  priority?: boolean;
};

export function Logo({ variant, className, priority }: LogoProps) {
  const src =
    variant === "white"
      ? "/brand/seedrix_logo_white.png"
      : "/brand/seedrix_logo_black.png";

  return (
    <Image
      src={src}
      alt="Seedrix"
      width={220}
      height={58}
      priority={priority}
      className={cn("h-9 w-auto sm:h-10", className)}
    />
  );
}
