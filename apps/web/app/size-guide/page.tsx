"use client";
import { useState } from "react";
const men = { head: ["Size", "Chest", "Waist", "Shoulder", "Length"], rows: [["S", 92, 78, 43, 68], ["M", 98, 84, 45, 70], ["L", 104, 90, 47, 72], ["XL", 110, 96, 49, 74], ["XXL", 116, 102, 51, 76]] };
const kids = { head: ["Size", "Age", "Height", "Chest", "Waist"], rows: [["2-3Y", "2–3 yrs", 98, 54, 52], ["4-5Y", "4–5 yrs", 110, 58, 54], ["6-7Y", "6–7 yrs", 122, 63, 56], ["8-9Y", "8–9 yrs", 134, 68, 59], ["10-11Y", "10–11 yrs", 146, 74, 62]] };
export default function SizeGuide() {
  const [t, setT] = useState<"men" | "kids">("men"); const [u, setU] = useState<"cm" | "in">("cm");
  const d = t === "men" ? men : kids; const cv = (v: string | number, ci: number) => (typeof v === "number" && !(t === "kids" && ci === 1) ? (u === "in" ? (v / 2.54).toFixed(1) : v) : v);
  return (<><section className="banner"><h1>Size guide</h1><p>Body measurements. Between sizes? Size up for a relaxed fit.</p></section>
    <div className="prose wide">
      <div className="chips center"><button className={t === "men" ? "on" : ""} onClick={() => setT("men")}>Men</button><button className={t === "kids" ? "on" : ""} onClick={() => setT("kids")}>Kids</button>
        <span className="gap" /><button className={u === "cm" ? "on" : ""} onClick={() => setU("cm")}>cm</button><button className={u === "in" ? "on" : ""} onClick={() => setU("in")}>in</button></div>
      <div className="tbl"><table><thead><tr>{d.head.map((h) => <th key={h}>{h}{["Size", "Age"].includes(h) ? "" : ` (${u})`}</th>)}</tr></thead>
        <tbody>{d.rows.map((r) => <tr key={r[0]}>{r.map((v, i) => <td key={i}>{cv(v, i)}</td>)}</tr>)}</tbody></table></div>
      <h2>How to measure</h2>
      <ol><li><b>Chest:</b> around the fullest part, arms relaxed.</li><li><b>Waist:</b> around your natural waistline.</li><li><b>Shoulder:</b> across the back, shoulder point to shoulder point.</li>{t === "kids" && <li><b>Height:</b> standing straight, without shoes.</li>}</ol>
    </div></>);
}
