// Shared, build-time data for the SEO page matrix (Stage 3).
//
// Everything here is deterministic so /tools, /scenarios and the
// programmatic [verb]-[content-type] pages can be statically generated with
// generateStaticParams. Content is written to match the real 9-step pipeline
// (PRD §4.2) — honest capability descriptions, no absolute-efficacy claims
// (R4) and no third-party brand endorsement (R2).

// Domain is TBD by the owner (PRD §1); the env override is for production.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://aivideostudio.app";

// ---------------------------------------------------------------------------
// The 9-step pipeline (PRD §4.2) — used by HowTo JSON-LD and page copy.
// ---------------------------------------------------------------------------

export type Step = {
  n: number;
  name: string;
  detail: string;
};

export const PIPELINE_STEPS: Step[] = [
  {
    n: 1,
    name: "Analyze your topic",
    detail:
      "Paste a draft, drop a URL, or pick a free topic. The pipeline normalizes it into a brief with theme, key points, target duration and audience.",
  },
  {
    n: 2,
    name: "Write the script",
    detail:
      "Generate a paragraph-by-paragraph video script with your chosen tone and length.",
  },
  {
    n: 3,
    name: "Generate the storyboard",
    detail:
      "A shot table is created from the script — each shot with sequence, duration, visual description, on-screen text and an image prompt.",
  },
  {
    n: 4,
    name: "Create each shot",
    detail:
      "Every storyboard row becomes an image you can regenerate or replace, in formats such as 16:9, 9:16 and 1:1.",
  },
  {
    n: 5,
    name: "Generate the voiceover",
    detail:
      "Text-to-speech voiceover is generated per shot. No voice cloning — plain TTS voices only.",
  },
  {
    n: 6,
    name: "Build subtitles",
    detail:
      "An SRT subtitle file is generated and aligned to the voiceover timeline.",
  },
  {
    n: 7,
    name: "Compose the video",
    detail:
      "Shots, voiceover, subtitles and transitions are composed into a final MP4 (static composition by default).",
  },
  {
    n: 8,
    name: "Export in open formats",
    detail:
      "A single zip is produced: MP4, storyboard JSON, shot assets, voiceover audio, SRT subtitles and a script file — importable into any editor that reads MP4 + SRT.",
  },
  {
    n: 9,
    name: "Review and iterate",
    detail:
      "Rerun any single step with new input and keep a versioned deliverable — change one shot and only that shot regenerates.",
  },
];

// ---------------------------------------------------------------------------
// Tools (PRD §6.2) — 8 standalone pages under /tools/[slug]
// ---------------------------------------------------------------------------

export type Tool = {
  slug: string;
  name: string;
  h1: string;
  title: string;
  description: string;
  keyword: string;
  cta: string;
  intro: string;
  body: string[];
  steps: number[]; // which pipeline steps this tool maps to
  related: string[]; // slugs of related tools
  highlight: string[]; // bullet features
};

export const TOOLS: Tool[] = [
  {
    slug: "storyboard-generator",
    name: "AI Storyboard Generator",
    h1: "AI Storyboard Generator",
    title: "AI Storyboard Generator — Turn a Script into a Shot Table",
    description:
      "Generate a shot-by-shot storyboard from your script or topic. Every shot has a duration, visual description and image prompt you can edit before generating.",
    keyword: "ai storyboard generator",
    cta: "Create a storyboard",
    intro:
      "A storyboard keeps a video from drifting. AI Video Studio reads your script and produces a shot table — each row lists the sequence number, duration, visual description, on-screen text and the image prompt that will be used later. You can edit any row and only that shot regenerates.",
    body: [
      "Start with a script you already wrote, a pasted draft, a URL, or just a topic. The storyboard generator structures it into scenes so your visuals, voiceover and captions stay in sync.",
      "Every shot row is editable before anything is rendered. Change the visual description of one shot and only that shot is regenerated — the rest of the pipeline is untouched. This is shot-by-shot control rather than a black-box one-click generator.",
      "The storyboard JSON is part of your export. It can be re-imported later to continue editing the same project, or handed to a teammate with the assets.",
    ],
    steps: [1, 2, 3],
    related: ["script-to-video", "text-to-video", "ai-video-script-writer", "ai-voiceover", "subtitle-generator", "video-export-zip"],
    highlight: [
      "Shot table with duration, description, captions and image prompts",
      "Edit one shot and regenerate only that shot",
      "Storyboard JSON included in your open export zip",
    ],
  },
  {
    slug: "script-to-video",
    name: "Script to Video AI",
    h1: "Script to Video AI — Shot-by-Shot Control",
    title: "Script to Video AI — Turn a Script into a Video with Shot-by-Shot Control",
    description:
      "Turn an existing script into a finished video with a generated storyboard, per-shot images, voiceover, subtitles and open-format export. You stay in control of every shot.",
    keyword: "script to video ai",
    cta: "Turn your script into video",
    intro:
      "Script to Video takes a finished script and runs it through the full pipeline: storyboard, per-shot images, TTS voiceover, SRT subtitles and MP4 composition. Unlike fully automatic tools, every shot stays editable before rendering.",
    body: [
      "Paste your script, choose a tone and length, and the pipeline builds a shot table from your text. Each shot gets an image, voiceover segment and subtitle line derived from the corresponding part of the script.",
      "You can review the storyboard before anything is generated. If a shot's visual description is wrong, fix the row and regenerate that shot — not the whole video.",
      "The output is an open zip (MP4 + storyboard JSON + shot images + voiceover audio + SRT). It works with editors that import MP4 and SRT, so you are never locked to one platform.",
    ],
    steps: [2, 3, 4, 5, 6, 7, 8],
    related: ["storyboard-generator", "text-to-video", "ai-video-script-writer", "ai-voiceover", "subtitle-generator", "video-export-zip"],
    highlight: [
      "Full pipeline from script to MP4 in one run",
      "Shot-by-shot review before rendering",
      "Open zip export: MP4 + JSON + SRT + assets",
    ],
  },
  {
    slug: "ai-video-script-writer",
    name: "AI Video Script Writer",
    h1: "AI Video Script Writer",
    title: "AI Video Script Writer — Scripts Ready for Storyboarding",
    description:
      "Write a structured video script with the right tone and length, ready to drop into the storyboard and video pipeline. By OpenAI or Claude — bring your own key.",
    keyword: "ai video script writer",
    cta: "Write my script",
    intro:
      "A video script is the backbone of the whole pipeline. AI Video Studio's script writer turns a topic or draft into a paragraph-by-paragraph script with a consistent tone, and hands it straight to the storyboard generator.",
    body: [
      "Start from a free topic, a rough draft, or a URL. Choose tone and target length, and the script writer produces a structured script — no black-box editing afterwards, since every paragraph maps to a storyboard shot.",
      "The script is the input to the storyboard step, so changing the script and re-running downstream steps keeps your visuals, captions and voiceover consistent.",
      "Like every step in the pipeline, script writing runs on the LLM provider you configure (OpenAI or Claude) using your own API key in BYOK mode.",
    ],
    steps: [1, 2],
    related: ["storyboard-generator", "script-to-video", "text-to-video", "ai-voiceover", "video-export-zip"],
    highlight: [
      "Tone and length controls per script",
      "Structured output that feeds the storyboard directly",
      "Runs on your own LLM key (BYOK)",
    ],
  },
  {
    slug: "text-to-video",
    name: "Text to Video",
    h1: "Text to Video with Full Control",
    title: "Text to Video AI — Start from Text, Keep Control",
    description:
      "Go from text to a finished video with a controllable storyboard, per-shot images, voiceover, subtitles and open export. Not a black box — every step is reviewable.",
    keyword: "text to video ai",
    cta: "Start creating",
    intro:
      "Text to Video is the general entry point to the pipeline. Give it text — a draft, an outline or a few bullet points — and work through script, storyboard, images, voiceover, subtitles and composition with a review point at each step.",
    body: [
      "This is not a fully automatic text-to-video generator. The pipeline stops at each meaningful step so you can adjust before cost accumulates: script, then storyboard, then shots, then audio.",
      "Output formats cover 16:9, 9:16 and 1:1, so the same text can become a YouTube video, a Reel, a Short or a TikTok-style vertical clip.",
      "Export is an open zip you can take anywhere — MP4, storyboard JSON, images, audio and SRT. Bring your own API keys for free use; there is no platform lock-in.",
    ],
    steps: [1, 2, 3, 4, 5, 6, 7, 8],
    related: ["storyboard-generator", "script-to-video", "ai-video-script-writer", "ai-voiceover", "subtitle-generator", "video-export-zip"],
    highlight: [
      "Text to video across 16:9, 9:16 and 1:1 formats",
      "Review gate before each expensive step",
      "BYOK: run on your own keys, free of platform compute",
    ],
  },
  {
    slug: "ai-voiceover",
    name: "AI Voiceover Generator",
    h1: "AI Voiceover Generator (TTS)",
    title: "AI Voiceover Generator (TTS) — Per-Shot Narration",
    description:
      "Generate clean text-to-speech voiceover per shot from your script. No voice cloning — plain TTS voices from ElevenLabs or OpenAI, on your own key.",
    keyword: "ai voiceover generator",
    cta: "Generate voiceover",
    intro:
      "The voiceover step turns each shot's narration line into an audio file. Choose a TTS voice, generate, and the audio stays aligned to its shot so captions and visuals match.",
    body: [
      "Voiceover is generated per shot from the script lines, which keeps timing aligned with the storyboard. The pipeline then uses the audio to build SRT subtitles and to compose the final MP4.",
      "No voice cloning is available — this is plain text-to-speech using ElevenLabs or OpenAI voices. That keeps outputs clearly synthetic and avoids the abuse categories listed in the Terms.",
      "In BYOK mode the voiceover runs on your own TTS key. The per-shot audio files are included in the export zip.",
    ],
    steps: [5],
    related: ["script-to-video", "text-to-video", "subtitle-generator", "storyboard-generator", "video-export-zip"],
    highlight: [
      "Per-shot TTS voiceover aligned to the storyboard",
      "ElevenLabs and OpenAI voices, no cloning",
      "Audio files included in the open export",
    ],
  },
  {
    slug: "subtitle-generator",
    name: "AI Subtitle Generator",
    h1: "AI Subtitle Generator (SRT)",
    title: "AI Subtitle Generator (SRT) — Aligned to Your Voiceover",
    description:
      "Generate SRT subtitles aligned to the voiceover timeline, then burn them into the video or export the .srt file. Works for any MP4 + SRT editor.",
    keyword: "subtitle generator srt",
    cta: "Generate subtitles",
    intro:
      "Subtitles are generated from the script and aligned to the voiceover timeline, so caption timing matches the narration instead of guessing. You get an SRT file you can use anywhere.",
    body: [
      "The subtitle step produces an SRT file with per-line timings derived from the audio. You can optionally burn subtitles into the MP4 during composition, or keep the .srt separate.",
      "Because subtitles are part of the storyboard contract, a caption edit only touches the affected lines — the rest of the pipeline stays in place.",
      "The .srt is included in the export zip alongside the MP4, storyboard JSON and assets, so it works with CapCut, Premiere, DaVinci Resolve and other editors that import MP4 + SRT.",
    ],
    steps: [6],
    related: ["ai-voiceover", "script-to-video", "text-to-video", "storyboard-generator", "video-export-zip"],
    highlight: [
      "SRT aligned to the actual voiceover timeline",
      "Optional burn-in during composition",
      "Open .srt in any editor that imports SRT",
    ],
  },
  {
    slug: "video-export-zip",
    name: "Open Format Video Export",
    h1: "Open Format Video Export (MP4 + JSON + SRT)",
    title: "Export Video Project Zip — MP4, Storyboard JSON, SRT and Assets",
    description:
      "Export a finished project as an open zip: MP4, storyboard JSON, shot images, voiceover audio, SRT subtitles and the script. Edit anywhere, no platform lock-in.",
    keyword: "export video project zip",
    cta: "Export & edit anywhere",
    intro:
      "Every pipeline run ends in an open export zip instead of a proprietary project file. You get the final video plus every editable intermediate, so you can continue working in whatever editor you prefer.",
    body: [
      "The zip contains final.mp4, storyboard.json (the full shot table), the per-shot images, voiceover audio, subtitles.srt and the script. That is the entire project, in open formats.",
      "Because the storyboard JSON is included, you can re-import the project and continue editing it later — change a shot, regenerate, export again.",
      "Compatibility is stated factually: the export works with editors that import MP4 + SRT, such as CapCut, Premiere Pro and DaVinci Resolve. We do not claim any official partnership.",
    ],
    steps: [8],
    related: ["storyboard-generator", "script-to-video", "text-to-video", "subtitle-generator", "ai-voiceover"],
    highlight: [
      "One zip: MP4 + storyboard JSON + assets + SRT + script",
      "Re-importable project data — keep editing later",
      "Open formats, importable into common editors",
    ],
  },
  {
    slug: "byok-video-tools",
    name: "BYOK AI Video Tools",
    h1: "BYOK AI Video Tools — Bring Your Own Key",
    title: "BYOK AI Video Tools — Run the Pipeline on Your Own Keys",
    description:
      "Use AI Video Studio's full pipeline with your own OpenAI, Claude, fal.ai, ElevenLabs and OpenAI TTS keys. Keys are encrypted on the backend; the frontend never stores or echoes plaintext.",
    keyword: "bring your own key video",
    cta: "Configure your keys",
    intro:
      "BYOK (Bring Your Own Key) lets you run the entire pipeline on your own API keys. There is no platform compute to pay for at the free tier — you supply the LLM, image, TTS and optional image-to-video keys.",
    body: [
      "Configure keys for LLM (OpenAI or Claude), image generation (fal.ai / Flux), TTS (ElevenLabs or OpenAI) and, optionally, image-to-video. Keys are sent to the backend over HTTPS and stored encrypted; the frontend never persists or displays the plaintext, only a masked status.",
      "Because the pipeline runs on your own providers, the content, cost and usage policy of those providers apply to your account. AI Video Studio acts as the workflow orchestrator.",
      "The free tier is the BYOK tier: bring your own keys, stay in control of cost and keep full access to the open export.",
    ],
    steps: [1, 2, 3, 4, 5, 6, 7, 8],
    related: ["storyboard-generator", "script-to-video", "text-to-video", "ai-voiceover", "video-export-zip"],
    highlight: [
      "LLM, image, TTS and i2v keys on one page",
      "Keys encrypted at rest, masked status only in the UI",
      "Free to run — you pay your own provider directly",
    ],
  },
];

export const TOOL_BY_SLUG: Record<string, Tool> = Object.fromEntries(
  TOOLS.map((t) => [t.slug, t]),
);

// ---------------------------------------------------------------------------
// Scenarios (PRD §6.3) — 5 pages under /scenarios/[slug]
// ---------------------------------------------------------------------------

export type Scenario = {
  slug: string;
  name: string;
  h1: string;
  title: string;
  description: string;
  keyword: string;
  cta: string;
  intro: string;
  body: string[];
  toolSlugs: string[]; // related tools to link to
  audience: string;
};

export const SCENARIOS: Scenario[] = [
  {
    slug: "client-video-delivery",
    name: "Client Video Delivery",
    h1: "AI Video for Client Deliverables",
    title: "AI Video for Client Deliverables — Deliver Faster, Keep Control",
    description:
      "For freelancers delivering videos to clients: a shot-by-shot pipeline with review gates and an open export zip the client can hand to any editor.",
    keyword: "ai video for client deliverables",
    cta: "Start a client project",
    intro:
      "When you deliver to a client, the problem is usually control: clients ask for one change, and regenerating a whole video is expensive. AI Video Studio's shot-by-shot pipeline is built for exactly that loop.",
    body: [
      "Start from a client brief, a draft script or a recorded outline. Walk through script, storyboard, shots, voiceover, subtitles and composition with a review point at each step — so the client's note lands on one shot instead of the whole video.",
      "Deliverables are open: a zip with the MP4, storyboard JSON, assets, SRT and script. If the client wants to continue in their own editor, they can — no platform lock-in to explain.",
      "The BYOK free tier means you can run a full client project on your own keys before any paid tier is involved.",
    ],
    toolSlugs: ["storyboard-generator", "script-to-video", "text-to-video", "video-export-zip", "subtitle-generator"],
    audience: "Freelance video creators and independent producers.",
  },
  {
    slug: "youtube-script-to-video",
    name: "YouTube Script to Video",
    h1: "Script to Video for YouTube",
    title: "Script to Video for YouTube — From Script to a Finished Video",
    description:
      "Turn a YouTube script into a finished video with a storyboard, per-shot visuals, voiceover and captions — in 16:9, with subtitles that match the narration.",
    keyword: "script to video for youtube",
    cta: "Turn a script into a YouTube video",
    intro:
      "YouTube rewards consistency more than flash. A scripted video with aligned visuals, narration and captions keeps retention up — and the pipeline is built around exactly that alignment.",
    body: [
      "Write or paste your script, and the pipeline builds a shot table in 16:9. Each shot gets an image, a narration line and a caption, so what the viewer hears matches what they see.",
      "Subtitles are generated from the voiceover timeline rather than guessed, which keeps caption timing honest. You can burn them in or export the .srt for YouTube's own upload.",
      "Export stays open: MP4 plus the storyboard JSON, so you can keep editing a video for later re-runs.",
    ],
    toolSlugs: ["script-to-video", "storyboard-generator", "ai-video-script-writer", "ai-voiceover", "subtitle-generator"],
    audience: "Content creators and YouTubers who produce from scripts.",
  },
  {
    slug: "social-ads-video",
    name: "Social Ads Video",
    h1: "AI Video for Social Ads",
    title: "AI Video for Social Ads — Vertical Video in 9:16",
    description:
      "Produce social ad videos in 9:16 with per-shot control, captions for silent viewing and an open export you can iterate for A/B testing.",
    keyword: "ai video for social ads",
    cta: "Create a social ad video",
    intro:
      "Social ads live or die on iteration: you test three hooks and keep the one that works. That means the video must be cheap to change, one shot at a time.",
    body: [
      "The pipeline renders in 9:16 for Reels, Shorts and TikTok-style placements. Start from your ad copy or hook, then walk the shot table and replace individual shots before composition.",
      "Captions are generated from the voiceover timeline so the ad works with sound off — and the SRT is exportable for the platform's own caption tools.",
      "Every version is an open zip you can hand to a designer or editor, and each variant is versioned for easy A/B comparison.",
    ],
    toolSlugs: ["text-to-video", "storyboard-generator", "ai-voiceover", "subtitle-generator", "video-export-zip"],
    audience: "Marketing teams and agencies running social ad tests.",
  },
  {
    slug: "product-demo-video",
    name: "Product Demo Video",
    h1: "AI Product Demo Video",
    title: "AI Product Demo Video — Scripted Demos with Real Screenshots",
    description:
      "Build a product demo video: script the walkthrough, storyboard each screen, add narration and captions, then export a zip you can ship to an editor or publish directly.",
    keyword: "ai product demo video",
    cta: "Make a product demo",
    intro:
      "Product demos are part video, part documentation. The pipeline keeps the narrative in a script and the visuals in a storyboard you can swap with real screenshots.",
    body: [
      "Write the walkthrough as a script, generate a storyboard, then replace storyboard rows with your actual product screenshots before composition. The narration and captions stay aligned to each screen.",
      "Because the shot table is JSON, keeping a demo up to date across releases is a matter of re-exporting the affected shots rather than re-recording the whole video.",
      "Export is an open zip — publish the MP4 directly, or hand the SRT and assets to your documentation team.",
    ],
    toolSlugs: ["script-to-video", "storyboard-generator", "ai-video-script-writer", "ai-voiceover", "subtitle-generator"],
    audience: "SaaS teams, founders and PMs who need scripted product walkthroughs.",
  },
  {
    slug: "video-localization",
    name: "Video Localization",
    h1: "AI Video Voiceover Localization",
    title: "AI Video Voiceover Localization — New Narration, Same Cuts",
    description:
      "Localize a video's voiceover and subtitles: regenerate narration and SRT for a new language while keeping the storyboard and visuals untouched.",
    keyword: "ai video voiceover localization",
    cta: "Localize a video",
    intro:
      "Re-voicing a video for a new market usually means re-editing everything. With a per-shot pipeline, localization touches the voiceover and subtitle steps while the visuals and structure stay put.",
    body: [
      "Keep the storyboard and shot images, then regenerate the script, narration and SRT for the target language. The timing realigns to the new voiceover automatically.",
      "TTS voices are plain text-to-speech — no cloning — which keeps localized narration clearly synthetic and avoids the abuse categories in the Terms.",
      "The export zip now holds the localized MP4, SRT and assets, ready for the platform or an editor that imports MP4 + SRT.",
    ],
    toolSlugs: ["ai-voiceover", "subtitle-generator", "script-to-video", "video-export-zip", "storyboard-generator"],
    audience: "Teams and freelancers adapting videos for multiple language markets.",
  },
];

export const SCENARIO_BY_SLUG: Record<string, Scenario> = Object.fromEntries(
  SCENARIOS.map((s) => [s.slug, s]),
);

// ---------------------------------------------------------------------------
// Programmatic SEO Phase 1 (PRD §7 / development-spec D.3)
// Template: [verb]-[content-type]. 6 verbs × 6 content types = 36 pages.
// ---------------------------------------------------------------------------

export const PROGRAMMATIC_VERBS = [
  "make",
  "create",
  "convert",
  "generate",
  "edit",
  "export",
] as const;

export type ProgrammaticContentType = {
  slug: string;
  label: string; // "a video"
  titleNoun: string; // "Video"
  motherTool: string; // slug
  formats: string[];
};

export const PROGRAMMATIC_CONTENT_TYPES: ProgrammaticContentType[] = [
  {
    slug: "video",
    label: "a video",
    titleNoun: "Video",
    motherTool: "text-to-video",
    formats: ["16:9", "9:16", "1:1"],
  },
  {
    slug: "storyboard",
    label: "a storyboard",
    titleNoun: "Storyboard",
    motherTool: "storyboard-generator",
    formats: ["16:9", "9:16", "1:1"],
  },
  {
    slug: "youtube-video",
    label: "a YouTube video",
    titleNoun: "YouTube Video",
    motherTool: "script-to-video",
    formats: ["16:9"],
  },
  {
    slug: "reels",
    label: "Reels",
    titleNoun: "Reels",
    motherTool: "text-to-video",
    formats: ["9:16"],
  },
  {
    slug: "shorts",
    label: "Shorts",
    titleNoun: "Shorts",
    motherTool: "text-to-video",
    formats: ["9:16", "1:1"],
  },
  {
    slug: "tiktok-video",
    label: "a TikTok video",
    titleNoun: "TikTok Video",
    motherTool: "text-to-video",
    formats: ["9:16"],
  },
];

const VERB_ACTION: Record<string, string> = {
  make: "To make something is to take it from an idea to a finished deliverable — and that is what the pipeline does step by step, with a review gate before each expensive operation.",
  create:
    "Creating here means producing original assets — a script, storyboard rows, images and narration — from your own input, instead of filling in a template.",
  convert:
    "Converting is about transforming an asset you already have — a script, a draft, an outline — into a different format while keeping the content aligned.",
  generate:
    "Generating focuses on the assets themselves: shots, voiceover, captions and the final file, produced by the pipeline from your brief.",
  edit:
    "Editing means changing what already exists without rebuilding the project — swap one shot, re-align one caption, then re-export.",
  export:
    "Exporting is the open-format step: the finished MP4 plus storyboard JSON, assets, audio and SRT, packed into one zip you can take anywhere.",
};

// Correct gerund forms — "${verb}ing" would produce makeing/editting/etc.
const VERB_GERUND: Record<string, string> = {
  make: "making",
  create: "creating",
  convert: "converting",
  generate: "generating",
  edit: "editing",
  export: "exporting",
};

// Build the 36 programmatic pages.
export type Programmatic = {
  slug: string;
  verb: string;
  content: string;
  h1: string;
  title: string;
  description: string;
  keyword: string;
  cta: string;
  intro: string;
  steps: string[];
  faq: { q: string; a: string }[];
  motherTool: string;
};

export const PROGRAMMATIC_PAGES: Programmatic[] = PROGRAMMATIC_VERBS.flatMap(
  (verb) =>
    PROGRAMMATIC_CONTENT_TYPES.map((ct) => {
      const mother = TOOL_BY_SLUG[ct.motherTool];
      const h1 = `${verb[0].toUpperCase()}${verb.slice(1)} ${ct.titleNoun} — AI-Powered in 9 Steps`;
      const action = VERB_ACTION[verb];
      const fmtLine = ct.formats.join(" and ");

      const faq: { q: string; a: string }[] = [
        {
          q: `How do I ${verb} ${ct.label}?`,
          a: `You work through the pipeline: analyze the topic, write the script, generate the storyboard, create the shots, add voiceover and subtitles, compose the MP4 and export the open zip. Each step can be reviewed before the next one starts.`,
        },
        {
          q: `Is ${VERB_GERUND[verb]} ${ct.label} free?`,
          a: `The BYOK free tier lets you run the pipeline on your own API keys — you pay your LLM, image and TTS providers directly, and the platform charges nothing for the free tier.`,
        },
        {
          q: `What formats can I ${verb} ${ct.label} in?`,
          a: `The pipeline supports ${fmtLine}, and the export is an open zip: MP4, storyboard JSON, shot assets, voiceover audio, SRT subtitles and the script.`,
        },
      ];

      const steps = [
        `Describe the goal and paste in any existing text — a draft, a script or a rough outline.`,
        `The pipeline writes a script with the tone and length you pick.`,
        `A storyboard is generated from the script: each shot with duration, visuals and an image prompt.`,
        `Each storyboard row becomes an image (${fmtLine}), replaceable shot by shot.`,
        `Voiceover is generated per shot with plain TTS — no voice cloning.`,
        `An SRT subtitle file is generated and aligned to the voiceover timeline.`,
        `Shots, voiceover, subtitles and transitions are composed into a final MP4.`,
        `The project exports as an open zip you can import into editors that read MP4 + SRT.`,
      ];

      return {
        slug: `${verb}-${ct.slug}`,
        verb,
        content: ct.slug,
        h1,
        title: `${verb[0].toUpperCase()}${verb.slice(1)} ${ct.titleNoun} — ${mother.name}`,
        description: `${verb[0].toUpperCase()}${verb.slice(1)} ${ct.label} with a shot-by-shot AI pipeline: script, storyboard, per-shot images, voiceover, subtitles and open export. BYOK free tier.`,
        keyword: `${verb} ${ct.label}`,
        cta: `Start ${VERB_GERUND[verb]}`,
        intro: `${action} You start from your own input and finish with a real, editable project — not a black box.`,
        steps,
        faq,
        motherTool: ct.motherTool,
      };
    }),
);

export const PROGRAMMATIC_BY_SLUG: Record<string, Programmatic> =
  Object.fromEntries(PROGRAMMATIC_PAGES.map((p) => [p.slug, p]));
