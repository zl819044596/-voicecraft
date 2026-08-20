"use client";

import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { useTranslation } from "@/i18n";
import { PRIMARY_TOOL_SLUG } from "@/lib/tools-config";
import { SITE_URL } from "@/lib/site-data";

export default function HomeClient() {
  const { t, locale } = useTranslation();

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "AI Video Studio",
    url: SITE_URL,
    description: t("station.home.lede"),
    inLanguage: locale === "zh" ? "zh-CN" : "en",
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: locale === "zh" ? "这是生成式 AI 视频吗？" : "Is this generative AI video?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            locale === "zh"
              ? "不是默认路径。主流程是静帧 + 配音 + 字幕用 FFmpeg 合成，强调可控与成本，适合口播讲解。"
              : "Not by default. The main path is stills + TTS + captions via FFmpeg — controllable and cost-efficient for talking-head clips.",
        },
      },
      {
        "@type": "Question",
        name: locale === "zh" ? "不满意成片怎么办？" : "What if I dislike the MP4?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            locale === "zh"
              ? "可下载素材包（每镜图片、配音、字幕与 storyboard.json），导入剪映或 CapCut 自己剪。"
              : "Download the asset pack (per-shot images, voice, captions, storyboard.json) and finish in CapCut / Jianying.",
        },
      },
      {
        "@type": "Question",
        name: locale === "zh" ? "免费吗？" : "Is it free?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            locale === "zh"
              ? "演示登录可用，每日有免费额度。额度用尽后次日重置；付费方案将随后上线。"
              : "Demo login includes a daily free quota. It resets next UTC day; paid plans come later.",
        },
      },
    ],
  };

  return (
    <>
      <JsonLd data={websiteJsonLd} />
      <JsonLd data={faqJsonLd} />

      <section className="home-split">
        <div className="home-split__copy">
          <p className="kicker">{t("station.home.kicker")}</p>
          <h1>
            {t("station.home.h1a")}{" "}
            <span className="mark">{t("station.home.h1b")}</span>
          </h1>
          <p className="lede">{t("station.home.lede")}</p>
          <div className="home-cta">
            <Link className="btn-ink" href="/login">
              {t("station.home.ctaWorkbench")}
            </Link>
            <Link className="btn-line" href={`/app/tools/${PRIMARY_TOOL_SLUG}`}>
              {t("station.home.ctaCompose")}
            </Link>
          </div>
          <span className="note">{t("station.home.note")}</span>
        </div>

        <figure className="apparatus" aria-hidden="true">
          <div className="gate">
            <div className="gate__sprocket gate__sprocket--l">
              <i /><i /><i /><i /><i /><i /><i /><i />
            </div>
            <div className="gate__sprocket gate__sprocket--r">
              <i /><i /><i /><i /><i /><i /><i /><i />
            </div>
            <div className="gate__frame">
              <span className="gate__filament" />
            </div>
            <div className="gate__stencil">avs · film gate</div>
          </div>
          <ul className="callouts">
            <li className="callout" data-side="left" style={{ top: "22%" }}>
              {t("station.home.callout1")}
            </li>
            <li className="callout" data-side="right" style={{ top: "42%" }}>
              {t("station.home.callout2")}
            </li>
            <li className="callout" data-side="left" style={{ top: "64%" }}>
              {t("station.home.callout3")}
            </li>
            <li className="callout" data-side="right" style={{ top: "82%" }}>
              {t("station.home.callout4")}
            </li>
          </ul>
        </figure>
      </section>

      <section className="band-dark">
        <div className="wrap">
          <p className="kicker">{t("station.home.flowKicker")}</p>
          <h2>{t("station.home.flowTitle")}</h2>
          <div className="steps" style={{ marginTop: "1.75rem" }}>
            <article className="step">
              <div className="step__n">{t("station.home.step1n")}</div>
              <h3>{t("station.home.step1h")}</h3>
              <p>{t("station.home.step1p")}</p>
            </article>
            <article className="step">
              <div className="step__n">{t("station.home.step2n")}</div>
              <h3>{t("station.home.step2h")}</h3>
              <p>{t("station.home.step2p")}</p>
            </article>
            <article className="step">
              <div className="step__n">{t("station.home.step3n")}</div>
              <h3>{t("station.home.step3h")}</h3>
              <p>{t("station.home.step3p")}</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <p className="kicker">{t("station.home.toolsKicker")}</p>
          <h2>{t("station.home.toolsTitle")}</h2>
          <div className="tool-rail">
            <Link href="/tools/script-to-video">
              <strong>{t("station.home.toolCompose")}</strong>
              <span>{t("station.home.toolComposeDesc")}</span>
            </Link>
            <Link href="/tools/storyboard-generator">
              <strong>{t("station.home.toolBoard")}</strong>
              <span>{t("station.home.toolBoardDesc")}</span>
            </Link>
            <Link href="/tools/video-export-zip">
              <strong>{t("station.home.toolPack")}</strong>
              <span>{t("station.home.toolPackDesc")}</span>
            </Link>
            <Link href="/tools/ai-voiceover">
              <strong>{t("station.home.toolVoice")}</strong>
              <span>{t("station.home.toolVoiceDesc")}</span>
            </Link>
            <Link href="/tools">
              <strong>{t("station.home.toolAll")}</strong>
              <span>{t("station.home.toolAllDesc")}</span>
            </Link>
            <Link href="/login">
              <strong>{t("station.home.toolTry")}</strong>
              <span>{t("station.home.toolTryDesc")}</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
