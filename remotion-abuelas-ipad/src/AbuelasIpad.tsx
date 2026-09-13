// ═══ RETIRED — legacy record only (Decision D19, 2026-09-10; ops/decision-log.md) ═══
// Do NOT render, develop, publish, or market this composition.
// Why: (1) it pitches the RETIRED $9 Starter Kit + STARTER15 coupon — old-model
//      resurrection, forbidden by pivot confinement;
//      (2) Pixar-style 3D / cartoon / CGI visuals — banned by the Realistic Social
//      Visual Standard;
//      (3) diaspora-home-cook / bilingual-cookbook framing — off-pivot.
// Superseded by the food-business-branding reel work in ../video-ads/.
// The file is kept as a historical record; build output is untracked.
// ════════════════════════════════════════════════════════════════════════════════════

import { Composition } from "remotion";

// "Abuela's iPad" — 3D Reel storyboard from marketing/general/video-concepts.md
// Format: 9:16 vertical · 15 sec · 30 fps · 3D character + floating ingredients
// Character: Pixar-style young PR female home cook, bandana + PR-flag apron
// Key props: glowing iPad (bilingual cookbook), glass sofrito jar, floating ingredients,
// yellow CTA button, plate of arroz con pollo
// Source storyboard: video-concepts.md lines 123-186 (Reference 8c + Companion 5) — RETIRED

export const AbuelasIpadComp = () => {
  return (
    <Composition
      id="AbuelasIpad"
      component={AbuelasIpadComponent}
      durationInFrames={450}     // 15 sec @ 30fps
      fps={30}
      width={1080}               // 9:16 vertical (IG Reels / TikTok / Shorts)
      height={1920}
      defaultProps={{}}
    />
  );
};

  // INCORPORATED SITE ASSETS (Desktop\SiteImages — copied 2026-08-30 into public/assets/):
  // - abuela's.jpg (714KB — original kitchen hero, human-story reference per hero-video-spec.md)
  // - chatgpt-hero-20260826.png (1230KB — AI food scene, same as hero-mesa.webp, poster/LCP reference)
  // - logo-badge-1024.png (161KB — brand mark, same style as deploy/images/logo-badge.svg)
  // Access in component: <Img src="reference.jpg" /> / <Img src="hero-mesa.webp" /> / <Img src="assets/logo-badge-1024.png" />
  // Reference image (multi-device mockup): C:\Users\josho\Downloads\watermarked_img_3081925967957743166.jpg — STILL MISSING

  // Scene mapping from video-concepts.md storyboard (reference 8c):
// 0:00-0:03 (0-90f)  Frame 1: Character taps glowing iPad → "Missing Abuela's Flavors?"
// 0:03-0:07 (90-210f) Frame 2: Fresh ingredients swirl into jar → "100% Mainland-Friendly Swaps!"
// 0:07-0:12 (210-360f) Frame 3: iPad shows bilingual cookbook + meal planner → "Bilingual Recipes (EN/ES)"
// 0:12-0:15 (360-450f) Frame 4: Character points to yellow button, plate of arroz con pollo → "GET THE $9 STARTER KIT"
const SCENES = [
  { label: "Frame 1 — Tap iPad", start: 0,  end: 90,  text: "Missing Abuela's Flavors?", sub: "Craving authentic boricua flavor on the mainland?" },
  { label: "Frame 2 — Ingredient Swirl", start: 90, end: 210, text: "100% Mainland-Friendly Swaps!", sub: "Get exact supermarket swaps for recao and ají dulce." },
  { label: "Frame 3 — Bilingual iPad", start: 210, end: 360, text: "Bilingual Recipes (EN / ES)", sub: "Instant digital access to 30 tested family recipes in English and Spanish." },
  { label: "Frame 4 — Yellow CTA", start: 360, end: 450, text: "GET THE $9 STARTER KIT", sub: "Tap below to get your $9 Starter Kit tonight!" },
];

export const AbuelasIpadComponent: React.FC = () => {
  return (
    <div style={{ flex: 1, backgroundColor: "#2B2118", fontFamily: "Fraunces, Georgia, serif", color: "#FFFDF8", width: 1080, height: 1920 }}>
      {/* Note: This is a component scaffold for the 3D Reel. The actual 3D assets (Pixar-style
         character model, hyper-real floating ingredients, glowing iPad, yellow CTA button,
         plate of arroz con pollo) must be produced externally (Midjourney/Runway/Sora/Remotion 3D)
         using the generation prompt below, then composited into this layout via Remotion's
         <AbsoluteFill>, <Sequence>, and <Img> / <Video> components. */}

      {/* Storyboard overlay — shows scene timing for production reference */}
      {SCENES.map((s, i) => (
        <div key={i} style={{ position: "absolute", bottom: 24 + i * 56, left: 24, right: 24,
          background: "rgba(43,33,24,0.85)", borderRadius: 12, padding: 12, fontSize: 16,
          borderLeft: "4px solid #C03D2A", color: "#FAF6EE" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#9A7318" }}>{s.label}</div>
          <div style={{ fontWeight: 700 }}>{s.text}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{s.sub}</div>
          <div style={{ fontSize: 10, opacity: 0.5 }}>{`${s.start}f — ${s.end}f`}</div>
        </div>
      ))}

      {/* STARTER15 Coupon Reference — integrated with Gumroad webhook pipeline -->
      <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(234,88,12,0.9)", color: "#fff", padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "Inter, sans-serif" }}>
        USE CODE: STARTER15
      </div>

      {/* Production prompt reference (rendered as on-screen text for review) */}
      <div style={{ position: "absolute", top: 24, left: 24, right: 24,
        background: "rgba(43,33,24,0.95)", borderRadius: 16, padding: 20,
        borderLeft: "6px solid #C03D2A", maxWidth: 1000 }}>
        <h2 style={{ fontSize: 28, marginBottom: 8, color: "#FAF6EE" }}>
          3D Reel Production Prompt — "Abuela's iPad"
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: "#F2EAD9", opacity: 0.9 }}>
          Pixar-style 3D Boricua home cook (bandana + PR-flag apron), warm smile, at kitchen counter tapping
          glowing iPad. Hyper-real 3D ingredients (culantro/recao leaves, garlic heads, red & green ají dulce,
          yellow onions) swirl into glass jar of emerald sofrito (liquid simulation). iPad shows bilingual
          EN/ES recipe card. Yellow "GET THE $9 STARTER KIT" CTA button. Bright studio lighting, warm wooden tones,
          macro DOF, cinematic color grade, 9:16 vertical, 60fps. Reference: video-concepts.md line 136-186.
        </p>
      </div>
    </div>
  );
};
