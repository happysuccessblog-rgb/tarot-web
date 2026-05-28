import type { Metadata } from "next";
import ResultClient from "./ResultClient";

type PageProps = {
  params: Promise<{
    reading_key: string;
  }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { reading_key } = await params;

  const ogImageUrl = "/api/og/free-tarot/" + reading_key;
  const resultUrl = "/free-tarot/result/" + reading_key;

  return {
    title: "タロット占い結果｜無料タロット占い",
    description:
      "無料タロット占いの鑑定結果ページです。カードの流れと今後のヒントを確認できます。",
    openGraph: {
      title: "タロット占い結果｜無料タロット占い",
      description:
        "カードが示す今の流れと、これからのヒントを確認できます。",
      type: "article",
      url: resultUrl,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: "タロット占い結果",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "タロット占い結果｜無料タロット占い",
      description:
        "カードが示す今の流れと、これからのヒントを確認できます。",
      images: [ogImageUrl],
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { reading_key } = await params;

  return <ResultClient readingKey={reading_key} />;
}