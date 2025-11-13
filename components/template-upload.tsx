"use client"

import type React from "react"

import { useCallback, useState } from "react"
import { Upload, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Placeholder } from "@/app/page"

type Props = {
  onTemplateUploaded: (file: File, content: ArrayBuffer, placeholders: Placeholder[]) => void
}

export function TemplateUpload({ onTemplateUploaded }: Props) {
  const [isDragging, setIsDragging] = useState(false)

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".docx")) {
        alert("Please upload a .docx file")
        return
      }

      try {
        const arrayBuffer = await file.arrayBuffer()

        const response = await fetch("/api/extract-placeholders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: Array.from(new Uint8Array(arrayBuffer)),
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          const errorMsg = data.error || "템플릿 파일 처리 실패"
          console.error("[v0] Error processing template:", data)
          alert(`템플릿 처리 중 오류가 발생했습니다:\n\n${errorMsg}\n\n문서에 중복된 {{{{ 또는 잘못된 플레이스홀더 형식이 있는지 확인해주세요.`)
          return
        }

        const { placeholders } = data
        onTemplateUploaded(file, arrayBuffer, placeholders)
      } catch (error) {
        console.error("[v0] Error processing template:", error)
        alert("템플릿 파일 처리 중 오류가 발생했습니다. 파일 형식을 확인해주세요.")
      }
    },
    [onTemplateUploaded],
  )

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      await processFile(file)
    },
    [processFile],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const file = e.dataTransfer.files?.[0]
      if (!file) return
      await processFile(file)
    },
    [processFile],
  )

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 transition-colors ${
        isDragging ? "border-primary bg-primary/5" : "border-border"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <FileText className="h-10 w-10 text-primary" />
      </div>
      <h2 className="mb-2 text-2xl font-semibold text-foreground">Upload Template</h2>
      <p className="mb-6 text-center text-muted-foreground">
        {"Upload a DOCX file with placeholders in {{keyword}} format"}
      </p>
      <label htmlFor="template-upload">
        <Button size="lg" asChild>
          <span className="cursor-pointer">
            <Upload className="mr-2 h-4 w-4" />
            Choose File
          </span>
        </Button>
      </label>
      <p className="mt-3 text-sm text-muted-foreground">or drag and drop your file here</p>
      <input id="template-upload" type="file" accept=".docx" className="hidden" onChange={handleFileChange} />
    </div>
  )
}
