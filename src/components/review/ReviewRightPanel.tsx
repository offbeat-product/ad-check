import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CommentsPanel from "@/components/CommentsPanel";
import AICheckPanel from "./AICheckPanel";
import ComparisonCheckPanel, { type ComparisonHistoryEntry } from "./ComparisonCheckPanel";
import { MessageCircle, Bot, GitCompare } from "lucide-react";
import type { CheckItem } from "@/lib/types";
import type { CheckResult } from "@/lib/types";
import type { CheckMarker } from "@/lib/marker-positions";

interface ReviewRightPanelProps {
  rightTab: string;
  onTabChange: (tab: string) => void;
  items: CheckItem[];
  markers: CheckMarker[];
  productCode: string;
  commentCounts: Record<string, number>;
  highlightCard: string | null;
  commentFilter: string | null;
  checkResultId: string | null;
  hasCheckResult: boolean;
  onCommentClick: (patternId: string) => void;
  onCheckItemClick?: (patternId: string) => void;
  onMarkerClick?: (patternId: string) => void;
  emptyCheckMessage?: React.ReactNode;
  onAnnotationClick?: (annotationData: unknown) => void;
  overallStatus?: string | null;
  checkedAt?: string | null;
  file?: { file_data: string | null; file_type: string; process_type: string; file_name?: string } | null;
  productId?: string;
  projectId?: string;
  /** Media playback current time for auto-timestamping */
  mediaCurrentTime?: number | null;
  /** Callback to seek media to a specific time */
  onSeekMedia?: (seconds: number) => void;
  /** Correction log context */
  patternId?: string | null;
  fileId?: string;
  /** Called after a comment is deleted */
  onCommentDeleted?: () => void;
  /** Comparison mode props */
  comparisonMode?: boolean;
  comparisonBeforeData?: string | null;
  comparisonAfterData?: string | null;
  comparisonAfterText?: string;
  comparisonRoundLabel?: string;
  onOpenComparisonMode?: () => void;
  onComparisonCheckComplete?: (result: CheckResult) => void;
  onComparisonSaved?: (entry: ComparisonHistoryEntry) => void;
  onClearAfterData?: () => void;
  clientName?: string;
  productName?: string;
  lockedByUser?: string | null;
  onAcquireLock?: () => Promise<boolean>;
  onReleaseLock?: () => Promise<void>;
  submissionType?: string;
  onSubmitToClient?: () => void;
  onInternalRevision?: () => void;
  commentRefreshKey?: number;
}

export default function ReviewRightPanel({
  rightTab, onTabChange, items, markers, productCode, commentCounts, highlightCard,
  commentFilter, checkResultId, hasCheckResult, onCommentClick, onCheckItemClick, onMarkerClick, emptyCheckMessage, onAnnotationClick,
  overallStatus, checkedAt, file, productId, projectId,
  mediaCurrentTime, onSeekMedia, patternId, fileId, onCommentDeleted,
  comparisonMode, comparisonBeforeData, comparisonAfterData, comparisonAfterText, comparisonRoundLabel,
  onOpenComparisonMode, onComparisonCheckComplete, onComparisonSaved, onClearAfterData,
  clientName, productName, lockedByUser, onAcquireLock, onReleaseLock,
  submissionType, onSubmitToClient, onInternalRevision, commentRefreshKey,
}: ReviewRightPanelProps) {
  const [totalCommentCount, setTotalCommentCount] = useState(0);

  // In comparison mode, force tab to "comparison" or "comments"
  const effectiveTab = comparisonMode
    ? (rightTab === "comments" ? "comments" : "comparison")
    : (rightTab === "comparison" ? "ai-check" : rightTab);

  return (
    <div className="w-[380px] shrink-0 h-screen border-l border-border flex flex-col bg-card overflow-hidden">
      <Tabs value={effectiveTab} onValueChange={onTabChange} className="relative flex-1 flex flex-col min-h-0">
        <TabsList className="w-full shrink-0 rounded-none border-b border-border bg-transparent h-10 p-0">
          {comparisonMode ? (
            <TabsTrigger value="comparison" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs h-10 gap-1">
              <GitCompare className="h-3 w-3" />
              比較チェック
            </TabsTrigger>
          ) : (
            <TabsTrigger value="ai-check" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs h-10">
              AIチェック結果
            </TabsTrigger>
          )}
          <TabsTrigger value="comments" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs h-10 gap-1">
            コメント
            {totalCommentCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                {totalCommentCount > 99 ? "99+" : totalCommentCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Comparison check tab */}
        {comparisonMode && (
          <TabsContent value="comparison" className="absolute inset-0 top-10 flex flex-col overflow-hidden mt-0 ring-0 focus-visible:ring-0 data-[state=inactive]:hidden">
            {file && productId && projectId ? (
              <ComparisonCheckPanel
                file={file}
                productId={productId}
                projectId={projectId}
                fileId={fileId}
                checkResultId={checkResultId}
                clientName={clientName}
                productCode={productCode}
                productName={productName}
                comparisonBeforeData={comparisonBeforeData ?? null}
                comparisonAfterData={comparisonAfterData ?? null}
                comparisonAfterText={comparisonAfterText ?? ""}
                comparisonRoundLabel={comparisonRoundLabel ?? ""}
                onOpenComparisonMode={onOpenComparisonMode ?? (() => {})}
                onCheckComplete={onComparisonCheckComplete}
                onComparisonSaved={onComparisonSaved}
                onClearAfterData={onClearAfterData}
                commentCounts={commentCounts}
                highlightCard={highlightCard}
                onCommentClick={onCommentClick}
                onTabChange={onTabChange}
                onSeekMedia={onSeekMedia}
                onMarkerClick={onMarkerClick}
                lockedByUser={lockedByUser}
                onAcquireLock={onAcquireLock}
                onReleaseLock={onReleaseLock}
                submissionType={submissionType}
                onSubmitToClient={onSubmitToClient}
                onInternalRevision={onInternalRevision}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6">
                <GitCompare className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">比較チェック準備中...</p>
              </div>
            )}
          </TabsContent>
        )}

        {/* AI check tab (only when not in comparison mode) */}
        {!comparisonMode && (
          <TabsContent value="ai-check" className="absolute inset-0 top-10 flex flex-col overflow-hidden mt-0 ring-0 focus-visible:ring-0 data-[state=inactive]:hidden">
            {hasCheckResult ? (
              <AICheckPanel
                items={items}
                markers={markers}
                productCode={productCode}
                commentCounts={commentCounts}
                highlightCard={highlightCard}
                onCommentClick={onCommentClick}
                checkResultId={checkResultId}
                onTabChange={onTabChange}
                overallStatus={overallStatus}
                checkedAt={checkedAt}
                productId={productId}
                projectId={projectId}
                processKey={file?.process_type}
                onSeekMedia={onSeekMedia}
                onMarkerClick={onMarkerClick}
              />
            ) : (
              emptyCheckMessage || (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6">
                  <Bot className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">AIチェック未実行</p>
                </div>
              )
            )}
          </TabsContent>
        )}

        <TabsContent value="comments" className="absolute inset-0 top-10 overflow-hidden mt-0 ring-0 focus-visible:ring-0 data-[state=inactive]:hidden">
          {checkResultId ? (
            <CommentsPanel checkResultId={checkResultId} filterItemId={commentFilter} onAnnotationClick={onAnnotationClick} onCheckItemClick={onCheckItemClick} mediaCurrentTime={mediaCurrentTime} onSeekMedia={onSeekMedia} productId={productId} projectId={projectId} processType={file?.process_type} patternId={patternId} fileId={fileId} onCommentDeleted={onCommentDeleted} onCommentCountChange={setTotalCommentCount} fileName={file?.file_name} refreshKey={commentRefreshKey} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6">
              <MessageCircle className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">コメントを利用するにはAIチェックを実行してください</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
