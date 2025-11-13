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
        {placeholders.map((placeholder, index) => (
          <div key={index} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 overflow-hidden">
                <Badge variant="secondary" className="font-mono text-xs">
                  {"{{"}
                  {placeholder.key}
                  {"}}"}
                </Badge>
                {placeholder.description && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {placeholder.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
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
