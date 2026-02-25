import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"

export type TemplateAIProvider = "openai" | "grok"

type GenerateTemplateInput = {
  provider: TemplateAIProvider
  apiKey: string
  userRequest: string
  templateName?: string
}

type TemplateBlock =
  | { type: "heading"; level?: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullet_list"; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "spacer"; lines?: number }

type TemplateGenerationJson = {
  fileName?: string
  title?: string
  subtitle?: string
  blocks: TemplateBlock[]
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    fileName: { anyOf: [{ type: "string" }, { type: "null" }] },
    title: { anyOf: [{ type: "string" }, { type: "null" }] },
    subtitle: { anyOf: [{ type: "string" }, { type: "null" }] },
    blocks: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["heading", "paragraph", "bullet_list", "table", "spacer"],
          },
          level: { anyOf: [{ type: "number", enum: [1, 2, 3] }, { type: "null" }] },
          text: { type: "string" },
          items: {
            type: "array",
            items: { type: "string" },
          },
          header: {
            type: "array",
            items: { type: "string" },
          },
          rows: {
            type: "array",
            items: {
              type: "array",
              items: { type: "string" },
            },
          },
          lines: { type: "number" },
        },
        required: ["type", "level", "text", "items", "header", "rows", "lines"],
        additionalProperties: false,
      },
    },
  },
  required: ["fileName", "title", "subtitle", "blocks"],
  additionalProperties: false,
} as const

function buildPrompt(userRequest: string, templateName?: string) {
  return `당신은 Word(.docx) 템플릿 설계 전문가입니다.

목표:
- 사용자 요구사항에 맞는 "보기 좋은" 문서 템플릿 구조를 JSON으로 생성하세요.
- 아래 플레이스홀더 문법을 문서 본문에 적극 사용하세요.

플레이스홀더 문법:
- 일반: {{company}}
- 설명 포함: {{project_name:프로젝트 공식 명칭}}
- 루프 시작/끝: {{#tasks}} ... {{/tasks}}
- 루프 내부 필드: {{no}}, {{name}}, {{owner}}

중요 규칙:
1) 의미가 다른 필드는 key를 절대 재사용하지 말 것.
2) key는 snake_case 영어 사용.
3) 같은 key 재사용은 완전히 같은 의미일 때만 허용.
4) blocks는 읽기 좋은 문서 레이아웃(제목, 섹션 제목, 본문, 목록, 표)을 포함할 것.
5) 표가 필요하면 type="table"로 구성하고, rows 안에 플레이스홀더를 넣어도 됨.
6) 반드시 JSON만 출력. 설명/마크다운/코드블록 금지.
7) blocks의 각 item에는 아래 키를 항상 모두 포함:
   - type, level, text, items, header, rows, lines
   - 미사용 필드는 기본값 사용:
     level=null, text="", items=[], header=[], rows=[], lines=1

선호 파일명(선택): ${templateName?.trim() ? templateName.trim() : "(없음)"}
사용자 요구사항:
${userRequest}`
}

function normalizeFileName(name: string) {
  const base = name.trim().replace(/[\\/:*?"<>|]/g, "-")
  if (!base) return `ai-template-${Date.now()}.docx`
  return base.toLowerCase().endsWith(".docx") ? base : `${base}.docx`
}

function parseGenerationJson(rawText: string): TemplateGenerationJson {
  const trimmed = rawText.trim()
  try {
    const parsed = JSON.parse(trimmed) as TemplateGenerationJson
    if (!Array.isArray(parsed.blocks)) throw new Error("blocks field is required")
    return parsed
  } catch {
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("AI 응답에서 JSON을 찾지 못했습니다.")
    }
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as TemplateGenerationJson
    if (!Array.isArray(parsed.blocks)) throw new Error("blocks field is required")
    return parsed
  }
}

type PlaceholderUsage = {
  key: string
  description: string
}

function splitByPlaceholderSegments(text: string) {
  const regex = /\{\{\s*([#\/]?)([a-zA-Z0-9_]+)(?:\s*:\s*([^}]+))?\s*\}\}/g
  const segments: Array<{ prefix: string; key: string; description: string }> = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    segments.push({
      prefix: match[1] || "",
      key: match[2],
      description: (match[3] || "").trim(),
    })
  }
  return segments
}

function normalizeConflictingPlaceholderKeys(spec: TemplateGenerationJson) {
  const textRefs: Array<{ get: () => string; set: (next: string) => void }> = []

  const pushRef = (obj: any, key: string) => {
    if (typeof obj?.[key] === "string") {
      textRefs.push({
        get: () => obj[key],
        set: (next) => {
          obj[key] = next
        },
      })
    }
  }

  pushRef(spec, "title")
  pushRef(spec, "subtitle")

  for (const block of spec.blocks) {
    if (block.type === "heading" || block.type === "paragraph") {
      pushRef(block as any, "text")
    }
    if (block.type === "bullet_list") {
      block.items.forEach((_, idx) => {
        textRefs.push({
          get: () => block.items[idx],
          set: (next) => {
            block.items[idx] = next
          },
        })
      })
    }
    if (block.type === "table") {
      block.header.forEach((_, idx) => {
        textRefs.push({
          get: () => block.header[idx],
          set: (next) => {
            block.header[idx] = next
          },
        })
      })
      block.rows.forEach((row, rowIdx) => {
        row.forEach((_, cellIdx) => {
          textRefs.push({
            get: () => block.rows[rowIdx][cellIdx],
            set: (next) => {
              block.rows[rowIdx][cellIdx] = next
            },
          })
        })
      })
    }
  }

  const keyDescriptions = new Map<string, Set<string>>()
  const usageList: PlaceholderUsage[] = []

  for (const ref of textRefs) {
    for (const segment of splitByPlaceholderSegments(ref.get())) {
      if (segment.prefix === "#" || segment.prefix === "/") continue
      if (!segment.description) continue

      usageList.push({ key: segment.key, description: segment.description })
      const current = keyDescriptions.get(segment.key) ?? new Set<string>()
      current.add(segment.description)
      keyDescriptions.set(segment.key, current)
    }
  }

  const conflictedKeys = new Set(
    Array.from(keyDescriptions.entries())
      .filter(([, descriptions]) => descriptions.size > 1)
      .map(([key]) => key),
  )

  if (conflictedKeys.size === 0) return spec

  const renamedBySignature = new Map<string, string>()
  const counterByKey = new Map<string, number>()
  const firstDescriptionByKey = new Map<string, string>()

  for (const usage of usageList) {
    if (!conflictedKeys.has(usage.key)) continue

    if (!firstDescriptionByKey.has(usage.key)) {
      firstDescriptionByKey.set(usage.key, usage.description)
      continue
    }

    const firstDescription = firstDescriptionByKey.get(usage.key)
    if (firstDescription === usage.description) continue

    const signature = `${usage.key}::${usage.description}`
    if (!renamedBySignature.has(signature)) {
      const nextCount = (counterByKey.get(usage.key) ?? 1) + 1
      counterByKey.set(usage.key, nextCount)
      renamedBySignature.set(signature, `${usage.key}_${nextCount}`)
    }
  }

  for (const ref of textRefs) {
    const replaced = ref.get().replace(
      /\{\{\s*([#\/]?)([a-zA-Z0-9_]+)(?:\s*:\s*([^}]+))?\s*\}\}/g,
      (raw, prefix, key, description) => {
        const desc = String(description || "").trim()
        if (prefix === "#" || prefix === "/") return raw
        if (!desc) return raw
        const renamed = renamedBySignature.get(`${key}::${desc}`)
        if (!renamed) return raw
        return `{{${renamed}:${desc}}}`
      },
    )
    ref.set(replaced)
  }

  return spec
}

function toHeadingLevel(level?: 1 | 2 | 3): HeadingLevel {
  if (level === 1) return HeadingLevel.HEADING_1
  if (level === 3) return HeadingLevel.HEADING_3
  return HeadingLevel.HEADING_2
}

function tableCell(text: string, isHeader = false) {
  return new TableCell({
    width: { size: 100 / 3, type: WidthType.PERCENTAGE },
    margins: { top: 120, bottom: 120, left: 120, right: 120 },
    shading: isHeader ? { fill: "F3F4F6" } : undefined,
    children: [
      new Paragraph({
        spacing: { after: 0, before: 0 },
        children: [
          new TextRun({ text, bold: isHeader, size: isHeader ? 22 : 20 }),
        ],
      }),
    ],
  })
}

async function createStyledDocx(spec: TemplateGenerationJson) {
  const children: Array<Paragraph | Table> = []

  if (spec.title?.trim()) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 220 },
        children: [new TextRun({ text: spec.title.trim(), bold: true, size: 44 })],
      }),
    )
  }

  if (spec.subtitle?.trim()) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [new TextRun({ text: spec.subtitle.trim(), italics: true, color: "6B7280", size: 22 })],
      }),
    )
  }

  for (const block of spec.blocks) {
    if (block.type === "heading") {
      children.push(
        new Paragraph({
          heading: toHeadingLevel(block.level),
          spacing: { before: 260, after: 120 },
          children: [new TextRun({ text: block.text, bold: true })],
        }),
      )
      continue
    }

    if (block.type === "paragraph") {
      children.push(
        new Paragraph({
          spacing: { after: 140 },
          children: [new TextRun({ text: block.text, size: 22 })],
        }),
      )
      continue
    }

    if (block.type === "bullet_list") {
      for (const item of block.items) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 100 },
            children: [new TextRun({ text: item, size: 22 })],
          }),
        )
      }
      continue
    }

    if (block.type === "table") {
      if (block.header.length === 0) continue

      const maxCols = Math.max(
        block.header.length,
        ...block.rows.map((row) => row.length),
      )
      const normalizedHeader = Array.from({ length: maxCols }, (_, i) => block.header[i] ?? "")
      const normalizedRows = block.rows.map((row) =>
        Array.from({ length: maxCols }, (_, i) => row[i] ?? ""),
      )

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
          },
          rows: [
            new TableRow({ children: normalizedHeader.map((cell) => tableCell(cell, true)) }),
            ...normalizedRows.map((row) =>
              new TableRow({
                children: row.map((cell) => tableCell(cell, false)),
              }),
            ),
          ],
        }),
      )

      children.push(new Paragraph({ spacing: { after: 160 } }))
      continue
    }

    if (block.type === "spacer") {
      const lines = Math.max(1, Math.min(8, Math.floor(block.lines ?? 1)))
      for (let i = 0; i < lines; i++) {
        children.push(new Paragraph({ spacing: { after: 120 } }))
      }
    }
  }

  if (children.length === 0) {
    throw new Error("생성된 템플릿 블록이 비어있습니다.")
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Calibri",
            size: 22,
          },
          paragraph: {
            spacing: {
              line: 320,
            },
          },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1100,
            right: 1100,
            bottom: 1100,
            left: 1100,
          },
        },
      },
      children,
    }],
  })

  return Packer.toBlob(doc)
}

function extractOpenAIText(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text
  }

  const output = Array.isArray(data?.output) ? data.output : []
  const chunks: string[] = []

  for (const item of output) {
    const contents = Array.isArray(item?.content) ? item.content : []
    for (const content of contents) {
      if (typeof content?.text === "string" && content.text.trim()) chunks.push(content.text)
      if (typeof content?.output_text === "string" && content.output_text.trim()) chunks.push(content.output_text)
      if (typeof content?.arguments === "string" && content.arguments.trim()) chunks.push(content.arguments)
    }

    if (typeof item?.text === "string" && item.text.trim()) chunks.push(item.text)
    if (typeof item?.arguments === "string" && item.arguments.trim()) chunks.push(item.arguments)
  }

  if (chunks.length > 0) return chunks.join("\n")

  if (typeof data?.status === "string" && data.status !== "completed") {
    const reason = data?.incomplete_details?.reason
    throw new Error(`OpenAI 응답이 완료되지 않았습니다. status=${data.status}${reason ? `, reason=${reason}` : ""}`)
  }

  return ""
}

async function generateWithOpenAI(apiKey: string, prompt: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5.2",
      input: prompt,
      reasoning: { effort: "low" },
      max_output_tokens: 6000,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "template_design",
          strict: true,
          schema: OUTPUT_SCHEMA,
        },
      },
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    const err = data?.error?.message || "OpenAI 템플릿 생성 실패"
    throw new Error(err)
  }

  const outputText = extractOpenAIText(data)
  if (!outputText) throw new Error("OpenAI 응답 텍스트가 비어있습니다.")
  return outputText
}

async function generateWithGrok(apiKey: string, prompt: string) {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4-fast-non-reasoning",
      temperature: 0.2,
      messages: [
        { role: "system", content: "You output only valid JSON and no extra text." },
        { role: "user", content: `${prompt}\n\n출력 스키마: ${JSON.stringify(OUTPUT_SCHEMA)}` },
      ],
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    const err = data?.error?.message || "Grok 템플릿 생성 실패"
    throw new Error(err)
  }

  const outputText = data?.choices?.[0]?.message?.content
  if (typeof outputText !== "string" || !outputText.trim()) {
    throw new Error("Grok 응답 텍스트가 비어있습니다.")
  }
  return outputText
}

export async function generateTemplateDocx(input: GenerateTemplateInput) {
  const prompt = buildPrompt(input.userRequest, input.templateName)
  const rawText =
    input.provider === "openai"
      ? await generateWithOpenAI(input.apiKey, prompt)
      : await generateWithGrok(input.apiKey, prompt)

  const parsed = parseGenerationJson(rawText)
  const normalized = normalizeConflictingPlaceholderKeys(parsed)

  const fileName = normalizeFileName(input.templateName || normalized.fileName || `ai-template-${Date.now()}.docx`)
  const blob = await createStyledDocx(normalized)
  const file = new File([blob], fileName, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  })

  return { file, spec: normalized }
}
