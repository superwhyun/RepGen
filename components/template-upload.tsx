"use client"

import type React from "react"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { Placeholder } from "@/app/page"
import { deleteStoredTemplate, getAllStoredTemplates, getStoredTemplate, saveTemplates } from "@/lib/template-storage"
import { generateTemplateDocx } from "@/lib/client-template-generator"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { DocfillerSettings } from "@/components/settings-dialog"
import { FileText, Plus, Sparkles, Upload, X } from "lucide-react"

type Props = {
  onTemplateUploaded: (file: File, content: ArrayBuffer, placeholders: Placeholder[]) => void
}

type TemplateOption = {
  name: string
  source: "server" | "browser"
}

export function TemplateUpload({ onTemplateUploaded }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [serverTemplates, setServerTemplates] = useState<string[]>([])
  const [browserTemplates, setBrowserTemplates] = useState<string[]>([])
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null)
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true)
  const [isSelectingTemplate, setIsSelectingTemplate] = useState(false)
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false)
  const [aiTemplateName, setAiTemplateName] = useState("")
  const [aiTemplatePrompt, setAiTemplatePrompt] = useState("")
  const [isGeneratingAiTemplate, setIsGeneratingAiTemplate] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
          const validationDetails = Array.isArray(data.validations) ? `\n\n${data.validations.join("\n")}` : ""
          alert(`템플릿 처리 중 오류가 발생했습니다:\n\n${errorMsg}${validationDetails}\n\n문서에 중복된 {{{{ 또는 잘못된 플레이스홀더 형식이 있는지 확인해주세요.`)
          return
        }

        const { placeholders } = data
        onTemplateUploaded(file, arrayBuffer, placeholders)
      } catch (error) {
        alert("템플릿 파일 처리 중 오류가 발생했습니다. 파일 형식을 확인해주세요.")
      }
    },
    [onTemplateUploaded],
  )

  const loadTemplates = useCallback(async () => {
    setIsLoadingTemplates(true)
    try {
      const [serverResponse, localItems] = await Promise.all([
        fetch("/api/templates"),
        getAllStoredTemplates(),
      ])

      const serverData = await serverResponse.json()
      if (!serverResponse.ok) {
        alert(serverData.error || "템플릿 목록을 불러오지 못했습니다.")
      } else {
        setServerTemplates(Array.isArray(serverData.templates) ? serverData.templates : [])
      }

      setBrowserTemplates(localItems.map((item) => item.name))
    } catch (error) {
      console.error("[v0] 템플릿 목록 로드 오류:", error)
      alert("템플릿 목록 로드 중 오류가 발생했습니다.")
    } finally {
      setIsLoadingTemplates(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const templateOptions = useMemo<TemplateOption[]>(() => {
    const serverItems = serverTemplates.map((name) => ({ name, source: "server" as const }))
    const browserItems = browserTemplates.map((name) => ({ name, source: "browser" as const }))
    return [...serverItems, ...browserItems]
  }, [browserTemplates, serverTemplates])

  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateKey) return null
    const [source, ...nameParts] = selectedTemplateKey.split(":")
    const name = nameParts.join(":")
    if (!name || (source !== "server" && source !== "browser")) return null
    return { name, source } as TemplateOption
  }, [selectedTemplateKey])

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

  const handleTemplateSelect = useCallback(async () => {
    if (!selectedTemplate) return

    setIsSelectingTemplate(true)
    try {
      if (selectedTemplate.source === "server") {
        const response = await fetch(`/api/templates/${encodeURIComponent(selectedTemplate.name)}`)

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          alert(data.error || "선택한 템플릿 파일을 불러오지 못했습니다.")
          return
        }

        const blob = await response.blob()
        const file = new File([blob], selectedTemplate.name, {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })

        await processFile(file)
        return
      }

      const localTemplate = await getStoredTemplate(selectedTemplate.name)
      if (!localTemplate) {
        alert("브라우저 저장 템플릿을 찾을 수 없습니다.")
        return
      }

      const file = new File([localTemplate.content], localTemplate.name, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
      await processFile(file)
    } catch (error) {
      console.error("[v0] 템플릿 선택 처리 오류:", error)
      alert("템플릿 선택 처리 중 오류가 발생했습니다.")
    } finally {
      setIsSelectingTemplate(false)
    }
  }, [processFile, selectedTemplate])

  const handleAddTemplates = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return

    const files = Array.from(fileList)
    const validFiles = files.filter((file) => file.name.toLowerCase().endsWith(".docx"))
    const invalidCount = files.length - validFiles.length

    if (validFiles.length === 0) {
      alert("DOCX 파일만 추가할 수 있습니다.")
      e.target.value = ""
      return
    }

    try {
      await saveTemplates(validFiles)
      await loadTemplates()
      alert(`${validFiles.length}개 템플릿을 브라우저에 저장했습니다.${invalidCount > 0 ? `\n제외된 파일: ${invalidCount}개` : ""}`)
    } catch (error) {
      console.error("[v0] 템플릿 저장 오류:", error)
      alert("템플릿 저장 중 오류가 발생했습니다.")
    } finally {
      e.target.value = ""
    }
  }, [loadTemplates])

  const handleDeleteBrowserTemplate = useCallback(
    async (templateName: string) => {
      try {
        await deleteStoredTemplate(templateName)
        if (selectedTemplateKey === `browser:${templateName}`) {
          setSelectedTemplateKey(null)
        }
        await loadTemplates()
      } catch (error) {
        console.error("[v0] 템플릿 삭제 오류:", error)
        alert("템플릿 삭제 중 오류가 발생했습니다.")
      }
    },
    [loadTemplates, selectedTemplateKey],
  )

  const handleGenerateTemplateWithAI = useCallback(async () => {
    if (!aiTemplatePrompt.trim()) {
      alert("요구사항을 입력해주세요.")
      return
    }

    const settingsRaw = localStorage.getItem("docfiller-settings")
    const settings = settingsRaw ? (JSON.parse(settingsRaw) as DocfillerSettings) : null
    const provider = settings?.defaultProvider ?? "openai"
    const apiKey = provider === "openai" ? settings?.openaiApiKey : settings?.grokApiKey

    if (!apiKey) {
      alert(`Settings에서 ${provider === "openai" ? "OpenAI" : "Grok"} API 키를 먼저 설정해주세요.`)
      return
    }

    setIsGeneratingAiTemplate(true)
    try {
      const { file } = await generateTemplateDocx({
        provider,
        apiKey,
        userRequest: aiTemplatePrompt,
        templateName: aiTemplateName.trim() || undefined,
      })

      await saveTemplates([file])
      await loadTemplates()
      setSelectedTemplateKey(`browser:${file.name}`)

      const url = URL.createObjectURL(file)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = file.name
      anchor.click()
      URL.revokeObjectURL(url)

      alert(`AI 템플릿 생성 완료: ${file.name}`)
      setAiTemplatePrompt("")
      setAiTemplateName("")
      setIsAiDialogOpen(false)
    } catch (error) {
      console.error("[v0] AI 템플릿 생성 오류:", error)
      const errorMessage = error instanceof Error ? error.message : "AI 템플릿 생성 중 오류가 발생했습니다."
      alert(errorMessage)
    } finally {
      setIsGeneratingAiTemplate(false)
    }
  }, [aiTemplateName, aiTemplatePrompt, loadTemplates])

  return (
    <div className="space-y-6">
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

      <div className="rounded-lg border border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">템플릿 선택</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              서버 template 디렉토리 또는 브라우저에 저장된 템플릿을 사용할 수 있습니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Plus className="mr-2 h-4 w-4" />
              추가
            </Button>
            <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="icon" aria-label="인공지능 기반 템플릿 생성">
                  <Sparkles className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                  <DialogTitle>인공지능 기반 템플릿 생성</DialogTitle>
                  <DialogDescription>
                    요구사항을 입력하면 플레이스홀더 문법을 반영한 DOCX 템플릿을 생성해 다운로드하고 목록에 저장합니다.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">파일명 (선택)</p>
                    <Input
                      placeholder="예: 제안서-템플릿.docx"
                      value={aiTemplateName}
                      onChange={(e) => setAiTemplateName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">요구사항</p>
                    <Textarea
                      placeholder="예: 회사 소개, 프로젝트 개요, 일정표(tasks 루프), 담당자 정보가 포함된 템플릿을 만들어줘"
                      value={aiTemplatePrompt}
                      onChange={(e) => setAiTemplatePrompt(e.target.value)}
                      className="min-h-40"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAiDialogOpen(false)} disabled={isGeneratingAiTemplate}>
                    취소
                  </Button>
                  <Button onClick={handleGenerateTemplateWithAI} disabled={isGeneratingAiTemplate}>
                    {isGeneratingAiTemplate ? "생성 중..." : "생성"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            multiple
            className="hidden"
            onChange={handleAddTemplates}
          />
        </div>

        <div className="mt-4 space-y-2">
          {isLoadingTemplates && <p className="text-sm text-muted-foreground">템플릿 목록을 불러오는 중...</p>}

          {!isLoadingTemplates && templateOptions.length === 0 && (
            <p className="text-sm text-muted-foreground">사용 가능한 템플릿이 없습니다.</p>
          )}

          {!isLoadingTemplates &&
            templateOptions.map((template) => {
              const templateKey = `${template.source}:${template.name}`
              const isSelected = selectedTemplateKey === templateKey
              return (
                <div
                  key={templateKey}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1 ${
                    isSelected ? "border-primary bg-primary/10" : "border-border bg-background"
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 rounded px-2 py-1 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    onClick={() => setSelectedTemplateKey(templateKey)}
                  >
                    <span>{template.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      [{template.source === "server" ? "서버" : "브라우저"}]
                    </span>
                  </button>

                  {template.source === "browser" && (
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={`${template.name} 삭제`}
                      onClick={() => handleDeleteBrowserTemplate(template.name)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )
            })}
        </div>

        {selectedTemplateKey && (
          <div className="mt-4 flex justify-end">
            <Button onClick={handleTemplateSelect} disabled={isSelectingTemplate}>
              {isSelectingTemplate ? "불러오는 중..." : "다음"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
