import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://neuro-endo-checker-jl5j-five.vercel.app"

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0 },
    // { url: `${base}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  ]

  // 動的ルートがあればここで配列を追加して返す
  // const items = await fetch(...)  // ※必要なら App Route で実装
  // const dynamicPages = items.map((id) => ({
  //   url: `${base}/devices/${id}`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7
  // }))

  return [...staticPages] // , ...dynamicPages
}
