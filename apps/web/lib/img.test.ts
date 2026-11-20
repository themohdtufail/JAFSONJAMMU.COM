import { describe, expect, it } from "vitest";
import { pick, pictures, placeholder, sized, srcsetOf } from "./img";

const u = "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=1600&h=900";
describe("image helpers", () => {
  it("asks Unsplash for the width needed, as WebP, at lower quality", () => { const s = new URL(sized(u, 480)); expect(s.searchParams.get("w")).toBe("480"); expect(s.searchParams.get("q")).toBe("70"); expect(s.searchParams.get("auto")).toBe("format"); expect(s.searchParams.has("h")).toBe(false); expect(s.pathname).toBe("/photo-1507679799987-c73779587ccf"); });
  it("leaves other addresses alone", () => { expect(sized("https://cdn.example.com/a.jpg?x=1", 480)).toBe("https://cdn.example.com/a.jpg?x=1"); expect(sized("/api/v1/media/abc/960.webp", 480)).toBe("/api/v1/media/abc/960.webp"); });
  it("uses the stored sizes of an uploaded picture: smallest that is wide enough, else the largest", () => {
    const m = { src: "x/960.webp", srcset: [{ w: 320, url: "x/320.webp" }, { w: 640, url: "x/640.webp" }, { w: 960, url: "x/960.webp" }] };
    expect(pick(m, 300)).toBe("x/320.webp"); expect(pick(m, 640)).toBe("x/640.webp"); expect(pick(m, 700)).toBe("x/960.webp"); expect(pick(m, 4000)).toBe("x/960.webp"); expect(srcsetOf(m)).toBe("x/320.webp 320w, x/640.webp 640w, x/960.webp 960w");
  });
  it("builds a srcset for Unsplash pictures, and none for a plain address", () => { expect(srcsetOf({ src: u })!.split(", ")).toHaveLength(5); expect(srcsetOf({ src: "https://cdn.example.com/a.jpg" })).toBeUndefined(); });
  it("paints a blurred preview if there is one, else the colour", () => { expect(placeholder({ blur: "data:image/webp;base64,AAA", color: "#123456" })).toEqual({ backgroundColor: "#123456", backgroundImage: "url(data:image/webp;base64,AAA)" }); expect(placeholder({ blur: null, color: null }).backgroundColor).toBeTruthy(); });
  it("lists pictures only, falling back to older image lists", () => {
    const vid = { kind: "VIDEO" as const, alt: "", src: "v.mp4", srcset: [], width: null, height: null, blur: null, color: null, poster: null };
    expect(pictures({ name: "P", images: ["a.jpg", "b.jpg"], media: [vid] }).map((x) => x.src)).toEqual(["a.jpg", "b.jpg"]); expect(pictures({ name: "P", images: [], media: [{ ...vid, kind: "IMAGE" as const, src: "i.jpg" }, vid] }).map((x) => x.src)).toEqual(["i.jpg"]);
  });
});
