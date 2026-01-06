"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Upload, Loader2, File, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Placeholder } from "@/app/page"

type Props = {
  placeholders: Placeholder[]
  onDataUploaded: () => void
  onContentGenerated: (placeholders: Placeholder[]) => void
}

type UploadedFile = {
  file: File
  content: string
}

export function DataUpload({ placeholders, onDataUploaded, onContentGenerated }: Props) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const extractTextFromFile = async (file: File): Promise<string> => {
    try {
      const fileName = file.name.toLowerCase()

      // Word 파일(.docx) 브라우저에서 직접 텍스트 추출
      if (fileName.endsWith('.docx')) {
        const PizZip = (await import("pizzip")).default
        const Docxtemplater = (await import("docxtemplater")).default
        const arrayBuffer = await file.arrayBuffer()
        const zip = new PizZip(arrayBuffer)
        const doc = new Docxtemplater(zip)
        return doc.getFullText()
      }

      // PDF 파일 브라우저에서 직접 텍스트 추출 (pdfjs-dist 활용)
      if (fileName.endsWith('.pdf')) {
        const pdfjs = await import('pdfjs-dist')
        // 워커 설정 - npm 패키지에서 제공하는 워커 파일 사용
        pdfjs.GlobalWorkerOptions.workerSrc = `//cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

        const arrayBuffer = await file.arrayBuffer()
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
        const pdf = await loadingTask.promise

        let fullText = ""
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          const strings = content.items.map((item: any) => item.str)
          fullText += strings.join(" ") + "\n"
        }

        if (!fullText.trim()) throw new Error("PDF에서 텍스트를 추출할 수 없습니다")
        return fullText
      }

      // 텍스트 계열 파일
      if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
        return await file.text()
      }

      throw new Error("지원하지 않는 파일 형식입니다 (.docx, .pdf, .txt, .md)")
    } catch (error) {
      throw error
    }
  }

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files)
      const newFiles: UploadedFile[] = []
      const errors: string[] = []

      for (const file of fileArray) {
        try {
          // 파일 크기 검증 (10MB 제한)
          const maxSize = 10 * 1024 * 1024 // 10MB
          if (file.size > maxSize) {
            throw new Error(`파일 크기가 너무 큽니다 (최대 10MB)`)
          }

          let content: string
          const fileName = file.name.toLowerCase()

          // .doc 파일 지원 안내
          if (fileName.endsWith('.doc') && !fileName.endsWith('.docx')) {
            throw new Error('.doc 형식은 지원하지 않습니다. .docx 형식으로 변환해주세요.')
          }

          // Word 또는 PDF 파일인 경우 텍스트 추출
          if (fileName.endsWith('.docx') || fileName.endsWith('.pdf')) {
            content = await extractTextFromFile(file)
          } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
            // 일반 텍스트 파일
            content = await file.text()
            if (!content || content.trim().length === 0) {
              throw new Error("파일 내용이 비어있습니다")
            }
          } else {
            throw new Error("지원하지 않는 파일 형식입니다 (.txt, .md, .docx, .pdf만 지원)")
          }

          newFiles.push({ file, content })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류"
          errors.push(`${file.name}: ${errorMessage}`)
        }
      }

      // 업로드 성공한 파일 추가
      if (newFiles.length > 0) {
        setUploadedFiles((prev) => [...prev, ...newFiles])
      }

      // 에러가 있으면 사용자에게 알림
      if (errors.length > 0) {
        alert(`파일 처리 중 오류가 발생했습니다:\n\n${errors.join('\n')}`)
      }

      // 성공한 파일이 있으면 성공 메시지
      if (newFiles.length > 0 && errors.length > 0) {
        alert(`${newFiles.length}개 파일은 성공적으로 업로드되었습니다.`)
      }
    },
    [],
  )

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return
      await processFiles(files)
      // input 초기화하여 같은 파일 재선택 가능하게
      e.target.value = ""
    },
    [processFiles],
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

      const files = e.dataTransfer.files
      if (files.length > 0) {
        await processFiles(files)
      }
    },
    [processFiles],
  )

  const removeFile = useCallback((index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleGenerate = useCallback(async () => {
    if (uploadedFiles.length === 0) {
      alert("최소 1개 이상의 파일을 업로드해주세요.")
      return
    }

    setIsProcessing(true)
    try {
      // 모든 파일의 내용을 하나로 합침
      const combinedContent = uploadedFiles
        .map((f) => `=== ${f.file.name} ===\n${f.content}`)
        .join("\n\n")

      const settings = localStorage.getItem("docfiller-settings")
      const { defaultProvider, openaiApiKey, grokApiKey } = settings
        ? JSON.parse(settings)
        : { defaultProvider: "openai", openaiApiKey: "", grokApiKey: "" }

      const response = await fetch("/api/fill-placeholders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataContent: combinedContent,
          placeholders,
          provider: defaultProvider,
          apiKey: defaultProvider === "openai" ? openaiApiKey : grokApiKey,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to fill placeholders")
      }

      const { filledPlaceholders } = await response.json()
      onContentGenerated(filledPlaceholders)
    } catch (error) {
      alert(error instanceof Error ? error.message : "Error processing data file")
    } finally {
      setIsProcessing(false)
    }
  }, [uploadedFiles, placeholders, onContentGenerated])

  return (
    <div className="py-6">
      <div className="mb-6">
        <h2 className="mb-2 text-2xl font-semibold text-foreground">Upload Data Files</h2>
        <p className="text-muted-foreground">
          데이터 파일을 업로드하면 AI가 자동으로 플레이스홀더를 채워줍니다
        </p>
      </div>

      {/* Drag & Drop Area */}
      <div
        className={`mb-6 flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border"
          }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <Upload className="h-10 w-10 text-primary" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">데이터 파일 업로드</h3>
        <p className="mb-4 text-center text-sm text-muted-foreground">
          텍스트 파일을 드래그하거나 클릭하여 업로드하세요
        </p>
        <label htmlFor="data-upload">
          <Button size="lg" disabled={isProcessing} asChild>
            <span className="cursor-pointer">
              <Upload className="mr-2 h-4 w-4" />
              파일 선택
            </span>
          </Button>
        </label>
        <p className="mt-3 text-sm text-muted-foreground">
          지원 형식: .txt, .md, .docx, .pdf (최대 10MB, 여러 파일 선택 가능)
        </p>
        <input
          id="data-upload"
          type="file"
          accept=".txt,.md,.docx,.pdf"
          multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={isProcessing}
        />
      </div>

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-foreground">
            업로드된 파일 ({uploadedFiles.length}개)
          </h3>
          <div className="space-y-2">
            {uploadedFiles.map((uploadedFile, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10">
                    <File className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{uploadedFile.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(uploadedFile.file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(index)}
                  disabled={isProcessing}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onDataUploaded} disabled={isProcessing}>
          수동으로 입력하기
        </Button>
        <Button size="lg" onClick={handleGenerate} disabled={isProcessing || uploadedFiles.length === 0}>
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              AI 처리 중...
            </>
          ) : (
            <>
              AI로 자동 채우기
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
