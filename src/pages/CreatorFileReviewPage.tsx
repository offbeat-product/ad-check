import { useParams } from "react-router-dom";
import FileReviewPage from "./FileReviewPage";
import { useCreatorProject } from "@/hooks/useCreatorProject";

export default function CreatorFileReviewPage() {
  const { shareToken, fileId } = useParams<{ shareToken: string; fileId: string }>();
  const { project, loading, error } = useCreatorProject(shareToken);

  if (!shareToken || !fileId) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">無効なリンクです</div>;
  }

  if (loading || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        {error || "読み込み中..."}
      </div>
    );
  }

  return (
    <FileReviewPage
      isCreatorMode
      shareToken={shareToken}
      fileId={fileId}
      creatorBreadcrumb={{
        clientName: project.client_name,
        productName: project.product_name,
        projectName: project.project_name,
      }}
    />
  );
}
