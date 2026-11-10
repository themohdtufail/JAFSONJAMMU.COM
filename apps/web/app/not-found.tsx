import Link from "next/link";
export default function NotFound() {
  return <section className="banner"><p className="eyebrow">404</p><h1>Page not found</h1><p>The page you're looking for has moved or never existed.</p><Link className="btn" href="/">Back to home</Link></section>;
}
