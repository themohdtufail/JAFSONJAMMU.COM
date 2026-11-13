"use client";
import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";

/** Scannable Code 128 barcode of the SKU, drawn in ink on white (brand kit: hang tag back). */
export function Barcode({ value, height = 28 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => { if (ref.current) JsBarcode(ref.current, value, { format: "CODE128", displayValue: false, height, margin: 0, width: 1.4, lineColor: "#1b1b1d", background: "#ffffff" }); }, [value, height]);
  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} className="barcode" />;
}
