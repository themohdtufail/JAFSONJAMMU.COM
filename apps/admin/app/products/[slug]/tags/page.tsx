"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { adm, inr } from "@/lib/api";
import { Barcode } from "@/components/Barcode";
import { useLoad } from "@/components/Shell";

interface Tag { name: string; brand: string; fabric: string; fit: string; variants: { sku: string; colour: string; size: string; pricePaise: number; mrpPaise: number }[] }

/** Hang tags to the brand kit: 55 x 90 mm. Front is the white logo on charcoal with no pattern; back carries brand, product, size, colour, MRP, price, barcode and "Jafson Jammu" at 7pt. */
export default function Tags() {
  const { slug } = useParams<{ slug: string }>(); const { data, err } = useLoad(() => adm<Tag>(`/admin/products/${slug}/tags`), [slug]);
  const [copies, setCopies] = useState<Record<string, number>>({}); const [off, setOff] = useState<Record<string, boolean>>({});
  const list = useMemo(() => (data?.variants ?? []).filter((v) => !off[v.sku]).flatMap((v) => Array.from({ length: copies[v.sku] ?? 1 }, (_, i) => ({ ...v, key: `${v.sku}-${i}` }))), [data, copies, off]);
  if (err) return <p style={{ padding: 40 }}>{err}</p>; if (!data) return <p style={{ padding: 40 }}>Loading…</p>;
  return (
    <div className="tagpage">
      <div className="noprint tag-ui">
        <div className="phead"><div><h1>Hang tags</h1><p>{data.name} · 55 × 90 mm on 350 gsm board. {list.length} {list.length === 1 ? "tag" : "tags"} ({list.length * 2} printed sides, front then back for each).</p></div>
          <div className="pact"><Link className="btn sec" href="/products">Back to products</Link><button className="btn" disabled={!list.length} onClick={() => window.print()}>Print</button></div></div>
        <p className="err-box" style={{ marginTop: 0 }}>Before printing: these tags don't include the declarations that labelling rules for garments require (such as manufacturer or packer name and address, country of origin, month and year of manufacture, and net quantity). Confirm what you must show and add it to the artwork. Print a proof first and check the barcode scans.</p>
        <div className="tbl" style={{ margin: "16px 0" }}><table><thead><tr><th>Print</th><th>SKU</th><th>Colour · size</th><th className="num">MRP</th><th className="num">Price</th><th className="num">Copies</th></tr></thead><tbody>
          {data.variants.map((v) => <tr key={v.sku}><td><input type="checkbox" aria-label={`Print ${v.sku}`} checked={!off[v.sku]} onChange={(e) => setOff({ ...off, [v.sku]: !e.target.checked })} /></td><td><b>{v.sku}</b></td><td>{v.colour} · {v.size}</td><td className="num">{inr(v.mrpPaise)}</td><td className="num">{inr(v.pricePaise)}</td>
            <td className="num"><input className="in" style={{ width: 80 }} type="number" min={1} max={500} aria-label={`Copies of ${v.sku}`} value={copies[v.sku] ?? 1} onChange={(e) => setCopies({ ...copies, [v.sku]: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })} /></td></tr>)}</tbody></table></div>
        <h2 style={{ font: "600 12px var(--sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--mute)", margin: "24px 0 12px" }}>Preview</h2>
      </div>
      <div className="tag-sheet">{list.slice(0, 200).map((v) => (
        <div className="tag-pair" key={v.key}>
          <div className="tag front"><span className="hole" /><img src="/brand/mark-white.png" alt="" className="m" /><img src="/brand/wordmark-white.png" alt="Jafson" className="w" /></div>
          <div className="tag back"><span className="hole" />
            <span className="brandname">{data.brand}</span><b className="nm">{data.name}</b><span className="at">Size {v.size} · Colour {v.colour}</span>
            <div className="pr">{v.mrpPaise > v.pricePaise && <s>MRP {inr(v.mrpPaise)}</s>}{v.mrpPaise === v.pricePaise && <span className="mrp">MRP incl. all taxes</span>}<div className="sell">{inr(v.pricePaise)}</div><Barcode value={v.sku} /><span className="sku">{v.sku}</span><span className="jj">Jafson Jammu</span></div></div>
        </div>))}</div>
      {list.length > 200 && <p className="noprint hint">Showing the first 200 tags in the preview. All {list.length} will print.</p>}
    </div>
  );
}
