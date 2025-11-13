"use client"

import { FileText, ChevronRight, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { Placeholder } from "@/app/page"

type Props = {
  placeholders: Placeholder[]
  onContinue: () => void
}

export function PlaceholderList({ placeholders, onContinue }: Props) {
  const hasLoopPlaceholders = placeholders.some((p: any) => p.isLoop)
  
  return (
    <div className="py-6">
      <div className="mb-6">
        <h2 className="mb-2 text-2xl font-semibold text-foreground">Detected Placeholders</h2>
        <p className="text-muted-foreground">
          Found {placeholders.length} placeholder{placeholders.length !== 1 ? "s" : ""} in your template
        </p>
      </div>
      
      {hasLoopPlaceholders && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>표(Table) 작성 안내</AlertTitle>
          <AlertDescription>
            <p className="mb-2">루프 플레이스홀더가 감지되었습니다. Word 표를 올바르게 작성하세요:</p>
            <div className="mt-2 rounded bg-muted p-3 font-mono text-xs">
              <div>✅ 올바른 방법:</div>
              <div className="mt-1 text-green-600 dark:text-green-400">
                첫 번째 셀: {`{{#arrayName}}{{field1}}{{/arrayName}}`}
              </div>
              <div className="text-green-600 dark:text-green-400">
                두 번째 셀: {`{{field2}}`}
              </div>
              <div className="mt-2">❌ 잘못된 방법 (이렇게 하면 [object Object] 오류!):</div>
              <div className="text-red-600 dark:text-red-400">
                행1: {`{{#arrayName}}`} (다른 행에 있으면 안됨!)
              </div>
              <div className="text-red-600 dark:text-red-400">
                행2: {`{{field1}} | {{field2}}`}
              </div>
              <div className="text-red-600 dark:text-red-400">
                행3: {`{{/arrayName}}`}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              ⚠️ 루프 시작과 종료 태그는 반드시 같은 행에 있어야 합니다.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-6 space-y-3">
        {placeholders.map((placeholder, index) => {
          const isLoop = (placeholder as any).isLoop
          return (
            <div key={index} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {"{"}
                      {isLoop ? "#" : "{"}
                      {placeholder.key}
                      {"}"}
                      {isLoop ? "" : "}"}
                    </Badge>
                    {isLoop && (
                      <Badge variant="outline" className="text-xs text-blue-600 dark:text-blue-400">
                        TABLE/ARRAY
                      </Badge>
                    )}
                  </div>
                  {placeholder.description && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {placeholder.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex justify-end">
        <Button size="lg" onClick={onContinue}>
          Continue to Data Upload
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
