// 法律页内容（terms / privacy / cookies）— P6 对照原型，写死英文。
// 项目 v2 统一支持/联系邮箱：zl18672545321@gmail.com（C14 GDPR 联系点）。
// 段落/列表/单元格为受控静态 HTML（仅本站内链与 mailto，无用户输入）。

export type LegalTable = { head: string[]; rows: string[][] };

export type LegalBlock = {
  h: string;
  html?: string[];
  ul?: string[];
  table?: LegalTable;
  tail?: string[];
};

export type LegalDoc = {
  kicker: string;
  title: string;
  meta: string;
  placeholder?: string;
  blocks: LegalBlock[];
  note?: string;
};

export const SUPPORT_EMAIL = "zl18672545321@gmail.com";

const mailto = (label?: string) =>
  `<a href="mailto:${SUPPORT_EMAIL}">${label ?? SUPPORT_EMAIL}</a>`;

const mono = (s: string) => `<span class="mono">${s}</span>`;

export const TERMS: LegalDoc = {
  kicker: "Legal",
  title: "Terms of Service",
  meta: "Last updated: August 11, 2026",
  placeholder: "Placeholder text: structurally complete draft, requires legal review before publication.",
  blocks: [
    {
      h: "1. The service",
      html: [
        "AI Video Studio is a storyboard-first video production workbench. It orchestrates third-party model providers (LLM, image, TTS, image-to-video) through a step-by-step pipeline and packages the results into an open export. We provide the workflow; the underlying models are provided by third parties under their own terms.",
      ],
    },
    {
      h: "2. Eligibility and accounts",
      html: [
        "You must be 18 or older to use the service. You are responsible for the activity under your account and for keeping your session credentials secure.",
      ],
    },
    {
      h: "3. Your content",
      html: [
        "You retain all rights to the content you submit (prompts, scripts, reference assets) and to the output produced for you (storyboards, images, clips, voiceover, videos, export packages). We claim no ownership of your content and do not use it to train models. You grant us only the limited license needed to process and store it in order to operate the pipeline for you.",
        "You represent that you have the rights to any material you upload, and that your use of the output complies with the terms of the underlying model providers and applicable law.",
      ],
    },
    {
      h: "4. Prohibited use",
      html: ["You may not use the service to generate, process or distribute content that:"],
      ul: [
        "is illegal, defamatory, or infringes intellectual property or publicity rights;",
        "depicts real people without consent, including impersonation, deepfakes, or voice cloning of identifiable individuals;",
        "is sexual content involving minors, or any non-consensual intimate imagery;",
        "promotes violence, terrorism, self-harm, or hatred against protected groups;",
        "is designed to deceive at scale (disinformation, spam, fraudulent advertising);",
        "attempts to reverse-engineer, overload, or abuse the service, another user's account, or an upstream provider.",
      ],
      tail: [
        "Violations may result in suspension or termination of your account. If you believe content was generated or distributed through the service in violation of these terms, please use our " +
          '<a href="/report-abuse">abuse report form</a>.',
      ],
    },
    {
      h: "5. BYOK responsibility boundary",
      html: [
        "On the BYOK track you configure your own provider credentials (API keys) and are billed directly by the upstream providers for the model calls the pipeline makes. We store your keys in encrypted form only (see the Privacy Policy) and are not responsible for the availability, pricing, output quality, or terms of any upstream provider you configure.",
        "You are responsible for ensuring that your provider accounts are in good standing, that their limits are not exceeded, and that your use of each provider complies with that provider's terms.",
      ],
    },
    {
      h: "6. Managed plans, credits and refunds",
      html: [
        "On managed plans you purchase credits, which are a unit of service allocation for the generation pipeline: 1 credit = $0.01 of compute, purchased as a platform service (not a token resale).",
      ],
      ul: [
        "Credits are frozen at task creation, settled against actual usage on completion, and returned if the task fails without consuming compute.",
        "Monthly plan credits do not roll over to the next billing period; pay-per-use credits do not expire; trial credits are granted once per account.",
        "Except where required by law, credit purchases are <b>non-refundable</b>.",
        "Managed track jobs pass a compliance pre-check; compliant jobs are not charged for the pre-check step.",
      ],
    },
    {
      h: "7. Disclaimers and liability",
      html: [
        "The service is provided “as is” and “as available”, without warranties of any kind, express or implied. Output generated through third-party models may be inaccurate, biased, or unsuitable for your use case; you are responsible for reviewing output before publication.",
        "To the maximum extent permitted by law, we are not liable for indirect, incidental, special, consequential, or punitive damages, or for any loss of data, revenue, or profits, arising out of or in connection with your use of the service.",
      ],
    },
    {
      h: "8. Changes and contact",
      html: [
        "We may update these terms from time to time; material changes will be announced through the service or by email. Continued use after a change takes effect constitutes acceptance.",
        `Questions about these terms: ${mailto()}.`,
      ],
    },
  ],
  note: "› 积分非退款口径与 CONTRACT C11 一致（售卖平台生成服务积分，非 token 转售）",
};

export const PRIVACY: LegalDoc = {
  kicker: "Legal",
  title: "Privacy Policy",
  meta: "Last updated: August 11, 2026 · Applies to aivideostudio.com and the AI Video Studio application",
  placeholder: "Placeholder text: structurally complete draft, requires legal review before publication.",
  blocks: [
    {
      h: "1. What we collect",
      html: ["We collect the minimum necessary to operate the service:"],
      ul: [
        "<b>Account information</b> — email address, nickname, locale preference, age-confirmation flag, and sign-in session metadata.",
        "<b>Project content</b> — prompts, scripts, reference assets, storyboards, and generated outputs you store in your workspace.",
        "<b>Billing data</b> — plan tier, credits ledger, and order history. Payment card details are handled by Creem (our payment processor); we never see or store card numbers.",
        "<b>Technical data</b> — request logs (kept 30 days), device fingerprint (anonymous, for abuse protection), and browser cookies described in the Cookie Policy.",
      ],
    },
    {
      h: "2. Third-party processors",
      html: [
        "The pipeline calls third-party model providers to produce your content. We send only the content needed for the step being processed:",
      ],
      table: {
        head: ["Processor class", "What is sent", "When"],
        rows: [
          ["LLM providers", "Scripts, prompts, storyboard drafts (L1–L3, L9), compliance pre-check (L1.5, managed)", "Each generation step"],
          ["Image providers", "Prompts and reference frames for shot images (L4)", "Each shot image"],
          ["TTS providers", "Script lines and voice settings for voiceover (L6)", "Each voiceover clip"],
          ["i2v providers", "Shot images and motion prompts (L5, i2v only)", "Each clip"],
          ["Payment (Creem)", "Order data and checkout references", "Checkout / billing"],
        ],
      },
      tail: [
        "On the BYOK track, generation calls go directly from our servers to the providers you configured; on the managed track, calls go through our provider pool. We do not sell your content, and no processor is permitted to use your content to train its models.",
      ],
    },
    {
      h: "3. How your BYOK keys are stored",
      html: [
        `BYOK credentials (API keys) are encrypted at rest with AES-GCM using a key derived via scrypt from a server-side secret. Only ciphertext is stored; we never log plaintext keys. When you view a credential we show only a masked prefix/suffix such as ${mono("sk-···4f2a")}. Deleting a credential permanently removes the ciphertext.`,
      ],
    },
    {
      h: "4. Where your data lives",
      html: [
        "PostgreSQL and MinIO object storage are hosted in the United States. Exported project packages are kept as downloadable zips for 30 days and then purged.",
      ],
    },
    {
      h: "5. Your rights (GDPR)",
      ul: [
        `<b>Export</b> — download a zip of your account data and projects via the settings page (GET /api/account/export),`,
        `<b>Delete</b> — request account and data deletion via DELETE /api/account; backups are rotated out within 30 days,`,
        `<b>Access · rectification · portability · objection</b> — exercise via your <a href="/app/settings">account settings</a> or by writing to ${mailto()}; we respond within 30 days.`,
      ],
    },
    {
      h: "6. Data retention",
      ul: [
        "Project content is retained while your account is active and deleted on account deletion.",
        "Request logs: 30 days. Export zips: 30 days.",
        "Billing records: retained as required by tax law.",
        "Device fingerprint: retained for the life of the account for abuse protection.",
      ],
    },
    {
      h: "7. Contact",
      html: [
        `Privacy questions: ${mailto()}. To report abusive content generated through the service, use the <a href="/report-abuse">abuse report form</a>.`,
      ],
    },
  ],
  note: "› GDPR 入口 → /app/settings（数据导出 + 账号删除，CONTRACT C6）",
};

export const COOKIES: LegalDoc = {
  kicker: "Legal",
  title: "Cookie Policy",
  meta: "Last updated: August 11, 2026",
  placeholder: "Placeholder text: structurally complete draft, requires legal review before publication.",
  blocks: [
    {
      h: "1. What we use",
      html: [
        "AI Video Studio uses only a small set of first-party cookies to keep you signed in, remember your preferences, and honor your consent choices. We do not use third-party advertising, tracking, or analytics cookies.",
      ],
    },
    {
      h: "2. Cookie inventory",
      table: {
        head: ["Name", "Purpose", "Duration", "Necessary"],
        rows: [
          [mono("avs_session"), "Session authentication (HttpOnly, Secure, SameSite=Lax)", "14 days", "Yes"],
          [mono("avs_locale"), "Language preference (en / zh)", "1 year", "No"],
          [mono("avs_cookie_consent"), "Records your consent choice", "1 year", "Yes"],
          [mono("avs_trial_fp"), "Trial-eligibility fingerprint (anonymous)", "Session", "No"],
        ],
      },
    },
    {
      h: "3. What we do not use",
      html: [
        "We do not use cross-site tracking, advertising cookies, or third-party analytics beacons. The device fingerprint mentioned in the Privacy Policy is stored server-side, not in a cookie.",
      ],
    },
    {
      h: "4. You can say no",
      html: [
        "The consent banner lets you accept or reject non-essential cookies. You can change your choice at any time from " +
          '<a href="/app/settings">account settings</a>. Rejecting non-essential cookies does not affect core sign-in or security functions.',
      ],
    },
    {
      h: "5. Contact",
      html: [
        `Questions about cookies: ${mailto()}. See also our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Service</a>.`,
      ],
    },
  ],
  note: "› 首方 cookie 清单：会话 / 语言 / 同意记录 / 试用量身指纹（C14）",
};
