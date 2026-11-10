"use client";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <section className="banner"><div className="wrap">
      <p className="eyebrow">Something went wrong</p><h1>We couldn't load this page</h1>
      <p className="lede">This is on our side. Try again, and if it keeps happening call us on +91 7006158072.</p>
      <button className="btn" onClick={reset}>Try again</button>
    </div></section>
  );
}
