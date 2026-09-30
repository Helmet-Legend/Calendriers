import { NextResponse, type NextRequest } from "next/server";

/**
 * Manifeste de l'application installable. L'adresse de démarrage peut être le lien d'une
 * équipe (/e/<jeton>) : sur iPhone, l'app installée ne partage pas la connexion de Safari,
 * elle doit donc rouvrir le lien de l'équipe à son premier lancement.
 */
export function GET(req: NextRequest) {
  const demande = req.nextUrl.searchParams.get("depart") ?? "/";
  const depart = /^\/e\/[0-9a-f]{32}$/.test(demande) ? demande : "/";
  return NextResponse.json(
    {
      name: "Tournée des calendriers",
      short_name: "Tournée",
      description: "Suivi en temps réel de la tournée des calendriers, rue par rue.",
      id: "/",
      start_url: depart,
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#E9EDF2",
      theme_color: "#14223A",
      lang: "fr",
      icons: [
        { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
