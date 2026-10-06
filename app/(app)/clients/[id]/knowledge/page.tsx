import { redirect } from "next/navigation";

// The old address: Knowledge is a page of Client Settings now (direct
// instruction).
export default async function OldClientKnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/clients/${id}/settings/knowledge`);
}
