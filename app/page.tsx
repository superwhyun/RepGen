"use client"

import { useEffect, useState } from "react"
import { Upload, FileText, Download, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { SettingsDialog } from "@/components/settings-dialog"
import { TemplateUpload } from "@/components/template-upload"
import { PlaceholderList } from "@/components/placeholder-list"
import { DataUpload } from "@/components/data-upload"
import { ContentEditor } from "@/components/content-editor"

export type Placeholder = {
  key: string
  value: string | any[]  // 문자열 또는 배열 (테이블용)
  description?: string
  isLoop?: boolean
  fields?: string[]
}

export type AIProvider = "openai" | "grok"
export type AIFillEvidence = {
  toolCallId: string
  queries: string[]
  fileId: string | null
  filename: string | null
  score: number | null
  text: string
}
export type FillProcessingMeta = {
  provider: "openai" | "grok"
  usedFileSearch: boolean
  usedFallback: boolean
  fallbackReason?: string
  parsingMode: "structured_json_schema" | "json_extractor"
  cleanup?: {
    vectorStoreDeleted: boolean
    vectorStoreDeleteAttempts: number
    uploadedFileDeleted: boolean
    uploadedFileDeleteAttempts: number
  }
}

export default function Home() {
  const [step, setStep] = useState<"upload" | "placeholders" | "data" | "edit" | "download">("upload")
  const [templateFile, setTemplateFile] = useState<File | null>(null)
  const [templateContent, setTemplateContent] = useState<ArrayBuffer | null>(null)
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [analysisEvidence, setAnalysisEvidence] = useState<AIFillEvidence[]>([])
  const [analysisProcessing, setAnalysisProcessing] = useState<FillProcessingMeta | null>(null)

  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl)
      }
    }
  }, [downloadUrl])

  const handleTemplateUploaded = (file: File, content: ArrayBuffer, extractedPlaceholders: any[]) => {
    setTemplateFile(file)
    setTemplateContent(content)
    // 루프인 경우 초기값을 빈 배열로, 일반인 경우 빈 문자열로 설정
    // isLoop와 fields 속성 유지
    setPlaceholders(extractedPlaceholders.map((p) => ({
      key: p.key,
      value: p.isLoop ? [] : "",
      ...(p.description && { description: p.description }),
      ...(p.isLoop && { isLoop: true, fields: p.fields })
    })))
    setAnalysisEvidence([])
    setAnalysisProcessing(null)
    setStep("placeholders")
  }

  const handleDataUploaded = () => {
    setStep("edit")
  }

  const handleContentGenerated = (
    generatedPlaceholders: Placeholder[],
    options?: { evidence?: AIFillEvidence[]; processing?: FillProcessingMeta }
  ) => {
    setPlaceholders(generatedPlaceholders)
    setAnalysisEvidence(options?.evidence ?? [])
    setAnalysisProcessing(options?.processing ?? null)
    setStep("edit")
  }

  const handleEditComplete = async () => {
    setIsProcessing(true)
    try {
      const PizZip = (await import("pizzip")).default
      const Docxtemplater = (await import("docxtemplater")).default

      const zip = new PizZip(templateContent!)

      // 템플릿 자동 변환: {{task.name}} -> {{#task}}{{name}}{{/task}}
      try {
        const docXmlPath = "word/document.xml"
        const file = zip.file(docXmlPath)
        if (file) {
          let docXml = file.asText()

          // 표의 각 행에서 parent.child 패턴을 루프로 변환
          const trRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g
          docXml = docXml.replace(trRegex, (fullMatch) => {
            const plainText = fullMatch.replace(/<[^>]+>/g, '')
            const dotMatch = plainText.match(/\{\{([a-zA-Z0-9_]+)\./)

            if (!dotMatch) return fullMatch

            const parentName = dotMatch[1]

            // parent. 제거
            let converted = fullMatch.replace(new RegExp(`\\{\\{${parentName}\\.`, 'g'), '{{')

            // 행 시작에 {{#parent}} 추가
            // NOTE: "<w:t[^>]*>" can falsely match "<w:tr...>".
            // Match only real text nodes (<w:t ...> or <w:t>).
            const firstTextMatch = converted.match(/<w:t(?:\s[^>]*)?>/)
            if (firstTextMatch?.index !== undefined) {
              const pos = firstTextMatch.index + firstTextMatch[0].length
              converted = converted.slice(0, pos) + `{{#${parentName}}}` + converted.slice(pos)
            }

            // 행 끝에 {{/parent}} 추가
            const lastCloseIndex = converted.lastIndexOf('</w:t>')
            if (lastCloseIndex !== -1) {
              converted = converted.slice(0, lastCloseIndex) + `{{/${parentName}}}` + converted.slice(lastCloseIndex)
            }

            return converted
          })

          zip.file(docXmlPath, docXml)
        }
      } catch (convError) {
        // Auto-conversion failed, proceed with normal rendering
      }

      // 데이터 준비
      const data = placeholders.reduce((acc, p) => ({ ...acc, [p.key]: p.value }), {})

      // --- Parser & Options ---
      const angularParser = (tag: string) => {
        // 1. 점 기호(.)나 쉼표(:) 앞에 오는 루프 기호(#, /) 제거
        // {{#task.name}} -> task.name, {{/task}} -> task
        let expression = tag.replace(/^[#\/]/, "")

        // 2. 지침(description) 제거: {{keyword:description}} -> keyword
        expression = expression.includes(':') ? expression.split(':')[0].trim() : expression.trim()

        if (expression === '') {
          return { get: (s: any) => s }
        }

        return {
          get: (scope: any) => {
            let obj: any = scope
            const parts = expression.split('.')
            for (let i = 0; i < parts.length; i++) {
              if (obj === undefined || obj === null) return undefined
              obj = obj[parts[i]]
            }
            return obj
          }
        }
      }

      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: {
          start: '{{',
          end: '}}'
        },
        parser: angularParser,
        nullGetter: () => "" // 값이 없는 경우 undefined 대신 빈 문자열 출력
      })

      try {
        doc.render(data)
      } catch (renderError: any) {
        throw renderError
      }

      const output = doc.getZip().generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })

      const url = URL.createObjectURL(output)
      setDownloadUrl(url)
      setStep("download")
    } catch (error: any) {
      const errorMsg = error.properties?.explanation || error.message || "문서 생성 중 알 수 없는 오류가 발생했습니다."
      alert(`오류: ${errorMsg}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReset = () => {
    setStep("upload")
    setTemplateFile(null)
    setTemplateContent(null)
    setPlaceholders([])
    setDownloadUrl(null)
    setAnalysisEvidence([])
    setAnalysisProcessing(null)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <FileText className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">DocFiller AI</h1>
                <p className="text-sm text-muted-foreground">Document Automation Tool</p>
              </div>
            </div>
            <SettingsDialog />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[
              { id: "upload", label: "Upload Template", icon: Upload },
              { id: "placeholders", label: "View Placeholders", icon: FileText },
              { id: "data", label: "Upload Data", icon: Upload },
              { id: "edit", label: "Edit Content", icon: Sparkles },
              { id: "download", label: "Download", icon: Download },
            ].map((s, index) => {
              const Icon = s.icon
              const isActive = step === s.id
              const isCompleted = ["upload", "placeholders", "data", "edit", "download"].indexOf(step) > index

              return (
                <div key={s.id} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : isCompleted
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-muted bg-background text-muted-foreground"
                        }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <span
                      className={`mt-2 text-xs font-medium ${isActive || isCompleted ? "text-foreground" : "text-muted-foreground"
                        }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {index < 4 && <div className={`h-0.5 flex-1 ${isCompleted ? "bg-primary" : "bg-border"}`} />}
                </div>
              )
            })}
          </div>
        </div>

        {/* Content Area */}
        <Card className="p-6">
          {step === "upload" && <TemplateUpload onTemplateUploaded={handleTemplateUploaded} />}

          {step === "placeholders" && (
            <PlaceholderList placeholders={placeholders} onContinue={() => setStep("data")} />
          )}

          {step === "data" && (
            <DataUpload
              placeholders={placeholders}
              onDataUploaded={handleDataUploaded}
              onContentGenerated={handleContentGenerated}
            />
          )}

          {step === "edit" && (
            <div className="space-y-4">
              {analysisProcessing && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <p>
                    분석 엔진: {analysisProcessing.provider.toUpperCase()} | file_search:{" "}
                    {analysisProcessing.usedFileSearch ? "사용" : "미사용"} | fallback:{" "}
                    {analysisProcessing.usedFallback ? "발생" : "없음"}
                  </p>
                  {analysisProcessing.fallbackReason && (
                    <p className="mt-1">fallback 사유: {analysisProcessing.fallbackReason}</p>
                  )}
                </div>
              )}

              {analysisEvidence.length > 0 && (
                <details className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-foreground">
                    근거 보기 ({analysisEvidence.length}개)
                  </summary>
                  <div className="mt-3 space-y-3">
                    {analysisEvidence.slice(0, 5).map((item, idx) => (
                      <div key={`${item.toolCallId}-${idx}`} className="rounded border border-border bg-background p-2">
                        <p>
                          파일: {item.filename ?? "unknown"} | score:{" "}
                          {item.score !== null ? item.score.toFixed(3) : "-"}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground/90">
                          {item.text.slice(0, 320)}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <ContentEditor
                placeholders={placeholders}
                onPlaceholdersChange={setPlaceholders}
                onComplete={handleEditComplete}
                isProcessing={isProcessing}
              />
            </div>
          )}

          {step === "download" && downloadUrl && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                <Download className="h-10 w-10 text-primary" />
              </div>
              <h2 className="mb-2 text-2xl font-semibold text-foreground">Document Ready!</h2>
              <p className="mb-6 text-muted-foreground">Your document has been generated successfully</p>
              <div className="flex gap-3">
                <Button size="lg" asChild>
                  <a href={downloadUrl} download={`filled-${templateFile?.name || "document.docx"}`}>
                    <Download className="mr-2 h-4 w-4" />
                    Download Document
                  </a>
                </Button>
                <Button size="lg" variant="outline" onClick={handleReset}>
                  Start Over
                </Button>
              </div>
            </div>
          )}
        </Card>
      </main>
    </div>
  )
}
