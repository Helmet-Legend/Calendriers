// Icônes au trait (24×24), couleur héritée via `currentColor`.
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
type Props = { size?: number };
const svg = (size: number, children: React.ReactNode, extra?: React.SVGProps<SVGSVGElement>) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...P} {...extra}>{children}</svg>
);

export const Calendrier = ({ size = 24 }: Props) => svg(size, <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" /></>);
export const Groupe = ({ size = 24 }: Props) => svg(size, <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.2c2.7.2 4.5 2 4.5 4.8" /></>);
export const Repere = ({ size = 24 }: Props) => svg(size, <><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>);
export const Barres = ({ size = 24 }: Props) => svg(size, <path d="M5 20v-6M12 20V9M19 20V4" />);
export const Aide = ({ size = 24 }: Props) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" /></>);
export const Engrenage = ({ size = 24 }: Props) => svg(size, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>);
export const Sortie = ({ size = 24 }: Props) => svg(size, <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />);
export const Grille = ({ size = 24 }: Props) => svg(size, <><rect x="3" y="3" width="8" height="8" rx="1.5" fill="currentColor" stroke="none" /><rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor" stroke="none" /><rect x="3" y="13" width="8" height="8" rx="1.5" fill="currentColor" stroke="none" /><rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor" stroke="none" /></>);
export const Crayon = ({ size = 24 }: Props) => svg(size, <><path d="M4 20l3-9 10-6-4 10z" /><circle cx="4" cy="20" r="1.4" /><circle cx="17" cy="5" r="1.4" /><circle cx="13" cy="15" r="1.4" /></>);
export const Etoile = ({ size = 24 }: Props) => svg(size, <path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8z" fill="currentColor" stroke="none" />);
export const Panier = ({ size = 24 }: Props) => svg(size, <><path d="M3 9h18l-2 11H5z" /><path d="M8 9l4-6 4 6M9 13v4M15 13v4" /></>);
export const Document = ({ size = 24 }: Props) => svg(size, <><path d="M6 3h9l4 4v14H6z" /><path d="M9 11h7M9 15h7M9 7h3" /></>);
export const Route = ({ size = 24 }: Props) => svg(size, <><path d="M8 21L11 3h2l3 18" /><path d="M12 7v2M12 12v2M12 17v2" /></>);
export const Lecture = ({ size = 24 }: Props) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor" /></>);
export const Drapeau = ({ size = 24 }: Props) => svg(size, <><path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" fill="currentColor" /></>);
export const Chevron = ({ size = 18 }: Props) => svg(size, <path d="M9 6l6 6-6 6" />);
export const ChevronBas = ({ size = 20 }: Props) => svg(size, <path d="M6 9l6 6 6-6" />);
export const Loupe = ({ size = 22 }: Props) => svg(size, <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>);
export const Viseur = ({ size = 24 }: Props) => svg(size, <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>);
export const Epingle = Repere;

export const Pieces = ({ size = 54 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <ellipse cx="18" cy="34" rx="14" ry="5" fill="#E7A92A" /><rect x="4" y="26" width="28" height="8" fill="#E7A92A" />
    <ellipse cx="18" cy="26" rx="14" ry="5" fill="#F5C84A" /><ellipse cx="30" cy="22" rx="14" ry="5" fill="#E7A92A" />
    <rect x="16" y="14" width="28" height="8" fill="#E7A92A" /><ellipse cx="30" cy="14" rx="14" ry="5" fill="#F5C84A" />
  </svg>
);
