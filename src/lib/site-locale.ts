import type { Locale } from "@/i18n/core";
import type { Tool, Scenario } from "@/lib/site-data";

/** English overlays for SEO tool pages (zh lives in site-data). */
const TOOL_EN: Record<
  string,
  Partial<Pick<Tool, "name" | "h1" | "title" | "description" | "intro" | "cta" | "body" | "highlight">> & {
    faq?: Tool["faq"];
  }
> = {
  "script-to-video": {
    name: "One-click compose",
    h1: "Script to video — shot control",
    title: "One-click compose | Editable storyboard · MP4 or asset pack",
    description:
      "Turn narration into a vertical talking-head clip: editable storyboard, per-shot art, compose MP4 — or download images + voice for CapCut.",
    intro:
      "Not a black-box lottery. Review the board, fix shots, then compose — or skip the MP4 and export an asset pack for CapCut.",
    cta: "Start compose",
    body: [
      "Paste script, rewrite from a reference, or start from one line. Default 9:16 for short video.",
      "Retry image gen, pull stock, or upload. Voice is per shot; editing copy clears cached audio.",
      "MP4 via FFmpeg stills; asset pack includes images, voice.mp3, captions, storyboard.json.",
    ],
    highlight: [
      "Editable storyboard — not one-and-done",
      "Dual export: MP4 + ZIP assets",
      "Stills talking-head: fast, cheap, controllable",
    ],
    faq: [
      {
        q: "How is this different from CapCut / InVideo one-click?",
        a: "Per-shot control: retry, upload, or stock a single frame. Dislike the cut? Take the asset pack and finish yourself.",
      },
      {
        q: "Is this generative AI video (I2V)?",
        a: "No. Default is stills + TTS + captions via FFmpeg — built for talking-head explainers.",
      },
      {
        q: "Do I need to pay?",
        a: "Demo login with a daily free quota. Paid plans come after launch.",
      },
    ],
  },
  "storyboard-generator": {
    name: "AI storyboard",
    h1: "AI storyboard — every shot editable",
    title: "AI storyboard generator | Script to shot table",
    description:
      "Split a script into an editable board: title, narration, captions, image prompts. Retry, stock, or upload before compose.",
    intro:
      "The board is the control surface. AI proposes shots; you decide what stays, regenerates, or gets replaced.",
    cta: "Generate board",
  },
  "video-export-zip": {
    name: "Asset pack export",
    h1: "Download asset pack — finish in CapCut",
    title: "Video asset pack ZIP | Images + voice + captions",
    description:
      "Export per-shot images, MP3 voice, captions and storyboard.json. When the MP4 is not enough, edit yourself.",
    intro:
      "Second exit from controllable compose: not locked to the platform cut. Open the ZIP in CapCut / Jianying / Premiere.",
    cta: "Download pack",
  },
  "text-to-video": {
    name: "Text to video (controlled)",
    h1: "Text to video — controlled board",
    title: "Text to video AI | Not a black box",
    description:
      "From text to short video with review gates: script, board, art, voice, captions. Vertical/horizontal. MP4 or asset pack.",
    cta: "Start from text",
  },
  "ai-voiceover": {
    name: "AI voiceover",
    h1: "AI voiceover (TTS)",
    title: "AI voiceover | Multi-speaker TTS",
    description: "Text to speech for talking-head clips. Used inside compose or standalone.",
    cta: "Generate voice",
  },
  "subtitle-generator": {
    name: "Subtitles",
    h1: "Subtitle generator",
    title: "AI subtitles | Burn-in or export",
    description: "Captions follow narration. Burn into MP4 or take subtitle.txt in the asset pack.",
    cta: "Generate captions",
  },
  "ai-video-script-writer": {
    name: "AI script writer",
    h1: "AI short-video script writer",
    title: "AI script writer | Topic to narration",
    description: "Turn a topic into ~60–90s spoken narration ready for storyboard and compose.",
    cta: "Write script",
  },
  "image-generator": {
    name: "AI image",
    h1: "AI stills for shots",
    title: "AI image | Short-video stills",
    description: "Prompt to stills for vertical/horizontal boards. Retry a single shot without redoing the whole video.",
    cta: "Generate image",
  },
  "byok-video-tools": {
    name: "Free quota tools",
    h1: "Free quota — try before you pay",
    title: "Free AI video tools | Daily quota · demo login",
    description: "Demo login into the workbench. Daily free quota covers script, board, image, voice, and compose.",
    cta: "Demo login",
  },
};

const SCENARIO_EN: Record<string, Partial<Pick<Scenario, "name" | "h1" | "title" | "description" | "intro" | "cta" | "audience">>> = {
  "client-video-delivery": {
    name: "Client delivery",
    h1: "Client shorts — change one shot",
    title: "Client video delivery | Per-shot edits · asset pack handoff",
    description:
      "For freelancers: reviewable boards, single-shot fixes, MP4 or ZIP delivery — avoid regenerating the whole cut for one note.",
    intro:
      "Clients love changing shot three. Controllable boards let you redo only that shot; if they want to polish, hand over the ZIP.",
    cta: "Start client compose",
    audience: "Freelance editors, agencies, operators",
  },
  "social-ads-video": {
    name: "Social ads",
    h1: "Vertical ad voiceover — test hooks fast",
    title: "Vertical ad video | 9:16 · editable hook shot",
    cta: "Make a vertical ad draft",
  },
  "youtube-script-to-video": {
    name: "Explainer",
    h1: "Talking-head explainer — script to cut",
    cta: "Make an explainer",
  },
  "product-demo-video": {
    name: "Product demo",
    h1: "Product walkthrough — swap in real shots",
    cta: "Make a product demo",
  },
  "video-localization": {
    name: "Re-voice",
    h1: "Change narration — keep frames",
    cta: "Re-voice a cut",
  },
};

export function localizeTool(tool: Tool, locale: Locale): Tool {
  if (locale !== "en") return tool;
  const en = TOOL_EN[tool.slug];
  if (!en) return tool;
  return {
    ...tool,
    ...en,
    body: en.body ?? tool.body,
    highlight: en.highlight ?? tool.highlight,
    faq: en.faq ?? tool.faq,
  };
}

export function localizeScenario(scenario: Scenario, locale: Locale): Scenario {
  if (locale !== "en") return scenario;
  const en = SCENARIO_EN[scenario.slug];
  if (!en) return scenario;
  return { ...scenario, ...en };
}
