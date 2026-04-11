import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  const site = (import.meta.env.SITE || "https://visupair.com").replace(
    /\/$/,
    "",
  );

  const body = [
    "User-agent: *",
    "Disallow: /api/",
    "Disallow: /account/",
    "Disallow: /login",
    "Allow: /",
    "",
    `Sitemap: ${site}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
