"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsStaff } from "@/hooks/use-is-staff";

// Client Settings opens on Client Details for staff, Knowledge for a
// client's own people.
export default function ClientSettingsIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { isStaff, isPending } = useIsStaff();
  useEffect(() => {
    if (!isPending) router.replace(`/clients/${id}/settings/${isStaff ? "details" : "knowledge"}`);
  }, [isPending, isStaff, id, router]);
  return null;
}
