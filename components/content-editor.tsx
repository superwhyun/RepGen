"use client"

import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, Check } from "lucide-react"
import type { Placeholder } from "@/app/page"

type Props = {
  placeholders: Placeholder[]
  onPlaceholdersChange: (placeholders: Placeholder[]) => void
  onComplete: () => void
  isProcessing: boolean
}

export function ContentEditor({ placeholders, onPlaceholdersChange, onComplete, isProcessing }: Props) {
  const handleChange = (index: number, value: string) => {
    const updated = [...placeholders]
    updated[index] = { ...updated[index], value }
    onPlaceholdersChange(updated)
  }

  return (
    <div className="py-6">
      <div className="mb-6">
        <h2 className="mb-2 text-2xl font-semibold text-foreground">Edit Content</h2>
        <p className="text-muted-foreground">Review and edit the AI-generated content for each placeholder</p>
      </div>

      <div className="mb-6 space-y-6">
        {placeholders.map((placeholder, index) => (
          <div key={index} className="space-y-2">
            <Label htmlFor={`placeholder-${index}`} className="font-mono text-sm">
              {"{{"}
              {placeholder.key}
              {"}}"}
            </Label>
            <Textarea
              id={`placeholder-${index}`}
              value={placeholder.value}
              onChange={(e) => handleChange(index, e.target.value)}
              rows={4}
              className="font-sans"
            />
          </div>
        ))}
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
