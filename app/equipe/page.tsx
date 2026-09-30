"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHorloge, useRole, useTournee } from "@/lib/useTournee";
import { Cadre } from "@/components/Page";
import { VueEquipe } from "@/components/Vues";

export default function MaTournee() {
  const router = useRouter();
  const [role] = useRole();
  const equipeId = !role.chargement ? role.equipeId : null;
  const d = useTournee(!!equipeId);
  useHorloge();

  useEffect(() => {
    if (!role.chargement && role.admin) router.replace("/");
  }, [role, router]);

  if (role.chargement || (!role.chargement && role.admin)) return <Cadre />;
  if (!equipeId)
    return (
      <Cadre etroit>
        <div className="empty">
          <strong>Téléphone non rattaché à une équipe</strong>
          Ouvrez le lien d&apos;accès que votre responsable vous a envoyé (SMS, WhatsApp…).
        </div>
      </Cadre>
    );
  if (!d.pret || !d.config) return <Cadre d={d} />;
  return (
    <Cadre d={d}>
      <VueEquipe d={d} config={d.config} equipeId={equipeId} admin={false} />
    </Cadre>
  );
}
