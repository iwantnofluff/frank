"use client";

import { useState } from "react";
import { useClientDetail } from "@/hooks/use-client";
import { useProjects } from "@/hooks/use-projects";
import { useArchiveProject } from "@/hooks/use-archive-project";
import { useProjectCreativeStats } from "@/hooks/use-project-creative-stats";
import { useProjectFolders } from "@/hooks/use-project-folders";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useMyAgency } from "@/hooks/use-my-agency";
import { seesAllClients } from "@/lib/roles";
import { ProjectProfileModal } from "./ProjectProfileModal";
import { MoveToFolderModal } from "./MoveToFolderModal";
import { MoveToClientModal } from "./MoveToClientModal";

// A project's profile and what it leads to (moving it to a folder or
// another client, archiving it), opened from the Project Settings button on
// the project's own page (direct instruction: the expand arrow on its row
// in the client's list went). One window at a time.
export function ProjectSettings({
  projectId,
  clientId,
  onClose,
  onDeleted,
  onMoved,
}: {
  projectId: string;
  clientId: string;
  onClose: () => void;
  onDeleted: () => void;
  onMoved: (notice: string) => void;
}) {
  const { data: projects } = useProjects(clientId);
  const { data: client } = useClientDetail(clientId);
  const { data: stats } = useProjectCreativeStats(clientId);
  const { data: folders } = useProjectFolders(clientId);
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const isAdmin = !!me && !me.client_id && seesAllClients(me.role);
  const archiveProject = useArchiveProject();
  const [step, setStep] = useState<"profile" | "folder" | "client">("profile");

  const project = projects?.find((p) => p.id === projectId);
  if (!project) return null;

  if (step === "folder") {
    return (
      <MoveToFolderModal
        projectId={project.id}
        clientId={clientId}
        projectName={project.name}
        currentFolderId={project.folder_id}
        folders={folders ?? []}
        onClose={onClose}
      />
    );
  }
  if (step === "client") {
    return (
      <MoveToClientModal
        projectId={project.id}
        projectName={project.name}
        fromClientId={clientId}
        onClose={onClose}
        onMoved={(clientName) => onMoved(`Moved “${project.name}” to ${clientName}.`)}
      />
    );
  }
  return (
    <ProjectProfileModal
      project={project}
      clientId={clientId}
      clientName={client?.name ?? "this client"}
      stats={stats?.[project.id]}
      isAdmin={isAdmin}
      agencyId={agency?.agencyId ?? ""}
      onMoveToFolder={() => setStep("folder")}
      onMoveToClient={() => setStep("client")}
      onArchive={() => {
        archiveProject.mutate({ projectId: project.id, clientId, archived: !project.archived_at });
        onClose();
      }}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
}
