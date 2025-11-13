"use client"

import { useState, useEffect } from "react"
import { SettingsIcon, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useToast } from "@/hooks/use-toast"

export type AIProvider = "openai" | "grok"

export type DocfillerSettings = {
  openaiApiKey: string
  grokApiKey: string
  defaultProvider: AIProvider
}

export function SettingsDialog() {
  const [settings, setSettings] = useState<DocfillerSettings>({
    openaiApiKey: "",
    grokApiKey: "",
    defaultProvider: "openai",
  })
  const [open, setOpen] = useState(false)
  const [keyErrors, setKeyErrors] = useState({ openai: false, grok: false })
  const { toast } = useToast()

  useEffect(() => {
    const stored = localStorage.getItem("docfiller-settings")
    if (stored) {
      setSettings(JSON.parse(stored))
    }
  }, [])

  const validateOpenAIKey = (key: string) => {
    if (!key) return true // 비어있으면 OK (optional)
    return key.startsWith('sk-')
  }

  const validateGrokKey = (key: string) => {
    if (!key) return true // 비어있으면 OK (optional)
    return key.startsWith('xai-')
  }

  const handleSave = () => {
    // API 키 형식 검증
    if (settings.openaiApiKey && !settings.openaiApiKey.startsWith('sk-')) {
      toast({
        title: "OpenAI API 키 오류",
        description: "OpenAI API 키는 'sk-'로 시작해야 합니다.",
        variant: "destructive",
        duration: 5000,
      })
      return
    }
    
    if (settings.grokApiKey && !settings.grokApiKey.startsWith('xai-')) {
      toast({
        title: "Grok API 키 오류",
        description: "Grok API 키는 'xai-'로 시작해야 합니다.",
        variant: "destructive",
        duration: 5000,
      })
      return
    }
    
    localStorage.setItem("docfiller-settings", JSON.stringify(settings))
    
    toast({
      title: "설정이 저장되었습니다",
      description: "API 키와 기본 제공자가 성공적으로 저장되었습니다.",
      duration: 3000,
    })
    
    // 다이얼로그 닫기
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>API Settings</DialogTitle>
          <DialogDescription>AI 제공자 API 키를 설정하고 기본 제공자를 선택하세요</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="openai-key">OpenAI API Key</Label>
            <Input
              id="openai-key"
              type="password"
              placeholder="sk-..."
              value={settings.openaiApiKey}
              onChange={(e) => {
                const newKey = e.target.value
                setSettings({ ...settings, openaiApiKey: newKey })
                setKeyErrors({ ...keyErrors, openai: !validateOpenAIKey(newKey) })
              }}
              className={keyErrors.openai ? "border-destructive" : ""}
            />
            {keyErrors.openai && (
              <p className="text-xs text-destructive">⚠️ OpenAI API 키는 'sk-'로 시작해야 합니다</p>
            )}
            <p className="text-xs text-muted-foreground">
              모델: <span className="font-mono font-semibold">gpt-5</span> (Responses API, reasoning: low) | 발급: platform.openai.com/api-keys
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="grok-key">Grok API Key (xAI)</Label>
            <Input
              id="grok-key"
              type="password"
              placeholder="xai-..."
              value={settings.grokApiKey}
              onChange={(e) => {
                const newKey = e.target.value
                setSettings({ ...settings, grokApiKey: newKey })
                setKeyErrors({ ...keyErrors, grok: !validateGrokKey(newKey) })
              }}
              className={keyErrors.grok ? "border-destructive" : ""}
            />
            {keyErrors.grok && (
              <p className="text-xs text-destructive">⚠️ Grok API 키는 'xai-'로 시작해야 합니다</p>
            )}
            <p className="text-xs text-muted-foreground">
              모델: <span className="font-mono font-semibold">grok-4-fast-non-reasoning</span> | 발급: console.x.ai
            </p>
          </div>
          <div className="space-y-2">
            <Label>Default Provider</Label>
            <RadioGroup
              value={settings.defaultProvider}
              onValueChange={(value) => setSettings({ ...settings, defaultProvider: value as AIProvider })}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="openai" id="openai" />
                <Label htmlFor="openai" className="font-normal">
                  OpenAI
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="grok" id="grok" />
                <Label htmlFor="grok" className="font-normal">
                  Grok (xAI)
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button onClick={handleSave}>
            <Check className="mr-2 h-4 w-4" />
            저장
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
