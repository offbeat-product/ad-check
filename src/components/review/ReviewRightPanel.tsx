import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CommentsPanel from "@/components/CommentsPanel";
import AICheckPanel from "./AICheckPanel";
import { MessageCircle, Bot } from "lucide-react";
import type { CheckItem } from "@/lib/types";
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
  emptyCheckMessage?: React.ReactNode;
  onAnnotationClick?: (annotationData: unknown) => void;
}

export default function ReviewRightPanel({
  rightTab, onTabChange, items, markers, productCode, commentCounts, highlightCard,
  commentFilter, checkResultId, hasCheckResult, onCommentClick, emptyCheckMessage, onAnnotationClick,
}: ReviewRightPanelProps) {
  return (
    <div className="w-[380px] shrink-0 h-full border-l border-border flex flex-col bg-card">
      <Tabs value={rightTab} onValueChange={onTabChange} className="flex flex-col h-full">
        <TabsList className="w-full shrink-0 rounded-none border-b border-border bg-transparent h-10 p-0">
          <TabsTrigger value="ai-check" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs h-10">
            AIチェック結果
          </TabsTrigger>
          <TabsTrigger value="comments" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs h-10">
            コメント
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai-check" className="flex-1 flex flex-col overflow-hidden mt-0 ring-0 focus-visible:ring-0">
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

        <TabsContent value="comments" className="flex-1 overflow-hidden mt-0 ring-0 focus-visible:ring-0">
          {checkResultId ? (
            <CommentsPanel checkResultId={checkResultId} filterItemId={commentFilter} onAnnotationClick={onAnnotationClick} />
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
