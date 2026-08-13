import { cn } from "@/lib/utils";

/**
 * The confidence percentage, shown on every match without exception.
 *
 * The colors are semantic and defined once in globals.css — green/amber/red
 * must mean the same thing everywhere confidence appears in the product.
 */
export function ConfidencePill({
  confidence,
  bucket,
  className,
}: {
  confidence: number;
  bucket: "high" | "medium" | "low";
  className?: string;
}) {
  const label = `${Math.round(confidence * 100)}%`;

  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-medium tabular-nums",
        bucket === "high" && "bg-confidence-high/15 text-confidence-high",
        bucket === "medium" && "bg-confidence-medium/15 text-confidence-medium",
        bucket === "low" && "bg-confidence-low/15 text-confidence-low",
        className,
      )}
      title={
        bucket === "high"
          ? "Confident this is the right track"
          : bucket === "medium"
            ? "Probably right — worth a glance"
            : "Low confidence — off by default, check before including"
      }
    >
      {label}
    </span>
  );
}
