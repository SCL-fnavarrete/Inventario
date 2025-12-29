"use client";

import { type HTMLAttributes } from "react";

type SkeletonVariant = "text" | "circle" | "rect" | "card";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  lines?: number;
  animate?: boolean;
}

const baseStyles = `
  bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200
  bg-[length:200%_100%]
  rounded
`;

const animationStyles = `
  animate-[shimmer_1.5s_ease-in-out_infinite]
  motion-reduce:animate-none
  motion-reduce:bg-gray-200
`;

export function Skeleton({
  variant = "text",
  width,
  height,
  lines = 1,
  animate = true,
  className = "",
  style,
  ...props
}: SkeletonProps) {
  const getVariantStyles = (): string => {
    switch (variant) {
      case "circle":
        return "rounded-full aspect-square";
      case "rect":
        return "rounded-lg";
      case "card":
        return "rounded-xl";
      case "text":
      default:
        return "rounded h-4";
    }
  };

  const getDimensions = () => {
    const dims: React.CSSProperties = { ...style };

    if (width) {
      dims.width = typeof width === "number" ? `${width}px` : width;
    }
    if (height) {
      dims.height = typeof height === "number" ? `${height}px` : height;
    }

    // Defaults by variant
    if (!width && !height) {
      switch (variant) {
        case "circle":
          dims.width = "40px";
          dims.height = "40px";
          break;
        case "rect":
          dims.width = "100%";
          dims.height = "100px";
          break;
        case "card":
          dims.width = "100%";
          dims.height = "200px";
          break;
        case "text":
        default:
          dims.width = "100%";
          dims.height = "16px";
          break;
      }
    }

    return dims;
  };

  // For multi-line text
  if (variant === "text" && lines > 1) {
    return (
      <div className={`space-y-2 ${className}`} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`
              ${baseStyles}
              ${animate ? animationStyles : "bg-gray-200"}
              ${getVariantStyles()}
            `}
            style={{
              ...getDimensions(),
              // Last line is shorter
              width: i === lines - 1 ? "75%" : "100%",
              animationDelay: `${i * 100}ms`,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`
        ${baseStyles}
        ${animate ? animationStyles : "bg-gray-200"}
        ${getVariantStyles()}
        ${className}
      `}
      style={getDimensions()}
      {...props}
    />
  );
}

// Componentes especializados para casos comunes

export function SkeletonText({
  lines = 3,
  ...props
}: Omit<SkeletonProps, "variant" | "lines"> & { lines?: number }) {
  return <Skeleton variant="text" lines={lines} {...props} />;
}

export function SkeletonAvatar({
  size = 40,
  ...props
}: Omit<SkeletonProps, "variant"> & { size?: number }) {
  return <Skeleton variant="circle" width={size} height={size} {...props} />;
}

export function SkeletonCard(props: Omit<SkeletonProps, "variant">) {
  return <Skeleton variant="card" {...props} />;
}

// Skeleton para filas de tabla
export function SkeletonTableRow({
  columns = 5,
  ...props
}: HTMLAttributes<HTMLDivElement> & { columns?: number }) {
  return (
    <div className={`flex items-center gap-4 py-3 ${props.className || ""}`}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === 0 ? "60%" : "80%"}
          className="flex-1"
          style={{ animationDelay: `${i * 50}ms` }}
        />
      ))}
    </div>
  );
}

// Skeleton para tabla completa
export function SkeletonTable({
  rows = 5,
  columns = 5,
  ...props
}: HTMLAttributes<HTMLDivElement> & { rows?: number; columns?: number }) {
  return (
    <div className={`divide-y divide-gray-100 ${props.className || ""}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow
          key={i}
          columns={columns}
          style={{ animationDelay: `${i * 100}ms` }}
        />
      ))}
    </div>
  );
}

export default Skeleton;
