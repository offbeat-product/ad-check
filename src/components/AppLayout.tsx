import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import CreateProjectModal from "@/components/CreateProjectModal";

export default function AppLayout() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar onCreateProject={() => setCreateOpen(true)} />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <CreateProjectModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => navigate(`/project/${id}`)}
      />
    </div>
  );
}
