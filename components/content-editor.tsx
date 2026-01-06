"use client"

import { useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, Check, Table, Plus, Trash2, Braces, Text } from "lucide-react"
import type { Placeholder } from "@/app/page"

type Props = {
  placeholders: Placeholder[]
  onPlaceholdersChange: (placeholders: Placeholder[]) => void
  onComplete: () => void
  isProcessing: boolean
}

export function ContentEditor({ placeholders, onPlaceholdersChange, onComplete, isProcessing }: Props) {
  const [editModes, setEditModes] = useState<Record<string, "table" | "json">>(
    Object.fromEntries(placeholders.map(p => [p.key, "table"]))
  )

  const handleChange = (index: number, value: any) => {
    const updated = [...placeholders]
    updated[index] = { ...updated[index], value }
    onPlaceholdersChange(updated)
  }

  const toggleEditMode = (key: string) => {
    setEditModes(prev => ({
      ...prev,
      [key]: prev[key] === "table" ? "json" : "table"
    }))
  }

  // 배열 데이터 업데이트 핸들러
  const handleUpdateArrayRow = (pIndex: number, rIndex: number, field: string, val: string) => {
    const p = placeholders[pIndex]
    if (!Array.isArray(p.value)) return

    const newValue = [...p.value]
    newValue[rIndex] = { ...newValue[rIndex], [field]: val }
    handleChange(pIndex, newValue)
  }

  const handleAddRow = (pIndex: number) => {
    const p = placeholders[pIndex]
    if (!Array.isArray(p.value)) return

    // 기존 행이 있으면 그 구조를 사용, 없으면 fields 속성 활용
    const newRow = p.value.length > 0
      ? Object.fromEntries(Object.keys(p.value[0]).map(k => [k, ""]))
      : (p as any).fields && (p as any).fields.length > 0
        ? Object.fromEntries((p as any).fields.map((f: string) => [f, ""]))
        : { value: "" }

    handleChange(pIndex, [...p.value, newRow])
  }

  const handleRemoveRow = (pIndex: number, rIndex: number) => {
    const p = placeholders[pIndex]
    if (!Array.isArray(p.value)) return

    const newValue = [...p.value]
    newValue.splice(rIndex, 1)
    handleChange(pIndex, newValue)
  }

  return (
    <div className="py-6">
      <div className="mb-6">
        <h2 className="mb-2 text-2xl font-semibold text-foreground">내용 편집 (Edit Content)</h2>
        <p className="text-muted-foreground">AI가 생성한 내용을 확인하고 수정하세요. 점(.) 문법을 사용한 표는 테이블 형식으로 편집 가능합니다.</p>
      </div>

      <div className="mb-6 space-y-8">
        {placeholders.map((placeholder, pIndex) => {
          const isArray = Array.isArray(placeholder.value)
          const mode = editModes[placeholder.key] || "table"

          return (
            <div key={pIndex} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label className="font-mono text-lg font-bold text-primary">
                      {"{"}{isArray ? "#" : ""}{placeholder.key}{"}"}
                    </Label>
                    {isArray && (
                      <span className="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        <Table className="h-3 w-3" />
                        TABLE ({placeholder.value.length})
                      </span>
                    )}
                  </div>
                  {placeholder.description && (
                    <p className="text-sm text-muted-foreground">{placeholder.description}</p>
                  )}
                </div>

                {isArray && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleEditMode(placeholder.key)}
                    className="text-xs"
                  >
                    {mode === "table" ? (
                      <><Braces className="mr-2 h-3 w-3" /> JSON 모드</>
                    ) : (
                      <><Table className="mr-2 h-3 w-3" /> 테이블 모드</>
                    )}
                  </Button>
                )}
              </div>

              {!isArray ? (
                <Textarea
                  value={placeholder.value as string}
                  onChange={(e) => handleChange(pIndex, e.target.value)}
                  rows={4}
                  className="resize-y"
                  placeholder="내용을 입력하세요..."
                />
              ) : mode === "json" ? (
                <Textarea
                  value={JSON.stringify(placeholder.value, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value)
                      handleChange(pIndex, parsed)
                    } catch (err) { }
                  }}
                  rows={10}
                  className="font-mono text-xs"
                />
              ) : (
                <div className="space-y-3">
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          {/* 테이블 헤더: 기존 데이터가 있으면 그것을 사용, 없으면 fields 속성 사용 */}
                          {(placeholder.value.length > 0
                            ? Object.keys(placeholder.value[0])
                            : (placeholder as any).fields || []
                          ).map((key: string) => (
                            <th key={key} className="px-3 py-2 font-medium text-muted-foreground">{key}</th>
                          ))}
                          <th className="w-10 px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(placeholder.value as any[]).map((row, rIndex) => (
                          <tr key={rIndex} className="group transition-colors hover:bg-muted/20">
                            {Object.keys(row).map(key => (
                              <td key={key} className="px-2 py-1.5 overflow-hidden">
                                <Input
                                  value={row[key] || ""}
                                  onChange={(e) => handleUpdateArrayRow(pIndex, rIndex, key, e.target.value)}
                                  className="h-8 border-transparent bg-transparent shadow-none focus-visible:border-primary focus-visible:bg-background group-hover:bg-background/50"
                                />
                              </td>
                            ))}
                            <td className="px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                onClick={() => handleRemoveRow(pIndex, rIndex)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-dashed"
                    onClick={() => handleAddRow(pIndex)}
                  >
                    <Plus className="mr-2 h-4 w-4" /> 행 추가 (Add Row)
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex justify-end gap-3">
        <Button size="lg" onClick={onComplete} disabled={isProcessing} className="px-8 font-semibold">
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              문서 생성 중...
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              문서 생성하기
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
