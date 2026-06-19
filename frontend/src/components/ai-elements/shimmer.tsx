"use client";

import { cn } from "@/lib/utils";
import type { MotionProps } from "motion/react";
import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ElementType, JSX } from "react";
import { memo, useMemo } from "react";

type MotionHTMLProps = MotionProps & Record<string, unknown>;

// Cache motion components at module level to avoid creating during render
const motionComponentCache = new Map<
  keyof JSX.IntrinsicElements,
  React.ComponentType<MotionHTMLProps>
>();

const getMotionComponent = (element: keyof JSX.IntrinsicElements) => {
  let component = motionComponentCache.get(element);
  if (!component) {
    component = motion.create(element);
    motionComponentCache.set(element, component);
  }
  return component;
};

export interface TextShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
  style?: CSSProperties;
}

// Color hooks (override per instance via inline CSS vars):
//   --shimmer-color     base text fill        (default: muted-foreground)
//   --shimmer-highlight the moving glint band (default: background)
const BASE = "var(--shimmer-color, var(--color-muted-foreground))";

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
  style,
}: TextShimmerProps) => {
  const MotionComponent = getMotionComponent(
    Component as keyof JSX.IntrinsicElements
  );
  const reduced = useReducedMotion();

  const dynamicSpread = useMemo(
    () => (children?.length ?? 0) * spread,
    [children, spread]
  );

  // Reduced motion: hold the base fill steady, no sweep.
  if (reduced) {
    const Static = Component as ElementType;
    return (
      <Static
        className={cn("relative inline-block", className)}
        style={{ color: BASE, ...style }}
      >
        {children}
      </Static>
    );
  }

  return (
    <MotionComponent
      animate={{ backgroundPosition: "0% center" }}
      className={cn(
        "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--shimmer-highlight,var(--color-background)),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
        className
      )}
      initial={{ backgroundPosition: "100% center" }}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          backgroundImage: `var(--bg), linear-gradient(${BASE}, ${BASE})`,
          ...style,
        } as CSSProperties
      }
      transition={{
        duration,
        ease: "linear",
        repeat: Number.POSITIVE_INFINITY,
      }}
    >
      {children}
    </MotionComponent>
  );
};

export const Shimmer = memo(ShimmerComponent);
