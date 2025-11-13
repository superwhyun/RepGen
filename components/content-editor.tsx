"use client"

import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, Check, Table } from "lucide-react"
import type { Placeholder } from "@/app/page"

type Props = {
  placeholders: Placeholder[]
  onPlaceholdersChange: (placeholders: Placeholder[]) => void
  onComplete: () => void
  isProcessing: boolean
}

export function ContentEditor({ placeholders, onPlaceholdersChange, onComplete, isProcessing }: Props) {
  const handleChange = (index: number, value: string | any[]) => {
    const updated = [...placeholders]
    updated[index] = { ...updated[index], value }
    onPlaceholdersChange(updated)
  }

  const handleJsonChange = (index: number, jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString)
      handleChange(index, parsed)
    } catch (error) {
      // JSON 파싱 오류 시 무시 (사용자가 입력 중)
    }
  }

  return (
    <div className="py-6">
      <div className="mb-6">
        <h2 className="mb-2 text-2xl font-semibold text-foreground">Edit Content</h2>
        <p className="text-muted-foreground">Review and edit the AI-generated content for each placeholder</p>
      </div>

      <div className="mb-6 space-y-6">
        {placeholders.map((placeholder, index) => {
          const isArray = Array.isArray(placeholder.value)
          
          return (
            <div key={index} className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor={`placeholder-${index}`} className="font-mono text-sm">
                  {"{"}
                  {isArray ? "#" : "{"}
                  {placeholder.key}
                  {"}"}
                  {isArray ? "" : "}"}
                </Label>
                {isArray && (
                  <span className="flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    <Table className="h-3 w-3" />
                    Table ({placeholder.value.length} rows)
                  </span>
                )}
              </div>
              
              {placeholder.description && (
                <p className="text-xs text-muted-foreground">{placeholder.description}</p>
              )}
              
              <Textarea
                id={`placeholder-${index}`}
                value={isArray ? JSON.stringify(placeholder.value, null, 2) : placeholder.value}
                onChange={(e) => {
                  if (isArray) {
                    handleJsonChange(index, e.target.value)
                  } else {
                    handleChange(index, e.target.value)
                  }
                }}
                rows={isArray ? Math.min(placeholder.value.length * 3 + 2, 20) : 4}
                className={`font-sans ${isArray ? "font-mono text-xs" : ""}`}
                placeholder={isArray ? "JSON array data" : "Enter text content"}
              />
            </div>
          )
        })}
      </div>

      <div className="flex justify-end">
        <Button size="lg" onClick={onComplete} disabled={isProcessing}>
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Document...
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Complete Editing
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
