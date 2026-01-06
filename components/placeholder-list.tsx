"use client"

import { FileText, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Placeholder } from "@/app/page"

type Props = {
  placeholders: Placeholder[]
  onContinue: () => void
}

export function PlaceholderList({ placeholders, onContinue }: Props) {
  return (
    <div className="py-6">
      <div className="mb-6">
        <h2 className="mb-2 text-2xl font-semibold text-foreground">Detected Placeholders</h2>
        <p className="text-muted-foreground">
          Found {placeholders.length} placeholder{placeholders.length !== 1 ? "s" : ""} in your template
        </p>
      </div>

      <div className="mb-6 space-y-3">
        {placeholders.map((placeholder, index) => {
          const isLoop = (placeholder as any).isLoop
          return (
            <div key={index} className="rounded-xl border border-border bg-card p-4 transition-all hover:shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-sm px-2">
                      {"{"}
                      {isLoop ? "" : "{"}
                      {placeholder.key}
                      {isLoop ? ".*" : "}"}
                      {"}"}
                    </Badge>
                    {isLoop && (
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                          TABLE/ARRAY
                        </Badge>
                        {(placeholder as any).fields?.map((f: string) => (
                          <Badge key={f} variant="secondary" className="px-1 py-0 text-[10px] font-normal opacity-80 bg-muted/50">
                            .{f}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {placeholder.description && (
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
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
